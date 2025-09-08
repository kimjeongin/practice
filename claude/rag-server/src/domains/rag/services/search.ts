/**
 * Search Service - 2-Stage RAG Search with Reranking
 * Implements vector search followed by cross-encoder reranking for improved accuracy
 */

import type { ISearchService, IRerankingService } from '@/domains/rag/core/interfaces.js'
import type { SearchOptions, SearchResult, RerankingInput, SearchType } from '@/domains/rag/core/types.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import { SearchError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

export class SearchService implements ISearchService {
  private rerankingService: IRerankingService

  constructor(
    private vectorStore: LanceDBProvider,
    private config: ServerConfig,
    prerankingService: IRerankingService
  ) {
    this.rerankingService = prerankingService

    logger.info('✅ SearchService initialized with pre-initialized reranking service', {
      rerankingReady: this.rerankingService.isReady(),
      component: 'SearchService',
    })
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const searchType = options.searchType || 'semantic'
    const endTiming = startTiming('search_pipeline', {
      query: query.substring(0, 50),
      rerankingEnabled: options.enableReranking || false,
      searchType,
      component: 'SearchService',
    })

    try {
      logger.info('🔍 Starting search pipeline', {
        query: query.substring(0, 100),
        topK: options.topK || 10,
        searchType,
        rerankingRequested: options.enableReranking || false,
        rerankingServiceExists: !!this.rerankingService,
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
        component: 'SearchService',
      })

      endTiming()
      return searchResults
    } catch (error) {
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
    const searchType = options.searchType || 'semantic'
    
    // For hybrid search, reranking is built into LanceDB's native implementation
    // For keyword search, reranking may not be as relevant
    // For semantic search, reranking provides the most benefit
    let isRerankingEnabled = false
    if (options.enableReranking && searchType !== 'hybrid') {
      if (!this.rerankingService.isReady()) {
        try {
          // Check if the service has an initialize method (like TransformersReranker)
          if (
            'initialize' in this.rerankingService &&
            typeof (this.rerankingService as any).initialize === 'function'
          ) {
            await (this.rerankingService as any).initialize()
          }
        } catch (error) {
          logger.warn(
            'Failed to initialize reranking service',
            error instanceof Error ? error : new Error(String(error))
          )
        }
      }
      isRerankingEnabled = this.rerankingService.isReady()
    }

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
      searchType: searchType,
    })

    const vectorDuration = Date.now() - vectorStartTime
    logger.info(`📊 Stage 1 (${searchType} Search) completed`, {
      query: query.substring(0, 100),
      searchType,
      candidatesRetrieved: vectorResults.length,
      duration: vectorDuration,
      component: 'SearchService',
    })

    // If no reranking or no results, return results without rerank scores
    // Note: hybrid search already includes reranking in LanceDB's native implementation
    if (!isRerankingEnabled || searchType === 'hybrid') {
      logger.info(`📊 Search completed - ${searchType === 'hybrid' ? 'native hybrid with built-in reranking' : 'no additional reranking'}`, {
        query: query.substring(0, 100),
        searchType,
        resultsCount: vectorResults.length,
        rerankingEnabled: isRerankingEnabled,
        component: 'SearchService',
      })
      return vectorResults.map((result) => ({
        content: result.content,
        score: result.score,
        metadata: result.metadata,
        chunkIndex: result.chunkIndex,
        searchType: searchType,
        vectorScore: result.score,
        keywordScore: result.keywordScore,
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

      // Convert reranking results to search results with rerank information
      return rerankingResults.map((result) => ({
        content: result.content,
        score: result.score, // Use final combined score (rerank score)
        metadata: result.metadata,
        chunkIndex: result.chunkIndex,
        searchType: searchType,
        rerankingScore: result.rerankScore,
        vectorScore: result.vectorScore,
      }))
    } catch (error) {
      logger.error(
        '❌ Stage 2 (Reranking) failed, falling back to vector search results',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'SearchService' }
      )

      // Fallback to search results (no rerank scores)
      return vectorResults.slice(0, options.topK || 10).map((result) => ({
        content: result.content,
        score: result.score,
        metadata: result.metadata,
        chunkIndex: result.chunkIndex,
        searchType: searchType,
        vectorScore: result.score,
        keywordScore: result.keywordScore,
      }))
    }
  }
}
