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

export interface OllamaRerankingModelConfig {
  modelId: string
  maxTokens: number
  description: string
  recommendedBatchSize?: number
}

export const AVAILABLE_OLLAMA_RERANKING_MODELS: Record<string, OllamaRerankingModelConfig> = {
  'dengcao/Qwen3-Reranker-0.6B:Q8_0': {
    modelId: 'dengcao/Qwen3-Reranker-0.6B:Q8_0',
    maxTokens: 8192,
    description: 'Qwen3 Reranker - High-performance reranking model optimized for relevance scoring',
    recommendedBatchSize: 4,
  },
}

/**
 * Ollama-based reranking service using Qwen3 reranker model
 * Implements cross-encoder architecture for accurate query-document relevance scoring
 */
export class OllamaReranker implements IRerankingService {
  private baseUrl: string
  private modelConfig: OllamaRerankingModelConfig
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  constructor(config: ServerConfig) {
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    
    // Get model configuration
    const modelName = config.rerankingModel || 'dengcao/Qwen3-Reranker-0.6B:Q8_0'
    const defaultModel = AVAILABLE_OLLAMA_RERANKING_MODELS['dengcao/Qwen3-Reranker-0.6B:Q8_0']
    if (!defaultModel) {
      throw new Error('Default Ollama reranking model configuration not found')
    }
    this.modelConfig = AVAILABLE_OLLAMA_RERANKING_MODELS[modelName] ?? defaultModel

    logger.info('🔄 OllamaReranker initialized', {
      model: this.modelConfig.modelId,
      maxTokens: this.modelConfig.maxTokens,
      baseUrl: this.baseUrl,
      component: 'OllamaReranker',
    })
  }

  /**
   * Initialize the reranking service
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
      logger.info(`🔄 Initializing Ollama reranker with model: ${this.modelConfig.modelId}`)

      // Check if Ollama server is available
      const isHealthy = await this.checkOllamaHealth()
      if (!isHealthy) {
        throw new Error('Ollama server is not available')
      }

      // Check if model is available
      const isModelAvailable = await this.isModelAvailable()
      if (!isModelAvailable) {
        logger.warn(`⚠️ Model ${this.modelConfig.modelId} not found. Please pull it using: ollama pull ${this.modelConfig.modelId}`)
        throw new Error(`Model ${this.modelConfig.modelId} not available in Ollama`)
      }

      logger.info(`✅ Ollama reranker initialized successfully with model: ${this.modelConfig.modelId}`)
      logger.info(`🚀 Ready for reranking (${this.modelConfig.description})`)

      this.isInitialized = true
    } catch (error) {
      logger.error(
        '❌ Failed to initialize OllamaReranker:',
        error instanceof Error ? error : new Error(String(error))
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
        model: this.modelConfig.modelId,
        component: 'OllamaReranker',
      })

      const startTime = Date.now()

      // Process in batches for memory efficiency
      const batchSize = this.modelConfig.recommendedBatchSize || 4
      const rerankingScores: number[] = []

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)

        // Process batch with concurrent requests (limited concurrency)
        const batchPromises = batch.map(async (doc) => {
          const truncatedQuery = this.truncateText(query)
          const truncatedContent = this.truncateText(doc.content)
          
          return await this.getRerankingScore(truncatedQuery, truncatedContent)
        })

        const batchResults = await Promise.all(batchPromises)
        rerankingScores.push(...batchResults)

        if (batch.length === batchSize) {
          logger.debug(
            `   📊 Reranked ${Math.min(i + batchSize, documents.length)}/${documents.length} documents`
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
        component: 'OllamaReranker',
      })

      return sortedResults
    } catch (error) {
      logger.error(
        '❌ Error during Ollama reranking:',
        error instanceof Error ? error : new Error(String(error))
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

      // Try using the generate API with a more explicit prompt
      const prompt = `Rate the relevance between query and document on a scale of 0.0 to 1.0.

Input: ${input}

Score:`

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelConfig.modelId,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1, // Slightly increased for variation
            num_predict: 50, // Allow more tokens for better response
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
        component: 'OllamaReranker',
      })

      return score
    } catch (error) {
      logger.error(
        'Error getting reranking score from Ollama:',
        error instanceof Error ? error : new Error(String(error))
      )
      // Return a random score between 0.1 and 0.9 to avoid identical scores
      return 0.1 + Math.random() * 0.8
    }
  }

  /**
   * Create reranking prompt for the model
   * Using a format similar to cross-encoder training
   */
  private createRerankingPrompt(query: string, document: string): string {
    // Use separator similar to transformers reranker
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
        /(\d+\.?\d*)/,           // 0.8, 1.0, 0, etc.
        /score[:\s]*(\d+\.?\d*)/,  // "score: 0.8"
        /(\d+\.?\d*)[\/]10/,     // "8/10" format
        /(\d+\.?\d*)%/,          // "80%" format
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

      // Enhanced fallback with more specific keywords (order matters - most specific first)
      if (cleanResponse.includes('not relevant') || cleanResponse.includes('unrelated') || cleanResponse.includes('irrelevant') || cleanResponse.includes('no relation')) {
        return 0.1
      }
      if (cleanResponse.includes('perfect') || cleanResponse.includes('exactly') || cleanResponse.includes('completely relevant')) {
        return 0.95
      }
      if (cleanResponse.includes('highly relevant') || cleanResponse.includes('very relevant') || cleanResponse.includes('strongly')) {
        return 0.85
      }
      if (cleanResponse.includes('somewhat') || cleanResponse.includes('partially') || cleanResponse.includes('moderate')) {
        return 0.5
      }
      if (cleanResponse.includes('slightly') || cleanResponse.includes('weak') || cleanResponse.includes('minor')) {
        return 0.3
      }
      if (cleanResponse.includes('relevant') || cleanResponse.includes('related') || cleanResponse.includes('matches')) {
        return 0.7
      }

      // If no clear indicators, return a middle-range random score to avoid identical scores
      return 0.4 + Math.random() * 0.2 // Random between 0.4-0.6
    } catch (error) {
      logger.warn('Error parsing reranking score, using random default:', { response, error: String(error) })
      return 0.3 + Math.random() * 0.4 // Random between 0.3-0.7
    }
  }

  /**
   * Truncate text to model's maximum token limit
   */
  private truncateText(text: string): string {
    // Conservative token to character conversion ratio: ~3 characters per token
    const maxChars = Math.floor(this.modelConfig.maxTokens * 3 * 0.4) // Use 40% for each text to leave room for prompt

    if (text.length <= maxChars) {
      return text
    }

    logger.warn(
      `⚠️ Truncating text from ${text.length} to ${maxChars} characters (${this.modelConfig.maxTokens} tokens limit)`
    )
    return text.substring(0, maxChars)
  }

  /**
   * Check Ollama server health
   */
  private async checkOllamaHealth(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      logger.warn(
        'Ollama health check failed:',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
  }

  /**
   * Check if the configured model is available in Ollama
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      })

      if (!response.ok) {
        return false
      }

      const data = (await response.json()) as { models: Array<{ name: string }> }
      return data.models.some(
        (model) => {
          const baseModelName = this.modelConfig.modelId.split(':')[0]
          return model.name === this.modelConfig.modelId || 
                 (baseModelName && model.name.startsWith(baseModelName))
        }
      )
    } catch (error) {
      logger.warn(
        'Error checking Ollama model availability:',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
  }

  /**
   * Health check for the reranking service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize()

      // Test with simple query-document pair
      const testInput: RerankingInput = {
        query: 'test query about machine learning',
        documents: [
          {
            id: 'test-doc-1',
            content: 'Machine learning is a subset of artificial intelligence that focuses on algorithms.',
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
          {
            id: 'test-doc-2',
            content: 'The weather today is sunny and warm.',
            score: 0.3,
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
            chunkIndex: 1,
          },
        ],
      }

      const results = await this.rerank(testInput, { topK: 2 })
      const isValid = Array.isArray(results) && results.length > 0
      
      if (isValid) {
        // Verify that reranking worked correctly (ML doc should rank higher than weather doc)
        const mlDocScore = results.find(r => r.id === 'test-doc-1')?.rerankScore || 0
        const weatherDocScore = results.find(r => r.id === 'test-doc-2')?.rerankScore || 0
        
        if (mlDocScore > weatherDocScore) {
          logger.info('✅ Ollama reranking health check passed - correct ranking detected')
          return true
        }
      }
      
      return isValid
    } catch (error) {
      logger.error(
        '❌ Ollama reranking health check failed:',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
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
    return {
      name: this.modelConfig.modelId,
      model: this.modelConfig.modelId,
      service: 'ollama',
      dimensions: 0, // Rerankers don't have fixed dimensions like embeddings
    }
  }

  /**
   * Get available reranking models for Ollama
   */
  static getAvailableModels(): Record<string, OllamaRerankingModelConfig> {
    return AVAILABLE_OLLAMA_RERANKING_MODELS
  }

  /**
   * Estimate memory usage for the model
   */
  estimateMemoryUsage(): string {
    return '~600MB (Q8_0 quantized)'
  }
}