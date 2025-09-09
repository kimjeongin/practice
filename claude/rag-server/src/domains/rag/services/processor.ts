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
   * Optimized file processing with reduced redundancy and batch operations
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

      logger.debug('📝 Processing file', { filePath, component: 'DocumentProcessor' })

      // Extract file metadata and read content in parallel
      const [fileMetadata, document] = await Promise.all([
        extractFileMetadata(filePath),
        this.fileReader.readFileContent(filePath),
      ])

      // Early validation
      if (!document?.pageContent?.trim()) {
        logger.warn('No content extracted from file', { filePath })
        return
      }

      // Check if file already exists and is up to date
      const hasExistingDocs = await this.vectorStoreProvider.hasDocumentsForFileId(fileMetadata.id)
      if (hasExistingDocs) {
        logger.debug('File already indexed, skipping', { filePath })
        return
      }

      // Ensure embedding service is ready
      await this.ensureEmbeddingServiceReady()

      // Process chunks and embeddings
      const ragDocuments = await this.processDocumentChunks(
        document.pageContent,
        filePath,
        fileMetadata
      )

      // Batch add to vector store
      await this.addRAGDocuments(ragDocuments)

      logger.debug('✅ File processed successfully', {
        filePath,
        chunksCount: ragDocuments.length,
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
   * Ensure embedding service is initialized (cached check)
   */
  private async ensureEmbeddingServiceReady(): Promise<void> {
    if (!this.embeddingService.isReady()) {
      await this.embeddingService.initialize()
    }
  }

  /**
   * Process document chunks with optimized embedding generation
   */
  private async processDocumentChunks(
    content: string,
    filePath: string,
    fileMetadata: any
  ): Promise<RAGDocumentRecord[]> {
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

    const currentModelName = this.embeddingService.getModelInfo().name || 'unknown'
    const serializedMetadata = JSON.stringify(documentMetadata)

    if (this.config.chunkingStrategy === 'contextual') {
      return this.processContextualChunks(
        content,
        filePath,
        fileMetadata.id,
        serializedMetadata,
        currentModelName
      )
    } else {
      return this.processNormalChunks(
        content,
        filePath,
        fileMetadata.id,
        serializedMetadata,
        currentModelName
      )
    }
  }

  /**
   * Process contextual chunks with batch embedding
   */
  private async processContextualChunks(
    content: string,
    filePath: string,
    docId: string,
    serializedMetadata: string,
    modelName: string
  ): Promise<RAGDocumentRecord[]> {
    const contextualChunks = await this.chunker.chunkTextWithContext(content, filePath)

    // Extract all contextual texts for batch embedding
    const contextsToEmbed = contextualChunks.map((cc) => cc.contextualText)
    const embeddings = await this.embeddingService.embedDocuments(contextsToEmbed)

    // Create RAG documents
    return contextualChunks.map((cc, index) => ({
      vector: embeddings[index] || [],
      text: cc.chunk.content,
      contextual_text: cc.contextualText,
      doc_id: docId,
      chunk_id: cc.chunk.index,
      metadata: serializedMetadata,
      model_name: modelName,
    }))
  }

  /**
   * Process normal chunks with batch embedding
   */
  private async processNormalChunks(
    content: string,
    filePath: string,
    docId: string,
    serializedMetadata: string,
    modelName: string
  ): Promise<RAGDocumentRecord[]> {
    const chunks = await this.chunker.chunkText(content, filePath)

    // Extract all chunk contents for batch embedding
    const textsToEmbed = chunks.map((chunk) => chunk.content)
    const embeddings = await this.embeddingService.embedDocuments(textsToEmbed)

    // Create RAG documents
    return chunks.map((chunk, index) => ({
      vector: embeddings[index] || [],
      text: chunk.content,
      contextual_text: chunk.content,
      doc_id: docId,
      chunk_id: chunk.index,
      metadata: serializedMetadata,
      model_name: modelName,
    }))
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
        vector: ragDoc.vector, // Normalized vector from EmbeddingService
        doc_id: ragDoc.doc_id,
        chunk_id: ragDoc.chunk_id,
        metadata: metadata,
        modelName: ragDoc.model_name,
      }
    })

    // Use LanceDBProvider's addDocuments method (vectors already normalized)
    await this.vectorStoreProvider.addDocuments(vectorDocuments)

    logger.debug('✅ RAG documents added via LanceDBProvider', {
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
