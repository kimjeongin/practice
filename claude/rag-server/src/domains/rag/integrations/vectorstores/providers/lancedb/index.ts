/**
 * LanceDB Provider - Main Implementation
 * 벡터와 메타데이터를 통합 관리하는 LanceDB 벡터 스토어
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

// LanceDB 관련 imports
import {
  LanceDBEmbeddingBridge,
  createLanceDBEmbeddingBridgeFromService,
} from './embedding-bridge.js'
import {
  lanceDBResultToSearchResult,
  type LanceDBTableOptions,
} from './types.js'
import {
  getDefaultTableConfig,
  LANCEDB_CONSTANTS,
  DEFAULT_TABLE_OPTIONS,
  type LanceDBTableConfig,
} from './config.js'
import {
  processBatches,
  validateEmbeddingVector,
  type LanceDBConnectionOptions,
} from './utils.js'

export class LanceDBProvider implements VectorStoreProvider {
  private db: lancedb.Connection | null = null
  private table: lancedb.Table | null = null
  private embeddingService: EmbeddingAdapter | null = null
  private embeddingBridge: LanceDBEmbeddingBridge | null = null
  private isInitialized = false

  // Simple cache for file metadata to prevent expensive queries on every list_sources call
  private fileMetadataCache: { data: Map<string, any>; timestamp: number } | null = null
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private initPromise: Promise<void> | null = null
  private connectionOptions: LanceDBConnectionOptions
  private tableOptions: LanceDBTableOptions
  private schemaConfig: LanceDBTableConfig

  public readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsHybridSearch: true,
    supportsReranking: true,
    supportsRealTimeUpdates: true,
    supportsBatchOperations: true,
    supportsIndexCompaction: false, // LanceDB handles this automatically
  }

  constructor(
    private config: ServerConfig,
    connectionOptions: Partial<LanceDBConnectionOptions> = {},
    tableOptions: Partial<LanceDBTableOptions> = {}
  ) {
    this.connectionOptions = {
      uri: connectionOptions.uri || './.data/lancedb',
      storageOptions: connectionOptions.storageOptions || {},
    }

    // 스키마 설정 로드
    this.schemaConfig = getDefaultTableConfig()

    this.tableOptions = {
      ...DEFAULT_TABLE_OPTIONS,
      ...tableOptions,
      tableName: tableOptions.tableName || this.schemaConfig.name,
      enableFullTextSearch:
        tableOptions.enableFullTextSearch !== undefined
          ? tableOptions.enableFullTextSearch
          : this.schemaConfig.enableFullTextSearch,
      indexColumns: tableOptions.indexColumns || this.schemaConfig.indexColumns,
    }

    logger.info('🚀 LanceDBProvider initialized', {
      uri: this.connectionOptions.uri,
      tableName: this.tableOptions.tableName,
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
      logger.info('🔄 Initializing LanceDB connection...', {
        uri: this.connectionOptions.uri,
        component: 'LanceDBProvider',
      })

      // 1. LanceDB 연결 생성 (timeout 설정 포함)
      const connectionConfig = {
        storageOptions: {
          ...this.connectionOptions.storageOptions,
          // LanceDB timeout 설정 - 환경변수 또는 기본값 사용
          timeout: process.env.LANCEDB_CONNECT_TIMEOUT || '30s',
        },
        // LanceDB 0.21.3+ timeout 설정
        timeout: {
          connectTimeout: parseInt(process.env.LANCEDB_CONNECT_TIMEOUT_MS || '30000'),
          readTimeout: parseInt(process.env.LANCEDB_READ_TIMEOUT_MS || '60000'),
          poolIdleTimeout: parseInt(process.env.LANCEDB_POOL_IDLE_TIMEOUT_MS || '120000'),
        },
      }

      logger.info('🔗 Connecting to LanceDB with timeout settings', {
        uri: this.connectionOptions.uri,
        connectTimeout: connectionConfig.timeout.connectTimeout,
        readTimeout: connectionConfig.timeout.readTimeout,
        component: 'LanceDBProvider',
      })

      this.db = await lancedb.connect(this.connectionOptions.uri, connectionConfig)

      // 2. 임베딩 서비스 초기화
      await this.initializeEmbeddingService()

      // 3. 테이블 초기화 또는 생성
      await this.initializeTable()

      this.isInitialized = true

      logger.info('✅ LanceDB initialization completed', {
        uri: this.connectionOptions.uri,
        tableName: this.tableOptions.tableName,
        embeddingDimensions: this.embeddingBridge?.ndims(),
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
      logger.info('🧠 Initializing embedding service for LanceDB...', {
        component: 'LanceDBProvider',
      })

      // EmbeddingFactory를 사용하여 임베딩 서비스 생성
      const { embeddings, actualService } = await EmbeddingFactory.createWithFallback(this.config)

      // EmbeddingAdapter로 래핑
      this.embeddingService = new EmbeddingAdapter(embeddings, actualService)

      // LanceDB 브릿지 생성
      this.embeddingBridge = createLanceDBEmbeddingBridgeFromService(
        this.embeddingService,
        'content'
      )

      // 임베딩 서비스 워밍업 - 모델 로드 및 성능 최적화
      await this.warmupEmbeddingService()

      logger.info('✅ Embedding service initialized successfully', {
        service: actualService,
        dimensions: this.embeddingBridge.ndims(),
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

  private async warmupEmbeddingService(): Promise<void> {
    if (!this.embeddingService || !this.embeddingBridge) {
      throw new Error('Embedding service not initialized')
    }

    const warmupStartTime = Date.now()
    logger.info('🔥 Starting embedding service warmup...', {
      component: 'LanceDBProvider',
    })

    try {
      // 1. 단일 쿼리 워밍업 (첫 번째 임베딩이 가장 오래 걸림)
      logger.debug('Warming up with single query...')
      const singleStart = Date.now()
      const testEmbedding = await this.embeddingService.embedQuery(
        'warmup test query for model initialization'
      )
      const singleTime = Date.now() - singleStart

      // 2. 배치 워밍업 (배치 처리 최적화)
      logger.debug('Warming up with batch queries...')
      const batchStart = Date.now()
      const warmupQueries = [
        'sample document text for embedding',
        'another test document',
        'machine learning and AI',
      ]
      await this.embeddingService.embedDocuments(warmupQueries)
      const batchTime = Date.now() - batchStart

      const totalWarmupTime = Date.now() - warmupStartTime
      logger.info('✅ Embedding service warmup completed', {
        singleQueryTime: singleTime,
        batchTime: batchTime,
        totalWarmupTime,
        dimensions: testEmbedding.length,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      const warmupTime = Date.now() - warmupStartTime
      logger.warn('⚠️ Embedding service warmup failed, but continuing', {
        error: error instanceof Error ? error.message : String(error),
        warmupTime,
        component: 'LanceDBProvider',
      })
      // 워밍업 실패해도 계속 진행 - 첫 검색이 느릴 뿐
    }
  }

  private async initializeTable(): Promise<void> {
    if (!this.db || !this.embeddingBridge) {
      throw new Error('Database connection or embedding bridge not initialized')
    }

    try {
      const tableName = this.tableOptions.tableName!
      const embeddingDimensions = this.embeddingBridge.ndims()

      logger.info('🔄 Initializing LanceDB table...', {
        tableName,
        embeddingDimensions,
        component: 'LanceDBProvider',
      })

      // 기존 테이블 확인
      const tableNames = await this.db.tableNames()
      const tableExists = tableNames.includes(tableName)

      if (tableExists) {
        logger.info('📋 Opening existing table', {
          tableName,
          component: 'LanceDBProvider',
        })
        this.table = await this.db.openTable(tableName)
      } else {
        logger.info('🆕 Creating new table', {
          tableName,
          embeddingDimensions,
          component: 'LanceDBProvider',
        })

        // 간단한 샘플 데이터로 테이블 생성 (LanceDB 권장 방식)
        const sampleData = [{
          id: 'init_sample',
          content: 'Initial sample document',
          vector: new Array(embeddingDimensions).fill(0),
          fileId: 'sample',
          fileName: 'sample.txt',
          filePath: '/sample.txt',
          fileSize: 0,
          fileType: 'text',
          fileHash: 'sample',
          chunkIndex: 0,
          totalChunks: 1,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          modelVersion: '1.0.0',
          processingVersion: '1.0.0',
          sourceType: 'local_file',
          status: 'completed'
        }]
        
        this.table = await this.db.createTable(tableName, sampleData, { mode: 'overwrite' })
        
        // 샘플 데이터 삭제
        await this.table.delete("id = 'init_sample'")
      }

      // 전문 검색 인덱스 생성 (스키마 설정 기반)
      if (this.schemaConfig.enableFullTextSearch) {
        await this.createFullTextIndexes()
      }

      logger.info('✅ Table initialization completed', {
        tableName,
        existed: tableExists,
        component: 'LanceDBProvider',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to initialize table',
        error instanceof Error ? error : new Error(String(error)),
        {
          tableName: this.tableOptions.tableName,
          component: 'LanceDBProvider',
        }
      )
      throw error
    }
  }

  private async createFullTextIndexes(): Promise<void> {
    if (!this.table || !this.schemaConfig.indexColumns.length) return

    try {
      logger.info('🔍 Creating full-text search indexes...', {
        columns: this.schemaConfig.indexColumns,
        component: 'LanceDBProvider',
      })

      // LanceDB의 FTS 인덱스 생성 (스키마 설정 기반)
      for (const column of this.schemaConfig.indexColumns) {
        try {
          await (this.table as any).createFtsIndex(column, { replace: true })
          logger.debug(`✅ Created FTS index for column: ${column}`)
        } catch (error) {
          logger.warn(`⚠️ Failed to create FTS index for column: ${column}`, {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error) {
      logger.warn('⚠️ Failed to create some full-text indexes', {
        error: error instanceof Error ? error.message : String(error),
        component: 'LanceDBProvider',
      })
      // FTS 인덱스 생성 실패는 치명적이지 않으므로 계속 진행
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    await this.initialize()

    if (!this.table || !this.embeddingService || !this.embeddingBridge) {
      throw new Error('LanceDB provider not properly initialized')
    }

    const endTiming = startTiming('lancedb_add_documents', {
      documentCount: documents.length,
      component: 'LanceDBProvider',
    })

    try {
      logger.info('📄 Adding documents to LanceDB', {
        count: documents.length,
        component: 'LanceDBProvider',
      })

      // 배치 처리로 메모리 사용량 최적화 (스키마 설정 기반)
      const batchSize = LANCEDB_CONSTANTS.DEFAULT_BATCH_SIZE
      await processBatches(documents, batchSize, async (batch) => {
        return await this.processBatchDocuments(batch)
      })

      logger.info('✅ Documents added successfully to LanceDB', {
        count: documents.length,
        component: 'LanceDBProvider',
      })

      // Invalidate file metadata cache since files have changed
      this.fileMetadataCache = null
    } catch (error) {
      logger.error(
        '❌ Failed to add documents to LanceDB',
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

  private async processBatchDocuments(
    documents: VectorDocument[]
  ): Promise<any[]> {
    if (!this.embeddingBridge) {
      throw new Error('Embedding bridge not initialized')
    }

    // 1. 임베딩 생성
    const contents = documents.map((doc) => doc.content)
    const embeddings = await this.embeddingBridge.embed(contents)

    // 2. 간단한 레코드 형식으로 변환 (LanceDB 권장 방식)
    const records: any[] = []
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]!
      const embedding = embeddings[i]!

      // 임베딩 유효성 검사
      const validation = validateEmbeddingVector(embedding, this.embeddingBridge.ndims())
      if (!validation.isValid) {
        logger.warn('⚠️ Invalid embedding vector', {
          docId: doc.id,
          error: validation.error,
          component: 'LanceDBProvider',
        })
        continue
      }

      // 간단한 레코드 구조 (필수 필드만)
      const record = {
        id: doc.id,
        content: doc.content,
        vector: embedding,
        
        // File 메타데이터
        fileId: doc.metadata.fileId || '',
        fileName: doc.metadata.fileName || '',
        filePath: doc.metadata.filePath || '',
        fileSize: Number(doc.metadata.fileSize) || 0,
        fileType: doc.metadata.fileType || 'text',
        fileHash: doc.metadata.fileHash || '',
        
        // 구조 정보
        chunkIndex: Number(doc.metadata.chunkIndex) || 0,
        totalChunks: Number(doc.metadata.totalChunks) || 1,
        
        // 타임스탬프 (ISO 문자열)
        createdAt: doc.metadata.createdAt || new Date().toISOString(),
        modifiedAt: doc.metadata.modifiedAt || new Date().toISOString(),
        processedAt: new Date().toISOString(),
        
        // 시스템 정보
        modelVersion: '1.0.0',
        processingVersion: '1.0.0',
        sourceType: 'local_file',
        status: 'completed'
      }

      records.push(record)
    }

    // 3. 테이블에 직접 추가 (중복 제거는 LanceDB에서 처리)
    if (records.length > 0) {
      await this.table!.add(records)
    }

    return records
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
      logger.debug('🔍 Performing LanceDB vector search', {
        query: query.substring(0, 100),
        topK: options.topK,
        scoreThreshold: options.scoreThreshold,
        component: 'LanceDBProvider',
      })

      // 1. 쿼리 임베딩 생성 (timeout 적용)
      const embeddingTimeout = parseInt(process.env.EMBEDDING_TIMEOUT_MS || '15000')
      logger.debug('⚡ Generating query embedding with timeout', {
        timeout: embeddingTimeout,
        component: 'LanceDBProvider',
      })

      const queryEmbedding = await TimeoutWrapper.withTimeout(
        this.embeddingBridge.embedQuery(query),
        {
          timeoutMs: embeddingTimeout,
          operation: 'generate_query_embedding',
        }
      )

      // 2. 간단한 벡터 검색 (LanceDB 권장 방식)
      const searchTimeout = parseInt(process.env.LANCEDB_SEARCH_TIMEOUT_MS || '30000')
      logger.debug('🔍 Performing simplified vector search', {
        timeout: searchTimeout,
        topK: options.topK,
        component: 'LanceDBProvider',
      })

      // 간단한 검색 (필터는 추후 추가)
      const rawResults = await TimeoutWrapper.withTimeout(
        this.table.search(queryEmbedding)
          .limit(options.topK || 10)
          .toArray(),
        {
          timeoutMs: searchTimeout,
          operation: 'lancedb_vector_search',
        }
      )

      // 3. 간단한 결과 변환
      let results = rawResults.map((result) => ({
        id: result.id || '',
        content: result.content || '',
        score: result._distance ? (1 - result._distance) : result.score || 0,
        metadata: {
          fileId: result.fileId || '',
          fileName: result.fileName || 'unknown',
          filePath: result.filePath || 'unknown',  
          fileType: result.fileType || 'unknown',
          fileSize: result.fileSize || 0,
          fileHash: result.fileHash || '',
          chunkIndex: result.chunkIndex || 0,
          totalChunks: result.totalChunks || 1,
          createdAt: result.createdAt || new Date().toISOString(),
          modifiedAt: result.modifiedAt || new Date().toISOString(),
          processedAt: result.processedAt || new Date().toISOString(),
        },
      }))

      // 4. 스코어 필터링
      if (options.scoreThreshold) {
        results = results.filter((result) => result.score >= options.scoreThreshold!)
      }

      logger.info('✅ LanceDB search completed', {
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


  async deleteDocuments(ids: string[]): Promise<void> {
    await this.initialize()

    if (!this.table) {
      throw new Error('LanceDB table not initialized')
    }

    const endTiming = startTiming('lancedb_delete_documents', {
      documentCount: ids.length,
      component: 'LanceDBProvider',
    })

    try {
      logger.info('🗑️ Deleting documents from LanceDB', {
        count: ids.length,
        component: 'LanceDBProvider',
      })

      // ID 목록으로 삭제
      const idsString = ids.map((id) => `'${id}'`).join(', ')
      await this.table.delete(`id IN (${idsString})`)

      logger.info('✅ Documents deleted successfully', {
        count: ids.length,
        component: 'LanceDBProvider',
      })
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
    } finally {
      endTiming()
    }
  }

  async removeDocumentsByFileId(fileId: string): Promise<void> {
    await this.initialize()

    if (!this.table) {
      throw new Error('LanceDB table not initialized')
    }

    try {
      logger.info('🗑️ Removing documents by fileId', {
        fileId,
        component: 'LanceDBProvider',
      })

      await this.table.delete(`"fileId" = '${fileId}'`)

      logger.info('✅ Documents removed by fileId', {
        fileId,
        component: 'LanceDBProvider',
      })

      // Invalidate file metadata cache since files have changed
      this.fileMetadataCache = null
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
      logger.info('🗑️ Removing all documents from LanceDB', {
        component: 'LanceDBProvider',
      })

      // 모든 행 삭제 (조건 없이)
      await this.table.delete('true')

      logger.info('✅ All documents removed', {
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

  getIndexInfo(): IndexStats {
    // LanceDB 테이블 통계 반환
    try {
      // For now, return estimated counts since countRows might be async
      const dimensions = this.embeddingBridge?.ndims() || 384
      const estimatedVectors = this.isInitialized && this.table ? 1 : 0 // Basic estimation

      return {
        totalVectors: estimatedVectors,
        dimensions: dimensions,
        indexSize: Math.floor((estimatedVectors * dimensions * 4) / 1024), // Approximate size in KB
        lastUpdated: new Date(),
      }
    } catch (error) {
      logger.warn(
        'Failed to get LanceDB index stats',
        error instanceof Error ? error : new Error(String(error))
      )
      return {
        totalVectors: 0,
        dimensions: this.embeddingBridge?.ndims() || 384,
        indexSize: 0,
        lastUpdated: new Date(),
      }
    }
  }

  isHealthy(): boolean {
    return this.isInitialized && this.db !== null && this.table !== null
  }

  // 추가 메서드들
  getDocumentCount(): number {
    try {
      // For now, return basic estimation since countRows might be async
      return this.isInitialized && this.table ? 1 : 0
    } catch (error) {
      logger.debug(
        'Failed to get document count',
        error instanceof Error ? error : new Error(String(error))
      )
      return 0
    }
  }

  // 고급 기능들

  /**
   * Get file metadata for a specific file from vector store
   * Efficient implementation using SQL query
   */
  async getFileMetadata(fileId: string): Promise<any | null> {
    await this.initialize()

    if (!this.table) {
      throw new Error('LanceDB provider not properly initialized')
    }

    try {
      logger.debug('Retrieving file metadata from LanceDB', {
        fileId,
        component: 'LanceDBProvider',
      })

      // Use efficient SQL query with centralized field selection
      const { QueryGenerator } = await import('@/shared/schemas/schema-generator.js')
      const selectFields = QueryGenerator.generateSelectClause('essential')
      const whereClause = QueryGenerator.generateFileIdWhereClause(fileId)

      const results = await this.table
        .query()
        .where(whereClause)
        .select(selectFields.split(', ').map((field) => field.replace(/"/g, '')))
        .limit(1)
        .toArray()

      if (results.length > 0) {
        const result = results[0]
        // Use centralized data transformation
        const { DataTransformer } = await import('@/shared/schemas/schema-generator.js')
        const unifiedMetadata = DataTransformer.lanceDBRecordToUnified(result)

        return {
          fileId: unifiedMetadata.file.id,
          fileName: unifiedMetadata.file.name,
          filePath: unifiedMetadata.file.path,
          fileType: unifiedMetadata.file.type,
          size: unifiedMetadata.file.size,
          fileHash: unifiedMetadata.file.hash,
          modifiedAt: unifiedMetadata.timestamps.modified.toISOString(),
          createdAt: unifiedMetadata.timestamps.created.toISOString(),
          processedAt: unifiedMetadata.timestamps.processed.toISOString(),
          sourceType: unifiedMetadata.system.sourceType,
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
   * Get all file metadata from vector store
   * Retrieves unique file metadata from all documents
   */
  async getAllFileMetadata(): Promise<Map<string, any>> {
    await this.initialize()

    if (!this.table) {
      throw new Error('LanceDB provider not properly initialized')
    }

    // Check cache first
    const now = Date.now()
    if (this.fileMetadataCache && now - this.fileMetadataCache.timestamp < this.CACHE_TTL) {
      logger.debug('Using cached file metadata', {
        cacheAge: Math.round((now - this.fileMetadataCache.timestamp) / 1000),
        cachedFiles: this.fileMetadataCache.data.size,
        component: 'LanceDBProvider',
      })
      return new Map(this.fileMetadataCache.data) // Return a copy to prevent mutation
    }

    const fileMetadataMap = new Map<string, any>()

    try {
      logger.debug('Retrieving all file metadata from LanceDB (cache miss or expired)', {
        component: 'LanceDBProvider',
      })

      // DEBUGGING: Check total document count first
      const totalCountResults = await this.table.query().select(['id']).toArray()

      logger.info(`🔍 Total documents in table: ${totalCountResults.length}`, {
        component: 'LanceDBProvider',
      })

      // 간단한 쿼리 (모든 메타데이터 필드 선택)
      const results = await this.table
        .query()
        .select(['fileId', 'fileName', 'filePath', 'fileType', 'fileSize', 'fileHash', 'createdAt', 'modifiedAt', 'processedAt'])
        .toArray()

      logger.info(`📊 Retrieved ${results.length} documents from LanceDB for metadata extraction`, {
        component: 'LanceDBProvider',
      })

      // Debug: show sample results
      if (results.length > 0) {
        const sample = results.slice(0, 3)
        logger.debug('Sample documents from LanceDB:', {
          sampleCount: sample.length,
          samples: sample.map((r) => ({
            fileId: r.fileId,
            fileName: r.fileName,
            hasFileId: !!r.fileId,
          })),
          component: 'LanceDBProvider',
        })
      } else {
        logger.warn('No documents found in LanceDB table', {
          component: 'LanceDBProvider',
        })
      }

      // 간단한 변환 (복잡한 변환 없이)
      for (const result of results) {
        const fileId = result.fileId
        if (fileId && !fileMetadataMap.has(fileId)) {
          // 가장 최근 문서만 유지
          const existingMeta = fileMetadataMap.get(fileId)
          const currentProcessedAt = new Date(result.processedAt || 0).getTime()
          const existingProcessedAt = existingMeta
            ? new Date(existingMeta.processedAt || 0).getTime()
            : 0

          if (!existingMeta || currentProcessedAt > existingProcessedAt) {
            fileMetadataMap.set(fileId, {
              fileId: result.fileId || '',
              fileName: result.fileName || 'unknown',
              filePath: result.filePath || 'unknown',
              fileType: result.fileType || 'text',
              size: Number(result.fileSize) || 0,
              fileHash: result.fileHash || '',
              modifiedAt: result.modifiedAt || new Date().toISOString(),
              createdAt: result.createdAt || new Date().toISOString(),
              processedAt: result.processedAt || new Date().toISOString(),
              sourceType: 'local_file',
            })
          }
        }
      }

      logger.info(
        `📊 Retrieved ${fileMetadataMap.size} unique files from ${results.length} documents`,
        {
          component: 'LanceDBProvider',
        }
      )

      // Log some sample metadata for debugging
      if (fileMetadataMap.size > 0) {
        const firstFile = Array.from(fileMetadataMap.values())[0]
        logger.debug('Sample file metadata', {
          fileName: firstFile.fileName,
          fileId: firstFile.fileId,
          size: firstFile.size,
          processedAt: firstFile.processedAt,
          component: 'LanceDBProvider',
        })
      }

      // Update cache
      this.fileMetadataCache = {
        data: new Map(fileMetadataMap), // Store a copy
        timestamp: Date.now(),
      }

      logger.debug('File metadata cached', {
        fileCount: fileMetadataMap.size,
        cacheExpiry: new Date(Date.now() + this.CACHE_TTL).toISOString(),
        component: 'LanceDBProvider',
      })

      return fileMetadataMap
    } catch (error) {
      logger.error(
        'Failed to retrieve all file metadata from LanceDB',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'LanceDBProvider',
        }
      )

      // Return empty map on error - will cause all files to be processed as new
      logger.warn('Falling back to empty metadata map - all files will be processed as new')
      return fileMetadataMap
    }
  }
}
