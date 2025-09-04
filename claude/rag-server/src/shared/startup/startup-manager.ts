/**
 * Application Startup Manager
 * Handles eager initialization of all services to improve runtime performance
 */

import { ServerConfig } from '@/shared/config/config-factory.js'
import { EmbeddingFactory } from '@/domains/rag/embeddings/index.js'
import { RerankingFactory } from '@/domains/rag/reranking/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import type { IEmbeddingService, IRerankingService } from '@/domains/rag/core/interfaces.js'

export interface StartupServices {
  embeddingService: IEmbeddingService | any
  rerankingService: IRerankingService | any
}

export class StartupManager {
  private static instance: StartupManager | null = null
  private services: StartupServices | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  private constructor(private config: ServerConfig) {}

  /**
   * Get or create singleton instance
   */
  static getInstance(config: ServerConfig): StartupManager {
    if (!StartupManager.instance) {
      StartupManager.instance = new StartupManager(config)
    }
    return StartupManager.instance
  }

  /**
   * Initialize all services at application startup
   */
  async initializeServices(): Promise<StartupServices> {
    if (this.services && this.initialized) {
      return this.services
    }

    if (this.initPromise) {
      await this.initPromise
      return this.services!
    }

    this.initPromise = this._doInitializeServices()
    await this.initPromise
    return this.services!
  }

  private async _doInitializeServices(): Promise<void> {
    const endTiming = startTiming('startup_initialization', {
      embeddingService: this.config.embeddingService,
      rerankingService: this.config.rerankingService,
      component: 'StartupManager',
    })

    try {
      logger.info('🚀 Starting application service initialization...', {
        embeddingService: this.config.embeddingService,
        rerankingService: this.config.rerankingService,
        component: 'StartupManager',
      })

      // Initialize embedding service first (required)
      logger.info('🔄 Initializing embedding service...', {
        service: this.config.embeddingService,
        component: 'StartupManager',
      })

      const embeddingStartTime = Date.now()
      const embeddingService = await EmbeddingFactory.createEmbeddingService(this.config)

      // Force initialization of the embedding service if it has an initialize method
      if (
        'initialize' in embeddingService &&
        typeof (embeddingService as any).initialize === 'function'
      ) {
        await (embeddingService as any).initialize()
      }

      const embeddingDuration = Date.now() - embeddingStartTime
      logger.info('✅ Embedding service initialized successfully', {
        service: this.config.embeddingService,
        duration: embeddingDuration,
        component: 'StartupManager',
      })

      // Initialize reranking service (optional but available for parameter-based usage)
      let rerankingService: IRerankingService | null = null
      try {
        logger.info('🔄 Initializing reranking service...', {
          service: this.config.rerankingService,
          model: this.config.rerankingModel,
          component: 'StartupManager',
        })

        const rerankingStartTime = Date.now()
        rerankingService = await RerankingFactory.createRerankingService(this.config)

        // Force initialization of the reranking service
        if (
          'initialize' in rerankingService &&
          typeof (rerankingService as any).initialize === 'function'
        ) {
          await (rerankingService as any).initialize()
        }

        const rerankingDuration = Date.now() - rerankingStartTime
        logger.info('✅ Reranking service initialized successfully', {
          service: this.config.rerankingService,
          model: this.config.rerankingModel,
          duration: rerankingDuration,
          isReady: rerankingService.isReady(),
          component: 'StartupManager',
        })
      } catch (error) {
        logger.warn(
          '⚠️ Failed to initialize reranking service during startup, will be unavailable for parameter-based usage',
          error instanceof Error ? error : new Error(String(error))
        )
      }

      this.services = {
        embeddingService,
        rerankingService,
      }

      this.initialized = true
      endTiming()

      const totalDuration = Date.now() - (endTiming as any).startTime
      logger.info('🎉 Application service initialization completed successfully', {
        totalDuration,
        embeddingReady: 'isReady' in embeddingService ? (embeddingService as any).isReady() : true,
        rerankingReady: rerankingService ? rerankingService.isReady() : 'disabled',
        component: 'StartupManager',
      })
    } catch (error) {
      logger.error(
        '❌ Application service initialization failed',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'StartupManager' }
      )
      endTiming()
      throw error
    }
  }

  /**
   * Get initialized services (throws if not initialized)
   */
  getServices(): StartupServices {
    if (!this.services || !this.initialized) {
      throw new Error('Services not initialized. Call initializeServices() first.')
    }
    return this.services
  }

  /**
   * Check if services are initialized and ready
   */
  isReady(): boolean {
    if (!this.services || !this.initialized) return false

    const embeddingReady =
      'isReady' in this.services.embeddingService
        ? (this.services.embeddingService as any).isReady()
        : true

    const rerankingReady = this.services.rerankingService
      ? this.services.rerankingService.isReady()
      : true

    return embeddingReady && rerankingReady
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    embedding: { ready: boolean; healthy: boolean }
    reranking: { available: boolean; ready: boolean; healthy: boolean }
  }> {
    if (!this.services || !this.initialized) {
      throw new Error('Services not initialized')
    }

    const embeddingHealthy =
      'healthCheck' in this.services.embeddingService
        ? await (this.services.embeddingService as any).healthCheck()
        : true

    const rerankingHealthy = this.services.rerankingService
      ? await this.services.rerankingService.healthCheck()
      : true

    return {
      embedding: {
        ready:
          'isReady' in this.services.embeddingService
            ? (this.services.embeddingService as any).isReady()
            : true,
        healthy: embeddingHealthy,
      },
      reranking: {
        available: this.services.rerankingService !== null,
        ready: this.services.rerankingService ? this.services.rerankingService.isReady() : false,
        healthy: rerankingHealthy,
      },
    }
  }
}
