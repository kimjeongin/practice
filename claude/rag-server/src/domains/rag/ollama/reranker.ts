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
   * Get reranking score for query-document pair using Ollama API
   */
  private async getRerankingScore(query: string, document: string): Promise<number> {
    try {
      // Create a reranking input for the model
      const input = this.createRerankingPrompt(query, document)

      // Use direct binary format - force the model to choose between tokens
      const chatPrompt = `Query: ${query}
Document: ${document}

Is this document relevant to the query? Answer:`

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: chatPrompt,
          stream: false,
          options: {
            temperature: 0,
            num_predict: 10, // Allow slightly more tokens
            stop: ['\n', '\n\n', '.', 'Query:', 'Document:'], // More specific stops
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as any
      logger.info('🤖 Qwen3-Reranker raw response:', {
        response: data.response,
        query: query.substring(0, 50) + '...',
        document: document.substring(0, 50) + '...',
        component: 'RerankingService',
      })

      // Extract numerical score from response
      const score = this.parseRerankingScore(data.response)

      logger.debug('🎯 Ollama reranking score:', {
        input: input.substring(0, 100) + '...',
        rawResponse: data.response.trim(),
        extractedScore: score,
        component: 'RerankingService',
      })

      return score
    } catch (error) {
      logger.error(
        'Error getting reranking score from Ollama:',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'RerankingService' }
      )
      return 0.0
    }
  }

  /**
   * Create reranking prompt for the model
   */
  private createRerankingPrompt(query: string, document: string): string {
    // Use separator similar to cross-encoder training
    return `${query}</s></s>${document}`
  }

  /**
   * Parse binary yes/no response from Qwen3-Reranker model
   */
  private parseRerankingScore(response: string): number {
    try {
      const cleanResponse = response.trim().toLowerCase()

      logger.debug('🔍 Parsing reranker response:', {
        originalResponse: response,
        cleanResponse: cleanResponse,
        component: 'RerankingService',
      })

      // Extract the first word from the response
      const firstWord = cleanResponse.split(/\s+/)[0]

      // Handle yes/no responses directly
      if (firstWord === 'yes') {
        return 1.0
      }
      if (firstWord === 'no') {
        return 0.0
      }

      // Fallback: check if yes/no appears anywhere in the response
      if (cleanResponse.includes('yes')) {
        return 1.0
      }
      if (cleanResponse.includes('no')) {
        return 0.0
      }

      // If neither yes nor no found, log warning and return neutral score
      logger.warn('⚠️ No clear yes/no response found in reranker output:', {
        response: response,
        component: 'RerankingService',
      })

      return 0.5 // Neutral score when unclear
    } catch (error) {
      logger.error(
        '❌ Error parsing binary reranking response:',
        error instanceof Error ? error : new Error(String(error)),
        {
          response,
          component: 'RerankingService',
        }
      )
      return 0.0
    }
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
        model_info: { 'qwen3.context_length': number }
      }
      return {
        maxTokens: data.model_info['qwen3.context_length'],
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
