import { pipeline, env } from '@huggingface/transformers'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { Embeddings } from '@langchain/core/embeddings'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

export interface EmbeddingModelConfig {
  modelId: string
  dimensions: number
  maxTokens: number
  description: string
  recommendedBatchSize?: number
}

export const AVAILABLE_MODELS: Record<string, EmbeddingModelConfig> = {
  'gte-multilingual-base': {
    modelId: 'onnx-community/gte-multilingual-base',
    dimensions: 768,
    maxTokens: 8192,
    description: 'High-quality multilingual embedding model from Alibaba with strong performance',
    recommendedBatchSize: 16,
  },
}

/**
 * LangChain-compatible embedding service using Transformers.js
 * Runs completely locally without any external dependencies
 * Supports lazy loading and model selection
 */
export class TransformersEmbeddings extends Embeddings {
  protected pipeline: FeatureExtractionPipeline | null = null
  protected modelConfig: EmbeddingModelConfig
  protected isInitialized = false
  protected initPromise: Promise<void> | null = null

  constructor(private config: ServerConfig) {
    super({})

    // Configure transformers.js environment
    env.allowRemoteModels = true
    env.allowLocalModels = true
    env.cacheDir = config.transformersCacheDir || './data/.transformers-cache'

    // Get model configuration
    const modelName = config.embeddingModel || 'gte-multilingual-base'
    const defaultModel = AVAILABLE_MODELS['gte-multilingual-base']
    if (!defaultModel) {
      throw new Error('Default embedding model configuration not found')
    }
    this.modelConfig = AVAILABLE_MODELS[modelName] ?? defaultModel

    logger.info('🤖 TransformersEmbeddings initialized', {
      model: this.modelConfig.modelId,
      dimensions: this.modelConfig.dimensions,
      maxTokens: this.modelConfig.maxTokens,
      component: 'TransformersEmbeddings',
    })
  }

  /**
   * Initialize the embedding pipeline
   */
  protected async initialize(): Promise<void> {
    if (this.isInitialized) return

    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = this._doInitialize()
    await this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Always download and initialize the model
      await this._downloadAndInitialize()
    } catch (error) {
      logger.error(
        '❌ Failed to initialize TransformersEmbeddings:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  private async _downloadAndInitialize(): Promise<void> {
    // Check if model is already cached
    const isCached = await this.isModelCached()
    if (isCached) {
      logger.info(`📂 Using cached model: ${this.modelConfig.modelId}`)
      logger.info(`💾 Cache location: ${env.cacheDir}`)
    } else {
      logger.info(`🔄 Model not cached, downloading: ${this.modelConfig.modelId}...`)
      const downloadInfo = this.getEstimatedDownloadSize()
      logger.info(`📦 Estimated download size: ${downloadInfo.formatted}`)
    }

    const startTime = Date.now()
    let lastProgress = 0

    // Create feature extraction pipeline with progress tracking
    this.pipeline = await pipeline('feature-extraction', this.modelConfig.modelId, {
      progress_callback: (progress: any) => {
        if (progress.status === 'downloading') {
          const percent = Math.round((progress.loaded / progress.total) * 100)
          const currentMB = this.formatBytes(progress.loaded)
          const totalMB = this.formatBytes(progress.total)

          // Only log every 10% to avoid spam
          if (percent >= lastProgress + 10 || percent === 100) {
            logger.info(`📥 Downloading ${progress.file}: ${percent}% (${currentMB}/${totalMB})`)
            lastProgress = percent
          }
        } else if (progress.status === 'ready') {
          logger.info(`✅ ${progress.file} ready`)
        } else if (progress.status === 'loading') {
          logger.info(`🔄 Loading ${progress.file}...`)
        }
      },
    })

    const loadTime = Date.now() - startTime
    if (isCached) {
      logger.info(`✅ Cached model loaded successfully in ${loadTime}ms`)
    } else {
      logger.info(`✅ Model downloaded and loaded successfully in ${loadTime}ms`)
      logger.info(`💾 Model cached in: ${env.cacheDir}`)
    }
    logger.info(`🚀 Ready for embeddings (${this.modelConfig.description})`)

    this.isInitialized = true
  }

  /**
   * Generate embedding for a single query
   */
  async embedQuery(query: string): Promise<number[]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized')
    }

    try {
      // Truncate query if too long
      const truncatedQuery = this.truncateText(query)

      // Generate embedding
      const output = await this.pipeline(truncatedQuery, {
        pooling: 'mean',
        normalize: true,
      })

      // Convert tensor to array
      const embedding = Array.from(output.data) as number[]

      if (embedding.length !== this.modelConfig.dimensions) {
        logger.warn(
          `⚠️  Expected ${this.modelConfig.dimensions} dimensions, got ${embedding.length}`
        )
      }

      return embedding
    } catch (error) {
      logger.error(
        '❌ Error generating query embedding:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Generate embeddings for multiple documents
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized')
    }

    if (documents.length === 0) return []

    try {
      logger.info(`🔄 Generating embeddings for ${documents.length} documents...`)
      const startTime = Date.now()

      // Process in batches for memory efficiency
      const batchSize = 10
      const embeddings: number[][] = []

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)
        const truncatedBatch = batch.map((doc) => this.truncateText(doc))

        // Generate embeddings for batch
        const batchEmbeddings = await Promise.all(
          truncatedBatch.map(async (doc) => {
            if (!this.pipeline) {
              throw new Error('Pipeline not initialized for batch embedding')
            }
            const output = await this.pipeline(doc, {
              pooling: 'mean',
              normalize: true,
            })
            return Array.from(output.data) as number[]
          })
        )

        embeddings.push(...batchEmbeddings)

        if (batch.length === batchSize) {
          logger.debug(
            `   📊 Processed ${Math.min(i + batchSize, documents.length)}/${
              documents.length
            } documents`
          )
        }
      }

      const duration = Date.now() - startTime
      logger.info(`✅ Generated ${embeddings.length} embeddings in ${duration}ms`)

      return embeddings
    } catch (error) {
      logger.error(
        '❌ Error generating document embeddings:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Truncate text to model's maximum token limit
   */
  private truncateText(text: string): string {
    // GTE multilingual model은 8192 토큰 지원
    // 토큰→문자 변환 비율: 다국어 기준 1 token ≈ 3-4 characters
    // 보수적으로 3를 사용하여 안전 마진 확보
    const maxChars = Math.floor(this.modelConfig.maxTokens * 3)

    if (text.length <= maxChars) {
      return text
    }

    logger.warn(
      `⚠️  Truncating text from ${text.length} to ${maxChars} characters (${this.modelConfig.maxTokens} tokens limit)`
    )
    return text.substring(0, maxChars)
  }

  /**
   * Health check for the embedding service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize()

      // Test with a simple query
      const testEmbedding = await this.embedQuery('test')
      return Array.isArray(testEmbedding) && testEmbedding.length === this.modelConfig.dimensions
    } catch (error) {
      logger.error(
        '❌ Health check failed:',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
  }

  /**
   * Check if model is available (always true for local models)
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      await this.initialize()
      return this.isInitialized
    } catch {
      return false
    }
  }

  /**
   * Get embedding dimensions
   */
  async getEmbeddingDimensions(): Promise<number> {
    return this.modelConfig.dimensions
  }

  /**
   * Get model information (ModelInfo 인터페이스 호환)
   */
  getModelInfo(): {
    name: string
    model: string
    service: string
    dimensions: number
    description?: string
  } {
    return {
      name: this.modelConfig.modelId,
      model: this.modelConfig.modelId,
      service: 'transformers.js',
      dimensions: this.modelConfig.dimensions,
      description: this.modelConfig.description,
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.pipeline !== null
  }

  /**
   * Get cache directory information
   */
  getCacheInfo(): { cacheDir: string; isLocal: boolean } {
    return {
      cacheDir: env.cacheDir || './data/.transformers-cache',
      isLocal: true,
    }
  }

  /**
   * Get available model (single model)
   */
  static getAvailableModels(): Record<string, EmbeddingModelConfig> {
    return AVAILABLE_MODELS
  }

  /**
   * Estimate memory usage for the model
   */
  estimateMemoryUsage(): string {
    return '~300MB'
  }

  /**
   * Get estimated download size for current model
   */
  getEstimatedDownloadSize(): { size: number; formatted: string } {
    const size = 300_000_000 // 300MB
    return {
      size,
      formatted: this.formatBytes(size),
    }
  }

  /**
   * Check if model is already cached locally
   */
  async isModelCached(): Promise<boolean> {
    const fs = await import('fs')
    const path = await import('path')

    const cacheDir = env.cacheDir || './data/.transformers-cache'
    const modelPath = path.join(cacheDir, this.modelConfig.modelId.replace('/', '_'))

    try {
      const stats = await fs.promises.stat(modelPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    isCached: boolean
    cacheSize?: string
    cachePath: string
    modelCount: number
    availableModels: string[]
  }> {
    const fs = await import('fs')

    const cacheDir = env.cacheDir || './data/.transformers-cache'
    const isCached = await this.isModelCached()

    let cacheSize: string | undefined
    let modelCount = 0
    let availableModels: string[] = []

    try {
      // Check if cache directory exists
      await fs.promises.access(cacheDir)

      // Get cache directory size
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      try {
        const { stdout } = await execAsync(`du -sh "${cacheDir}"`)
        cacheSize = stdout.split('\t')[0]
      } catch (error) {
        logger.warn(
          'Could not get cache size:',
          error instanceof Error ? error : new Error(String(error))
        )
      }

      // Count cached models and list them
      const entries = await fs.promises.readdir(cacheDir, { withFileTypes: true })
      const modelDirs = entries.filter((entry) => entry.isDirectory())
      modelCount = modelDirs.length
      availableModels = modelDirs.map((dir) => dir.name.replace('_', '/'))
    } catch (error) {
      // Cache directory doesn't exist yet
    }

    return {
      isCached,
      ...(cacheSize !== undefined && { cacheSize }),
      cachePath: cacheDir,
      modelCount,
      availableModels,
    }
  }
}
