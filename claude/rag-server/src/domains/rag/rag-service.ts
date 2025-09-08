/**
 * RAG Service - Unified RAG Domain Facade
 * Provides a high-level interface to all RAG functionality with internal service management
 * Follows DDD Application Service pattern and popular OSS RAG framework design patterns
 */

import { logger } from '@/shared/logger/index.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import type {
  SearchOptions,
  SearchResult,
  VectorStoreInfo,
  EmbeddingModelInfo,
} from './core/types.js'
import type { IVectorStoreProvider, IEmbeddingService } from './core/interfaces.js'

// Internal service imports (concrete classes - RAG domain internal)
import { LanceDBProvider } from './lancedb/index.js'
import { EmbeddingService } from './ollama/embedding.js'
import { SearchService } from './services/search.js'
import { DocumentProcessor } from './services/processor.js'

/**
 * RAG Information for external consumers
 */
export interface RagInfo {
  isReady: boolean
  vectorStore: {
    isHealthy: boolean
    documentCount: number
    info: VectorStoreInfo
  }
  embedding: {
    model: EmbeddingModelInfo
  }
}

/**
 * RAG Service - Main facade for all RAG operations
 * Encapsulates initialization and management of internal RAG services
 */
export class RAGService {
  // External dependencies (interfaces for flexibility)
  private vectorStoreProvider?: IVectorStoreProvider // Could be LanceDB, Pinecone, etc.
  private embeddingService?: IEmbeddingService // Could be Ollama, OpenAI, etc.

  // Internal RAG services (concrete classes - domain internal)
  private searchService?: SearchService
  private documentProcessor?: DocumentProcessor

  private config?: ServerConfig
  private isInitialized = false

  constructor() {
    logger.debug('RAGService instance created (not initialized)')
  }

  /**
   * Initialize all RAG services
   * Encapsulates the complex initialization process from app/index.ts
   */
  async initialize(config: ServerConfig): Promise<void> {
    if (this.isInitialized) {
      logger.warn('RAGService already initialized, skipping')
      return
    }

    try {
      logger.info('🔧 Initializing RAG services...', {
        component: 'RAGService',
      })

      this.config = config

      // Initialize LanceDB provider
      logger.debug('Initializing LanceDB provider...')
      this.vectorStoreProvider = new LanceDBProvider(
        config,
        {
          uri: config.vectorStore.config.uri,
        },
        'documents'
      )

      // Initialize embedding service
      logger.debug('Initializing embedding service...')
      this.embeddingService = new EmbeddingService(config)

      logger.info('✅ Ollama services initialized', {
        component: 'RAGService',
      })

      // Initialize SearchService with dependencies (passing concrete classes)
      logger.debug('Initializing search service...')
      this.searchService = new SearchService(this.vectorStoreProvider as LanceDBProvider)

      // Initialize DocumentProcessor
      logger.debug('Initializing document processor...')
      this.documentProcessor = new DocumentProcessor(
        this.vectorStoreProvider as LanceDBProvider,
        config
      )

      this.isInitialized = true

      logger.info('✅ RAGService fully initialized', {
        vectorStoreHealthy: this.vectorStoreProvider.isHealthy(),
        component: 'RAGService',
      })
    } catch (error) {
      logger.error(
        'Failed to initialize RAGService',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RAGService' }
      )
      throw new StructuredError(
        'RAG service initialization failed',
        ErrorCode.INITIALIZATION_ERROR,
        'HIGH',
        { originalError: error }
      )
    }
  }

  /**
   * Add documents to the RAG system
   * High-level interface for document processing
   */
  async addDocuments(filePaths: string[]): Promise<void> {
    this.ensureInitialized()

    if (!filePaths || filePaths.length === 0) {
      logger.warn('No file paths provided to addDocuments')
      return
    }

    try {
      logger.info('📄 Adding documents to RAG system', {
        fileCount: filePaths.length,
        files: filePaths.map((p) => p.split('/').pop()).slice(0, 5), // Show first 5 filenames
        component: 'RAGService',
      })

      // Process each file
      for (const filePath of filePaths) {
        await this.documentProcessor!.processFile(filePath)
      }

      logger.info('✅ Documents successfully added to RAG system', {
        fileCount: filePaths.length,
        component: 'RAGService',
      })
    } catch (error) {
      logger.error(
        'Failed to add documents to RAG system',
        error instanceof Error ? error : new Error(String(error)),
        {
          filePaths,
          component: 'RAGService',
        }
      )
      throw error
    }
  }

  /**
   * Search the RAG system
   * High-level interface for retrieval and search
   */
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    this.ensureInitialized()

    if (!query || query.trim().length === 0) {
      throw new StructuredError('Search query cannot be empty', ErrorCode.VALIDATION_ERROR)
    }

    // Create complete SearchOptions with defaults
    const searchOptions: SearchOptions = {
      topK: options.topK,
      searchType: options.searchType,
    }

    try {
      logger.info('🔍 Performing RAG search', {
        query: query.substring(0, 100),
        options: searchOptions,
        component: 'RAGService',
      })

      const results = await this.searchService!.search(query, searchOptions)

      logger.info('✅ RAG search completed', {
        resultCount: results.length,
        query: query.substring(0, 50),
        component: 'RAGService',
      })

      return results
    } catch (error) {
      logger.error('RAG search failed', error instanceof Error ? error : new Error(String(error)), {
        query: query.substring(0, 100),
        options,
        component: 'RAGService',
      })
      throw error
    }
  }

  /**
   * Get RAG system information and health status
   * Provides comprehensive system status for monitoring
   */
  async getRagInfo(): Promise<RagInfo> {
    this.ensureInitialized()

    try {
      const [documentCount, info] = await Promise.all([
        this.vectorStoreProvider!.getDocumentCount(),
        this.vectorStoreProvider!.getVectorStoreInfo(),
      ])

      const ragInfo: RagInfo = {
        isReady: this.isInitialized,
        vectorStore: {
          isHealthy: this.vectorStoreProvider!.isHealthy(),
          documentCount,
          info,
        },
        embedding: {
          model: this.embeddingService!.getModelInfo(),
        },
      }

      logger.debug('RAG info retrieved', {
        documentCount,
        vectorStoreHealthy: ragInfo.vectorStore.isHealthy,
        component: 'RAGService',
      })

      return ragInfo
    } catch (error) {
      logger.error(
        'Failed to get RAG info',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RAGService' }
      )
      throw error
    }
  }

  /**
   * Remove a file from the RAG system
   * High-level interface for document removal
   */
  async removeDocument(filePath: string): Promise<void> {
    this.ensureInitialized()

    try {
      logger.info('🗑️ Removing document from RAG system', {
        filePath,
        component: 'RAGService',
      })

      await this.documentProcessor!.removeFile(filePath)

      logger.info('✅ Document removed from RAG system', {
        filePath,
        component: 'RAGService',
      })
    } catch (error) {
      logger.error(
        'Failed to remove document from RAG system',
        error instanceof Error ? error : new Error(String(error)),
        {
          filePath,
          component: 'RAGService',
        }
      )
      throw error
    }
  }

  /**
   * Graceful shutdown of all RAG services
   * Cleanup and resource management
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      logger.debug('RAGService not initialized, nothing to shutdown')
      return
    }

    try {
      logger.info('🛑 Shutting down RAG services...', {
        component: 'RAGService',
      })

      // Cleanup would go here if services had cleanup methods
      // For now, just mark as not initialized
      this.isInitialized = false

      logger.info('✅ RAG services shutdown completed', {
        component: 'RAGService',
      })
    } catch (error) {
      logger.error(
        'Error during RAG services shutdown',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RAGService' }
      )
      throw error
    }
  }

  /**
   * Check if RAGService is ready for operations
   */
  isReady(): boolean {
    return this.isInitialized && !!this.vectorStoreProvider?.isHealthy()
  }

  // Backward compatibility methods (for MCP handlers)
  // Note: These are provided for backward compatibility with existing MCP handlers
  // In future versions, handlers should use RAGService methods directly

  /**
   * Get search service for MCP handler compatibility
   * @deprecated Use search() method instead
   */
  getSearchService(): SearchService {
    this.ensureInitialized()
    return this.searchService!
  }

  /**
   * Get vector store provider for MCP handler compatibility
   * @deprecated Use RAGService methods instead
   */
  getVectorStoreProvider(): LanceDBProvider {
    this.ensureInitialized()
    return this.vectorStoreProvider as LanceDBProvider
  }

  // Internal helper methods

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new StructuredError(
        'RAGService not initialized. Call initialize() first.',
        ErrorCode.INITIALIZATION_ERROR
      )
    }
  }
}
