/**
 * Search Service - Simplified Single-Stage Search
 * Supports semantic, keyword, and hybrid search
 */

import type { ISearchService } from '@/domains/rag/core/interfaces.js'
import type {
  SearchOptions,
  SearchResult,
  VectorSearchResult,
  HybridSearchConfig
} from '@/domains/rag/core/types.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import { SearchError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import { RerankingService } from '@/domains/rag/services/reranking.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

export class SearchService implements ISearchService {
  private rerankingService: RerankingService | null = null
  private hybridConfig: HybridSearchConfig

  constructor(
    private vectorStore: LanceDBProvider,
    private config: ServerConfig
  ) {
    // Initialize hybrid search configuration
    this.hybridConfig = {
      semanticRatio: config.hybridSemanticRatio,
      keywordRatio: config.hybridKeywordRatio,
      totalResultsForReranking: config.hybridTotalResultsForReranking,
    }

    // Initialize reranking service if enabled
    if (config.enableLLMReranking) {
      this.rerankingService = new RerankingService(config)
    }

    logger.info('✅ SearchService initialized', {
      hybridConfig: this.hybridConfig,
      enableLLMReranking: config.enableLLMReranking,
      component: 'SearchService',
    })
  }

  async initialize(): Promise<void> {
    if (this.rerankingService) {
      await this.rerankingService.initialize()
      logger.info('✅ Reranking Service initialized in SearchService', {
        component: 'SearchService',
      })
    }
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const searchType = options.searchType
    const endTiming = startTiming('search_pipeline', {
      query: query.substring(0, 50),
      searchType,
      component: 'SearchService',
    })

    try {
      logger.info('🔍 Starting search', {
        query: query.substring(0, 100),
        topK: options.topK,
        searchType,
        component: 'SearchService',
      })

      const searchResults = await TimeoutWrapper.withTimeout(this.performSearch(query, options), {
        timeoutMs: parseInt(process.env.SEARCH_PIPELINE_TIMEOUT_MS || '60000'),
        operation: 'search',
      })

      logger.info('✅ Search completed', {
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
              'semantic' as const,
              error instanceof Error ? error : undefined
            )

      errorMonitor.recordError(searchError)
      endTiming()
      throw searchError
    }
  }

  private async performSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const searchType = options.searchType

    let results: VectorSearchResult[]

    switch (searchType) {
      case 'semantic':
        results = await this.vectorStore.semanticSearch(query, options)
        break
      case 'keyword':
        results = await this.vectorStore.keywordSearch(query, options)
        break
      case 'hybrid':
        results = await this.hybridSearch(query, options)
        break
      default:
        throw new Error(`Unsupported search type: ${searchType}`)
    }

    // Convert vector search results to search results
    return results.map((result) => ({
      id: result.id,
      content: result.content,
      score: result.score,
      metadata: result.metadata,
      chunkIndex: result.chunkIndex,
      searchType: searchType,
    }))
  }

  private async hybridSearch(
    query: string,
    options: SearchOptions
  ): Promise<VectorSearchResult[]> {
    try {
      logger.debug('🔍 Starting hybrid search with configuration', {
        query: query.substring(0, 50),
        config: this.hybridConfig,
        hasReranking: !!this.rerankingService,
        component: 'SearchService',
      })

      // Step 1: Get semantic and keyword results based on configured ratios
      const semanticCount = Math.ceil(
        this.hybridConfig.totalResultsForReranking * this.hybridConfig.semanticRatio
      )
      const keywordCount = Math.ceil(
        this.hybridConfig.totalResultsForReranking * this.hybridConfig.keywordRatio
      )

      logger.debug('📊 Fetching separate search results', {
        semanticCount,
        keywordCount,
        totalForReranking: this.hybridConfig.totalResultsForReranking,
        component: 'SearchService',
      })

      // Perform searches in parallel
      const [semanticResults, keywordResults] = await Promise.all([
        this.vectorStore.semanticSearch(query, {
          topK: semanticCount,
          searchType: 'semantic',
        }),
        this.vectorStore.keywordSearch(query, {
          topK: keywordCount,
          searchType: 'keyword',
        }),
      ])

      logger.debug('📊 Search results retrieved', {
        semanticResultsCount: semanticResults.length,
        keywordResultsCount: keywordResults.length,
        component: 'SearchService',
      })

      // Step 2: Combine and deduplicate results with ratio-based scoring
      const combinedResults = this.combineResults(
        semanticResults,
        keywordResults,
        this.hybridConfig
      )

      logger.debug('🔄 Results combined and deduplicated', {
        combinedCount: combinedResults.length,
        component: 'SearchService',
      })

      // Step 3: Apply LLM reranking if service is available
      let finalResults: VectorSearchResult[]
      if (this.rerankingService && combinedResults.length > 1) {
        logger.info('🤖 Applying LLM reranking', {
          query: query.substring(0, 100),
          combinedCount: combinedResults.length,
          topK: options.topK,
          component: 'SearchService',
        })

        const rerankedResults = await this.rerankingService.rerankDocuments(
          query,
          combinedResults,
          options.topK
        )

        finalResults = rerankedResults
      } else {
        // Without reranking, just take top K from combined results
        finalResults = combinedResults.slice(0, options.topK)
      }

      logger.info('✅ Hybrid search completed', {
        query: query.substring(0, 100),
        semanticCount: semanticResults.length,
        keywordCount: keywordResults.length,
        combinedCount: combinedResults.length,
        finalCount: finalResults.length,
        topScore: finalResults[0]?.score || 0,
        hasReranking: !!this.rerankingService,
        component: 'SearchService',
      })

      return finalResults
    } catch (error) {
      logger.error(
        'Hybrid search failed, falling back to semantic search',
        error instanceof Error ? error : new Error(String(error))
      )
      // Fallback to semantic search
      return await this.vectorStore.semanticSearch(query, options)
    }
  }

  /**
   * Combine semantic and keyword results with deduplication and ratio-based scoring
   */
  private combineResults(
    semanticResults: VectorSearchResult[],
    keywordResults: VectorSearchResult[],
    config: HybridSearchConfig
  ): VectorSearchResult[] {
    const resultMap = new Map<string, VectorSearchResult>()

    // Add semantic results
    for (const result of semanticResults) {
      resultMap.set(result.id, {
        ...result,
        searchType: 'semantic',
      })
    }

    // Add keyword results, handling duplicates
    for (const result of keywordResults) {
      const existingResult = resultMap.get(result.id)

      if (existingResult) {
        // Document exists from semantic search - combine scores with ratio
        const combinedScore =
          existingResult.score * config.semanticRatio + result.score * config.keywordRatio

        resultMap.set(result.id, {
          ...existingResult,
          score: combinedScore,
          searchType: 'hybrid', // Mark as hybrid since it appeared in both
        })
      } else {
        // New document from keyword search
        resultMap.set(result.id, {
          ...result,
          searchType: 'keyword',
        })
      }
    }

    // Convert to array and sort by combined score
    const combinedResults = Array.from(resultMap.values()).sort((a, b) => b.score - a.score)

    logger.debug('🔄 Results combined with ratio-based scoring', {
      semanticOnlyCount: combinedResults.filter((r) => r.searchType === 'semantic').length,
      keywordOnlyCount: combinedResults.filter((r) => r.searchType === 'keyword').length,
      hybridCount: combinedResults.filter((r) => r.searchType === 'hybrid').length,
      totalCombined: combinedResults.length,
      semanticRatio: config.semanticRatio,
      keywordRatio: config.keywordRatio,
      component: 'SearchService',
    })

    return combinedResults
  }
}
