/**
 * Reranking Module Index
 * Factory for creating reranking services with different providers
 */

import type { IRerankingService } from '@/domains/rag/core/interfaces.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { TransformersReranker } from './transformers-reranker.js'
import { OllamaReranker } from './ollama-reranker.js'
import { logger } from '@/shared/logger/index.js'

/**
 * Factory class for creating reranking services
 */
export class RerankingFactory {
  /**
   * Create a reranking service based on configuration
   */
  static async createRerankingService(config: ServerConfig): Promise<IRerankingService> {
    const service = config.rerankingService || 'transformers'

    logger.info(`🏭 Creating reranking service: ${service}`, {
      model: config.rerankingModel,
      component: 'RerankingFactory',
    })

    switch (service) {
      case 'transformers':
        return new TransformersReranker(config)

      case 'ollama':
        return new OllamaReranker(config)

      default:
        logger.warn(`Unsupported reranking service: ${service}, falling back to transformers`)
        return new TransformersReranker(config)
    }
  }

  /**
   * Check if a specific reranking service is available
   */
  static async isServiceAvailable(serviceName: string): Promise<boolean> {
    switch (serviceName) {
      case 'transformers':
        return true // Always available via Transformers.js

      case 'ollama':
        // Check if Ollama server is accessible
        try {
          const ollamaReranker = new OllamaReranker({
            ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            rerankingModel: 'dengcao/Qwen3-Reranker-0.6B:Q8_0'
          } as ServerConfig)
          return await ollamaReranker.isModelAvailable()
        } catch {
          return false
        }

      default:
        return false
    }
  }

  /**
   * Get list of available reranking services
   */
  static getAvailableServices(): string[] {
    return ['transformers', 'ollama']
  }
}

// Re-export main components
export { TransformersReranker } from './transformers-reranker.js'
export { OllamaReranker } from './ollama-reranker.js'
export type { IRerankingService } from '@/domains/rag/core/interfaces.js'
export type { 
  RerankingInput, 
  RerankingResult, 
  RerankingOptions 
} from '@/domains/rag/core/types.js'