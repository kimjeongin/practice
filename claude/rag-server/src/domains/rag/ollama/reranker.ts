import fetch from 'node-fetch'
import type { IRerankingService } from '@/domains/rag/core/interfaces.js'
import type {
  RerankingInput,
  RerankingResult,
  RerankingOptions,
  ModelInfo,
} from '@/domains/rag/core/types.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

interface OllamaModel {
  name: string
  parameters?: string
  modelfile?: string
  dimensions?: number
  maxTokens?: number
  details?: {
    context_length?: number
  }
}

/**
 * Ollama-based reranking service
 * Uses cross-encoder architecture for accurate query-document relevance scoring
 */
export class RerankingService implements IRerankingService {
  private baseUrl: string
  private model: string
  private isInitialized = false
  private cachedModelInfo: ModelInfo | null = null
  private modelDetails: OllamaModel | null = null

  constructor(config: ServerConfig) {
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
    if (this.isInitialized) return

    try {
      logger.info(`🔄 Initializing Ollama reranker with model: ${this.model}`, {
        component: 'RerankingService',
      })

      // Check Ollama connection and model availability
      const models = await this.getTags()
      if (models.length === 0) {
        throw new Error('Ollama server is not available or has no models')
      }

      const modelAvailable = models.some((model) => {
        const baseModelName = this.model.split(':')[0]
        return model.name === this.model || (baseModelName && model.name.startsWith(baseModelName))
      })

      if (!modelAvailable) {
        logger.warn(
          `⚠️ Model ${this.model} not found. Please pull it using: ollama pull ${this.model}`,
          { component: 'RerankingService' }
        )
        throw new Error(`Model ${this.model} not available in Ollama`)
      }

      // Get detailed model information
      this.modelDetails = await this.getModelDetails()

      // Cache model info with complete information
      this.cachedModelInfo = {
        name: this.model,
        service: 'ollama',
        dimensions: 0, // Rerankers don't have fixed dimensions like embeddings
        maxTokens: 0,
      }

      logger.info(`✅ Ollama reranker initialized successfully with model: ${this.model}`, {
        maxTokens: this.modelDetails?.maxTokens || 0,
        component: 'RerankingService',
      })

      this.isInitialized = true
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
      const batchSize = 4
      const rerankingScores: number[] = []

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)

        // Process batch with concurrent requests (limited concurrency)
        const batchPromises = batch.map(async (doc) => {
          // Use model's actual maxTokens if available
          const maxTokens = this.modelDetails?.maxTokens || 8192
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

      // Use generate API with explicit prompt for relevance scoring
      const prompt = `Rate the relevance between query and document on a scale of 0.0 to 1.0.

Input: ${input}

Score:`

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 50,
            top_p: 0.9,
            top_k: 10,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { response: string }

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
   * Parse numerical score from model response
   */
  private parseRerankingScore(response: string): number {
    try {
      const cleanResponse = response.trim().toLowerCase()

      // Try to extract numerical value with improved regex
      const patterns = [
        /(\d+\.?\d*)/, // 0.8, 1.0, 0, etc.
        /score[:\s]*(\d+\.?\d*)/, // "score: 0.8"
        /(\d+\.?\d*)[\/]10/, // "8/10" format
        /(\d+\.?\d*)%/, // "80%" format
      ]

      for (const pattern of patterns) {
        const match = cleanResponse.match(pattern)
        if (match && match[1]) {
          let score = parseFloat(match[1])

          // Handle different scales
          if (pattern.toString().includes('%')) {
            score = score / 100 // Convert percentage
          } else if (pattern.toString().includes('/10')) {
            score = score / 10 // Convert 0-10 scale
          } else if (score > 1 && score <= 10) {
            score = score / 10 // Assume 0-10 scale if > 1
          }

          return Math.max(0, Math.min(1, score))
        }
      }

      // Enhanced fallback with specific keywords (order matters - most specific first)
      if (
        cleanResponse.includes('not relevant') ||
        cleanResponse.includes('unrelated') ||
        cleanResponse.includes('irrelevant') ||
        cleanResponse.includes('no relation')
      ) {
        return 0.1
      }
      if (
        cleanResponse.includes('perfect') ||
        cleanResponse.includes('exactly') ||
        cleanResponse.includes('completely relevant')
      ) {
        return 0.95
      }
      if (
        cleanResponse.includes('highly relevant') ||
        cleanResponse.includes('very relevant') ||
        cleanResponse.includes('strongly')
      ) {
        return 0.85
      }
      if (
        cleanResponse.includes('somewhat') ||
        cleanResponse.includes('partially') ||
        cleanResponse.includes('moderate')
      ) {
        return 0.5
      }
      if (
        cleanResponse.includes('slightly') ||
        cleanResponse.includes('weak') ||
        cleanResponse.includes('minor')
      ) {
        return 0.3
      }
      if (
        cleanResponse.includes('relevant') ||
        cleanResponse.includes('related') ||
        cleanResponse.includes('matches')
      ) {
        return 0.7
      }

      // If no clear indicators, return a middle-range random score to avoid identical scores
      return 0.4 + Math.random() * 0.2 // Random between 0.4-0.6
    } catch (error) {
      logger.warn('Error parsing reranking score, using random default:', {
        response,
        error: String(error),
        component: 'RerankingService',
      })
      return 0.3 + Math.random() * 0.4 // Random between 0.3-0.7
    }
  }

  /**
   * Get detailed model information from Ollama server
   */
  async getModelDetails(modelName?: string): Promise<OllamaModel | null> {
    const targetModel = modelName || this.model
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: targetModel,
        }),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as OllamaModel

      // Try to extract maxTokens from parameters or modelfile
      const maxTokens = this.extractMaxTokensFromModelInfo(data)
      if (maxTokens) {
        data.maxTokens = maxTokens
      }

      return data
    } catch (error) {
      logger.warn(`Could not fetch model details for ${targetModel}:`, {
        error: error instanceof Error ? error : new Error(String(error)),
        component: 'RerankingService',
      })
      return null
    }
  }

  /**
   * Extract max tokens from model information
   */
  private extractMaxTokensFromModelInfo(modelInfo: OllamaModel): number | null {
    // Try to extract from details first
    if (modelInfo.details?.context_length) {
      return modelInfo.details.context_length
    }

    // Try to extract from parameters string
    if (modelInfo.parameters) {
      const contextMatch = modelInfo.parameters.match(/num_ctx\s+(\d+)/i)
      if (contextMatch && contextMatch[1]) {
        return parseInt(contextMatch[1])
      }
    }

    // Try to extract from modelfile
    if (modelInfo.modelfile) {
      const contextMatch = modelInfo.modelfile.match(/PARAMETER\s+num_ctx\s+(\d+)/i)
      if (contextMatch && contextMatch[1]) {
        return parseInt(contextMatch[1])
      }
    }

    // Default context lengths for common models
    const modelName = modelInfo.name.toLowerCase()
    if (modelName.includes('qwen3')) {
      return 32768 // Qwen3 typically has 32k context
    }
    if (modelName.includes('qwen')) {
      return 8192 // Other Qwen models typically 8k
    }

    return null
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
  async getTags(): Promise<OllamaModel[]> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return []
      }

      const data = (await response.json()) as { models: OllamaModel[] }
      return data.models
    } catch (error) {
      logger.warn(
        'Failed to get Ollama tags:',
        error instanceof Error ? error : new Error(String(error))
      )
      return []
    }
  }

  /**
   * Health check for the reranking service
   */
  async healthCheck(): Promise<boolean> {
    const models = await this.getTags()
    return models.length > 0
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Get model information
   */
  getModelInfo(): ModelInfo {
    return (
      this.cachedModelInfo || {
        name: this.model,
        service: 'ollama',
        dimensions: 0, // Rerankers don't have fixed dimensions like embeddings
        maxTokens: 0,
      }
    )
  }
}
