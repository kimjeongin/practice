/**
 * Reranking Module Index
 * Factory for creating reranking services with different providers
 */

import type { IRerankingService } from '@/domains/rag/core/interfaces.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { TransformersReranker } from './transformers-reranker.js'
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

      default:
        return false
    }
  }

  /**
   * Get list of available reranking services
   */
  static getAvailableServices(): string[] {
    return ['transformers']
  }
}

// Re-export main components
export { TransformersReranker } from './transformers-reranker.js'
export type { IRerankingService } from '@/domains/rag/core/interfaces.js'
export type { 
  RerankingInput, 
  RerankingResult, 
  RerankingOptions 
} from '@/domains/rag/core/types.js'