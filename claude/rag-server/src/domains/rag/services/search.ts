/**
 * Search Service - Simplified Single-Stage Search
 * Supports semantic, keyword, and hybrid search
 */

import type { ISearchService } from '@/domains/rag/core/interfaces.js'
import type {
  SearchOptions,
  SearchResult,
  VectorSearchResult,
  HybridSearchConfig,
} from '@/domains/rag/core/types.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import { SearchError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import { RerankingService } from '@/domains/rag/services/reranking.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { LanguageDetector } from '@/shared/utils/language-detector.js'
import { KoreanTokenizer } from '@/domains/rag/services/korean-tokenizer.js'

export class SearchService implements ISearchService {
  private rerankingService: RerankingService | null = null
  private hybridConfig: HybridSearchConfig
  private languageDetector: LanguageDetector
  private koreanTokenizer: KoreanTokenizer

  constructor(private vectorStore: LanceDBProvider, config: ServerConfig) {
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

    // Initialize language processing services
    this.languageDetector = new LanguageDetector()
    this.koreanTokenizer = new KoreanTokenizer()

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
        results = await this.keywordSearch(query, options)
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

  private async hybridSearch(query: string, options: SearchOptions): Promise<VectorSearchResult[]> {
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
        this.keywordSearch(query, {
          topK: keywordCount,
          searchType: 'keyword',
        }),
      ])

      logger.debug('📊 Search results retrieved', {
        semanticResultsCount: semanticResults.length,
        keywordResultsCount: keywordResults.length,
        component: 'SearchService',
      })

      // Step 2: Combine and deduplicate results with positional bias optimization
      const combinedResults = this.combineResults(
        semanticResults,
        keywordResults
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
   * Combine semantic and keyword results with positional bias optimization
   * Order: keyword-only → semantic-only → hybrid (both searches)
   * Within each group: lower scores first, higher scores last (LLM prefers later positions)
   */
  private combineResults(
    semanticResults: VectorSearchResult[],
    keywordResults: VectorSearchResult[]
  ): VectorSearchResult[] {
    const semanticMap = new Map<string, VectorSearchResult>()
    const keywordMap = new Map<string, VectorSearchResult>()

    // Build maps for easy lookup
    for (const result of semanticResults) {
      semanticMap.set(result.id, { ...result, searchType: 'semantic' })
    }

    for (const result of keywordResults) {
      keywordMap.set(result.id, { ...result, searchType: 'keyword' })
    }

    // Categorize results into three groups
    const keywordOnly: VectorSearchResult[] = []
    const semanticOnly: VectorSearchResult[] = []
    const hybrid: VectorSearchResult[] = []

    // Process keyword results
    for (const [id, result] of keywordMap) {
      if (semanticMap.has(id)) {
        // Document appears in both - use semantic score as primary
        const semanticResult = semanticMap.get(id)!
        hybrid.push({
          ...semanticResult,
          score: semanticResult.score, // Keep semantic score as primary
          searchType: 'hybrid',
        })
      } else {
        // Keyword only
        keywordOnly.push(result)
      }
    }

    // Process semantic-only results
    for (const [id, result] of semanticMap) {
      if (!keywordMap.has(id)) {
        semanticOnly.push(result)
      }
    }

    // Sort each group: lower scores first, higher scores last (for LLM positional bias)
    keywordOnly.sort((a, b) => a.score - b.score)
    semanticOnly.sort((a, b) => a.score - b.score)
    hybrid.sort((a, b) => a.score - b.score)

    // Combine in order: keyword-only → semantic-only → hybrid
    const combinedResults = [...keywordOnly, ...semanticOnly, ...hybrid]

    logger.debug('🔄 Results combined with positional bias optimization', {
      keywordOnlyCount: keywordOnly.length,
      semanticOnlyCount: semanticOnly.length,
      hybridCount: hybrid.length,
      totalCombined: combinedResults.length,
      component: 'SearchService',
    })

    return combinedResults
  }

  private async keywordSearch(
    query: string,
    options: SearchOptions
  ): Promise<VectorSearchResult[]> {
    // Detect query language to determine search strategy
    const languageResult = this.languageDetector.detectLanguage(query)
    const queryLanguage = languageResult.language

    logger.debug('🔍 Keyword search language detection', {
      query: query.substring(0, 50),
      detectedLanguage: queryLanguage,
      confidence: languageResult.confidence,
      component: 'SearchService',
    })

    if (queryLanguage === 'ko') {
      return await this.koreanKeywordSearch(query, options)
    } else {
      const results = await this.vectorStore.fullTextSearch(
        query.toLowerCase(),
        ['text'],
        options.topK
      )

      logger.debug('other language keyword search completed', {
        query: query.substring(0, 50),
        resultsCount: results.length,
        component: 'SearchService',
      })
      return results
    }
  }

  private async koreanKeywordSearch(
    query: string,
    options: SearchOptions
  ): Promise<VectorSearchResult[]> {
    // Korean keyword search: search tokenized_text only
    const tokenizedQuery = this.koreanTokenizer.tokenizeKorean(query).join(' ')

    // Search on tokenized Korean text
    const tokenizedResults = await this.vectorStore.fullTextSearch(
      tokenizedQuery.toLowerCase(),
      ['tokenized_text'],
      options.topK
    )

    logger.debug('🇰🇷 Korean keyword search completed', {
      tokenizedQuery,
      resultsCount: tokenizedResults.length,
      component: 'SearchService',
    })

    return tokenizedResults
  }
}
