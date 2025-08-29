import { basename } from 'path'
import { createHash } from 'crypto'
import { IFileProcessingService, VectorDocument } from '@/shared/types/interfaces.js'
import { IVectorStoreService } from '@/shared/types/interfaces.js'
import { DocumentChunk, FileMetadata, CustomMetadata } from '../../core/models.js'
import { Document } from '@langchain/core/documents'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { FileReader } from './reader.js'
import { ChunkingService } from '../chunking.js'
import { FileProcessingError, VectorStoreError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { withTimeout, withRetry, BatchProcessor } from '@/shared/utils/resilience.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { VectorStoreProvider } from '../../integrations/vectorstores/adapter.js'
import { EmbeddingMetadataService } from '../embedding-metadata-service.js'
import { stat } from 'fs/promises'

/**
 * Document Processor - VectorStore-only architecture
 * Processes files directly to VectorStore without database dependencies
 */
export class DocumentProcessor implements IFileProcessingService {
  private processingQueue = new Set<string>()
  private fileReader: FileReader
  private textChunker: ChunkingService

  constructor(
    private vectorStoreProvider: VectorStoreProvider,
    private embeddingMetadataService: EmbeddingMetadataService,
    private config: ServerConfig
  ) {
    this.fileReader = new FileReader()
    this.textChunker = new ChunkingService(config)
  }

  async processFile(filePath: string, forceReprocess: boolean = false): Promise<void> {
    if (this.processingQueue.has(filePath)) {
      logger.debug('File already being processed', { filePath, component: 'DocumentProcessor' })
      return
    }

    this.processingQueue.add(filePath)
    const endTiming = startTiming('file_processing', { filePath, component: 'DocumentProcessor' })

    try {
      logger.info('Starting file processing', { filePath, fileName: basename(filePath) })

      // Generate file metadata without database
      const fileMetadata = await this.extractFileMetadata(filePath)
      
      // Check if file needs processing (smart sync)
      if (!forceReprocess) {
        const shouldProcess = await this.shouldProcessFile(fileMetadata)
        if (!shouldProcess) {
          logger.info('File unchanged, skipping processing', { 
            filePath, 
            fileName: fileMetadata.name,
            fileId: fileMetadata.id 
          })
          return
        }
      }

      logger.info('File requires processing', { 
        filePath, 
        fileName: fileMetadata.name,
        forced: forceReprocess 
      })
      
      // Timeout applied file reading (PDF processing can take long)
      const document = await withTimeout(this.fileReader.readFileContent(filePath), {
        timeoutMs: 60000, // 1 minute
        operation: 'file_reading',
        fallback: async () => {
          logger.warn('File reading timed out, attempting fallback', { filePath })
          return null
        },
      })

      if (!document) {
        const error = new FileProcessingError(
          'Could not read file content',
          filePath,
          'content_reading'
        )
        errorMonitor.recordError(error)
        logger.error('Failed to read file content', error, { filePath })
        return
      }

      // Add file metadata to document metadata
      const processedAt = new Date().toISOString()
      document.metadata = {
        ...document.metadata,
        fileId: fileMetadata.id,
        fileName: fileMetadata.name,
        filePath: fileMetadata.path,
        fileType: fileMetadata.fileType,
        size: fileMetadata.size,
        createdAt: fileMetadata.createdAt.toISOString(),
        sourceType: 'local_file',
        processedAt: processedAt,
        updatedAt: processedAt, // Set updatedAt for LanceDB schema consistency
      }

      // Chunking with retry logic
      const langchainChunks = await withRetry(
        () => this.textChunker.chunkDocument(document),
        'document_chunking',
        { retries: 2 }
      )

      // Convert to DocumentChunk format
      const documentChunks: DocumentChunk[] = langchainChunks.map((chunk, index) => ({
        id: `${fileMetadata.id}_${index}`,
        fileId: fileMetadata.id,
        chunkIndex: index,
        content: chunk.pageContent,
      }))

      logger.info('Document chunked successfully', {
        filePath,
        chunkCount: documentChunks.length,
      })

      // Clear existing chunks for this file from VectorStore
      await this.vectorStoreProvider.removeDocumentsByFileId(fileMetadata.id)

      // Process chunks in batches
      const batchSize = this.config.embeddingBatchSize || 10
      for (let i = 0; i < documentChunks.length; i += batchSize) {
        const batch = documentChunks.slice(i, i + batchSize)
        await this.processChunkBatch(batch, fileMetadata)
      }

      // Update vector counts in metadata
      const indexInfo = this.vectorStoreProvider.getIndexInfo()
      await this.embeddingMetadataService.updateVectorCounts(
        Math.floor(indexInfo.totalVectors / 10), // Rough estimate of document count
        indexInfo.totalVectors
      )

      logger.info('File processing completed successfully', {
        filePath,
        chunkCount: documentChunks.length,
        totalVectors: indexInfo.totalVectors,
      })

      endTiming()

    } catch (error) {
      const processingError = error instanceof FileProcessingError ? error : new FileProcessingError(
        'File processing pipeline failed',
        filePath,
        'processing',
        error instanceof Error ? error : new Error(String(error))
      )

      logger.error('File processing failed', processingError, { filePath })
      endTiming()
      errorMonitor.recordError(processingError)
      throw processingError
    } finally {
      this.processingQueue.delete(filePath)
    }
  }

  async removeFile(filePath: string): Promise<void> {
    try {
      logger.info('Removing file from VectorStore', { filePath })

      // Generate file ID for removal
      const fileMetadata = await this.extractFileMetadata(filePath)
      
      // Remove from VectorStore
      await this.vectorStoreProvider.removeDocumentsByFileId(fileMetadata.id)

      // Update vector counts
      const indexInfo = this.vectorStoreProvider.getIndexInfo()
      await this.embeddingMetadataService.updateVectorCounts(
        Math.floor(indexInfo.totalVectors / 10),
        indexInfo.totalVectors
      )

      logger.info('File removed successfully', {
        filePath,
        remainingVectors: indexInfo.totalVectors,
      })

    } catch (error) {
      const removalError = new FileProcessingError(
        'Failed to remove file',
        filePath,
        'file_removal',
        error instanceof Error ? error : new Error(String(error))
      )

      logger.error('File removal failed', removalError)
      errorMonitor.recordError(removalError)
      throw removalError
    }
  }

  /**
   * Extract file metadata without database
   */
  private async extractFileMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const stats = await stat(filePath)
      const fileName = basename(filePath)
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || ''
      
      // Generate consistent file ID based on path
      const fileId = createHash('sha256').update(filePath).digest('hex').substring(0, 16)
      
      return {
        id: fileId,
        name: fileName,
        path: filePath,
        size: stats.size,
        fileType: this.guessFileType(fileExtension),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        hash: fileId, // Use fileId as hash for simplicity
      }
    } catch (error) {
      throw new FileProcessingError(
        `Failed to extract file metadata: ${error}`,
        filePath,
        'metadata_extraction',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Process a batch of chunks
   */
  private async processChunkBatch(chunks: DocumentChunk[], fileMetadata: FileMetadata): Promise<void> {
    try {
      const processedAt = new Date().toISOString()
      // Convert chunks to VectorDocuments
      const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
        id: `${fileMetadata.id}_${index}`,
        content: chunk.content,
        metadata: {
          fileId: fileMetadata.id,
          fileName: fileMetadata.name,
          filePath: fileMetadata.path,
          fileType: fileMetadata.fileType,
          chunkIndex: index,
          chunkCount: chunks.length,
          size: fileMetadata.size,
          createdAt: fileMetadata.createdAt.toISOString(),
          processedAt: processedAt,
          updatedAt: processedAt, // Set updatedAt for LanceDB schema consistency
          sourceType: 'local_file',
        }
      }))

      // Add to VectorStore
      await this.vectorStoreProvider.addDocuments(vectorDocuments)

      logger.debug('Processed chunk batch', {
        fileId: fileMetadata.id,
        batchSize: chunks.length,
      })

    } catch (error) {
      throw new VectorStoreError(
        'Failed to process chunk batch',
        'batch_processing',
        { fileId: fileMetadata.id, batchSize: chunks.length },
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Guess file type from extension
   */
  private guessFileType(extension: string): string {
    const typeMap: Record<string, string> = {
      'txt': 'text',
      'md': 'markdown',
      'pdf': 'pdf',
      'doc': 'document',
      'docx': 'document', 
      'json': 'json',
      'csv': 'csv',
      'html': 'html',
      'htm': 'html',
      'xml': 'xml',
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
    }

    return typeMap[extension] || extension || 'text'
  }

  /**
   * Get processing queue status
   */
  getProcessingStatus(): { activeFiles: string[], queueSize: number } {
    return {
      activeFiles: Array.from(this.processingQueue),
      queueSize: this.processingQueue.size,
    }
  }

  /**
   * Check if file is currently being processed
   */
  isProcessing(filePath: string): boolean {
    return this.processingQueue.has(filePath)
  }

  /**
   * Check if file should be processed based on changes
   * Returns true if file needs processing, false if unchanged
   */
  private async shouldProcessFile(currentMetadata: FileMetadata): Promise<boolean> {
    try {
      // Get existing metadata from vector store
      if (!this.vectorStoreProvider.getFileMetadata) {
        logger.debug('getFileMetadata not supported by vector store provider')
        return true // Default to processing if check not supported
      }
      const existingMetadata = await this.vectorStoreProvider.getFileMetadata(currentMetadata.id)
      
      if (!existingMetadata) {
        logger.debug('File not found in vector store, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name
        })
        return true // New file
      }

      // Compare file size
      if (currentMetadata.size !== existingMetadata.size) {
        logger.debug('File size changed, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name,
          oldSize: existingMetadata.size,
          newSize: currentMetadata.size
        })
        return true
      }

      // Compare modification time
      const currentModTime = currentMetadata.modifiedAt.getTime()
      const existingProcessedTime = existingMetadata.processedAt 
        ? new Date(existingMetadata.processedAt).getTime()
        : new Date(existingMetadata.createdAt).getTime()
      
      if (currentModTime > existingProcessedTime) {
        logger.debug('File modification time changed, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name,
          oldProcessedTime: existingMetadata.processedAt || existingMetadata.createdAt,
          newModTime: currentMetadata.modifiedAt.toISOString()
        })
        return true
      }

      // Compare file hash if available (both should use hash field consistently)
      if (currentMetadata.hash && existingMetadata.fileId) {
        // Use fileId as the stored hash since that's how we generate it
        if (currentMetadata.hash !== existingMetadata.fileId) {
          logger.debug('File hash changed, needs processing', {
            fileId: currentMetadata.id,
            fileName: currentMetadata.name,
            oldHash: existingMetadata.fileId,
            newHash: currentMetadata.hash
          })
          return true
        }
      }

      logger.debug('File unchanged, skipping processing', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        size: currentMetadata.size,
        modTime: currentMetadata.modifiedAt.toISOString()
      })

      return false // File unchanged
    } catch (error) {
      logger.warn('Failed to check file changes, defaulting to process', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        error: error instanceof Error ? error.message : String(error)
      })
      return true // Default to processing if check fails
    }
  }

  /**
   * Perform smart directory synchronization
   * Only processes changed files
   */
  async syncDirectoryWithVectorStore(documentsDir: string): Promise<void> {
    try {
      logger.info('🔄 Starting smart directory synchronization...', {
        documentsDir,
        component: 'DocumentProcessor'
      })

      // Get all existing file metadata from vector store
      if (!this.vectorStoreProvider.getAllFileMetadata) {
        logger.warn('getAllFileMetadata not supported by vector store provider, skipping smart sync')
        return // Skip smart sync if not supported
      }
      const existingFiles = await this.vectorStoreProvider.getAllFileMetadata()
      logger.info(`📊 Found ${existingFiles.size} files in vector store`)

      // Get all current files in directory
      const { glob } = await import('glob')
      const pattern = `${documentsDir}/**/*.{txt,md,pdf,doc,docx,csv,json,html,xml}`
      const currentFilePaths = await glob(pattern)
      
      logger.info(`📁 Found ${currentFilePaths.length} files in directory`)

      const processedFiles = new Set<string>()
      let newFiles = 0
      let updatedFiles = 0
      let skippedFiles = 0

      // Process current files
      for (const filePath of currentFilePaths) {
        try {
          const fileMetadata = await this.extractFileMetadata(filePath)
          processedFiles.add(fileMetadata.id)
          
          const shouldProcess = await this.shouldProcessFile(fileMetadata)
          if (shouldProcess) {
            const isNew = !existingFiles.has(fileMetadata.id)
            logger.info(`${isNew ? '🆕 New file' : '🔄 Updated file'} detected`, {
              fileName: fileMetadata.name,
              filePath
            })
            
            await this.processFile(filePath, false) // Don't force, use smart logic
            
            if (isNew) {
              newFiles++
            } else {
              updatedFiles++
            }
          } else {
            skippedFiles++
          }
        } catch (error) {
          logger.error('Failed to process file during sync', error instanceof Error ? error : new Error(String(error)), {
            filePath
          })
        }
      }

      // Remove files that no longer exist
      let deletedFiles = 0
      for (const [fileId, metadata] of existingFiles) {
        if (!processedFiles.has(fileId)) {
          logger.info('🗑️ File no longer exists, removing from vector store', {
            fileName: metadata.fileName,
            filePath: metadata.filePath,
            fileId
          })
          
          try {
            await this.vectorStoreProvider.removeDocumentsByFileId(fileId)
            deletedFiles++
          } catch (error) {
            logger.error('Failed to remove deleted file from vector store', error instanceof Error ? error : new Error(String(error)), {
              fileId,
              fileName: metadata.fileName
            })
          }
        }
      }

      logger.info('✅ Smart directory synchronization completed', {
        totalFiles: currentFilePaths.length,
        newFiles,
        updatedFiles,
        skippedFiles,
        deletedFiles,
        component: 'DocumentProcessor'
      })

    } catch (error) {
      logger.error('Smart directory synchronization failed', error instanceof Error ? error : new Error(String(error)), {
        documentsDir,
        component: 'DocumentProcessor'
      })
      throw error
    }
  }
}