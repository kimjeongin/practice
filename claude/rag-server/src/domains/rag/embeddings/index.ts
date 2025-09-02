/**
 * Embedding Factory
 * Factory for creating embedding services with multiple backends and automatic fallback
 */

import { Embeddings } from '@langchain/core/embeddings'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { OllamaEmbeddings } from './ollama.js'
import { TransformersEmbeddings } from './transformers.js'
import { EmbeddingAdapter } from './adapter.js'
import { logger } from '@/shared/logger/index.js'

export type EmbeddingServiceType = 'transformers' | 'ollama'

/**
 * Factory for creating embedding services
 * Supports multiple embedding backends with automatic fallback
 */
export class EmbeddingFactory {
  /**
   * Create an embedding service based on configuration
   */
  static async createEmbeddingService(config: ServerConfig): Promise<Embeddings> {
    const service = (config.embeddingService || 'transformers') as EmbeddingServiceType

    logger.info(`🏭 Creating embedding service: ${service}`)

    switch (service) {
      case 'transformers':
        return new TransformersEmbeddings(config)

      case 'ollama':
        return new OllamaEmbeddings(config)

      default:
        logger.warn(`⚠️ Unknown embedding service: ${service}, falling back to transformers`)
        return new TransformersEmbeddings(config)
    }
  }

  /**
   * Create embedding service with automatic fallback
   * Tries the configured service first, falls back to transformers if it fails
   */
  static async createWithFallback(config: ServerConfig): Promise<{
    embeddings: Embeddings
    actualService: EmbeddingServiceType
  }> {
    const requestedService = (config.embeddingService || 'transformers') as EmbeddingServiceType

    try {
      logger.info(`🔍 Attempting to create ${requestedService} embedding service...`)
      const embeddings = await this.createEmbeddingService(config)

      // Test the service
      const isHealthy = await this.testEmbeddingService(embeddings)

      if (isHealthy) {
        logger.info(`✅ ${requestedService} embedding service created successfully`)
        return { embeddings, actualService: requestedService }
      } else {
        throw new Error(`${requestedService} service health check failed`)
      }
    } catch (error) {
      logger.warn(`⚠️ Failed to create ${requestedService} service, falling back to transformers:`, { 
        error: error instanceof Error ? error.message : String(error) 
      })

      if (requestedService === 'transformers') {
        // If transformers also failed, we're out of options
        throw new Error(`All embedding services failed: ${error}`)
      }

      try {
        const fallbackEmbeddings = new TransformersEmbeddings(config)
        const isFallbackHealthy = await this.testEmbeddingService(fallbackEmbeddings)

        if (isFallbackHealthy) {
          logger.info('✅ Fallback to transformers successful')
          return { embeddings: fallbackEmbeddings, actualService: 'transformers' }
        } else {
          throw new Error('Fallback transformers service health check failed')
        }
      } catch (fallbackError) {
        throw new Error(`All embedding services failed. Original: ${error}, Fallback: ${fallbackError}`)
      }
    }
  }

  /**
   * Create embedding adapter (wrapper around LangChain embeddings)
   */
  static async createEmbeddingAdapter(config: ServerConfig): Promise<EmbeddingAdapter> {
    const { embeddings, actualService } = await this.createWithFallback(config)
    return new EmbeddingAdapter(embeddings, actualService)
  }

  /**
   * Test embedding service health
   */
  private static async testEmbeddingService(embeddings: Embeddings): Promise<boolean> {
    try {
      // For TransformersEmbeddings, ensure it's fully initialized
      if (embeddings instanceof TransformersEmbeddings) {
        await (embeddings as any).initialize()
        logger.info('🔄 TransformersEmbeddings initialization completed for health check')
      }
      
      const testEmbedding = await embeddings.embedQuery('test')
      const isValid = Array.isArray(testEmbedding) && testEmbedding.length > 0
      
      if (isValid) {
        logger.info(`✅ Embedding service health check passed (dimension: ${testEmbedding.length})`)
      }
      
      return isValid
    } catch (error) {
      logger.error('Embedding service test failed:', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * Get available embedding services
   */
  static getAvailableServices(): EmbeddingServiceType[] {
    return ['transformers', 'ollama']
  }

  /**
   * Validate embedding service configuration
   */
  static validateConfig(config: ServerConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!config.embeddingService) {
      errors.push('Embedding service not specified')
    }

    if (!config.embeddingModel) {
      errors.push('Embedding model not specified')
    }

    if (config.embeddingDimensions < 1) {
      errors.push('Embedding dimensions must be positive')
    }

    if (config.embeddingBatchSize < 1) {
      errors.push('Embedding batch size must be positive')
    }

    if (config.embeddingService === 'ollama' && !config.ollamaBaseUrl) {
      errors.push('Ollama base URL required for Ollama service')
    }

    if (config.embeddingService === 'transformers' && !config.transformersCacheDir) {
      errors.push('Transformers cache directory required for Transformers service')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Get available models for a specific service
   */
  static getAvailableModelsForService(service: EmbeddingServiceType): Record<string, any> {
    switch (service) {
      case 'ollama':
        return OllamaEmbeddings.getAvailableModels()
      case 'transformers':
        return TransformersEmbeddings.getAvailableModels()
      default:
        return {}
    }
  }

  /**
   * Get all available models across all services
   */
  static getAllAvailableModels(): Record<string, Record<string, any>> {
    return {
      ollama: OllamaEmbeddings.getAvailableModels(),
      transformers: TransformersEmbeddings.getAvailableModels(),
    }
  }
}

// Export types and classes
export { EmbeddingAdapter } from './adapter.js'
export { TransformersEmbeddings } from './transformers.js'
export { OllamaEmbeddings } from './ollama.js'