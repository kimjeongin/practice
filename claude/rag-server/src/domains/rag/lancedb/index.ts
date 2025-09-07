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
  IndexStats,
  RAGDocumentRecord,
  SearchFilters,
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

      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.db.openTable(this.tableName)
        logger.info('📂 Opened existing LanceDB table', {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        })
      } else {
        // Create new table with simplified schema
        const schema = createLanceDBSchema(this.embeddingDimensions)

        // Create table with empty data (will add documents later)
        const emptyData: RAGDocumentRecord[] = []

        this.table = await this.db.createTable(this.tableName, emptyData, { schema })

        logger.info('🆕 Created new LanceDB table', {
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

      // 배치 처리
      const batchSize = LANCEDB_CONSTANTS.DEFAULT_BATCH_SIZE
      const records: RAGDocumentRecord[] = []

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)

        // 임베딩 생성
        const contents = batch.map((doc) => doc.content)
        const embeddings = await this.embeddingBridge.embed(contents)

        // 새로운 변환 함수 사용
        for (let j = 0; j < batch.length; j++) {
          const doc = batch[j]!
          const embedding = embeddings[j]!

          // VectorDocument를 RAGDocumentRecord로 변환
          const ragRecord = convertVectorDocumentToRAGRecord({
            ...doc,
            vector: embedding,
            modelName: doc.modelName || currentModelName,
          })
          records.push(ragRecord)
        }
      }

      // LanceDB에 직접 추가 (중복 검사 없이)
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

    const endTiming = startTiming('lancedb_search', {
      query: query.substring(0, 50),
      topK: options.topK,
      component: 'LanceDBProvider',
    })

    try {
      logger.debug('🔍 Performing simplified LanceDB search', {
        query: query.substring(0, 100),
        topK: options.topK,
        component: 'LanceDBProvider',
      })

      // 1. 쿼리 임베딩 생성
      const queryEmbedding = await TimeoutWrapper.withTimeout(
        this.embeddingBridge.embedQuery(query),
        { timeoutMs: 15000, operation: 'generate_query_embedding' }
      )

      // 2. 정규화된 벡터를 사용한 코사인 유사도 검색
      let searchQuery = (this.table.search(queryEmbedding) as any)
        .distanceType('cosine') // 코사인 거리 계산 (정규화된 벡터에서는 [0,2] 범위)
        .limit(options.topK || 10)

      // 3. 검색 실행
      const rawResults: RAGSearchResult[] = await TimeoutWrapper.withTimeout(
        searchQuery.toArray(),
        { timeoutMs: 30000, operation: 'lancedb_search' }
      )

      logger.info('🔍 LanceDB raw search results', {
        query: query.substring(0, 100),
        rawResultsCount: rawResults.length,
        component: 'LanceDBProvider',
      })

      // 4. 결과 변환 (새로운 core 타입으로)
      let results = rawResults.map(convertRAGResultToVectorSearchResult)

      // 5. 스코어 필터링 (단순화)
      if (options.scoreThreshold) {
        results = results.filter((result) => result.score >= options.scoreThreshold!)
        logger.info('📊 After score filtering', {
          scoreThreshold: options.scoreThreshold,
          filteredCount: results.length,
          component: 'LanceDBProvider',
        })
      }

      logger.info('✅ Simplified LanceDB search completed', {
        query: query.substring(0, 100),
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

  async getIndexStats(): Promise<IndexStats> {
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
   * 모든 파일 메타데이터 조회 (간소화)
   */
  async getAllFileMetadata(): Promise<Map<string, any>> {
    await this.initialize()
    if (!this.table) return new Map()

    const fileMetadataMap = new Map<string, any>()

    try {
      // 모든 문서의 메타데이터만 조회
      const results = await this.table
        .query() // 빈 벡터로 모든 문서 조회
        .select(['doc_id', 'metadata'])
        .toArray()

      // doc_id 기준으로 중복 제거하며 메타데이터 수집
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
