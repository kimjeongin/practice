import fetch from 'node-fetch'
import type { IRerankingService } from '@/domains/rag/core/interfaces.js'
import type {
  RerankingInput,
  RerankingResult,
  RerankingOptions,
  ModelInfo,
  RerankerModelInfo,
} from '@/domains/rag/core/types.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

/**
 * Ollama-based reranking service
 * Uses cross-encoder architecture for accurate query-document relevance scoring
 */
export class RerankingService implements IRerankingService {
  private baseUrl: string
  private model: string
  private config: ServerConfig
  private cachedModelInfo: RerankerModelInfo | null = null

  constructor(config: ServerConfig) {
    this.config = config
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    this.model = config.rerankingModel

    logger.info('🔄 RerankingService initialized', {
      model: this.model,
      baseUrl: this.baseUrl,
      component: 'RerankingService',
    })
  }

  /**
   * Initialize the reranking service
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`🔄 Initializing Ollama reranker with model: ${this.model}`, {
        component: 'RerankingService',
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

      // Cache model info with complete information
      this.cachedModelInfo = {
        name: this.model,
        service: 'ollama',
        maxTokens: modelDetails.maxTokens,
      }

      logger.info(`✅ Ollama reranker initialized successfully with model: ${this.model}`, {
        maxTokens: this.cachedModelInfo?.maxTokens || 0,
        component: 'RerankingService',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to initialize RerankingService:',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RerankingService' }
      )
      throw error
    }
  }

  /**
   * Rerank documents based on query relevance using Ollama
   */
  async rerank(input: RerankingInput, options: RerankingOptions = {}): Promise<RerankingResult[]> {
    await this.initialize()

    const { query, documents } = input
    const topK = options.topK || documents.length

    if (documents.length === 0) {
      return []
    }

    try {
      logger.info(`🔄 Reranking ${documents.length} documents using Ollama...`, {
        query: query.substring(0, 100),
        topK,
        model: this.model,
        component: 'RerankingService',
      })

      const startTime = Date.now()

      // Process in batches for memory efficiency
      const batchSize = this.config.rerankerBatchSize
      const rerankingScores: number[] = []

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)

        // Process batch with concurrent requests (limited concurrency)
        const batchPromises = batch.map(async (doc) => {
          // Use model's actual maxTokens if available
          const maxTokens = this.cachedModelInfo?.maxTokens || 8192
          const queryMaxChars = Math.floor(maxTokens * 0.3 * 3) // 30% for query, ~3 chars per token
          const docMaxChars = Math.floor(maxTokens * 0.6 * 3) // 60% for document, ~3 chars per token

          const truncatedQuery = this.truncateText(query, queryMaxChars)
          const truncatedContent = this.truncateText(doc.content, docMaxChars)

          return await this.getRerankingScore(truncatedQuery, truncatedContent)
        })

        const batchResults = await Promise.all(batchPromises)
        rerankingScores.push(...batchResults)

        if (batch.length === batchSize) {
          logger.debug(
            `   📊 Reranked ${Math.min(i + batchSize, documents.length)}/${
              documents.length
            } documents`,
            { component: 'RerankingService' }
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
      logger.info(`✅ Ollama reranking completed in ${duration}ms`, {
        originalCount: documents.length,
        finalCount: sortedResults.length,
        topScore: sortedResults[0]?.rerankScore || 0,
        component: 'RerankingService',
      })

      return sortedResults
    } catch (error) {
      logger.error(
        '❌ Error during Ollama reranking:',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RerankingService' }
      )
      throw error
    }
  }

  /**
   * Get reranking score for query-document pair using Ollama with BGE-Reranker-v2-m3
   */
  private async getRerankingScore(query: string, document: string): Promise<number> {
    try {
      // First try generate API with a reranking-specific prompt
      const rerankPrompt = `Query: ${query}\nDocument: ${document}.\n\nReturn ONLY a score between 0 and 1.`

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: rerankPrompt,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as any

      logger.info('!!!!!!!!!!!!!!!!!!!!!!!', { response: data.response })

      logger.debug('🤖 BGE-Reranker-v2-m3 generate response:', {
        response: data.response,
        query: query.substring(0, 50) + '...',
        document: document.substring(0, 50) + '...',
        component: 'RerankingService',
      })

      // Try to extract numerical score from response
      let score = 0.5 // default neutral score
      const cleanResponse = data.response?.trim() || ''

      // Look for number between 0 and 1
      const scoreMatch = cleanResponse.match(/([0-1]\.?\d*)/)
      if (scoreMatch) {
        const parsedScore = parseFloat(scoreMatch[1])
        if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 1) {
          score = parsedScore
        }
      }

      logger.debug('🎯 BGE reranking score computed:', {
        rawResponse: cleanResponse,
        extractedScore: score,
        component: 'RerankingService',
      })

      return score
    } catch (error) {
      logger.error(
        'Generate API failed, trying embeddings API as fallback:',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RerankingService' }
      )

      // Fallback to embeddings API
      return this.getRerankingScoreFromEmbeddings(query, document)
    }
  }

  /**
   * Fallback method using embeddings API
   */
  private async getRerankingScoreFromEmbeddings(query: string, document: string): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `${query} [SEP] ${document}`,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama embeddings API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as any

      logger.debug('🤖 BGE-Reranker embeddings fallback:', {
        embeddingLength: data.embedding?.length || 0,
        firstFew: data.embedding?.slice(0, 3),
        component: 'RerankingService',
      })

      // For long embedding arrays, we need to compute similarity differently
      if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 1) {
        // Option 1: Use cosine similarity with a reference vector
        // Option 2: Use the mean of the embedding as relevance indicator
        // Option 3: Use the first dimension as primary relevance score

        // Let's try using the mean as it represents overall activation
        const sum = data.embedding.reduce((a: number, b: number) => a + b, 0)
        const mean = sum / data.embedding.length

        // Normalize using sigmoid
        const score = this.sigmoid(mean)

        logger.debug('🔢 Embedding-based score calculation:', {
          embeddingLength: data.embedding.length,
          mean: mean,
          normalizedScore: score,
          component: 'RerankingService',
        })

        return score
      }

      return 0.5
    } catch (error) {
      logger.error(
        'Embeddings API fallback also failed:',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RerankingService' }
      )
      return 0.0
    }
  }

  /**
   * Sigmoid function to normalize raw logit scores to 0-1 range
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x))
  }

  /**
   * Get detailed model information from Ollama server
   */
  async getModelDetails(model: string): Promise<{ maxTokens: number } | null> {
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
        model_info: { 'bert.context_length': number }
      }
      return {
        maxTokens: data.model_info['bert.context_length'],
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
   * Truncate text to specified maximum character limit
   */
  private truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text
    }

    logger.warn(`⚠️ Truncating text from ${text.length} to ${maxChars} characters`, {
      component: 'RerankingService',
    })
    return text.substring(0, maxChars)
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
   * Check if service is ready
   */
  isReady(): boolean {
    return this.cachedModelInfo !== null
  }

  /**
   * Get model information (ModelInfo interface compatible)
   */
  getModelInfo(): RerankerModelInfo {
    if (this.cachedModelInfo) {
      return {
        name: this.cachedModelInfo.name,
        service: 'ollama',
        maxTokens: this.cachedModelInfo.maxTokens,
      }
    }

    // Return minimal info if not cached yet
    return {
      name: this.model,
      service: 'ollama',
      maxTokens: 0,
    }
  }
}
