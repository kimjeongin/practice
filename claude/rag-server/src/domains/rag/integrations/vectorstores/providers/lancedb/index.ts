/**
 * LanceDB Provider - 간소화 버전 (GPT Best Practice 방식)
 * 복잡한 77개 필드를 5개 필드로 간소화
 * 직접적인 LanceDB 네이티브 API 사용
 */

import * as lancedb from '@lancedb/lancedb'
import { VectorStoreProvider, VectorStoreCapabilities } from '../../core/interfaces.js'
import {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  IndexStats,
} from '../../core/types.js'
import { EmbeddingAdapter } from '../../../embeddings/adapter.js'
import { EmbeddingFactory } from '../../../embeddings/index.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'

// 새로운 간소화된 타입들
import {
  RAGDocumentRecord,
  RAGSearchResult,
  createSimpleLanceDBSchema,
  convertVectorDocumentToRAGRecord,
  convertRAGResultToVectorSearchResult,
  type SearchFilters,
} from './types.js'

import {
  LanceDBEmbeddingBridge,
  createLanceDBEmbeddingBridgeFromService,
} from './embedding-bridge.js'

import { LANCEDB_CONSTANTS, type LanceDBConnectionOptions } from './config.js'

export class LanceDBProvider implements VectorStoreProvider {
  private db: lancedb.Connection | null = null
  private table: lancedb.Table | null = null
  private embeddingService: EmbeddingAdapter | null = null
  private embeddingBridge: LanceDBEmbeddingBridge | null = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  private connectionOptions: LanceDBConnectionOptions
  private tableName: string
  private embeddingDimensions: number

  public readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsHybridSearch: true,
    supportsReranking: true,
    supportsRealTimeUpdates: true,
    supportsBatchOperations: true,
    supportsIndexCompaction: false,
  }

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

      // 1. LanceDB 연결 (간단한 설정)
      this.db = await lancedb.connect(this.connectionOptions.uri)

      // 2. 임베딩 서비스 초기화
      await this.initializeEmbeddingService()

      // 3. 테이블 초기화 (GPT 방식)
      await this.initializeSimpleTable()

      this.isInitialized = true

      logger.info('✅ Simplified LanceDB initialization completed', {
        uri: this.connectionOptions.uri,
        tableName: this.tableName,
        embeddingDimensions: this.embeddingDimensions,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(
        '❌ LanceDB initialization failed',
        error instanceof Error ? error : new Error(errorMessage),
        {
          uri: this.connectionOptions.uri,
          component: 'LanceDBProvider',
        }
      )
      errorMonitor.recordError(
        error instanceof StructuredError
          ? error
          : new StructuredError(errorMessage, ErrorCode.VECTOR_STORE_ERROR)
      )
      throw error
    } finally {
      endTiming()
    }
  }

  private async initializeEmbeddingService(): Promise<void> {
    try {
      logger.info('🧠 Initializing embedding service...', {
        component: 'LanceDBProvider',
      })

      const { embeddings, actualService } = await EmbeddingFactory.createWithFallback(this.config)
      this.embeddingService = new EmbeddingAdapter(embeddings, actualService)
      this.embeddingBridge = createLanceDBEmbeddingBridgeFromService(this.embeddingService, 'text')

      // 차원 수 업데이트
      this.embeddingDimensions = this.embeddingBridge.ndims()

      // 간단한 워밍업
      await this.embeddingService.embedQuery('warmup test')

      logger.info('✅ Embedding service initialized', {
        service: actualService,
        dimensions: this.embeddingDimensions,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to initialize embedding service',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  /**
   * GPT 방식의 간단한 테이블 초기화
   */
  private async initializeSimpleTable(): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not initialized')
    }

    try {
      logger.info('🔄 Initializing simple LanceDB table...', {
        tableName: this.tableName,
        embeddingDimensions: this.embeddingDimensions,
        component: 'LanceDBProvider',
      })

      // GPT 방식: 간단한 스키마 정의
      const schema = createSimpleLanceDBSchema(this.embeddingDimensions)

      // 기존 테이블 확인
      const tableNames = await this.db.tableNames()
      const tableExists = tableNames.includes(this.tableName)

      if (tableExists) {
        logger.info('📋 Opening existing table', {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        })
        this.table = await this.db.openTable(this.tableName)
      } else {
        logger.info('🆕 Creating new table with simple schema', {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        })

        // 빈 테이블 생성 (GPT 방식)
        this.table = await this.db.createTable(this.tableName, [], { schema })
      }

      logger.info('✅ Simple table initialization completed', {
        tableName: this.tableName,
        existed: tableExists,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to initialize simple table',
        error instanceof Error ? error : new Error(String(error)),
        {
          tableName: this.tableName,
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  /**
   * GPT 방식의 간소화된 문서 추가
   */
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

  /**
   * GPT 방식의 간소화된 벡터 검색
   */
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

      // 2. GPT 방식의 간단한 검색 (필터링 없음)
      let searchQuery = this.table.search(queryEmbedding).limit(options.topK || 10)

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

  /**
   * 문서 삭제 (간소화)
   */
  async deleteDocuments(ids: string[]): Promise<void> {
    await this.initialize()
    if (!this.table) {
      throw new Error('LanceDB table not initialized')
    }

    try {
      logger.info('🗑️ Deleting documents', { count: ids.length, component: 'LanceDBProvider' })

      // GPT 방식: 간단한 ID 기반 삭제
      const idsString = ids.map((id) => `'${id}'`).join(', ')
      await this.table.delete(`doc_id IN (${idsString})`)

      logger.info('✅ Documents deleted', { count: ids.length, component: 'LanceDBProvider' })
    } catch (error) {
      logger.error(
        '❌ Failed to delete documents',
        error instanceof Error ? error : new Error(String(error)),
        {
          documentCount: ids.length,
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  async removeDocumentsByFileId(fileId: string): Promise<void> {
    await this.initialize()
    if (!this.table) {
      throw new Error('LanceDB table not initialized')
    }

    try {
      logger.info('🗑️ Removing documents by fileId', { fileId, component: 'LanceDBProvider' })
      await this.table.delete(`doc_id = '${fileId}'`)
      logger.info('✅ Documents removed by fileId', { fileId, component: 'LanceDBProvider' })
    } catch (error) {
      logger.error(
        '❌ Failed to remove documents by fileId',
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
      throw new Error('LanceDB table not initialized')
    }

    try {
      logger.info('🗑️ Removing all documents', { component: 'LanceDBProvider' })
      await this.table.delete('true') // 모든 행 삭제
      logger.info('✅ All documents removed', { component: 'LanceDBProvider' })
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

  getIndexInfo(): IndexStats {
    return {
      totalVectors: 0, // 실제 구현에서는 this.table.countRows() 사용
      dimensions: this.embeddingDimensions,
      indexSize: 0,
      lastUpdated: new Date(),
    }
  }

  isHealthy(): boolean {
    return this.isInitialized && this.db !== null && this.table !== null
  }

  getDocumentCount(): number {
    return 0 // 실제 구현에서는 this.table.countRows() 사용
  }

  /**
   * 파일 메타데이터 조회 (간소화)
   */
  async getFileMetadata(fileId: string): Promise<any | null> {
    await this.initialize()
    if (!this.table) return null

    try {
      const results = await this.table
        .query() // 빈 벡터로 모든 문서 조회
        .where(`doc_id = '${fileId}'`)
        .limit(1)
        .toArray()

      if (results.length > 0) {
        const result = results[0]
        const metadata = JSON.parse(result.metadata)
        return {
          fileId: result.doc_id,
          fileName: metadata.fileName,
          filePath: metadata.filePath,
          fileType: metadata.fileType,
          size: metadata.fileSize,
          fileHash: metadata.fileHash,
          modifiedAt: metadata.modifiedAt,
          createdAt: metadata.createdAt,
          processedAt: metadata.processedAt,
        }
      }
      return null
    } catch (error) {
      logger.warn('Failed to retrieve file metadata', {
        fileId,
        error: error instanceof Error ? error.message : String(error),
        component: 'LanceDBProvider',
      })
      return null
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
