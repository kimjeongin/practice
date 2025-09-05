import { Embeddings } from '@langchain/core/embeddings'
import fetch from 'node-fetch'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { EmbeddingModelInfo } from '@/domains/rag/core/types.js'
import { logger } from '@/shared/logger/index.js'

/**
 * Ollama-based embedding service
 * Communicates with local Ollama server to generate embeddings
 */
export class EmbeddingService extends Embeddings {
  private baseUrl: string
  private model: string
  private cachedModelInfo: EmbeddingModelInfo | null = null

  constructor(config: ServerConfig) {
    super({})
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    this.model = config.embeddingModel
  }

  /**
   * Generate embedding for a single query
   */
  async embedQuery(query: string): Promise<number[]> {
    try {
      logger.info('@@@@@@@@@@@@@@@@@@@@', { model: this.model, input: query })
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: query,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { embeddings: number[][] }

      if (!data.embeddings || !Array.isArray(data.embeddings[0])) {
        throw new Error('Invalid embedding data received from Ollama')
      }

      // Normalize vector for cosine similarity
      return this.normalizeVector(data.embeddings[0])
    } catch (error) {
      logger.error(
        'Error generating Ollama embedding for query:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Generate embeddings for multiple documents
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) {
      return []
    }

    try {
      logger.info(`Generating embeddings for ${documents.length} documents...`, {
        model: this.model,
        component: 'EmbeddingService',
      })
      const embeddings: number[][] = []

      // Process with limited concurrency for optimal performance
      const concurrency = 3
      for (let i = 0; i < documents.length; i += concurrency) {
        const batch = documents.slice(i, i + concurrency)
        const batchPromises = batch.map((doc) => this.embedQuery(doc))

        try {
          const batchEmbeddings = await Promise.all(batchPromises)
          embeddings.push(...batchEmbeddings)

          // Progress logging
          if (i % (concurrency * 5) === 0) {
            logger.debug(
              `Progress: ${Math.min(i + concurrency, documents.length)}/${
                documents.length
              } embeddings generated`,
              { component: 'EmbeddingService' }
            )
          }
        } catch (error) {
          logger.error(
            `Error in batch ${i}-${i + concurrency}:`,
            error instanceof Error ? error : new Error(String(error))
          )
          throw error
        }
      }

      logger.info(`Successfully generated ${embeddings.length} embeddings`, {
        model: this.model,
        component: 'EmbeddingService',
      })
      return embeddings
    } catch (error) {
      logger.error(
        'Error generating Ollama embeddings for documents:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
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
        model_info: { 'qwen3.context_length': number; 'qwen3.embedding_length': number }
      }
      return {
        maxTokens: data.model_info['qwen3.context_length'],
        dimensions: data.model_info['qwen3.embedding_length'],
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
   * Initialize service with model information caching
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`🔄 Initializing Ollama embedding service with model: ${this.model}`, {
        baseUrl: this.baseUrl,
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

      logger.info(`✅ Ollama embedding service initialized successfully`, this.cachedModelInfo)
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

  /**
   * Normalize vector (L2 norm) for cosine similarity calculation
   */
  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))

    if (norm === 0) {
      logger.warn('Zero vector detected during normalization', {
        component: 'EmbeddingService',
      })
      return vector
    }

    return vector.map((val) => val / norm)
  }
}
