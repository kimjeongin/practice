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
import { withTimeout, withRetry } from '@/shared/utils/resilience.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'

// LanceDB 관련 imports
import {
  LanceDBEmbeddingBridge,
  createLanceDBEmbeddingBridgeFromService,
} from './embedding-bridge.js'
import {
  LanceDBDocumentRecord,
  createLanceDBSchema,
  vectorDocumentToLanceDBRecord,
  lanceDBResultToSearchResult,
  validateLanceDBRecord,
  type LanceDBTableOptions,
} from './types.js'
import {
  getDefaultTableConfig,
  LANCEDB_CONSTANTS,
  DEFAULT_TABLE_OPTIONS,
  type LanceDBTableConfig
} from './config.js'
import {
  buildWhereClause,
  highlightSearchResult,
  processBatches,
  getTableStats,
  deduplicateRecords,
  normalizeSearchScores,
  validateEmbeddingVector,
  type LanceDBConnectionOptions,
  type LanceDBSearchFilter,
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
      storageOptions: connectionOptions.storageOptions || {}
    }
    
    // 스키마 설정 로드
    this.schemaConfig = getDefaultTableConfig()
    
    this.tableOptions = {
      ...DEFAULT_TABLE_OPTIONS,
      ...tableOptions,
      tableName: tableOptions.tableName || this.schemaConfig.name,
      enableFullTextSearch: tableOptions.enableFullTextSearch !== undefined 
        ? tableOptions.enableFullTextSearch 
        : this.schemaConfig.enableFullTextSearch,
      indexColumns: tableOptions.indexColumns || this.schemaConfig.indexColumns
    }

    logger.info('🚀 LanceDBProvider initialized', {
      uri: this.connectionOptions.uri,
      tableName: this.tableOptions.tableName,
      component: 'LanceDBProvider'
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
      component: 'LanceDBProvider'
    })

    try {
      logger.info('🔄 Initializing LanceDB connection...', {
        uri: this.connectionOptions.uri,
        component: 'LanceDBProvider'
      })

      // 1. LanceDB 연결 생성
      this.db = await lancedb.connect(this.connectionOptions.uri, {
        storageOptions: this.connectionOptions.storageOptions
      })

      // 2. 임베딩 서비스 초기화
      await this.initializeEmbeddingService()

      // 3. 테이블 초기화 또는 생성
      await this.initializeTable()

      this.isInitialized = true

      logger.info('✅ LanceDB initialization completed', {
        uri: this.connectionOptions.uri,
        tableName: this.tableOptions.tableName,
        embeddingDimensions: this.embeddingBridge?.ndims(),
        component: 'LanceDBProvider'
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('❌ LanceDB initialization failed', error instanceof Error ? error : new Error(errorMessage), {
        uri: this.connectionOptions.uri,
        component: 'LanceDBProvider'
      })
      
      errorMonitor.recordError(error instanceof StructuredError ? error : new StructuredError(errorMessage, ErrorCode.VECTOR_STORE_ERROR))
      throw error
    } finally {
      endTiming()
    }
  }

  private async initializeEmbeddingService(): Promise<void> {
    try {
      logger.info('🧠 Initializing embedding service for LanceDB...', {
        component: 'LanceDBProvider'
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

      // 임베딩 서비스 테스트
      const testEmbedding = await this.embeddingService.embedQuery('test')
      logger.info('✅ Embedding service initialized successfully', {
        service: actualService,
        dimensions: testEmbedding.length,
        component: 'LanceDBProvider'
      })

    } catch (error) {
      logger.error('❌ Failed to initialize embedding service', error instanceof Error ? error : new Error(String(error)), {
        component: 'LanceDBProvider'
      })
      throw error
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
        component: 'LanceDBProvider'
      })

      // 기존 테이블 확인
      const tableNames = await this.db.tableNames()
      const tableExists = tableNames.includes(tableName)

      if (tableExists) {
        logger.info('📋 Opening existing table', {
          tableName,
          component: 'LanceDBProvider'
        })
        this.table = await this.db.openTable(tableName)
      } else {
        logger.info('🆕 Creating new table', {
          tableName,
          embeddingDimensions,
          component: 'LanceDBProvider'
        })

        // 빈 스키마로 테이블 생성
        const schema = createLanceDBSchema(embeddingDimensions)
        this.table = await this.db.createEmptyTable(tableName, schema)
      }

      // 전문 검색 인덱스 생성 (스키마 설정 기반)
      if (this.schemaConfig.enableFullTextSearch) {
        await this.createFullTextIndexes()
      }

      logger.info('✅ Table initialization completed', {
        tableName,
        existed: tableExists,
        component: 'LanceDBProvider'
      })

    } catch (error) {
      logger.error('❌ Failed to initialize table', error instanceof Error ? error : new Error(String(error)), {
        tableName: this.tableOptions.tableName,
        component: 'LanceDBProvider'
      })
      throw error
    }
  }

  private async createFullTextIndexes(): Promise<void> {
    if (!this.table || !this.schemaConfig.indexColumns.length) return

    try {
      logger.info('🔍 Creating full-text search indexes...', {
        columns: this.schemaConfig.indexColumns,
        component: 'LanceDBProvider'
      })

      // LanceDB의 FTS 인덱스 생성 (스키마 설정 기반)
      for (const column of this.schemaConfig.indexColumns) {
        try {
          await (this.table as any).createFtsIndex(column, { replace: true })
          logger.debug(`✅ Created FTS index for column: ${column}`)
        } catch (error) {
          logger.warn(`⚠️ Failed to create FTS index for column: ${column}`, {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

    } catch (error) {
      logger.warn('⚠️ Failed to create some full-text indexes', {
        error: error instanceof Error ? error.message : String(error),
        component: 'LanceDBProvider'
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
      component: 'LanceDBProvider'
    })

    try {
      logger.info('📄 Adding documents to LanceDB', {
        count: documents.length,
        component: 'LanceDBProvider'
      })

      // 배치 처리로 메모리 사용량 최적화 (스키마 설정 기반)
      const batchSize = LANCEDB_CONSTANTS.DEFAULT_BATCH_SIZE
      await processBatches(documents, batchSize, async (batch) => {
        return await this.processBatchDocuments(batch)
      })

      logger.info('✅ Documents added successfully to LanceDB', {
        count: documents.length,
        component: 'LanceDBProvider'
      })

      // Invalidate file metadata cache since files have changed
      this.fileMetadataCache = null

    } catch (error) {
      logger.error('❌ Failed to add documents to LanceDB', error instanceof Error ? error : new Error(String(error)), {
        documentCount: documents.length,
        component: 'LanceDBProvider'
      })
      errorMonitor.recordError(error instanceof StructuredError ? error : new StructuredError(String(error), ErrorCode.VECTOR_STORE_ERROR))
      throw error
    } finally {
      endTiming()
    }
  }

  private async processBatchDocuments(documents: VectorDocument[]): Promise<LanceDBDocumentRecord[]> {
    if (!this.embeddingBridge) {
      throw new Error('Embedding bridge not initialized')
    }

    // 1. 임베딩 생성
    const contents = documents.map(doc => doc.content)
    const embeddings = await this.embeddingBridge.embed(contents)

    // 2. LanceDB 레코드 형식으로 변환
    const records: LanceDBDocumentRecord[] = []
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]!
      const embedding = embeddings[i]!
      
      // 임베딩 유효성 검사
      const validation = validateEmbeddingVector(embedding, this.embeddingBridge.ndims())
      if (!validation.isValid) {
        logger.warn('⚠️ Invalid embedding vector', {
          docId: doc.id,
          error: validation.error,
          component: 'LanceDBProvider'
        })
        continue
      }

      const record = vectorDocumentToLanceDBRecord(doc, embedding)
      
      // 레코드 유효성 검사
      const recordValidation = validateLanceDBRecord(record)
      if (recordValidation.length > 0) {
        logger.warn('⚠️ Invalid LanceDB record', {
          docId: doc.id,
          errors: recordValidation,
          component: 'LanceDBProvider'
        })
        continue
      }

      records.push(record)
    }

    // 3. 중복 제거
    const deduplicatedRecords = deduplicateRecords(records)

    // 4. 테이블에 추가
    if (deduplicatedRecords.length > 0) {
      await this.table!.add(deduplicatedRecords as any)
    }

    return deduplicatedRecords
  }

  async search(query: string, options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> {
    await this.initialize()

    if (!this.table || !this.embeddingBridge) {
      throw new Error('LanceDB provider not properly initialized')
    }

    const endTiming = startTiming('lancedb_search', {
      query: query.substring(0, 50),
      topK: options.topK,
      component: 'LanceDBProvider'
    })

    try {
      logger.debug('🔍 Performing LanceDB vector search', {
        query: query.substring(0, 100),
        topK: options.topK,
        scoreThreshold: options.scoreThreshold,
        component: 'LanceDBProvider'
      })

      // 1. 쿼리 임베딩 생성
      const queryEmbedding = await this.embeddingBridge.embedQuery(query)

      // 2. 검색 필터 구성
      const whereClause = buildWhereClause(this.buildSearchFilter(options))

      // 3. 벡터 검색 실행
      let searchQuery = this.table
        .vectorSearch(queryEmbedding)
        .limit(options.topK || 10)

      if (whereClause) {
        searchQuery = searchQuery.where(whereClause)
      }

      const rawResults = await searchQuery.toArray()

      // 4. 결과 변환 및 후처리
      let results = rawResults.map(result => lanceDBResultToSearchResult(result))

      // 5. 스코어 필터링
      if (options.scoreThreshold) {
        results = results.filter(result => result.score >= options.scoreThreshold!)
      }

      // 6. 스코어 정규화
      results = normalizeSearchScores(results)

      // 7. 하이라이트 추가 (항상 포함)
      results = results.map(result => ({
        ...result,
        ...highlightSearchResult(result.content, query, 200)
      }))

      logger.info('✅ LanceDB search completed', {
        query: query.substring(0, 100),
        resultsCount: results.length,
        topScore: results[0]?.score || 0,
        component: 'LanceDBProvider'
      })

      return results

    } catch (error) {
      logger.error('❌ LanceDB search failed', error instanceof Error ? error : new Error(String(error)), {
        query: query.substring(0, 100),
        component: 'LanceDBProvider'
      })
      errorMonitor.recordError(error instanceof StructuredError ? error : new StructuredError(String(error), ErrorCode.VECTOR_STORE_ERROR))
      throw error
    } finally {
      endTiming()
    }
  }

  private buildSearchFilter(options: VectorSearchOptions): LanceDBSearchFilter {
    const filter: LanceDBSearchFilter = {}

    if (options.fileTypes && options.fileTypes.length > 0) {
      filter.fileTypes = options.fileTypes
    }

    if (options.metadataFilters) {
      filter.customFilters = options.metadataFilters
    }

    return filter
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    await this.initialize()

    if (!this.table) {
      throw new Error('LanceDB table not initialized')
    }

    const endTiming = startTiming('lancedb_delete_documents', {
      documentCount: ids.length,
      component: 'LanceDBProvider'
    })

    try {
      logger.info('🗑️ Deleting documents from LanceDB', {
        count: ids.length,
        component: 'LanceDBProvider'
      })

      // ID 목록으로 삭제
      const idsString = ids.map(id => `'${id}'`).join(', ')
      await this.table.delete(`id IN (${idsString})`)

      logger.info('✅ Documents deleted successfully', {
        count: ids.length,
        component: 'LanceDBProvider'
      })

    } catch (error) {
      logger.error('❌ Failed to delete documents', error instanceof Error ? error : new Error(String(error)), {
        documentCount: ids.length,
        component: 'LanceDBProvider'
      })
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
        component: 'LanceDBProvider'
      })

      await this.table.delete(`"fileId" = '${fileId}'`)

      logger.info('✅ Documents removed by fileId', {
        fileId,
        component: 'LanceDBProvider'
      })

      // Invalidate file metadata cache since files have changed
      this.fileMetadataCache = null

    } catch (error) {
      logger.error('❌ Failed to remove documents by fileId', error instanceof Error ? error : new Error(String(error)), {
        fileId,
        component: 'LanceDBProvider'
      })
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
        component: 'LanceDBProvider'
      })

      // 모든 행 삭제 (조건 없이)
      await this.table.delete('true')

      logger.info('✅ All documents removed', {
        component: 'LanceDBProvider'
      })

    } catch (error) {
      logger.error('❌ Failed to remove all documents', error instanceof Error ? error : new Error(String(error)), {
        component: 'LanceDBProvider'
      })
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
        indexSize: Math.floor(estimatedVectors * dimensions * 4 / 1024), // Approximate size in KB
        lastUpdated: new Date(),
      }
    } catch (error) {
      logger.warn('Failed to get LanceDB index stats', error instanceof Error ? error : new Error(String(error)))
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
      logger.debug('Failed to get document count', error instanceof Error ? error : new Error(String(error)))
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
        component: 'LanceDBProvider'
      })

      // Use efficient SQL query instead of vector search - match actual schema and quote column names
      const results = await this.table
        .query()
        .where(`"fileId" = '${fileId}'`)
        .select(['fileId', 'fileName', 'filePath', 'fileType', 'fileSize', 'fileCreatedAt', 'updatedAt'])
        .limit(1)
        .toArray()

      if (results.length > 0) {
        const result = results[0]
        return {
          fileId: result.fileId,
          fileName: result.fileName,
          filePath: result.filePath,
          fileType: result.fileType,
          size: result.fileSize || 0,
          createdAt: result.fileCreatedAt,
          processedAt: result.updatedAt || result.fileCreatedAt, // Use updatedAt as processed time, fall back to file creation
          sourceType: 'local_file' // Default value since not in schema
        }
      }

      return null
    } catch (error) {
      logger.warn('Failed to retrieve file metadata', {
        fileId,
        error: error instanceof Error ? error.message : String(error),
        component: 'LanceDBProvider'
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
    if (this.fileMetadataCache && (now - this.fileMetadataCache.timestamp) < this.CACHE_TTL) {
      logger.debug('Using cached file metadata', {
        cacheAge: Math.round((now - this.fileMetadataCache.timestamp) / 1000),
        cachedFiles: this.fileMetadataCache.data.size,
        component: 'LanceDBProvider'
      })
      return new Map(this.fileMetadataCache.data) // Return a copy to prevent mutation
    }

    const fileMetadataMap = new Map<string, any>()

    try {
      logger.debug('Retrieving all file metadata from LanceDB (cache miss or expired)', {
        component: 'LanceDBProvider'
      })

      // DEBUGGING: Check total document count first
      const totalCountResults = await this.table
        .query()
        .select(['id'])
        .toArray()
      
      logger.info(`🔍 Total documents in table: ${totalCountResults.length}`, {
        component: 'LanceDBProvider'
      })

      // Use efficient SQL query to get all file metadata - match actual schema
      const results = await this.table
        .query()
        .select(['fileId', 'fileName', 'filePath', 'fileType', 'fileSize', 'fileCreatedAt', 'updatedAt'])
        .toArray()

      logger.info(`📊 Retrieved ${results.length} documents from LanceDB for metadata extraction`, {
        component: 'LanceDBProvider'
      })

      // Debug: show sample results
      if (results.length > 0) {
        const sample = results.slice(0, 3)
        logger.debug('Sample documents from LanceDB:', {
          sampleCount: sample.length,
          samples: sample.map(r => ({
            fileId: r.fileId,
            fileName: r.fileName,
            hasFileId: !!r.fileId
          })),
          component: 'LanceDBProvider'
        })
      } else {
        logger.warn('No documents found in LanceDB table', {
          component: 'LanceDBProvider'
        })
      }

      // Extract unique file metadata
      for (const result of results) {
        const fileId = result.fileId
        if (fileId && !fileMetadataMap.has(fileId)) {
          // Get the most recent document for this file (highest chunkIndex or latest updatedAt)
          const existingMeta = fileMetadataMap.get(fileId)
          const currentProcessedAt = new Date(result.updatedAt || result.fileCreatedAt || 0).getTime()
          const existingProcessedAt = existingMeta ? new Date(existingMeta.processedAt || existingMeta.createdAt || 0).getTime() : 0

          if (!existingMeta || currentProcessedAt > existingProcessedAt) {
            fileMetadataMap.set(fileId, {
              fileId: result.fileId,
              fileName: result.fileName,
              filePath: result.filePath,
              fileType: result.fileType,
              size: result.fileSize || 0,
              createdAt: result.fileCreatedAt,
              processedAt: result.updatedAt || result.fileCreatedAt, // Use updatedAt as processed time, fall back to file creation
              sourceType: 'local_file' // Default value since not in schema
            })
          }
        }
      }

      logger.info(`📊 Retrieved ${fileMetadataMap.size} unique files from ${results.length} documents`, {
        component: 'LanceDBProvider'
      })

      // Log some sample metadata for debugging
      if (fileMetadataMap.size > 0) {
        const firstFile = Array.from(fileMetadataMap.values())[0]
        logger.debug('Sample file metadata', {
          fileName: firstFile.fileName,
          fileId: firstFile.fileId,
          size: firstFile.size,
          processedAt: firstFile.processedAt,
          component: 'LanceDBProvider'
        })
      }

      // Update cache
      this.fileMetadataCache = {
        data: new Map(fileMetadataMap), // Store a copy
        timestamp: Date.now()
      }

      logger.debug('File metadata cached', {
        fileCount: fileMetadataMap.size,
        cacheExpiry: new Date(Date.now() + this.CACHE_TTL).toISOString(),
        component: 'LanceDBProvider'
      })

      return fileMetadataMap

    } catch (error) {
      logger.error('Failed to retrieve all file metadata from LanceDB', error instanceof Error ? error : new Error(String(error)), {
        component: 'LanceDBProvider'
      })
      
      // Return empty map on error - will cause all files to be processed as new
      logger.warn('Falling back to empty metadata map - all files will be processed as new')
      return fileMetadataMap
    }
  }


}