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
import { LanguageDetector } from '@/shared/utils/language-detector.js'
import { KoreanTokenizer } from '@/domains/rag/services/korean-tokenizer.js'

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
  private languageDetector: LanguageDetector
  private koreanTokenizer: KoreanTokenizer

  constructor(
    private config: ServerConfig,
    connectionOptions: LanceDBConnectionOptions,
    tableName: string = LANCEDB_CONSTANTS.DEFAULT_TABLE_NAME
  ) {
    this.connectionOptions = {
      uri: connectionOptions.uri,
      storageOptions: connectionOptions.storageOptions || { timeout: '30s' },
    }

    this.tableName = tableName
    this.embeddingDimensions = LANCEDB_CONSTANTS.DEFAULT_VECTOR_DIMENSIONS

    // Initialize language processing services
    this.languageDetector = new LanguageDetector()
    this.koreanTokenizer = new KoreanTokenizer()

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
      // Create optimized FTS indexes on new table
      const ftsConfigs = [
        {
          column: 'text',
          config: lancedb.Index.fts({
            baseTokenizer: 'simple',
            withPosition: true,
            lowercase: true,
            stem: true,
            language: 'English',
            removeStopWords: true,
          }),
          description: 'English content',
        },
        {
          column: 'tokenized_text',
          config: lancedb.Index.fts({
            baseTokenizer: 'whitespace',
            withPosition: true,
            lowercase: false,
            stem: false,
            removeStopWords: false,
          }),
          description: 'Korean tokenized content',
        },
      ]

      if (tableExists) {
        // Open existing table
        this.table = await this.db.openTable(this.tableName)
        logger.info('📂 Opened existing LanceDB table', {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        })

        for (const { column, config } of ftsConfigs) {
          try {
            await this.table.createIndex(column, { config })
            logger.info('📇 Optimized FTS index created on existing table', {
              tableName: this.tableName,
              column,
              component: 'LanceDBProvider',
            })
          } catch (error) {
            // Index might already exist, which is fine
            logger.debug('📇 FTS index creation skipped (likely already exists)', {
              tableName: this.tableName,
              column,
              component: 'LanceDBProvider',
            })
          }
        }
      } else {
        // Create new table with simplified schema and overwrite mode
        const schema = createLanceDBSchema(this.embeddingDimensions)

        // Create empty table with schema and overwrite mode
        this.table = await this.db.createEmptyTable(this.tableName, schema, {
          mode: 'overwrite',
        })

        for (const { column, config } of ftsConfigs) {
          await this.table.createIndex(column, { config })
        }

        logger.info('🆕 Created new LanceDB table with optimized multilingual FTS indexes', {
          tableName: this.tableName,
          dimensions: this.embeddingDimensions,
          ftsIndexes: ftsConfigs.map((c) => ({ column: c.column, description: c.description })),
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

        // Use new conversion function with language processing
        for (let j = 0; j < batch.length; j++) {
          const doc = batch[j]!
          const embedding = embeddings[j]!

          // Detect document language
          const languageResult = this.languageDetector.detectLanguage(doc.content)
          const detectedLanguage = languageResult.language

          // Prepare enhanced document with multilingual fields
          let enhancedDoc = {
            ...doc,
            vector: embedding,
            modelName: doc.modelName || currentModelName,
            language: detectedLanguage,
            tokenized_text: '',
          }

          // Apply Korean-specific processing if detected as Korean
          if (detectedLanguage === 'ko') {
            const tokens = this.koreanTokenizer.tokenizeKorean(doc.content)

            enhancedDoc.tokenized_text = tokens.join(' ')

            logger.debug('🇰🇷 Korean document processed', {
              docId: doc.doc_id,
              chunkId: doc.chunk_id,
              tokenCount: tokens.length,
              component: 'LanceDBProvider',
            })
          }

          // Convert enhanced VectorDocument to RAGDocumentRecord
          const ragRecord = convertVectorDocumentToRAGRecord(enhancedDoc)
          records.push(ragRecord)
        }
      }

      // Add directly to LanceDB (without duplicate checking)
      if (records.length > 0) {
        await this.table.add(records as any)

        // Optimize table to update FTS indexes for real-time search
        try {
          await this.table.optimize()
          logger.info('📇 FTS indexes optimized for real-time search', {
            count: documents.length,
            component: 'LanceDBProvider',
          })
        } catch (optimizeError) {
          logger.warn('⚠️ FTS index optimization failed, search may not reflect new data', {
            count: documents.length,
            error: optimizeError instanceof Error ? optimizeError.message : String(optimizeError),
            component: 'LanceDBProvider',
          })
          // Don't throw error - document addition was successful, only optimization failed
        }
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

  async semanticSearch(query: string, options: VectorSearchOptions): Promise<VectorSearchResult[]> {
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
      .limit(options.topK)

    // Execute search
    const rawResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(searchQuery.toArray(), {
      timeoutMs: 30000,
      operation: 'semantic_search',
    })

    let results = rawResults.map(convertRAGResultToVectorSearchResult)

    // Score filtering using config threshold
    if (this.config.semanticScoreThreshold > 0) {
      results = results.filter((result) => result.score >= this.config.semanticScoreThreshold)
      logger.info('📊 After score filtering', {
        scoreThreshold: this.config.semanticScoreThreshold,
        filteredCount: results.length,
        searchType: 'semantic',
        component: 'LanceDBProvider',
      })
    }

    // Convert results
    return results
  }

  async fullTextSearch(
    searchText: string,
    columns: string[],
    limit: number
  ): Promise<VectorSearchResult[]> {
    if (!this.table) {
      throw new Error('Table not initialized')
    }

    logger.debug('🔍 Performing full-text search', {
      searchText: searchText.substring(0, 50),
      columns,
      limit,
      component: 'LanceDBProvider',
    })

    // Execute FTS query
    const rawResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
      this.table
        .query()
        .fullTextSearch(searchText.toLowerCase(), { columns })
        .limit(limit)
        .toArray(),
      { timeoutMs: 30000, operation: 'full_text_search' }
    )

    logger.debug('✅ Full-text search completed', {
      searchText: searchText.substring(0, 50),
      columns,
      resultsCount: rawResults.length,
      component: 'LanceDBProvider',
    })

    // Convert results and adjust scores for FTS
    return rawResults.map((result) => convertRAGResultToVectorSearchResult(result))
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

      // Optimize table to update FTS indexes for real-time search
      try {
        await this.table.optimize()
        logger.info('📇 FTS indexes optimized after document deletion', {
          fileId,
          component: 'LanceDBProvider',
        })
      } catch (optimizeError) {
        logger.warn('⚠️ FTS index optimization failed after deletion, search may include stale data', {
          fileId,
          error: optimizeError instanceof Error ? optimizeError.message : String(optimizeError),
          component: 'LanceDBProvider',
        })
        // Don't throw error - document deletion was successful, only optimization failed
      }

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

      // Optimize table to update FTS indexes for real-time search
      try {
        await this.table.optimize()
        logger.info('📇 FTS indexes optimized after removing all documents', {
          component: 'LanceDBProvider',
        })
      } catch (optimizeError) {
        logger.warn('⚠️ FTS index optimization failed after removing all documents, search may include stale data', {
          error: optimizeError instanceof Error ? optimizeError.message : String(optimizeError),
          component: 'LanceDBProvider',
        })
        // Don't throw error - document deletion was successful, only optimization failed
      }

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
