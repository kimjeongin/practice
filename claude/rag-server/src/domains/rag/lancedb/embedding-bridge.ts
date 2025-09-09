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
  // Validate input vector
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    logger.error('Invalid vector received for normalization')
    throw new Error('Cannot normalize invalid or empty vector')
  }

  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  if (magnitude === 0) {
    logger.warn('Zero vector detected during normalization, returning original vector')
    return vector
  }
  return vector.map((val) => val / magnitude)
}

/**
 * Batch vector normalization with validation
 */
function normalizeBatchVectors(vectors: number[][]): number[][] {
  if (!vectors || !Array.isArray(vectors)) {
    logger.error('Invalid vectors array received for batch normalization')
    throw new Error('Invalid vectors array for normalization')
  }
  
  return vectors.map((vector, index) => {
    if (!vector) {
      logger.error(`Null/undefined vector at index ${index}`)
      throw new Error(`Invalid vector at index ${index}`)
    }
    return normalizeVector(vector)
  })
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
        
        // Validate embeddings before normalization
        if (!rawEmbeddings || rawEmbeddings.length === 0) {
          logger.error('EmbeddingService returned empty or null embeddings')
          throw new Error('Failed to generate embeddings: service returned empty result')
        }
        
        // Validate all embeddings without filtering
        for (let idx = 0; idx < rawEmbeddings.length; idx++) {
          if (!rawEmbeddings[idx]) {
            logger.error(`Undefined embedding at index ${idx} for text: "${uncachedTexts[idx]?.substring(0, 50)}..."`)
            throw new Error(`Failed to generate embedding for text at index ${idx}`)
          }
        }

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
   * Generate single query embedding (convenience method)
   * @param query Query text to embed
   * @returns Embedding vector
   */
  async embedQuery(query: string): Promise<number[]> {
    // Check cache
    if (this.cache.has(query)) {
      const cached = this.cache.get(query)!
      // LRU implementation: move reused item to end
      this.cache.delete(query)
      this.cache.set(query, cached)
      logger.info('🎯 Cache hit for query embedding')
      return cached
    }

    // Cache miss - generate embedding (performance measurement)
    const startTime = Date.now()
    const rawEmbedding = await this.embeddingService.embedQuery(query)
    const embeddingTime = Date.now() - startTime

    // Validate embedding before normalization
    if (!rawEmbedding || rawEmbedding.length === 0) {
      logger.error('EmbeddingService returned empty or null embedding for query')
      throw new Error('Failed to generate query embedding: service returned empty result')
    }

    logger.debug(`⚡ Query embedding generated in ${embeddingTime}ms`, {
      queryLength: query.length,
      embeddingDimensions: rawEmbedding.length,
      cached: false,
    })

    // Vector normalization for cosine similarity (single normalization point)
    const normalizedEmbedding = normalizeVector(rawEmbedding)

    logger.debug(`📏 Query vector normalized for cosine similarity`, {
      originalMagnitude: Math.sqrt(rawEmbedding.reduce((sum, val) => sum + val * val, 0)),
      normalizedMagnitude: Math.sqrt(normalizedEmbedding.reduce((sum, val) => sum + val * val, 0)),
    })

    // Store normalized vector in cache
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest item
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
