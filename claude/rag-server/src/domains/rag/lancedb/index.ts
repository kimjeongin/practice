/**
 * LanceDB Provider - Simplified Version
 * GPT Best Practice approach: 5 fields instead of 77 complex fields
 * Direct LanceDB native API usage
 */

import * as lancedb from '@lancedb/lancedb'
import type { IVectorStoreProvider } from '@/domains/rag/core/interfaces.js'
import type {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  VectorStoreInfo,
  RAGDocumentRecord,
  RAGSearchResult,
} from '@/domains/rag/core/types.js'
import { EmbeddingService } from '@/domains/rag/ollama/embedding.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'

// Import simplified schema functions
import {
  createLanceDBSchema,
  convertVectorDocumentToRAGRecord,
  convertRAGResultToVectorSearchResult,
} from './schema.js'

import {
  LanceDBEmbeddingBridge,
  createLanceDBEmbeddingBridgeFromService,
} from './embedding-bridge.js'

import { LANCEDB_CONSTANTS, type LanceDBConnectionOptions } from './config.js'

export class LanceDBProvider implements IVectorStoreProvider {
  private db: lancedb.Connection | null = null
  private table: lancedb.Table | null = null
  private embeddingService: EmbeddingService | null = null
  private embeddingBridge: LanceDBEmbeddingBridge | null = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  private connectionOptions: LanceDBConnectionOptions
  private tableName: string
  private embeddingDimensions: number
  private reranker: lancedb.rerankers.RRFReranker | null = null

  constructor(
    private config: ServerConfig,
    connectionOptions: Partial<LanceDBConnectionOptions> = {},
    tableName: string = LANCEDB_CONSTANTS.DEFAULT_TABLE_NAME
  ) {
    this.connectionOptions = {
      uri: connectionOptions.uri || './.data/lancedb',
      storageOptions: connectionOptions.storageOptions || { timeout: '30s' },
    }

    this.tableName = tableName
    this.embeddingDimensions = LANCEDB_CONSTANTS.DEFAULT_VECTOR_DIMENSIONS

    logger.info('🚀 LanceDB Provider initialized (simplified)', {
      uri: this.connectionOptions.uri,
      tableName: this.tableName,
      component: 'LanceDBProvider',
    })
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) {
      await this.initPromise
      return
    }
    this.initPromise = this._doInitialize()
    await this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    const endTiming = startTiming('lancedb_initialization', {
      component: 'LanceDBProvider',
    })

    try {
      logger.info('🔄 Initializing simplified LanceDB connection...', {
        uri: this.connectionOptions.uri,
        component: 'LanceDBProvider',
      })

      // Connect to LanceDB
      this.db = await lancedb.connect(this.connectionOptions.uri)

      // Initialize embedding service
      this.embeddingService = new EmbeddingService(this.config)
      await this.embeddingService.initialize()
      this.embeddingDimensions = this.embeddingService.getModelInfo().dimensions

      // Create embedding bridge
      this.embeddingBridge = createLanceDBEmbeddingBridgeFromService(this.embeddingService)

      // Create or open table
      await this._initializeTable()

      this.isInitialized = true
      logger.info('✅ LanceDB Provider initialized successfully', {
        uri: this.connectionOptions.uri,
        tableName: this.tableName,
        dimensions: this.embeddingDimensions,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      const structuredError = new StructuredError(
        'Failed to initialize LanceDB provider',
        ErrorCode.INITIALIZATION_ERROR,
        'CRITICAL',
        { uri: this.connectionOptions.uri },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      logger.error('❌ LanceDB Provider initialization failed', structuredError)
      throw structuredError
    } finally {
      endTiming()
    }
  }

  private async _initializeTable(): Promise<void> {
    if (!this.db || !this.embeddingBridge) {
      throw new Error('Database connection or embedding bridge not initialized')
    }

    try {
      // Check if table exists
      const tableNames = await this.db.tableNames()
      const tableExists = tableNames.includes(this.tableName)

      if (tableExists) {
        // Open existing table
        this.table = await this.db.openTable(this.tableName)
        logger.info('📂 Opened existing LanceDB table', {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        })

        // Create FTS index on existing table if it doesn't exist
        try {
          await this.table.createIndex('text', {
            config: lancedb.Index.fts(),
          })
          logger.info('📇 FTS index created on existing table', {
            tableName: this.tableName,
            component: 'LanceDBProvider',
          })
        } catch (error) {
          // Index might already exist, which is fine
          logger.debug('📇 FTS index creation skipped (likely already exists)', {
            tableName: this.tableName,
            component: 'LanceDBProvider',
          })
        }
      } else {
        // Create new table with simplified schema and overwrite mode
        const schema = createLanceDBSchema(this.embeddingDimensions)

        // Create empty table with schema and overwrite mode
        this.table = await this.db.createEmptyTable(this.tableName, schema, {
          mode: 'overwrite',
        })

        // Create FTS index on new table
        await this.table.createIndex('text', {
          config: lancedb.Index.fts(),
        })

        logger.info('🆕 Created new LanceDB table with FTS index', {
          tableName: this.tableName,
          dimensions: this.embeddingDimensions,
          component: 'LanceDBProvider',
        })
      }
    } catch (error) {
      throw new Error(`Failed to initialize table ${this.tableName}: ${error}`)
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    await this.initialize()

    if (!this.table || !this.embeddingBridge) {
      throw new Error('LanceDB provider not properly initialized')
    }

    const endTiming = startTiming('lancedb_add_documents', {
      documentCount: documents.length,
      component: 'LanceDBProvider',
    })

    try {
      logger.info('📄 Adding documents to simplified LanceDB', {
        count: documents.length,
        component: 'LanceDBProvider',
      })

      const currentModelName = this.embeddingService?.getModelInfo().name || 'unknown'

      // Process in batches
      const batchSize = LANCEDB_CONSTANTS.DEFAULT_BATCH_SIZE
      const records: RAGDocumentRecord[] = []

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)

        // Generate embeddings
        const contents = batch.map((doc) => doc.content)
        const embeddings = await this.embeddingBridge.embed(contents)

        // Use new conversion function
        for (let j = 0; j < batch.length; j++) {
          const doc = batch[j]!
          const embedding = embeddings[j]!

          // Convert VectorDocument to RAGDocumentRecord
          const ragRecord = convertVectorDocumentToRAGRecord({
            ...doc,
            vector: embedding,
            modelName: doc.modelName || currentModelName,
          })
          records.push(ragRecord)
        }
      }

      // Add directly to LanceDB (without duplicate checking)
      if (records.length > 0) {
        await this.table.add(records as any)
      }

      logger.info('✅ Documents added successfully', {
        count: documents.length,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to add documents',
        error instanceof Error ? error : new Error(String(error)),
        {
          documentCount: documents.length,
          component: 'LanceDBProvider',
        }
      )
      errorMonitor.recordError(
        error instanceof StructuredError
          ? error
          : new StructuredError(String(error), ErrorCode.VECTOR_STORE_ERROR)
      )
      throw error
    } finally {
      endTiming()
    }
  }
  async search(query: string, options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> {
    await this.initialize()

    if (!this.table || !this.embeddingBridge) {
      throw new Error('LanceDB provider not properly initialized')
    }

    const searchType = options.searchType || 'semantic'
    const endTiming = startTiming('lancedb_search', {
      query: query.substring(0, 50),
      topK: options.topK,
      searchType,
      component: 'LanceDBProvider',
    })

    try {
      logger.debug('🔍 Performing LanceDB search', {
        query: query.substring(0, 100),
        topK: options.topK,
        searchType,
        component: 'LanceDBProvider',
      })

      let results: VectorSearchResult[]

      switch (searchType) {
        case 'semantic':
          results = await this.performSemanticSearch(query, options)
          break
        case 'keyword':
          results = await this.performKeywordSearch(query, options)
          break
        case 'hybrid':
          results = await this.performHybridSearch(query, options)
          break
        default:
          throw new Error(`Unsupported search type: ${searchType}`)
      }

      // Set search type on results
      results.forEach((result) => {
        result.searchType = searchType
      })

      logger.info('✅ LanceDB search completed', {
        query: query.substring(0, 100),
        searchType,
        resultsCount: results.length,
        topScore: results[0]?.score || 0,
        component: 'LanceDBProvider',
      })

      return results
    } catch (error) {
      logger.error(
        '❌ LanceDB search failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          query: query.substring(0, 100),
          searchType,
          component: 'LanceDBProvider',
        }
      )
      errorMonitor.recordError(
        error instanceof StructuredError
          ? error
          : new StructuredError(String(error), ErrorCode.VECTOR_STORE_ERROR)
      )
      throw error
    } finally {
      endTiming()
    }
  }

  private async performSemanticSearch(
    query: string,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (!this.table || !this.embeddingBridge) {
      throw new Error('Table or embedding bridge not initialized')
    }

    // Generate query embedding
    const queryEmbedding = await TimeoutWrapper.withTimeout(
      this.embeddingBridge.embedQuery(query),
      { timeoutMs: 15000, operation: 'generate_query_embedding' }
    )

    // Cosine similarity search using normalized vectors
    let searchQuery = (this.table.search(queryEmbedding) as any)
      .distanceType('cosine')
      .limit(options.topK || 10)

    // Execute search
    const rawResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(searchQuery.toArray(), {
      timeoutMs: 30000,
      operation: 'semantic_search',
    })

    let results = rawResults.map(convertRAGResultToVectorSearchResult)

    // Score filtering
    if (options.scoreThreshold) {
      results = results.filter((result) => result.score >= options.scoreThreshold!)
      logger.info('📊 After score filtering', {
        scoreThreshold: options.scoreThreshold,
        filteredCount: results.length,
        searchType: 'semantic',
        component: 'LanceDBProvider',
      })
    }

    // Convert results
    return results
  }

  private async performKeywordSearch(
    query: string,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (!this.table) {
      throw new Error('Table not initialized')
    }

    // Perform FTS search
    const rawResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
      this.table
        .search(query, 'fts')
        .limit(options.topK || 10)
        .toArray(),
      { timeoutMs: 30000, operation: 'keyword_search' }
    )

    // Convert results and adjust scores for FTS
    return rawResults.map((result) => {
      const converted = convertRAGResultToVectorSearchResult(result)
      // For FTS, use the FTS score if available, otherwise use a default score
      if (result._score !== undefined) {
        converted.keywordScore = result._score
        converted.score = result._score
      } else {
        // FTS results might not have explicit scores, use a default
        converted.keywordScore = 1.0
        converted.score = 1.0
      }
      return converted
    })
  }

  private async performHybridSearch(
    query: string,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (!this.table || !this.embeddingBridge) {
      throw new Error('Table or embedding bridge not initialized')
    }

    try {
      // Generate query embedding for hybrid search
      const queryEmbedding = await TimeoutWrapper.withTimeout(
        this.embeddingBridge.embedQuery(query),
        { timeoutMs: 15000, operation: 'generate_query_embedding' }
      )

      if (!this.reranker) {
        this.reranker = await lancedb.rerankers.RRFReranker.create()
      }

      // Perform hybrid search using LanceDB's native hybrid search capability
      const rawResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
        this.table
          .query()
          .fullTextSearch(query)
          .nearestTo(queryEmbedding)
          .rerank(this.reranker)
          .limit(options.topK || 10)
          .toArray(),
        { timeoutMs: 30000, operation: 'hybrid_search' }
      )

      // Convert results and preserve both vector and keyword scores
      return rawResults.map((result) => {
        const converted = convertRAGResultToVectorSearchResult(result)
        // For hybrid search, the score from LanceDB is the combined score
        if (result._relevance_score !== undefined) {
          converted.score = result._relevance_score
        }
        return converted
      })
    } catch (error) {
      logger.warn(
        'Hybrid search failed, falling back to semantic search',
        error instanceof Error ? error : new Error(String(error))
      )
      return this.performSemanticSearch(query, options)
    }
  }

  async removeDocumentsByFileId(fileId: string): Promise<void> {
    await this.initialize()

    if (!this.table) {
      throw new Error('Table not initialized')
    }

    try {
      logger.info('🗑️ Removing documents by file ID', {
        fileId,
        component: 'LanceDBProvider',
      })

      // Delete documents with matching doc_id
      await this.table.delete(`doc_id = '${fileId}'`)

      logger.info('✅ Documents removed successfully', {
        fileId,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to remove documents',
        error instanceof Error ? error : new Error(String(error)),
        {
          fileId,
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  async removeAllDocuments(): Promise<void> {
    await this.initialize()

    if (!this.table) {
      throw new Error('Table not initialized')
    }

    try {
      logger.info('🗑️ Removing all documents from LanceDB', {
        component: 'LanceDBProvider',
      })

      // Delete all documents
      await this.table.delete('true')

      logger.info('✅ All documents removed successfully', {
        component: 'LanceDBProvider',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to remove all documents',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  isHealthy(): boolean {
    return this.isInitialized && this.db !== null && this.table !== null
  }

  async getVectorStoreInfo(): Promise<VectorStoreInfo> {
    await this.initialize()

    if (!this.table) {
      throw new Error('Table not initialized')
    }

    try {
      const countResult = await this.table.countRows()

      return {
        totalVectors: countResult,
        dimensions: this.embeddingDimensions,
        embeddingModel: this.embeddingService?.getModelInfo().name || 'unknown',
      }
    } catch (error) {
      logger.error(
        '❌ Failed to get index stats',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  async getDocumentCount(): Promise<number> {
    await this.initialize()

    if (!this.table) {
      return 0
    }

    try {
      const rows = await this.table.query().select(['doc_id']).toArray()
      return [...new Set(rows.map((r) => r.doc_id))].length
    } catch (error) {
      logger.error(
        '❌ Failed to get document count',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'LanceDBProvider',
        }
      )
      return 0
    }
  }

  async hasDocumentsForFileId(fileId: string): Promise<boolean> {
    await this.initialize()

    if (!this.table) {
      return false
    }

    try {
      const results = await this.table.query().where(`doc_id = '${fileId}'`).toArray()

      return results.length > 0
    } catch (error) {
      logger.error(
        '❌ Failed to check documents for file ID',
        error instanceof Error ? error : new Error(String(error)),
        {
          fileId,
          component: 'LanceDBProvider',
        }
      )
      return false
    }
  }

  /**
   * Retrieve all file metadata (simplified)
   */
  async getAllFileMetadata(): Promise<Map<string, any>> {
    await this.initialize()
    if (!this.table) return new Map()

    const fileMetadataMap = new Map<string, any>()

    try {
      // Query only metadata of all documents
      const results = await this.table
        .query() // Query all documents with empty vector
        .select(['doc_id', 'metadata'])
        .toArray()

      // Collect metadata while removing duplicates based on doc_id
      for (const result of results) {
        const docId = result.doc_id
        if (docId && !fileMetadataMap.has(docId)) {
          const metadata = JSON.parse(result.metadata)
          fileMetadataMap.set(docId, {
            fileId: docId,
            fileName: metadata.fileName || 'unknown',
            filePath: metadata.filePath || 'unknown',
            fileType: metadata.fileType || 'text',
            size: metadata.fileSize || 0,
            fileHash: metadata.fileHash || '',
            modifiedAt: metadata.modifiedAt || new Date().toISOString(),
            createdAt: metadata.createdAt || new Date().toISOString(),
            processedAt: metadata.processedAt || new Date().toISOString(),
          })
        }
      }

      logger.info(`📊 Retrieved ${fileMetadataMap.size} unique files`, {
        component: 'LanceDBProvider',
      })

      return fileMetadataMap
    } catch (error) {
      logger.error(
        'Failed to retrieve all file metadata',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'LanceDBProvider',
        }
      )
      return fileMetadataMap
    }
  }
}
