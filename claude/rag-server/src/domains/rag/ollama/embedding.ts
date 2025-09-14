import { Embeddings } from '@langchain/core/embeddings'
import fetch from 'node-fetch'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { EmbeddingModelInfo } from '@/domains/rag/core/types.js'
import { logger } from '@/shared/logger/index.js'

/**
 * Optimized Ollama-based embedding service with adaptive batching and caching
 * Provides high-performance embedding generation with intelligent resource management
 */
export class EmbeddingService extends Embeddings {
  private baseUrl: string
  private model: string
  private config: ServerConfig
  private cachedModelInfo: EmbeddingModelInfo | null = null
  private adaptiveBatchSize: number
  private maxConcurrentRequests: number
  private requestQueue: Array<{ texts: string[]; resolve: Function; reject: Function }> = []
  private activeRequests = 0
  private embeddingCache = new Map<string, number[]>()
  private maxCacheSize = 1000

  constructor(config: ServerConfig) {
    super({})
    this.config = config
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    this.model = config.embeddingModel
    this.adaptiveBatchSize = config.embeddingBatchSize
    this.maxConcurrentRequests = Math.max(2, Math.min(config.embeddingConcurrency, 6)) // Optimized range
  }

  /**
   * Generate embedding for a single query with caching and queue management
   */
  async embedQuery(query: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.getCacheKey(query)
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!
    }

    // Use batch processing for better efficiency
    const results = await this.embedDocuments([query])
    const result = results[0]

    if (!result || result.length === 0) {
      throw new Error('Failed to generate embedding: empty result from batch processing')
    }

    return result
  }

  /**
   * Optimized batch embedding with adaptive sizing and queue management
   */
  private async embedBatch(documents: string[]): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ texts: documents, resolve, reject })
      this.processQueue()
    })
  }

  /**
   * Process the embedding queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
      return
    }

    const batch = this.requestQueue.shift()
    if (!batch) return

    this.activeRequests++

    try {
      const embeddings = await this.performBatchEmbeddingWithChunking(batch.texts)

      // Cache results
      for (let i = 0; i < batch.texts.length; i++) {
        const cacheKey = this.getCacheKey(batch.texts[i]!)
        this.cacheEmbedding(cacheKey, embeddings[i]!)
      }

      batch.resolve(embeddings)
    } catch (error) {
      batch.reject(error)
    } finally {
      this.activeRequests--
      // Process next batch if available
      setImmediate(() => this.processQueue())
    }
  }

  /**
   * Handle large batches by chunking them into smaller API calls
   */
  private async performBatchEmbeddingWithChunking(documents: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = []
    const optimalBatchSize = this.getOptimalBatchSize(documents)

    if (documents.length > 50) {
      logger.debug('🔄 Processing large batch with chunking', {
        totalDocuments: documents.length,
        batchesNeeded: Math.ceil(documents.length / optimalBatchSize),
        component: 'EmbeddingService',
      })
    }

    // Process documents in chunks
    for (let i = 0; i < documents.length; i += optimalBatchSize) {
      const chunk = documents.slice(i, i + optimalBatchSize)

      const chunkEmbeddings = await this.performBatchEmbedding(chunk)
      allEmbeddings.push(...chunkEmbeddings)
    }

    if (documents.length > 50) {
      logger.debug('✅ Large batch processing completed', {
        totalInput: documents.length,
        totalOutput: allEmbeddings.length,
        component: 'EmbeddingService',
      })
    }

    return allEmbeddings
  }

  /**
   * Perform actual API call for batch embedding
   */
  private async performBatchEmbedding(documents: string[]): Promise<number[][]> {
    // This method now handles single batch - chunking is done at higher level
    const inputTexts = documents

    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: inputTexts,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(
          'Ollama API error response',
          new Error(`${response.status} ${response.statusText}: ${errorText}`)
        )
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { embeddings: number[][] }

      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        logger.error(
          'Invalid response structure',
          new Error(`Response data: ${JSON.stringify(data)}`)
        )
        throw new Error('Invalid batch embedding data received from Ollama')
      }

      // Check if input/output count matches
      if (data.embeddings.length !== inputTexts.length) {
        logger.error(
          'Input/output count mismatch',
          new Error(
            `Input: ${inputTexts.length}, Output: ${data.embeddings.length}, Texts: ${inputTexts
              .map((t) => `"${t.substring(0, 50)}..."`)
              .join(', ')}`
          )
        )
        throw new Error(
          `Ollama returned ${data.embeddings.length} embeddings for ${inputTexts.length} inputs`
        )
      }

      // Validate embeddings but don't filter - preserve array length
      for (let i = 0; i < data.embeddings.length; i++) {
        const emb = data.embeddings[i]
        if (!emb || !Array.isArray(emb) || emb.length === 0) {
          logger.error(`Invalid embedding at index ${i} in batch response`)
          throw new Error(`Invalid embedding received at index ${i}`)
        }
      }

      return data.embeddings
    } catch (error) {
      logger.error(
        'Error generating batch embeddings:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Calculate optimal batch size based on text length and model capacity
   */
  private getOptimalBatchSize(documents: string[]): number {
    if (!this.cachedModelInfo) {
      return Math.min(this.adaptiveBatchSize, documents.length)
    }

    // Calculate average text length in characters
    const avgLength = documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length

    // Estimate tokens (conservative: 3 chars per token for multilingual)
    const avgTokens = Math.ceil(avgLength / 3)

    // Calculate how many documents can fit in model context
    const maxDocsInBatch = Math.floor(this.cachedModelInfo.maxTokens / avgTokens)

    // Use conservative limit but ensure minimum batch size
    return Math.max(1, Math.min(maxDocsInBatch, this.adaptiveBatchSize, documents.length))
  }

  /**
   * Generate embeddings for multiple documents with intelligent caching and batching
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) {
      return []
    }

    const startTime = Date.now()
    const embeddings: number[][] = []
    const documentsToEmbed: string[] = []
    const cacheIndices: number[] = []

    // Check cache for existing embeddings
    for (let i = 0; i < documents.length; i++) {
      const cacheKey = this.getCacheKey(documents[i]!)
      if (this.embeddingCache.has(cacheKey)) {
        embeddings[i] = this.embeddingCache.get(cacheKey)!
      } else {
        documentsToEmbed.push(documents[i]!)
        cacheIndices.push(i)
      }
    }

    // Process uncached documents in batches
    if (documentsToEmbed.length > 0) {
      const newEmbeddings = await this.embedBatch(documentsToEmbed)

      // Validate batch results
      if (!newEmbeddings || newEmbeddings.length !== documentsToEmbed.length) {
        throw new Error(
          `Embedding batch size mismatch: expected ${documentsToEmbed.length}, got ${
            newEmbeddings?.length || 0
          }`
        )
      }

      // Place new embeddings in correct positions
      for (let i = 0; i < cacheIndices.length; i++) {
        const embedding = newEmbeddings[i]
        if (!embedding || embedding.length === 0) {
          throw new Error(`Empty embedding received for document at index ${i}`)
        }
        embeddings[cacheIndices[i]!] = embedding
      }
    }

    const totalTime = Date.now() - startTime
    if (documentsToEmbed.length > 10) {
      logger.debug(`Embeddings generated in ${totalTime}ms`, {
        totalDocs: documents.length,
        cached: documents.length - documentsToEmbed.length,
        generated: documentsToEmbed.length,
        component: 'EmbeddingService',
      })
    }

    return embeddings
  }

  /**
   * Generate cache key for embedding text
   */
  private getCacheKey(text: string): string {
    // Simple hash for cache key (could be replaced with crypto.createHash for production)
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return `${this.model}:${hash}`
  }

  /**
   * Cache embedding with size limit management
   */
  private cacheEmbedding(key: string, embedding: number[]): void {
    // Remove oldest entries if cache is full
    if (this.embeddingCache.size >= this.maxCacheSize) {
      const firstKey = this.embeddingCache.keys().next().value
      if (firstKey) {
        this.embeddingCache.delete(firstKey)
      }
    }
    this.embeddingCache.set(key, embedding)
  }

  /**
   * Get available models from Ollama server (/api/tags)
   */
  async isAvailableModel(model: string): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return false
      }

      const data = (await response.json()) as { models: { name: string }[] }

      return !!data.models.find(({ name }) => name === model)
    } catch (error) {
      logger.warn(
        'Failed to get Ollama tags:',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
  }

  /**
   * Get detailed model information from Ollama server
   */
  async getModelDetails(model: string): Promise<{ maxTokens: number; dimensions: number } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: model,
        }),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as {
        model_info: {
          'bert.context_length': number
          'bert.embedding_length': number
          'qwen3.context_length': number
          'qwen3.embedding_length': number
        }
      }
      return {
        maxTokens:
          data.model_info['bert.context_length'] || data.model_info['qwen3.context_length'],
        dimensions:
          data.model_info['bert.embedding_length'] || data.model_info['qwen3.embedding_length'],
      }
    } catch (error) {
      logger.warn(
        `Could not fetch model details for ${model}:`,
        error instanceof Error ? error : new Error(String(error))
      )
      return null
    }
  }

  /**
   * Get model information (ModelInfo interface compatible)
   */
  getModelInfo(): EmbeddingModelInfo {
    if (this.cachedModelInfo) {
      return {
        name: this.cachedModelInfo.name,
        service: 'ollama',
        dimensions: this.cachedModelInfo.dimensions,
        maxTokens: this.cachedModelInfo.maxTokens,
      }
    }

    // Return minimal info if not cached yet
    return {
      name: this.model,
      service: 'ollama',
      dimensions: 0,
      maxTokens: 0,
    }
  }

  /**
   * Initialize service with model information caching and performance optimization
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`🔄 Initializing optimized Ollama embedding service`, {
        model: this.model,
        baseUrl: this.baseUrl,
        maxConcurrentRequests: this.maxConcurrentRequests,
        adaptiveBatchSize: this.adaptiveBatchSize,
        cacheSize: this.maxCacheSize,
        component: 'EmbeddingService',
      })

      // Check Ollama connection and model availability
      const isAvailable = await this.isAvailableModel(this.model)
      if (isAvailable == false) {
        throw new Error('Ollama server is not available or has no models')
      }

      // Get detailed model information
      const modelDetails = await this.getModelDetails(this.model)

      // Update cached model info with complete information
      if (!modelDetails) {
        throw new Error('Ollama server is not available or has no models')
      }

      this.cachedModelInfo = {
        name: this.model,
        service: 'ollama',
        dimensions: modelDetails.dimensions,
        maxTokens: modelDetails.maxTokens,
      }

      // Adjust batch size based on model capacity
      this.adaptiveBatchSize = Math.min(
        this.adaptiveBatchSize,
        Math.max(1, Math.floor(modelDetails.maxTokens / 100)) // Conservative estimate
      )

      logger.info(`✅ Optimized Ollama embedding service initialized`, {
        ...this.cachedModelInfo,
        finalBatchSize: this.adaptiveBatchSize,
        maxConcurrentRequests: this.maxConcurrentRequests,
      })
    } catch (error) {
      logger.error(
        '❌ Failed to initialize EmbeddingService:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.cachedModelInfo !== null
  }
}
