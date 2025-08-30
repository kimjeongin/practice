/**
 * LanceDB Embedding Bridge
 * 기존 EmbeddingAdapter를 LanceDB의 EmbeddingFunction 인터페이스와 연결
 */

import { EmbeddingAdapter } from '../../../embeddings/adapter.js'
import type { IEmbeddingService } from '@/domains/rag/core/types.js'

/**
 * LanceDB 호환 임베딩 함수 인터페이스
 * LanceDB의 EmbeddingFunction을 TypeScript로 구현
 */
export interface LanceDBEmbeddingFunction {
  sourceColumn: string
  embed(data: string[]): Promise<number[][]>
  embeddingDataType?: string
  embeddingDimension?: number
  ndims(): number
}

/**
 * 기존 EmbeddingAdapter를 LanceDB EmbeddingFunction으로 변환하는 브릿지
 */
export class LanceDBEmbeddingBridge implements LanceDBEmbeddingFunction {
  public readonly sourceColumn: string
  public readonly embeddingDataType = 'Float32'
  private _embeddingDimension?: number

  // 간단한 LRU 캐시
  private queryCache = new Map<string, number[]>()
  private readonly maxCacheSize = parseInt(process.env.EMBEDDING_CACHE_SIZE || '100')
  private readonly cacheEnabled = process.env.EMBEDDING_CACHE_ENABLED !== 'false'

  constructor(private embeddingService: IEmbeddingService, sourceColumn: string = 'content') {
    this.sourceColumn = sourceColumn
    console.log(`🧠 LanceDB Embedding Bridge initialized with cache`, {
      cacheEnabled: this.cacheEnabled,
      maxCacheSize: this.maxCacheSize,
    })
  }

  /**
   * 임베딩 차원 수를 반환
   */
  ndims(): number {
    if (this._embeddingDimension) {
      return this._embeddingDimension
    }

    // 모델 정보에서 차원 수 가져오기
    const modelInfo = this.embeddingService.getModelInfo()
    this._embeddingDimension = modelInfo.dimensions || 384
    return this._embeddingDimension
  }

  /**
   * embeddingDimension getter (LanceDB 호환성)
   */
  get embeddingDimension(): number {
    return this.ndims()
  }

  /**
   * 배치 임베딩 생성 (LanceDB 인터페이스)
   * @param data 임베딩할 텍스트 배열
   * @returns 임베딩 벡터 배열
   */
  async embed(data: string[]): Promise<number[][]> {
    if (!data || data.length === 0) {
      return []
    }

    try {
      // EmbeddingAdapter의 embedDocuments 메서드 사용 (성능 측정)
      const startTime = Date.now()
      const embeddings = await this.embeddingService.embedDocuments(data)
      const embeddingTime = Date.now() - startTime

      console.log(`⚡ Batch embeddings generated in ${embeddingTime}ms`, {
        batchSize: data.length,
        avgTimePerDoc: Math.round(embeddingTime / data.length),
        embeddingDimensions: embeddings[0]?.length || 0,
        throughput: Math.round((data.length * 1000) / embeddingTime) + ' docs/sec',
      })

      // 차원 수 캐싱
      if (embeddings.length > 0 && embeddings[0] && !this._embeddingDimension) {
        this._embeddingDimension = embeddings[0].length
      }

      return embeddings
    } catch (error) {
      console.error('❌ Failed to generate embeddings in LanceDB bridge:', error)
      throw error
    }
  }

  /**
   * 단일 쿼리 임베딩 생성 (편의 메서드)
   * @param query 임베딩할 쿼리 텍스트
   * @returns 임베딩 벡터
   */
  async embedQuery(query: string): Promise<number[]> {
    // 캐시 확인
    if (this.cacheEnabled && this.queryCache.has(query)) {
      const cached = this.queryCache.get(query)!
      // LRU 구현: 재사용된 항목을 끝으로 이동
      this.queryCache.delete(query)
      this.queryCache.set(query, cached)
      console.log('🎯 Cache hit for query embedding')
      return cached
    }

    // 캐시 미스 - 임베딩 생성 (성능 측정)
    const startTime = Date.now()
    const embedding = await this.embeddingService.embedQuery(query)
    const embeddingTime = Date.now() - startTime

    console.log(`⚡ Query embedding generated in ${embeddingTime}ms`, {
      queryLength: query.length,
      embeddingDimensions: embedding.length,
      cached: false,
    })

    // 캐시에 저장 (LRU)
    if (this.cacheEnabled) {
      // 캐시 크기 제한
      if (this.queryCache.size >= this.maxCacheSize) {
        // 가장 오래된 항목 제거
        const firstKey = this.queryCache.keys().next().value
        if (firstKey) {
          this.queryCache.delete(firstKey)
        }
      }
      this.queryCache.set(query, embedding)
      console.log(
        `📦 Cached query embedding (cache size: ${this.queryCache.size}/${this.maxCacheSize})`
      )
    }

    return embedding
  }

  /**
   * 모델 정보 반환
   */
  getModelInfo() {
    return this.embeddingService.getModelInfo()
  }

  /**
   * 헬스 체크 (사용 가능한 경우)
   */
  async healthCheck(): Promise<boolean> {
    try {
      // EmbeddingService에 healthCheck 메서드가 있는지 확인
      if (
        'healthCheck' in this.embeddingService &&
        typeof (this.embeddingService as any).healthCheck === 'function'
      ) {
        return await (this.embeddingService as any).healthCheck()
      }

      // fallback: 테스트 임베딩으로 헬스 체크
      const testEmbedding = await this.embedQuery('test')
      return Array.isArray(testEmbedding) && testEmbedding.length > 0
    } catch (error) {
      console.warn('⚠️  Embedding bridge health check failed:', error)
      return false
    }
  }

  /**
   * 캐시 통계 반환
   */
  getCacheStats() {
    return {
      enabled: this.cacheEnabled,
      size: this.queryCache.size,
      maxSize: this.maxCacheSize,
      hitRate: 'N/A', // 간단한 구현에서는 별도 추적하지 않음
    }
  }

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.queryCache.clear()
    console.log('🧹 Embedding cache cleared')
  }
}

/**
 * EmbeddingAdapter에서 LanceDB 브릿지로 변환하는 팩토리 함수
 * @param embeddingAdapter 기존 EmbeddingAdapter 인스턴스
 * @param sourceColumn 소스 컬럼 명 (기본: 'content')
 * @returns LanceDB 호환 임베딩 함수
 */
export function createLanceDBEmbeddingBridge(
  embeddingAdapter: EmbeddingAdapter,
  sourceColumn: string = 'content'
): LanceDBEmbeddingBridge {
  return new LanceDBEmbeddingBridge(embeddingAdapter, sourceColumn)
}

/**
 * 임베딩 서비스에서 직접 LanceDB 브릿지 생성
 * @param embeddingService IEmbeddingService 구현체
 * @param sourceColumn 소스 컬럼 명 (기본: 'content')
 * @returns LanceDB 호환 임베딩 함수
 */
export function createLanceDBEmbeddingBridgeFromService(
  embeddingService: IEmbeddingService,
  sourceColumn: string = 'content'
): LanceDBEmbeddingBridge {
  return new LanceDBEmbeddingBridge(embeddingService, sourceColumn)
}
