import { pipeline, env } from '@huggingface/transformers'
import type { TextClassificationPipeline } from '@huggingface/transformers'
import type { IRerankingService } from '@/domains/rag/core/interfaces.js'
import type {
  RerankingInput,
  RerankingResult,
  RerankingOptions,
  ModelInfo,
} from '@/domains/rag/core/types.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

export interface RerankingModelConfig {
  modelId: string
  maxTokens: number
  description: string
  recommendedBatchSize?: number
}

export const AVAILABLE_RERANKING_MODELS: Record<string, RerankingModelConfig> = {
  'gte-multilingual-reranker-base': {
    modelId: 'onnx-community/gte-multilingual-reranker-base',
    maxTokens: 8192,
    description:
      'High-performance multilingual reranker from Alibaba with cross-encoder architecture',
    recommendedBatchSize: 8,
  },
}

/**
 * Transformers.js-based reranking service using GTE multilingual reranker
 * Implements cross-encoder architecture for accurate query-document relevance scoring
 */
export class TransformersReranker implements IRerankingService {
  protected pipeline: any = null
  protected modelConfig: RerankingModelConfig
  protected isInitialized = false
  protected initPromise: Promise<void> | null = null

  constructor(private config: ServerConfig) {
    // Configure transformers.js environment
    env.allowRemoteModels = true
    env.allowLocalModels = true
    env.cacheDir = config.transformersCacheDir || './data/.transformers-cache'

    // Get model configuration
    const modelName = config.rerankingModel || 'gte-multilingual-reranker-base'
    const defaultModel = AVAILABLE_RERANKING_MODELS['gte-multilingual-reranker-base']
    if (!defaultModel) {
      throw new Error('Default reranking model configuration not found')
    }
    this.modelConfig = AVAILABLE_RERANKING_MODELS[modelName] ?? defaultModel

    logger.info('🔄 TransformersReranker initialized', {
      model: this.modelConfig.modelId,
      maxTokens: this.modelConfig.maxTokens,
      component: 'TransformersReranker',
    })
  }

  /**
   * Initialize the reranking pipeline
   */
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
    try {
      // Check if model is already cached
      const isCached = await this.isModelCached()
      if (isCached) {
        logger.info(`📂 Using cached reranking model: ${this.modelConfig.modelId}`)
      } else {
        logger.info(`🔄 Downloading reranking model: ${this.modelConfig.modelId}...`)
        const downloadInfo = this.getEstimatedDownloadSize()
        logger.info(`📦 Estimated download size: ${downloadInfo.formatted}`)
      }

      const startTime = Date.now()
      let lastProgress = 0

      // Try to create the pipeline with the GTE multilingual reranker
      try {
        this.pipeline = await pipeline('text-classification', this.modelConfig.modelId, {
          device: this.config.deviceType,
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              const percent = Math.round((progress.loaded / progress.total) * 100)
              const currentMB = this.formatBytes(progress.loaded)
              const totalMB = this.formatBytes(progress.total)

              // Only log every 10% to avoid spam
              if (percent >= lastProgress + 10 || percent === 100) {
                logger.info(
                  `📥 Downloading ${progress.file}: ${percent}% (${currentMB}/${totalMB})`
                )
                lastProgress = percent
              }
            } else if (progress.status === 'ready') {
              logger.info(`✅ ${progress.file} ready`)
            } else if (progress.status === 'loading') {
              logger.info(`🔄 Loading ${progress.file}...`)
            }
          },
        })

        logger.info(`✅ GTE multilingual reranker pipeline initialized successfully`)
      } catch (modelError: any) {
        logger.error(`❌ Failed to initialize GTE multilingual reranker: ${modelError.message}`)
      }

      const loadTime = Date.now() - startTime
      if (isCached) {
        logger.info(`✅ Cached reranking model loaded in ${loadTime}ms`)
      } else {
        logger.info(`✅ Reranking model downloaded and loaded in ${loadTime}ms`)
        logger.info(`💾 Model cached in: ${env.cacheDir}`)
      }
      logger.info(`🚀 Ready for reranking (${this.modelConfig.description})`)

      this.isInitialized = true
    } catch (error) {
      logger.error(
        '❌ Failed to initialize TransformersReranker:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(input: RerankingInput, options: RerankingOptions = {}): Promise<RerankingResult[]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Reranking pipeline not initialized')
    }

    const { query, documents } = input
    const topK = options.topK || documents.length

    if (documents.length === 0) {
      return []
    }

    try {
      logger.info(`🔄 Reranking ${documents.length} documents...`, {
        query: query.substring(0, 100),
        topK,
        component: 'TransformersReranker',
      })

      const startTime = Date.now()

      // Prepare query-document pairs for cross-encoder
      const queryDocPairs = documents.map((doc) => {
        const truncatedQuery = this.truncateText(query)
        const truncatedContent = this.truncateText(doc.content)
        return `${truncatedQuery}</s></s>${truncatedContent}`
      })

      // Process in batches for memory efficiency
      const batchSize = this.modelConfig.recommendedBatchSize || 8
      const rerankingScores: number[] = []

      for (let i = 0; i < queryDocPairs.length; i += batchSize) {
        const batch = queryDocPairs.slice(i, i + batchSize)

        // Get relevance scores from the cross-encoder
        const batchResults = await Promise.all(
          batch.map(async (pair) => {
            if (!this.pipeline) {
              throw new Error('Pipeline not initialized for batch reranking')
            }
            const result = (await (this.pipeline as any)(pair)) as any

            // Debug: Log the raw result to understand the format
            logger.debug('🔍 Raw reranking result:', {
              result,
              isArray: Array.isArray(result),
              component: 'TransformersReranker',
            })

            // Extract relevance score for GTE multilingual reranker
            let relevantScore = 0

            if (Array.isArray(result) && result.length > 0) {
              // GTE reranker typically returns classification scores
              // Look for positive relevance label (LABEL_1 usually indicates relevance)
              const positiveClass = result.find(
                (r: any) => r.label === 'LABEL_1' || r.label === 'relevant' || r.label === '1'
              )

              if (positiveClass) {
                relevantScore = positiveClass.score || 0
              } else {
                // If no positive class found, use the first result and apply sigmoid
                const firstResult = result[0]
                if (firstResult && 'score' in firstResult) {
                  // Apply sigmoid transformation for logits
                  const logit = firstResult.score || 0
                  relevantScore = 1 / (1 + Math.exp(-logit))
                }
              }
            } else if (result && typeof result === 'object' && 'score' in result) {
              // Direct score case - apply sigmoid if it looks like a logit
              const score = result.score || 0
              if (score > 10 || score < -10) {
                // Likely a logit, apply sigmoid
                relevantScore = 1 / (1 + Math.exp(-score))
              } else {
                // Likely already a probability
                relevantScore = score
              }
            }

            // Ensure score is between 0 and 1
            relevantScore = Math.max(0, Math.min(1, relevantScore))

            logger.debug('🎯 Extracted relevance score:', {
              rawScore: Array.isArray(result) && result[0] ? result[0].score : 'N/A',
              relevantScore,
              component: 'TransformersReranker',
            })

            return relevantScore
          })
        )

        rerankingScores.push(...batchResults)

        if (batch.length === batchSize) {
          logger.debug(
            `   📊 Reranked ${Math.min(i + batchSize, queryDocPairs.length)}/${
              queryDocPairs.length
            } documents`
          )
        }
      }

      // Create reranking results with scores
      const rerankingResults: RerankingResult[] = documents.map((doc, index) => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        chunkIndex: doc.chunkIndex,
        vectorScore: doc.score,
        rerankScore: rerankingScores[index] || 0,
        score: rerankingScores[index] || 0, // Use rerank score as final score
      }))

      // Sort by reranking score (descending) and take topK
      const sortedResults = rerankingResults
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, topK)

      const duration = Date.now() - startTime
      logger.info(`✅ Reranking completed in ${duration}ms`, {
        originalCount: documents.length,
        finalCount: sortedResults.length,
        topScore: sortedResults[0]?.rerankScore || 0,
        component: 'TransformersReranker',
      })

      return sortedResults
    } catch (error) {
      logger.error(
        '❌ Error during reranking:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Truncate text to model's maximum token limit
   */
  private truncateText(text: string): string {
    // GTE multilingual reranker supports 8192 tokens
    // Token to character conversion ratio: ~3-4 characters per token for multilingual
    // Use conservative 3 for safety margin
    const maxChars = Math.floor(this.modelConfig.maxTokens * 3)

    if (text.length <= maxChars) {
      return text
    }

    logger.warn(
      `⚠️ Truncating text from ${text.length} to ${maxChars} characters (${this.modelConfig.maxTokens} tokens limit)`
    )
    return text.substring(0, maxChars)
  }

  /**
   * Health check for the reranking service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize()

      // Test with simple query-document pair
      const testInput: RerankingInput = {
        query: 'test query',
        documents: [
          {
            id: 'test-doc',
            content: 'test document content',
            score: 0.8,
            metadata: {
              fileName: 'test',
              filePath: 'test',
              fileType: 'test',
              fileSize: 0,
              fileHash: 'test',
              createdAt: '',
              modifiedAt: '',
              processedAt: '',
            },
            chunkIndex: 0,
          },
        ],
      }

      const results = await this.rerank(testInput, { topK: 1 })
      return Array.isArray(results) && results.length > 0
    } catch (error) {
      logger.error(
        '❌ Reranking health check failed:',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
  }

  /**
   * Check if service is ready
   * Note: This is a synchronous check - initialization should be done beforehand
   */
  isReady(): boolean {
    return this.isInitialized && this.pipeline !== null
  }

  /**
   * Get model information
   */
  getModelInfo(): ModelInfo {
    return {
      name: this.modelConfig.modelId,
      model: this.modelConfig.modelId,
      service: 'transformers.js',
      dimensions: 0, // Rerankers don't have fixed dimensions like embeddings
    }
  }

  /**
   * Get estimated download size for current model
   */
  getEstimatedDownloadSize(): { size: number; formatted: string } {
    const size = 280_000_000 // ~280MB for GTE multilingual reranker
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
   * Get available reranking models
   */
  static getAvailableModels(): Record<string, RerankingModelConfig> {
    return AVAILABLE_RERANKING_MODELS
  }

  /**
   * Estimate memory usage for the model
   */
  estimateMemoryUsage(): string {
    return '~350MB'
  }
}
