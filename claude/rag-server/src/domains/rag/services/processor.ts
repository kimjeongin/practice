/**
 * Document Processor - Simplified Version
 * Simple document processing following GPT Best Practices
 */

import { logger, startTiming } from '@/shared/logger/index.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'
import type { IFileProcessingService } from '@/domains/rag/core/interfaces.js'
import type { DocumentMetadata } from '@/domains/rag/core/types.js'
import { FileReader } from './reader.js'
import { ChunkingService, type ContextualChunk } from './chunking.js'
import { EmbeddingService } from '../ollama/embedding.js'
import { extractFileId, extractFileMetadata } from '@/shared/utils/file-metadata.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import type { RAGDocumentRecord } from '@/domains/rag/core/types.js'

/**
 * Document Processor - Simplified Version (GPT Best Practice)
 * Remove complex metadata system, perform only basic processing
 */
export class DocumentProcessor implements IFileProcessingService {
  private processingQueue = new Set<string>()
  private fileReader: FileReader
  private chunker: ChunkingService
  private embeddingService: EmbeddingService
  private config: ServerConfig

  constructor(private vectorStoreProvider: LanceDBProvider, config: ServerConfig) {
    this.config = config
    this.fileReader = new FileReader()
    this.embeddingService = new EmbeddingService(config)
    this.chunker = new ChunkingService(config, this.embeddingService)
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

      // Initialize embedding service if not ready
      if (!this.embeddingService.isReady()) {
        await this.embeddingService.initialize()
      }

      // Use chunking strategy based on configuration
      const ragDocuments: RAGDocumentRecord[] = []
      const currentModelName = this.embeddingService.getModelInfo().name || 'unknown'

      if (this.config.chunkingStrategy === 'contextual') {
        // Use contextual chunking for better performance
        const contextualChunks = await this.chunker.chunkTextWithContext(
          document.pageContent, 
          filePath
        )

        for (const { chunk, contextualText } of contextualChunks) {
          try {
            // Generate embedding from contextual text (safe method handles overflow)
            // Note: EmbeddingService returns raw vectors, will be normalized later
            const embedding = await this.chunker.createSafeEmbedding(contextualText)

            ragDocuments.push({
              vector: embedding,
              text: chunk.content, // Original chunk for LLM
              contextual_text: contextualText, // Contextual text used for embedding
              doc_id: fileMetadata.id,
              chunk_id: chunk.index,
              metadata: JSON.stringify(documentMetadata),
              model_name: currentModelName,
            })
          } catch (error) {
            logger.error(
              'Failed to process contextual chunk',
              error instanceof Error ? error : new Error(String(error)),
              {
                chunkIndex: chunk.index,
                component: 'DocumentProcessor',
              }
            )
            
            // Fallback: use original chunk without context
            // Note: EmbeddingService returns raw vectors, will be normalized later
            const fallbackEmbedding = await this.embeddingService.embedQuery(chunk.content)
            ragDocuments.push({
              vector: fallbackEmbedding,
              text: chunk.content,
              contextual_text: chunk.content, // Use chunk content as fallback contextual text
              doc_id: fileMetadata.id,
              chunk_id: chunk.index,
              metadata: JSON.stringify(documentMetadata),
              model_name: currentModelName,
            })
          }
        }

        logger.info('✅ File processed successfully with contextual chunking', {
          filePath,
          chunksCount: contextualChunks.length,
          ragDocumentsCount: ragDocuments.length,
          component: 'DocumentProcessor',
        })
      } else {
        // Use normal chunking
        const normalChunks = await this.chunker.chunkText(document.pageContent, filePath)

        for (const chunk of normalChunks) {
          try {
            // Note: EmbeddingService returns raw vectors, will be normalized later
            const embedding = await this.embeddingService.embedQuery(chunk.content)

            ragDocuments.push({
              vector: embedding,
              text: chunk.content,
              contextual_text: chunk.content, // Same as text for normal chunking
              doc_id: fileMetadata.id,
              chunk_id: chunk.index,
              metadata: JSON.stringify(documentMetadata),
              model_name: currentModelName,
            })
          } catch (error) {
            logger.error(
              'Failed to process normal chunk',
              error instanceof Error ? error : new Error(String(error)),
              {
                chunkIndex: chunk.index,
                component: 'DocumentProcessor',
              }
            )
          }
        }

        logger.info('✅ File processed successfully with normal chunking', {
          filePath,
          chunksCount: normalChunks.length,
          ragDocumentsCount: ragDocuments.length,
          component: 'DocumentProcessor',
        })
      }

      // Normalize vectors and add to LanceDB table
      await this.addRAGDocuments(ragDocuments)
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
   * Add RAG documents using LanceDBProvider to ensure consistent normalization
   */
  private async addRAGDocuments(ragDocuments: RAGDocumentRecord[]): Promise<void> {
    if (ragDocuments.length === 0) return

    // Convert RAG documents to VectorDocuments format for LanceDBProvider
    const vectorDocuments = ragDocuments.map((ragDoc) => {
      const metadata = JSON.parse(ragDoc.metadata)
      return {
        id: `${ragDoc.doc_id}_chunk_${ragDoc.chunk_id}`, // Generate unique chunk ID
        content: ragDoc.text,
        vector: ragDoc.vector, // Raw vector - will be normalized by LanceDBProvider
        doc_id: ragDoc.doc_id,
        chunk_id: ragDoc.chunk_id,
        metadata: metadata,
        modelName: ragDoc.model_name,
      }
    })

    // Use LanceDBProvider's addDocuments method for consistent normalization
    await this.vectorStoreProvider.addDocuments(vectorDocuments)

    logger.debug('✅ RAG documents added via LanceDBProvider with consistent normalization', {
      count: ragDocuments.length,
      component: 'DocumentProcessor',
    })
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
