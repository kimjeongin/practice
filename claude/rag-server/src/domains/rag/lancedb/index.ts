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
  private reranker: lancedb.rerankers.RRFReranker | null = null
  private languageDetector: LanguageDetector
  private koreanTokenizer: KoreanTokenizer

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
        {
          column: 'initial_consonants',
          config: lancedb.Index.fts({
            baseTokenizer: 'ngram',
            ngramMinLength: 1,
            ngramMaxLength: 3,
            withPosition: false,
            lowercase: false,
            stem: false,
            removeStopWords: false,
          }),
          description: 'Korean initial consonants',
        },
      ]

      if (tableExists) {
        // Open existing table
        this.table = await this.db.openTable(this.tableName)
        logger.info('📂 Opened existing LanceDB table', {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        })

        for (const { column, config, description } of ftsConfigs) {
          try {
            await this.table.createIndex(column, { config })
            logger.info('📇 Optimized FTS index created on existing table', {
              tableName: this.tableName,
              column,
              description,
              component: 'LanceDBProvider',
            })
          } catch (error) {
            // Index might already exist, which is fine
            logger.debug('📇 FTS index creation skipped (likely already exists)', {
              tableName: this.tableName,
              column,
              description,
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

        for (const { column, config, description } of ftsConfigs) {
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
            initial_consonants: '',
          }

          // Apply Korean-specific processing if detected as Korean
          if (detectedLanguage === 'ko') {
            const tokens = this.koreanTokenizer.tokenizeKorean(doc.content)
            const initials = this.koreanTokenizer.extractInitials(doc.content)

            enhancedDoc.tokenized_text = tokens.join(' ')
            enhancedDoc.initial_consonants = initials

            logger.debug('🇰🇷 Korean document processed', {
              docId: doc.doc_id,
              chunkId: doc.chunk_id,
              tokenCount: tokens.length,
              hasInitials: initials.length > 0,
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
  async search(query: string, options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    await this.initialize()

    if (!this.table || !this.embeddingBridge) {
      throw new Error('LanceDB provider not properly initialized')
    }

    const searchType = options.searchType
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

  private async performKeywordSearch(
    query: string,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (!this.table) {
      throw new Error('Table not initialized')
    }

    // Detect query language to determine search strategy
    const languageResult = this.languageDetector.detectLanguage(query)
    const queryLanguage = languageResult.language

    logger.debug('🔍 Keyword search language detection', {
      query: query.substring(0, 50),
      detectedLanguage: queryLanguage,
      confidence: languageResult.confidence,
      component: 'LanceDBProvider',
    })

    let rawResults: RAGSearchResult[] = []

    if (queryLanguage === 'ko') {
      // Korean keyword search: search tokenized_text and initial_consonants
      const tokenizedQuery = this.koreanTokenizer.tokenizeKorean(query).join(' ')
      const initialQuery = this.koreanTokenizer.extractInitials(query)

      // Primary search on tokenized Korean text
      const tokenizedResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
        this.table
          .query()
          .fullTextSearch(tokenizedQuery.toLowerCase(), { columns: ['tokenized_text'] })
          .limit(options.topK)
          .toArray(),
        { timeoutMs: 30000, operation: 'korean_tokenized_search' }
      )

      // Secondary search on initial consonants if available
      if (initialQuery && initialQuery.length > 0) {
        const initialResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
          this.table
            .query()
            .fullTextSearch(initialQuery.toLowerCase(), { columns: ['initial_consonants'] })
            .limit(Math.ceil(options.topK / 2))
            .toArray(),
          { timeoutMs: 30000, operation: 'korean_initial_search' }
        )

        // Combine and deduplicate results
        const combinedResults = [...tokenizedResults, ...initialResults]
        const uniqueResults = combinedResults.filter(
          (result, index, arr) =>
            index ===
            arr.findIndex((r) => r.doc_id === result.doc_id && r.chunk_id === result.chunk_id)
        )

        rawResults = uniqueResults.slice(0, options.topK)
      } else {
        rawResults = tokenizedResults
      }

      logger.debug('🇰🇷 Korean keyword search completed', {
        tokenizedQuery,
        initialQuery,
        resultsCount: rawResults.length,
        component: 'LanceDBProvider',
      })
    } else {
      // English keyword search: search text column only
      rawResults = await TimeoutWrapper.withTimeout(
        this.table
          .query()
          .fullTextSearch(query.toLowerCase(), { columns: ['text'] })
          .limit(options.topK)
          .toArray(),
        { timeoutMs: 30000, operation: 'english_keyword_search' }
      )

      logger.debug('🇺🇸 English keyword search completed', {
        query: query.substring(0, 50),
        resultsCount: rawResults.length,
        component: 'LanceDBProvider',
      })
    }

    // Convert results and adjust scores for FTS
    return rawResults.map((result) => convertRAGResultToVectorSearchResult(result))
  }

  private async performHybridSearch(
    query: string,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (!this.table || !this.embeddingBridge) {
      throw new Error('Table or embedding bridge not initialized')
    }

    try {
      // Detect query language for language-aware FTS
      const languageResult = this.languageDetector.detectLanguage(query)
      const queryLanguage = languageResult.language

      logger.debug('🔍 Hybrid search language detection', {
        query: query.substring(0, 50),
        detectedLanguage: queryLanguage,
        confidence: languageResult.confidence,
        component: 'LanceDBProvider',
      })

      // Generate query embedding for hybrid search
      const queryEmbedding = await TimeoutWrapper.withTimeout(
        this.embeddingBridge.embedQuery(query),
        { timeoutMs: 15000, operation: 'generate_query_embedding' }
      )

      if (!this.reranker) {
        this.reranker = await lancedb.rerankers.RRFReranker.create()
      }

      let rawResults: RAGSearchResult[] = []

      if (queryLanguage === 'ko') {
        // Korean hybrid search: manual combination of semantic + FTS with column specification
        const tokenizedQuery = this.koreanTokenizer.tokenizeKorean(query).join(' ')

        // Get semantic search results
        const semanticResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
          (this.table.search(queryEmbedding) as any)
            .distanceType('cosine')
            .limit(options.topK * 2) // Get more candidates for reranking
            .toArray(),
          { timeoutMs: 30000, operation: 'korean_hybrid_semantic' }
        )

        // Get FTS results from tokenized text
        const ftsResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
          this.table
            .query()
            .fullTextSearch(tokenizedQuery.toLowerCase(), { columns: ['tokenized_text'] })
            .limit(options.topK * 2)
            .toArray(),
          { timeoutMs: 30000, operation: 'korean_hybrid_fts' }
        )

        // Manual RRF-like reranking: combine and deduplicate
        const combinedResults = [...semanticResults, ...ftsResults]
        const uniqueResults = new Map<string, RAGSearchResult>()

        combinedResults.forEach((result) => {
          const key = `${result.doc_id}_${result.chunk_id}`
          if (!uniqueResults.has(key)) {
            uniqueResults.set(key, result)
          }
        })

        rawResults = Array.from(uniqueResults.values()).slice(0, options.topK)

        logger.debug('🇰🇷 Korean hybrid search completed', {
          tokenizedQuery,
          semanticCount: semanticResults.length,
          ftsCount: ftsResults.length,
          finalCount: rawResults.length,
          component: 'LanceDBProvider',
        })
      } else {
        // English hybrid search: use native LanceDB hybrid with explicit column specification
        rawResults = await TimeoutWrapper.withTimeout(
          this.table
            .query()
            .fullTextSearch(query.toLowerCase(), { columns: ['text'] })
            .nearestTo(queryEmbedding)
            .rerank(this.reranker)
            .limit(options.topK)
            .toArray(),
          { timeoutMs: 30000, operation: 'english_hybrid_search' }
        )

        logger.debug('🇺🇸 English hybrid search completed', {
          query: query.substring(0, 50),
          resultsCount: rawResults.length,
          component: 'LanceDBProvider',
        })
      }

      // Convert results and preserve both vector and keyword scores
      return rawResults.map((result) => convertRAGResultToVectorSearchResult(result))
    } catch (error) {
      logger.error(
        'Hybrid search failed, falling back to semantic search',
        error instanceof Error ? error : new Error(String(error))
      )
      // Fallback to semantic search
      return await this.performSemanticSearch(query, options)
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
