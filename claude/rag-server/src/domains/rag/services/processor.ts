/**
 * Document Processor - Simplified Version
 * Simple document processing following GPT Best Practices
 */

import { logger, startTiming } from '@/shared/logger/index.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'
import type { IFileProcessingService } from '@/domains/rag/core/interfaces.js'
import type { VectorDocument, DocumentMetadata } from '@/domains/rag/core/types.js'
import { FileReader } from './reader.js'
import { ChunkingService } from './chunking.js'
import { extractFileId, extractFileMetadata } from '@/shared/utils/file-metadata.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'

/**
 * Document Processor - Simplified Version (GPT Best Practice)
 * Remove complex metadata system, perform only basic processing
 */
export class DocumentProcessor implements IFileProcessingService {
  private processingQueue = new Set<string>()
  private fileReader: FileReader
  private textChunker: ChunkingService

  constructor(private vectorStoreProvider: LanceDBProvider, private config: ServerConfig) {
    this.fileReader = new FileReader()
    this.textChunker = new ChunkingService(config)
  }

  /**
   * Process file (simplified version)
   */
  async processFile(filePath: string): Promise<void> {
    const endTiming = startTiming('document_processing', {
      file: filePath,
      component: 'DocumentProcessor',
    })

    try {
      // Prevent duplicate processing
      if (this.processingQueue.has(filePath)) {
        logger.debug(`File already being processed: ${filePath}`)
        return
      }

      this.processingQueue.add(filePath)

      logger.info('📝 Processing file', {
        filePath,
        component: 'DocumentProcessor',
      })

      // Extract file metadata
      const fileMetadata = await extractFileMetadata(filePath)

      // Check if file already exists and is up to date
      const hasExistingDocs = await this.vectorStoreProvider.hasDocumentsForFileId(fileMetadata.id)
      if (hasExistingDocs) {
        logger.debug('File already indexed, skipping', { filePath })
        return
      }

      // Read file content
      const document = await this.fileReader.readFileContent(filePath)
      if (!document || !document.pageContent.trim()) {
        logger.warn('No content extracted from file', { filePath })
        return
      }

      // Create document metadata
      const documentMetadata: DocumentMetadata = {
        fileName: fileMetadata.name,
        filePath: fileMetadata.path,
        fileType: fileMetadata.fileType,
        fileSize: fileMetadata.size,
        fileHash: fileMetadata.hash,
        createdAt: fileMetadata.createdAt,
        modifiedAt: fileMetadata.modifiedAt,
        processedAt: new Date().toISOString(),
      }

      // Chunk the document
      const chunks = await this.textChunker.chunkText(document.pageContent, filePath)

      // Create vector documents
      const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
        id: `${fileMetadata.id}_chunk_${index}`,
        doc_id: fileMetadata.id,
        chunk_id: index,
        content: chunk.content,
        metadata: documentMetadata,
      }))

      // Add to vector store
      await this.vectorStoreProvider.addDocuments(vectorDocuments)

      logger.info('✅ File processed successfully', {
        filePath,
        chunksCount: chunks.length,
        component: 'DocumentProcessor',
      })
    } catch (error) {
      const structuredError = new StructuredError(
        `Failed to process file: ${filePath}`,
        ErrorCode.PROCESSING_ERROR,
        'HIGH',
        { filePath },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      logger.error('❌ File processing failed', structuredError)
      throw structuredError
    } finally {
      this.processingQueue.delete(filePath)
      endTiming()
    }
  }

  /**
   * Remove file from index
   */
  async removeFile(filePath: string): Promise<void> {
    try {
      logger.info('🗑️ Removing file from index', {
        filePath,
        component: 'DocumentProcessor',
      })

      const fileId = await extractFileId(filePath)

      await this.vectorStoreProvider.removeDocumentsByFileId(fileId)

      logger.info('✅ File removed successfully', {
        filePath,
        component: 'DocumentProcessor',
      })
    } catch (error) {
      const structuredError = new StructuredError(
        `Failed to remove file: ${filePath}`,
        ErrorCode.DELETE_ERROR,
        'HIGH',
        { filePath },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      logger.error('❌ File removal failed', structuredError)
      throw structuredError
    }
  }

  /**
   * Get processing status
   */
  getProcessingStatus() {
    return {
      isProcessing: this.processingQueue.size > 0,
      queueSize: this.processingQueue.size,
      currentFiles: Array.from(this.processingQueue),
    }
  }
}
