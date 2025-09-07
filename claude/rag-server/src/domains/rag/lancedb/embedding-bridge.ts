/**
 * LanceDB Embedding Bridge
 * Connect existing EmbeddingAdapter with LanceDB's EmbeddingFunction interface
 */

import { logger } from '@/shared/logger/index.js'
import type { IEmbeddingService } from '@/domains/rag/core/interfaces.js'

/**
 * Vector normalization utility function (L2 Norm)
 * Normalize vectors for cosine similarity
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  if (magnitude === 0) {
    logger.warn('Zero vector detected during normalization')
    return vector
  }
  return vector.map((val) => val / magnitude)
}

/**
 * Batch vector normalization
 */
function normalizeBatchVectors(vectors: number[][]): number[][] {
  return vectors.map(normalizeVector)
}

/**
 * LanceDB compatible embedding function interface
 * TypeScript implementation of LanceDB's EmbeddingFunction
 */
export interface LanceDBEmbeddingFunction {
  sourceColumn: string
  embed(data: string[]): Promise<number[][]>
  embeddingDataType?: string
  embeddingDimension?: number
  ndims(): number
}

/**
 * Bridge to convert existing EmbeddingAdapter to LanceDB EmbeddingFunction
 */
export class LanceDBEmbeddingBridge implements LanceDBEmbeddingFunction {
  public readonly sourceColumn: string
  public readonly embeddingDataType = 'Float32'
  private _embeddingDimension?: number

  // Simple LRU cache for embeddings
  private cache = new Map<string, number[]>()
  private readonly maxCacheSize = 1000

  constructor(private embeddingService: IEmbeddingService, sourceColumn: string = 'text') {
    this.sourceColumn = sourceColumn
  }

  /**
   * Get embedding dimensions
   */
  ndims(): number {
    logger.info('!!!!!!!!!!!!!!!!!!!!!!!!!!', { dimension: this._embeddingDimension })
    if (!this._embeddingDimension) {
      const modelInfo = this.embeddingService.getModelInfo()
      this._embeddingDimension = modelInfo.dimensions
    }
    return this._embeddingDimension
  }

  /**
   * Generate embeddings for text array
   */
  async embed(texts: string[]): Promise<number[][]> {
    try {
      logger.info('🔄 Generating embeddings for LanceDB', {
        textCount: texts.length,
        component: 'LanceDBEmbeddingBridge',
      })

      // Check cache first
      const cachedResults: (number[] | null)[] = texts.map((text) => this.cache.get(text) || null)

      const uncachedTexts: string[] = []
      const uncachedIndices: number[] = []

      cachedResults.forEach((result, index) => {
        if (result === null) {
          uncachedTexts.push(texts[index]!)
          uncachedIndices.push(index)
        }
      })

      let newEmbeddings: number[][] = []
      if (uncachedTexts.length > 0) {
        // Generate embeddings for uncached texts (raw vectors from EmbeddingService)
        const rawEmbeddings = await this.embeddingService.embedDocuments(uncachedTexts)

        // Normalize vectors for cosine similarity (single normalization point)
        newEmbeddings = normalizeBatchVectors(rawEmbeddings)

        // Update cache with normalized vectors
        uncachedTexts.forEach((text, idx) => {
          if (this.cache.size >= this.maxCacheSize) {
            // Simple eviction: remove first entry
            const firstKey = this.cache.keys().next().value
            if (firstKey !== undefined) {
              this.cache.delete(firstKey)
            }
          }
          this.cache.set(text, newEmbeddings[idx]!)
        })
      }

      // Combine cached and new results
      const results: number[][] = []
      let newEmbeddingIndex = 0

      cachedResults.forEach((cached, index) => {
        if (cached !== null) {
          results[index] = cached
        } else {
          results[index] = newEmbeddings[newEmbeddingIndex++]!
        }
      })

      logger.info('✅ Embeddings generated for LanceDB', {
        totalTexts: texts.length,
        cacheHits: texts.length - uncachedTexts.length,
        newEmbeddings: uncachedTexts.length,
        component: 'LanceDBEmbeddingBridge',
      })

      return results
    } catch (error) {
      logger.error(
        '❌ Failed to generate embeddings for LanceDB',
        error instanceof Error ? error : new Error(String(error)),
        {
          textCount: texts.length,
          component: 'LanceDBEmbeddingBridge',
        }
      )
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
    if (this.cache.has(query)) {
      const cached = this.cache.get(query)!
      // LRU 구현: 재사용된 항목을 끝으로 이동
      this.cache.delete(query)
      this.cache.set(query, cached)
      logger.info('🎯 Cache hit for query embedding')
      return cached
    }

    // 캐시 미스 - 임베딩 생성 (성능 측정)
    const startTime = Date.now()
    const rawEmbedding = await this.embeddingService.embedQuery(query)
    const embeddingTime = Date.now() - startTime

    logger.debug(`⚡ Query embedding generated in ${embeddingTime}ms`, {
      queryLength: query.length,
      embeddingDimensions: rawEmbedding.length,
      cached: false,
    })

    // 코사인 유사도를 위한 벡터 정규화 (single normalization point)
    const normalizedEmbedding = normalizeVector(rawEmbedding)

    logger.debug(`📏 Query vector normalized for cosine similarity`, {
      originalMagnitude: Math.sqrt(rawEmbedding.reduce((sum, val) => sum + val * val, 0)),
      normalizedMagnitude: Math.sqrt(normalizedEmbedding.reduce((sum, val) => sum + val * val, 0)),
    })

    // 캐시에 정규화된 벡터 저장
    if (this.cache.size >= this.maxCacheSize) {
      // 가장 오래된 항목 제거
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(query, normalizedEmbedding)
    logger.debug(
      `📦 Cached normalized query embedding (cache size: ${this.cache.size}/${this.maxCacheSize})`
    )

    return normalizedEmbedding
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear()
    logger.info('🧹 Embedding cache cleared', {
      component: 'LanceDBEmbeddingBridge',
    })
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    }
  }
}

/**
 * Create LanceDB embedding bridge from embedding service
 */
export function createLanceDBEmbeddingBridgeFromService(
  embeddingService: IEmbeddingService,
  sourceColumn: string = 'text'
): LanceDBEmbeddingBridge {
  return new LanceDBEmbeddingBridge(embeddingService, sourceColumn)
}
