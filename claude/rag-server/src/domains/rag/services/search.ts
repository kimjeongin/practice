/**
 * Search Service - 2-Stage RAG Search with Reranking
 * Implements vector search followed by cross-encoder reranking for improved accuracy
 */

import type { ISearchService, IRerankingService } from '@/domains/rag/core/interfaces.js'
import type { SearchOptions, SearchResult, RerankingInput } from '@/domains/rag/core/types.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import { RerankingFactory } from '@/domains/rag/reranking/index.js'
import { SearchError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

export class SearchService implements ISearchService {
  private rerankingService: IRerankingService | null = null
  private initPromise: Promise<void> | null = null

  constructor(private vectorStore: LanceDBProvider, private config: ServerConfig) {}

  /**
   * Initialize reranking service if enabled
   */
  private async initialize(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = this._doInitialize()
    await this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    if (this.config.rerankingEnabled && !this.rerankingService) {
      try {
        logger.info('🔄 Initializing reranking service for 2-stage search...', {
          component: 'SearchService',
        })

        this.rerankingService = await RerankingFactory.createRerankingService(this.config)

        logger.info('✅ Reranking service initialized for 2-stage search', {
          model: this.config.rerankingModel,
          component: 'SearchService',
        })
      } catch (error) {
        logger.error(
          '❌ Failed to initialize reranking service, falling back to vector search only',
          error instanceof Error ? error : new Error(String(error)),
          { component: 'SearchService' }
        )
        // Continue without reranking
        this.rerankingService = null
      }
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.initialize()

    const endTiming = startTiming('search_pipeline', {
      query: query.substring(0, 50),
      rerankingEnabled: this.config.rerankingEnabled,
      component: 'SearchService',
    })

    try {
      const isRerankingEnabled = this.config.rerankingEnabled && this.rerankingService?.isReady()

      // Debug reranking state
      logger.info('🔍 Starting 2-stage search pipeline', {
        query: query.substring(0, 100),
        topK: options.topK || 10,
        rerankingEnabled: isRerankingEnabled,
        rerankingConfig: this.config.rerankingEnabled,
        rerankingServiceExists: !!this.rerankingService,
        rerankingServiceReady: this.rerankingService?.isReady() || false,
        component: 'SearchService',
      })

      const searchResults = await TimeoutWrapper.withTimeout(
        this.performTwoStageSearch(query, options),
        {
          timeoutMs: parseInt(process.env.SEARCH_PIPELINE_TIMEOUT_MS || '90000'), // Increased for reranking
          operation: 'two_stage_search',
        }
      )

      logger.info('✅ 2-stage search pipeline completed', {
        query: query.substring(0, 100),
        resultsCount: searchResults.length,
        topScore: searchResults[0]?.score || 0,
        rerankingUsed: isRerankingEnabled,
        component: 'SearchService',
      })

      endTiming()
      return searchResults
    } catch (error) {
      const isRerankingEnabled = this.config.rerankingEnabled && this.rerankingService?.isReady()
      const searchError =
        error instanceof SearchError
          ? error
          : new SearchError(
              error instanceof Error ? error.message : String(error),
              query.substring(0, 100),
              'semantic', // Keep original semantic type for compatibility
              error instanceof Error ? error : undefined
            )

      errorMonitor.recordError(searchError)
      endTiming()
      throw searchError
    }
  }

  private async performTwoStageSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const isRerankingEnabled = this.config.rerankingEnabled && this.rerankingService?.isReady()
    // Stage 1: Vector Search
    // Retrieve more candidates if reranking is enabled
    let vectorTopK = options.topK || 10

    if (isRerankingEnabled) {
      // Get total document count to optimize candidate retrieval
      const totalDocs = await this.vectorStore.getDocumentCount()
      const desiredCandidates = Math.max((options.topK || 10) * 4, 20)

      // Don't request more than what exists, but ensure we have enough for reranking
      vectorTopK = Math.min(desiredCandidates, totalDocs)

      logger.debug('📊 Optimizing candidate retrieval', {
        totalDocs,
        desiredCandidates,
        actualVectorTopK: vectorTopK,
        finalTopK: options.topK || 10,
        component: 'SearchService',
      })
    }

    const vectorStartTime = Date.now()
    const vectorResults = await this.vectorStore.search(query, {
      topK: vectorTopK,
      scoreThreshold: options.scoreThreshold || 0.0,
    })

    const vectorDuration = Date.now() - vectorStartTime
    logger.info(`📊 Stage 1 (Vector Search) completed`, {
      query: query.substring(0, 100),
      candidatesRetrieved: vectorResults.length,
      duration: vectorDuration,
      component: 'SearchService',
    })

    // If no reranking or no results, return vector results
    if (!isRerankingEnabled || vectorResults.length === 0 || !this.rerankingService) {
      return vectorResults.map((result) => ({
        content: result.content,
        score: result.score,
        metadata: result.metadata,
        chunkIndex: result.chunkIndex,
      }))
    }

    // Stage 2: Reranking
    const rerankingStartTime = Date.now()

    try {
      const rerankingInput: RerankingInput = {
        query,
        documents: vectorResults,
      }

      const rerankingResults = await this.rerankingService.rerank(rerankingInput, {
        topK: options.topK || 10,
        model: this.config.rerankingModel,
      })

      const rerankingDuration = Date.now() - rerankingStartTime
      logger.info(`📊 Stage 2 (Reranking) completed`, {
        query: query.substring(0, 100),
        inputCandidates: vectorResults.length,
        outputResults: rerankingResults.length,
        duration: rerankingDuration,
        totalDuration: vectorDuration + rerankingDuration,
        topRerankScore: rerankingResults[0]?.rerankScore || 0,
        component: 'SearchService',
      })

      // Convert reranking results to search results
      return rerankingResults.map((result) => ({
        content: result.content,
        score: result.score, // Use final combined score
        metadata: result.metadata,
        chunkIndex: result.chunkIndex,
      }))
    } catch (error) {
      logger.error(
        '❌ Stage 2 (Reranking) failed, falling back to vector search results',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'SearchService' }
      )

      // Fallback to vector search results
      return vectorResults.slice(0, options.topK || 10).map((result) => ({
        content: result.content,
        score: result.score,
        metadata: result.metadata,
        chunkIndex: result.chunkIndex,
      }))
    }
  }
}
