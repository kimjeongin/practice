import { basename } from 'path'
import { extractFileMetadata } from '@/shared/utils/file-metadata.js'
import { IFileProcessingService, VectorDocument } from '@/domains/rag/core/types.js'
import { IVectorStoreService } from '@/domains/rag/core/types.js'
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
import { ModelCompatibilityService } from '../models/index.js'
import { stat } from 'fs/promises'
import {
  UnifiedDocumentMetadata,
  createUnifiedMetadata,
  isUnifiedDocumentMetadata,
} from '@/shared/schemas/metadata-schema.js'
import {
  DataTransformer,
  MetadataValidator,
  QueryGenerator,
} from '@/shared/schemas/schema-generator.js'
import {
  ContentAnalyzer,
  ContentAnalysisConfig,
} from '@/shared/content-analysis/content-analyzer.js'

/**
 * Document Processor - Enhanced with Unified Metadata Schema
 * Processes files with comprehensive metadata extraction and analysis
 */
export class DocumentProcessor implements IFileProcessingService {
  private processingQueue = new Set<string>()
  private fileReader: FileReader
  private textChunker: ChunkingService
  private contentAnalyzer: ContentAnalyzer

  constructor(
    private vectorStoreProvider: VectorStoreProvider,
    private modelCompatibilityService: ModelCompatibilityService,
    private config: ServerConfig
  ) {
    this.fileReader = new FileReader()
    this.textChunker = new ChunkingService(config)

    // Initialize content analyzer with configuration
    const analysisConfig: ContentAnalysisConfig = {
      enableLanguageDetection: true,
      enableKeywordExtraction: true,
      enableCategoryClassification: true,
      enableSummarization: false, // Disabled for now
      enableContextHeaders: true,
      keywordLimit: 15,
      summaryMaxLength: 300,
      contextHeaderLimit: 8,
    }
    this.contentAnalyzer = new ContentAnalyzer(analysisConfig)
  }

  async processFile(filePath: string, forceReprocess: boolean = false): Promise<void> {
    if (this.processingQueue.has(filePath)) {
      logger.debug('File already being processed', { filePath, component: 'DocumentProcessor' })
      return
    }

    this.processingQueue.add(filePath)
    const endTiming = startTiming('file_processing', { filePath, component: 'DocumentProcessor' })

    try {
      logger.info('Starting enhanced file processing', { filePath, fileName: basename(filePath) })

      // Generate unified file metadata
      const baseFileMetadata = await extractFileMetadata(filePath)

      // Check if file needs processing (smart sync)
      if (!forceReprocess) {
        const shouldProcess = await this.shouldProcessFile(baseFileMetadata)
        if (!shouldProcess) {
          logger.info('File unchanged, skipping processing', {
            filePath,
            fileName: baseFileMetadata.name,
            fileId: baseFileMetadata.id,
          })
          return
        }
      }

      logger.info('File requires processing', {
        filePath,
        fileName: baseFileMetadata.name,
        forced: forceReprocess,
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

      // Create base unified metadata structure
      const now = new Date()
      const baseUnifiedMetadata = createUnifiedMetadata({
        file: {
          id: baseFileMetadata.id,
          name: baseFileMetadata.name,
          path: baseFileMetadata.path,
          size: baseFileMetadata.size,
          hash: baseFileMetadata.hash,
          type: baseFileMetadata.fileType,
          mimeType: this.guessMimeType(baseFileMetadata.fileType),
          encoding: 'utf-8', // Default, could be detected
        },
        timestamps: {
          created: baseFileMetadata.createdAt,
          modified: baseFileMetadata.modifiedAt,
          processed: now,
          indexed: now,
        },
        system: {
          modelVersion: this.modelCompatibilityService.getActiveMetadata
            ? (await this.modelCompatibilityService.getActiveMetadata())?.modelVersion || '1.0.0'
            : '1.0.0',
          processingVersion: '2.0.0', // New schema version
          sourceType: 'local_file',
          status: 'processing',
        },
      })

      // Analyze document content for enhanced metadata
      logger.debug('Analyzing document content for enhanced metadata')
      const contentAnalysis = await this.contentAnalyzer.analyzeContent(
        document.pageContent,
        baseUnifiedMetadata
      )

      // Merge content analysis into unified metadata
      const enhancedMetadata: UnifiedDocumentMetadata = {
        ...baseUnifiedMetadata,
        content: {
          ...baseUnifiedMetadata.content,
          language: contentAnalysis.language,
          category: contentAnalysis.category,
          keywords: contentAnalysis.keywords,
          summary: contentAnalysis.summary,
          importance: contentAnalysis.importance,
          readingTime: contentAnalysis.readingTime,
          wordCount: contentAnalysis.wordCount,
        },
        search: {
          ...baseUnifiedMetadata.search,
          tags: contentAnalysis.keywords?.slice(0, 5), // Use top keywords as tags
          searchableText: contentAnalysis.searchableText,
          contextHeaders: contentAnalysis.contextHeaders,
          searchBoost: contentAnalysis.importance || 1.0,
        },
        system: {
          ...baseUnifiedMetadata.system,
          status: 'completed',
        },
      }

      // Add metadata to document for chunking compatibility
      document.metadata = {
        ...document.metadata,
        ...DataTransformer.unifiedToLanceDBRecord(enhancedMetadata, '', []),
      }

      // Chunking with retry logic
      const langchainChunks = await withRetry(
        () => this.textChunker.chunkDocument(document),
        'document_chunking',
        { retries: 2 }
      )

      // Convert to enhanced DocumentChunk format with per-chunk analysis
      const documentChunks: DocumentChunk[] = []
      for (let index = 0; index < langchainChunks.length; index++) {
        const chunk = langchainChunks[index]!

        // Create chunk-specific metadata
        const chunkMetadata: UnifiedDocumentMetadata = {
          ...enhancedMetadata,
          structure: {
            ...enhancedMetadata.structure,
            chunkIndex: index,
            totalChunks: langchainChunks.length,
          },
          timestamps: {
            ...enhancedMetadata.timestamps,
            indexed: new Date(), // Update index time for each chunk
          },
        }

        // Analyze chunk content for section-specific metadata
        if (chunk.pageContent.length > 100) {
          // Only analyze substantial chunks
          const chunkAnalysis = await this.contentAnalyzer.analyzeContent(
            chunk.pageContent,
            chunkMetadata
          )

          // Update chunk-specific content analysis
          chunkMetadata.content = {
            ...chunkMetadata.content,
            keywords: chunkAnalysis.keywords,
            importance: chunkAnalysis.importance,
            wordCount: chunkAnalysis.wordCount,
          }

          chunkMetadata.search = {
            ...chunkMetadata.search,
            contextHeaders: chunkAnalysis.contextHeaders,
            searchableText: chunkAnalysis.searchableText,
            searchBoost: chunkAnalysis.importance || 1.0,
          }
        }

        documentChunks.push({
          id: `${baseFileMetadata.id}_${index}`,
          fileId: baseFileMetadata.id,
          chunkIndex: index,
          content: chunk.pageContent,
          metadata: chunkMetadata,
        })
      }

      logger.info('Document chunked and analyzed successfully', {
        filePath,
        chunkCount: documentChunks.length,
        language: enhancedMetadata.content.language,
        category: enhancedMetadata.content.category,
        keywords: enhancedMetadata.content.keywords?.slice(0, 5),
      })

      // Clear existing chunks for this file from VectorStore
      await this.vectorStoreProvider.removeDocumentsByFileId(baseFileMetadata.id)

      // Process chunks in batches
      const batchSize = this.config.embeddingBatchSize || 10
      for (let i = 0; i < documentChunks.length; i += batchSize) {
        const batch = documentChunks.slice(i, i + batchSize)
        await this.processEnhancedChunkBatch(batch)
      }

      // Update vector counts in metadata
      const indexInfo = this.vectorStoreProvider.getIndexInfo()
      await this.modelCompatibilityService.updateVectorCounts(
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
      const processingError =
        error instanceof FileProcessingError
          ? error
          : new FileProcessingError(
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
      const fileMetadata = await extractFileMetadata(filePath)

      // Remove from VectorStore
      await this.vectorStoreProvider.removeDocumentsByFileId(fileMetadata.id)

      // Update vector counts
      const indexInfo = this.vectorStoreProvider.getIndexInfo()
      await this.modelCompatibilityService.updateVectorCounts(
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
   * Guess MIME type based on file extension
   */
  private guessMimeType(fileType: string): string {
    const mimeTypes: Record<string, string> = {
      text: 'text/plain',
      markdown: 'text/markdown',
      pdf: 'application/pdf',
      document: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      json: 'application/json',
      csv: 'text/csv',
      html: 'text/html',
      xml: 'application/xml',
      javascript: 'application/javascript',
      typescript: 'application/typescript',
      python: 'text/x-python',
      java: 'text/x-java-source',
      cpp: 'text/x-c++src',
      c: 'text/x-csrc',
      go: 'text/x-go',
      rust: 'text/x-rust',
    }

    return mimeTypes[fileType] || 'text/plain'
  }


  /**
   * Process a batch of enhanced chunks with unified metadata
   */
  private async processEnhancedChunkBatch(chunks: DocumentChunk[]): Promise<void> {
    try {
      // Convert chunks to VectorDocuments with enhanced metadata
      const vectorDocuments: VectorDocument[] = chunks.map((chunk) => {
        const unifiedMetadata = (chunk.metadata || {}) as UnifiedDocumentMetadata

        // Validate metadata before processing
        const validation = MetadataValidator.validateRequiredFields(unifiedMetadata, 'standard')
        if (!validation.isValid) {
          logger.warn('Chunk metadata validation failed, using defaults', {
            chunkId: chunk.id,
            missingFields: validation.missingFields,
          })

          // Fill in missing fields with defaults
          Object.assign(unifiedMetadata, createUnifiedMetadata(unifiedMetadata))
        }

        const lanceDBRecord = DataTransformer.unifiedToLanceDBRecord(
          unifiedMetadata,
          chunk.content,
          []
        )

        return {
          id: chunk.id,
          content: chunk.content,
          metadata: {
            fileId: lanceDBRecord.fileId,
            fileName: lanceDBRecord.fileName,
            filePath: lanceDBRecord.filePath,
            chunkIndex: lanceDBRecord.chunkIndex,
            fileType: lanceDBRecord.fileType,
            createdAt: lanceDBRecord.createdAt,
            ...lanceDBRecord, // Include all other fields
          },
        }
      })

      // Add to VectorStore
      await this.vectorStoreProvider.addDocuments(vectorDocuments)

      logger.debug('Processed enhanced chunk batch', {
        batchSize: chunks.length,
        firstChunkId: chunks[0]?.id,
      })
    } catch (error) {
      throw new VectorStoreError(
        'Failed to process enhanced chunk batch',
        'batch_processing',
        { batchSize: chunks.length },
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Process a batch of chunks (legacy method for backward compatibility)
   */
  private async processChunkBatch(
    chunks: DocumentChunk[],
    fileMetadata: FileMetadata
  ): Promise<void> {
    try {
      const processedAt = new Date().toISOString()
      // Convert chunks to VectorDocuments - ensure all required fields are included
      const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
        id: `${fileMetadata.id}_${index}`,
        content: chunk.content,
        metadata: {
          fileId: fileMetadata.id,
          fileName: fileMetadata.name,
          filePath: fileMetadata.path,
          fileType: fileMetadata.fileType,
          fileSize: fileMetadata.size, // Use consistent field name
          size: fileMetadata.size, // Keep both for compatibility
          fileHash: fileMetadata.hash, // Include file hash
          fileModifiedAt: fileMetadata.modifiedAt.toISOString(), // Include file modified time
          fileCreatedAt: fileMetadata.createdAt.toISOString(), // Include file created time
          chunkIndex: index,
          chunkCount: chunks.length,
          createdAt: fileMetadata.createdAt.toISOString(), // Keep for compatibility
          processedAt: processedAt,
          updatedAt: processedAt, // Set updatedAt for LanceDB schema consistency
          sourceType: 'local_file',
        },
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
      txt: 'text',
      md: 'markdown',
      pdf: 'pdf',
      doc: 'document',
      docx: 'document',
      json: 'json',
      csv: 'csv',
      html: 'html',
      htm: 'html',
      xml: 'xml',
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      go: 'go',
      rs: 'rust',
    }

    return typeMap[extension] || extension || 'text'
  }

  /**
   * Get processing queue status
   */
  getProcessingStatus(): { activeFiles: string[]; queueSize: number } {
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
        logger.debug(
          'getFileMetadata not supported by vector store provider, assuming processing needed'
        )
        return true // Default to processing if check not supported
      }
      const existingMetadata = await this.vectorStoreProvider.getFileMetadata(currentMetadata.id)

      if (!existingMetadata) {
        logger.info('📄 New file detected, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name,
          filePath: currentMetadata.path,
        })
        return true // New file
      }

      logger.debug('📋 Comparing file metadata for change detection', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        current: {
          size: currentMetadata.size,
          modTime: currentMetadata.modifiedAt.toISOString(),
          hash: currentMetadata.hash,
        },
        existing: {
          size: existingMetadata.size || existingMetadata.fileSize,
          modTime: existingMetadata.fileModifiedAt || existingMetadata.modifiedAt,
          hash: existingMetadata.fileHash || existingMetadata.hash,
          processedAt: existingMetadata.processedAt,
        },
      })

      // Primary check: Compare file hash (most reliable)
      const existingHash = existingMetadata.fileHash || existingMetadata.hash
      if (currentMetadata.hash && existingHash) {
        if (currentMetadata.hash !== existingHash) {
          logger.info('🔄 File content changed (hash mismatch), needs processing', {
            fileId: currentMetadata.id,
            fileName: currentMetadata.name,
            oldHash: existingHash.substring(0, 8) + '...',
            newHash: currentMetadata.hash.substring(0, 8) + '...',
          })
          return true
        }
      }

      // Secondary check: Compare file size
      const existingSize = existingMetadata.size || existingMetadata.fileSize
      if (existingSize && currentMetadata.size !== existingSize) {
        logger.info('📏 File size changed, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name,
          oldSize: existingSize,
          newSize: currentMetadata.size,
        })
        return true
      }

      // Tertiary check: Compare modification time
      const existingModTime = existingMetadata.fileModifiedAt || existingMetadata.modifiedAt
      if (existingModTime) {
        const currentModTime = currentMetadata.modifiedAt.getTime()
        const storedModTime = new Date(existingModTime).getTime()

        if (currentModTime > storedModTime) {
          logger.info('⏰ File modification time newer, needs processing', {
            fileId: currentMetadata.id,
            fileName: currentMetadata.name,
            storedModTime: new Date(storedModTime).toISOString(),
            currentModTime: currentMetadata.modifiedAt.toISOString(),
          })
          return true
        }
      }

      logger.info('✅ File unchanged, skipping processing', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        size: currentMetadata.size,
        modTime: currentMetadata.modifiedAt.toISOString(),
        hash: currentMetadata.hash.substring(0, 8) + '...',
      })

      return false // File unchanged
    } catch (error) {
      logger.warn('⚠️ Failed to check file changes, defaulting to process', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        error: error instanceof Error ? error.message : String(error),
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
        component: 'DocumentProcessor',
      })

      // Get all existing file metadata from vector store
      if (!this.vectorStoreProvider.getAllFileMetadata) {
        logger.warn(
          'getAllFileMetadata not supported by vector store provider, performing full sync instead'
        )
        // Fallback to basic directory processing
        const { glob } = await import('glob')
        const pattern = `${documentsDir}/**/*.{txt,md,pdf,doc,docx,csv,json,html,xml}`
        const currentFilePaths = await glob(pattern)

        let processedCount = 0
        for (const filePath of currentFilePaths) {
          try {
            await this.processFile(filePath, false)
            processedCount++
          } catch (error) {
            logger.error(
              'Failed to process file during fallback sync',
              error instanceof Error ? error : new Error(String(error)),
              {
                filePath,
              }
            )
          }
        }
        logger.info('✅ Fallback sync completed', { processedFiles: processedCount })
        return
      }

      const existingFiles = await this.vectorStoreProvider.getAllFileMetadata()
      logger.info(`📊 Found ${existingFiles.size} files in vector store`)

      // Get all current files in directory
      const { glob } = await import('glob')
      const pattern = `${documentsDir}/**/*.{txt,md,pdf,doc,docx,csv,json,html,xml}`
      const currentFilePaths = await glob(pattern)

      logger.info(`📁 Found ${currentFilePaths.length} files in directory`)

      // Build mapping of current files by path and by file ID
      const currentFilesByPath = new Map<string, FileMetadata>()
      const currentFilesById = new Map<string, FileMetadata>()

      // Extract metadata for all current files first
      for (const filePath of currentFilePaths) {
        try {
          const fileMetadata = await extractFileMetadata(filePath)
          currentFilesByPath.set(filePath, fileMetadata)
          currentFilesById.set(fileMetadata.id, fileMetadata)
        } catch (error) {
          logger.error(
            'Failed to extract metadata for file during sync',
            error instanceof Error ? error : new Error(String(error)),
            {
              filePath,
            }
          )
        }
      }

      let newFiles = 0
      let updatedFiles = 0
      let skippedFiles = 0

      // Process current files
      for (const [filePath, fileMetadata] of currentFilesByPath) {
        try {
          const shouldProcess = await this.shouldProcessFile(fileMetadata)
          if (shouldProcess) {
            const isNew = !existingFiles.has(fileMetadata.id)
            logger.info(`${isNew ? '🆕 New file' : '🔄 Updated file'} detected`, {
              fileName: fileMetadata.name,
              filePath: fileMetadata.path,
            })

            await this.processFile(filePath, false) // Don't force, use smart logic

            if (isNew) {
              newFiles++
            } else {
              updatedFiles++
            }
          } else {
            skippedFiles++
            logger.debug('⏭️ Skipping unchanged file', {
              fileName: fileMetadata.name,
              filePath: fileMetadata.path,
            })
          }
        } catch (error) {
          logger.error(
            'Failed to process file during sync',
            error instanceof Error ? error : new Error(String(error)),
            {
              filePath,
              fileName: fileMetadata.name,
            }
          )
        }
      }

      // Remove files that no longer exist in the filesystem
      let deletedFiles = 0
      for (const [fileId, storedMetadata] of existingFiles) {
        // Check if file still exists by ID and verify path still exists
        const currentFile = currentFilesById.get(fileId)
        let shouldDelete = false

        if (!currentFile) {
          // File ID not found in current files - might be deleted
          shouldDelete = true
          logger.debug('🔍 File ID not found in current directory scan', {
            fileId,
            storedPath: storedMetadata.filePath,
            storedName: storedMetadata.fileName,
          })
        } else {
          // Double check: verify the file path actually exists
          try {
            await stat(currentFile.path)
            logger.debug('✅ File exists and matches stored metadata', {
              fileId,
              filePath: currentFile.path,
            })
          } catch (error) {
            shouldDelete = true
            logger.debug('💀 File path no longer accessible', {
              fileId,
              filePath: currentFile.path,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        if (shouldDelete) {
          logger.info('🗑️ File no longer exists, removing from vector store', {
            fileName: storedMetadata.fileName,
            filePath: storedMetadata.filePath,
            fileId,
          })

          try {
            await this.vectorStoreProvider.removeDocumentsByFileId(fileId)
            deletedFiles++
          } catch (error) {
            logger.error(
              'Failed to remove deleted file from vector store',
              error instanceof Error ? error : new Error(String(error)),
              {
                fileId,
                fileName: storedMetadata.fileName,
              }
            )
          }
        }
      }

      logger.info('✅ Smart directory synchronization completed', {
        totalFiles: currentFilePaths.length,
        newFiles,
        updatedFiles,
        skippedFiles,
        deletedFiles,
        vectorStoreFiles: existingFiles.size,
        component: 'DocumentProcessor',
      })
    } catch (error) {
      logger.error(
        'Smart directory synchronization failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          documentsDir,
          component: 'DocumentProcessor',
        }
      )
      throw error
    }
  }
}
