/**
 * Search Service - Pipeline-based RAG System (VectorStore-only)
 * Implements semantic search, hybrid search, and query processing without database dependencies
 */

import { ISearchService, SearchOptions, SearchResult } from '@/domains/rag/core/types.js'
import { VectorStoreProvider } from '../../integrations/vectorstores/adapter.js'
import { SearchError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'

export interface QueryProcessingPipeline {
  name: string
  process(query: string, options?: SearchOptions): Promise<ProcessedQuery>
}

export interface ProcessedQuery {
  original: string
  processed: string[]
  intent: QueryIntent
  metadata: {
    complexity: 'simple' | 'medium' | 'complex'
    categories: string[]
    keywords: string[]
    entities?: string[]
  }
}

export interface QueryIntent {
  type: 'factual' | 'comparison' | 'procedural' | 'analytical' | 'creative'
  confidence: number
  subqueries?: string[]
}

export interface SearchPipeline {
  name: string
  execute(query: ProcessedQuery, options?: SearchOptions): Promise<SearchResult[]>
}

export interface RerankingPipeline {
  name: string
  rerank(query: string, results: SearchResult[], options?: any): Promise<SearchResult[]>
}

export class SearchService implements ISearchService {
  private queryPipelines = new Map<string, QueryProcessingPipeline>()
  private searchPipelines = new Map<string, SearchPipeline>()
  private rerankingPipelines = new Map<string, RerankingPipeline>()

  constructor(private vectorStore: VectorStoreProvider) {
    this.initializePipelines()
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const searchType = this.determineSearchStrategy(options)
    const endTiming = startTiming('advanced_search', {
      query: query.substring(0, 50),
      searchType,
      component: 'SearchService',
    })

    try {
      // 전체 검색 파이프라인에 timeout 적용
      const searchTimeout = parseInt(process.env.SEARCH_PIPELINE_TIMEOUT_MS || '60000') // 60초

      logger.info('🚀 Starting advanced search with timeout', {
        query: query.substring(0, 100),
        searchType,
        timeout: searchTimeout,
        options: {
          searchType: options.searchType,
          topK: options.topK,
        },
        component: 'SearchService',
      })

      const searchResults = await TimeoutWrapper.withTimeout(
        this.executeSearchPipeline(query, options),
        {
          timeoutMs: searchTimeout,
          operation: 'search_pipeline',
        }
      )

      logger.info('✅ Advanced search completed successfully', {
        originalQuery: query.substring(0, 100),
        resultsCount: searchResults.length,
        searchType,
        component: 'SearchService',
      })

      endTiming()
      return searchResults
    } catch (error) {
      const searchError =
        error instanceof SearchError
          ? error
          : new SearchError(
              'Advanced search pipeline failed',
              query.substring(0, 100),
              'hybrid',
              error instanceof Error ? error : new Error(String(error))
            )

      logger.error('Advanced search failed', searchError)
      endTiming()
      errorMonitor.recordError(searchError)

      throw searchError
    }
  }

  private async executeSearchPipeline(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Step 1: Query Processing Pipeline
    const processedQuery = await this.processQuery(query, options)

    // Step 2: Search Pipeline Selection and Execution
    const rawResults = await this.executeSearch(processedQuery, options)

    // Step 3: Result Fusion (if multiple search strategies)
    const fusedResults = await this.fuseResults(rawResults, options)

    // Step 4: Reranking Pipeline (if enabled)
    const rerankedResults = await this.rerankResults(query, fusedResults, options)

    // Step 5: Post-processing and Filtering
    const finalResults = await this.postProcessResults(rerankedResults, options)

    return finalResults
  }

  private async processQuery(query: string, options: SearchOptions): Promise<ProcessedQuery> {
    // Use basic query pipeline as default
    const pipeline = this.queryPipelines.get('basic') || this.createBasicQueryPipeline()
    return await pipeline.process(query, options)
  }

  private async executeSearch(
    processedQuery: ProcessedQuery,
    options: SearchOptions
  ): Promise<SearchResult[][]> {
    const searchStrategies = this.determineSearchStrategies(options)
    const searchPromises: Promise<SearchResult[]>[] = []

    for (const strategyName of searchStrategies) {
      const pipeline = this.searchPipelines.get(strategyName)
      if (pipeline) {
        const pipelineResult = pipeline.execute(processedQuery, options)
        if (pipelineResult) {
          searchPromises.push(pipelineResult)
        }
      }
    }

    return await Promise.all(searchPromises)
  }

  private async fuseResults(
    resultSets: SearchResult[][],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    if (resultSets.length === 0) {
      return []
    }
    if (resultSets.length === 1) {
      return resultSets[0] || []
    }

    // Implement result fusion using weighted scoring
    const fusedMap = new Map<string, SearchResult>()
    const weights = this.getStrategyWeights(options)

    resultSets.forEach((results, strategyIndex) => {
      const weight = weights[strategyIndex] || 1.0

      results.forEach((result) => {
        const key = `${result.metadata.fileName || 'unknown'}_${result.chunkIndex}`
        const existing = fusedMap.get(key)

        if (existing) {
          // Combine scores with weights
          existing.score = Math.max(existing.score, result.score * weight)
          existing.hybridScore = (existing.hybridScore || 0) + result.score * weight
        } else {
          fusedMap.set(key, {
            ...result,
            score: result.score * weight,
            hybridScore: result.score * weight,
          })
        }
      })
    })

    // Sort by hybrid score and return top results
    const fusedResults = Array.from(fusedMap.values())
      .sort((a, b) => (b.hybridScore || b.score) - (a.hybridScore || a.score))
      .slice(0, options.topK || 10)

    return fusedResults
  }

  private async rerankResults(
    query: string,
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Reranking disabled for now - config doesn't have search.rerankingEnabled
    if (results.length <= 1) {
      return results
    }

    // Use basic reranking pipeline
    const pipeline = this.rerankingPipelines.get('basic')
    if (pipeline) {
      return await pipeline.rerank(query, results, options)
    }

    return results
  }

  private async postProcessResults(
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    let processedResults = [...results]

    // Apply score threshold
    if (options.scoreThreshold !== undefined) {
      processedResults = processedResults.filter((r) => r.score >= options.scoreThreshold!)
    }

    // Apply file type filters
    if (options.fileTypes && options.fileTypes.length > 0) {
      processedResults = processedResults.filter((r) => {
        const fileType = r.metadata.fileType || 'unknown'
        return options.fileTypes!.includes(fileType)
      })
    }

    // Apply metadata filters
    if (options.metadataFilters) {
      processedResults = processedResults.filter((r) => {
        return Object.entries(options.metadataFilters!).every(([key, value]) => {
          return r.metadata[key] === value
        })
      })
    }

    // Limit results
    const limit = options.topK || 10
    return processedResults.slice(0, limit)
  }

  private determineSearchStrategy(options: SearchOptions): string {
    return options.searchType || 'semantic'
  }

  private determineSearchStrategies(options: SearchOptions): string[] {
    const searchType = options.searchType || 'semantic'
    switch (searchType) {
      case 'hybrid':
        return ['semantic', 'fulltext']
      case 'semantic':
        return ['semantic']
      case 'fulltext':
        return ['fulltext']
      default:
        return ['semantic'] // Default to semantic search
    }
  }

  private getStrategyWeights(options: SearchOptions): number[] {
    const searchType = options.searchType || 'semantic'
    if (searchType === 'hybrid') {
      const semanticWeight = options.semanticWeight || 0.7
      return [semanticWeight, 1.0 - semanticWeight]
    }
    return [1.0]
  }

  private initializePipelines(): void {
    // Initialize query processing pipelines
    this.queryPipelines.set('basic', this.createBasicQueryPipeline())

    // Initialize search pipelines
    this.searchPipelines.set('semantic', this.createSemanticSearchPipeline())
    this.searchPipelines.set('fulltext', this.createFullTextSearchPipeline())

    // Initialize reranking pipelines
    this.rerankingPipelines.set('basic', this.createBasicRerankingPipeline())
  }

  private createBasicQueryPipeline(): QueryProcessingPipeline {
    return {
      name: 'basic',
      async process(query: string, _options?: SearchOptions): Promise<ProcessedQuery> {
        // Basic query processing
        const processed = [query.toLowerCase().trim()]
        const keywords = query
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 2)

        return {
          original: query,
          processed,
          intent: {
            type: 'factual',
            confidence: 0.8,
          },
          metadata: {
            complexity: 'simple',
            categories: [],
            keywords,
          },
        }
      },
    }
  }

  private createSemanticSearchPipeline(): SearchPipeline {
    return {
      name: 'semantic',
      execute: async (query: ProcessedQuery, options?: SearchOptions): Promise<SearchResult[]> => {
        const vectorSearchOptions = {
          topK: options?.topK || 10,
          scoreThreshold: options?.scoreThreshold,
          fileTypes: options?.fileTypes,
          metadataFilters: options?.metadataFilters,
        }

        const vectorResults = await this.vectorStore.search(query.original, vectorSearchOptions)

        return vectorResults.map(
          (result): SearchResult => ({
            content: result.content,
            score: result.score,
            semanticScore: result.score,
            metadata: result.metadata,
            chunkIndex: result.metadata?.chunkIndex || 0,
          })
        )
      },
    }
  }

  private createFullTextSearchPipeline(): SearchPipeline {
    return {
      name: 'fulltext',
      execute: async (query: ProcessedQuery, options?: SearchOptions): Promise<SearchResult[]> => {
        // For VectorStore-only architecture, we'll simulate fulltext search
        // by using keyword matching in the semantic search results
        const vectorSearchOptions = {
          topK: (options?.topK || 10) * 2, // Get more results for filtering
          scoreThreshold: 0.1, // Lower threshold for keyword matching
          fileTypes: options?.fileTypes,
          metadataFilters: options?.metadataFilters,
        }

        const vectorResults = await this.vectorStore.search(query.original, vectorSearchOptions)
        const keywords = query.metadata.keywords

        // Score results based on keyword matches
        const keywordResults = vectorResults
          .map((result): SearchResult => {
            const content = result.content.toLowerCase()
            let keywordScore = 0
            let matchCount = 0

            keywords.forEach((keyword) => {
              const matches = (content.match(new RegExp(keyword, 'g')) || []).length
              if (matches > 0) {
                keywordScore += matches * 0.1
                matchCount++
              }
            })

            // Boost score based on keyword matches
            const finalScore = matchCount > 0 ? Math.min(keywordScore, 1.0) : result.score * 0.3

            return {
              content: result.content,
              score: finalScore,
              keywordScore: keywordScore,
              metadata: result.metadata,
              chunkIndex: result.metadata?.chunkIndex || 0,
            }
          })
          .filter((result) => result.score > (options?.scoreThreshold || 0.1))
          .sort((a, b) => b.score - a.score)
          .slice(0, options?.topK || 10)

        return keywordResults
      },
    }
  }

  private createBasicRerankingPipeline(): RerankingPipeline {
    return {
      name: 'basic',
      async rerank(
        query: string,
        results: SearchResult[],
        _options?: any
      ): Promise<SearchResult[]> {
        // Simple reranking based on content length and keyword density
        const queryWords = query.toLowerCase().split(/\s+/)

        return results
          .map((result) => {
            const content = result.content.toLowerCase()
            let rerankScore = result.score

            // Boost shorter, more relevant content
            if (content.length < 500) {
              rerankScore *= 1.1
            } else if (content.length > 2000) {
              rerankScore *= 0.9
            }

            // Boost results with query words in prominent positions
            const firstSentence = content.split('.')[0] || content.substring(0, 100)
            const hasQueryWordsInStart = queryWords.some(
              (word) => word.length > 2 && firstSentence.includes(word)
            )

            if (hasQueryWordsInStart) {
              rerankScore *= 1.15
            }

            return {
              ...result,
              score: Math.min(rerankScore, 1.0),
            }
          })
          .sort((a, b) => b.score - a.score)
      },
    }
  }
}
