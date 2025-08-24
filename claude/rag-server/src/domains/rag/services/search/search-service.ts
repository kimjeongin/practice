/**
 * Search Service - Pipeline-based RAG System
 * Implements semantic search, hybrid search, and query processing
 */

import {
  ISearchService,
  SearchOptions,
  SearchResult,
  IVectorStoreService,
} from '@/shared/types/interfaces.js'
import { IFileRepository } from '../../repositories/document.js'
import { IChunkRepository } from '../../repositories/chunk.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { VectorStoreProvider } from '../../integrations/vectorstores/adapter.js'
import { SearchError, VectorStoreError, ErrorCode } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { withTimeout, withRetry, CircuitBreakerManager } from '@/shared/utils/resilience.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'

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

  constructor(
    private vectorStore: VectorStoreProvider,
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private config: ServerConfig
  ) {
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
      logger.debug('Starting advanced search', {
        query: query.substring(0, 100),
        searchType,
        options: {
          useSemanticSearch: options.useSemanticSearch,
          useHybridSearch: options.useHybridSearch,
          topK: options.topK,
        },
      })

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

      logger.info('Advanced search completed', {
        originalQuery: query.substring(0, 100),
        processedQueries: processedQuery.processed.length,
        rawResultCount: rawResults.length,
        finalResultCount: finalResults.length,
        searchType,
      })

      return finalResults
    } catch (error) {
      const searchError = new SearchError(
        `Advanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query,
        searchType,
        error instanceof Error ? error : undefined
      )

      errorMonitor.recordError(searchError)
      logger.error('Advanced search failed, attempting fallback', searchError)

      // Fallback to simple search
      return await this.fallbackSearch(query, options)
    } finally {
      endTiming()
    }
  }

  private async processQuery(query: string, options: SearchOptions): Promise<ProcessedQuery> {
    const endTiming = startTiming('query_processing', {
      component: 'SearchService',
    })

    try {
      // Use the best available query processing pipeline
      const pipelineName = this.selectQueryPipeline(options)
      const pipeline = this.queryPipelines.get(pipelineName)

      if (!pipeline) {
        // Fallback to basic processing
        return this.basicQueryProcessing(query)
      }

      const processed = await pipeline.process(query, options)

      logger.debug('Query processed', {
        original: query,
        processed: processed.processed,
        intent: processed.intent.type,
        complexity: processed.metadata.complexity,
      })

      return processed
    } catch (error) {
      logger.warn('Query processing failed, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return this.basicQueryProcessing(query)
    } finally {
      endTiming()
    }
  }

  private async executeSearch(
    processedQuery: ProcessedQuery,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const endTiming = startTiming('search_execution', {
      component: 'SearchService',
      queryCount: processedQuery.processed.length,
    })

    try {
      const searchPromises: Promise<SearchResult[]>[] = []

      // Execute searches for each processed query
      for (const query of processedQuery.processed) {
        if (options.useHybridSearch && this.config.search.enableHybridSearch) {
          searchPromises.push(this.executeHybridSearch(query, options))
        } else if (options.useSemanticSearch !== false) {
          searchPromises.push(this.executeSemanticSearch(query, options))
        } else {
          searchPromises.push(this.executeKeywordSearch(query, options))
        }
      }

      // Execute all searches in parallel
      const allResults = await Promise.allSettled(searchPromises)

      // Combine successful results
      const combinedResults = allResults
        .filter(
          (result): result is PromiseFulfilledResult<SearchResult[]> =>
            result.status === 'fulfilled'
        )
        .flatMap((result) => result.value)

      return combinedResults
    } catch (error) {
      logger.error(
        'Search execution failed',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    } finally {
      endTiming()
    }
  }

  private async executeSemanticSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const searchOptions = {
      topK: Math.max(options.topK || 10, 20),
      scoreThreshold: options.scoreThreshold,
      filter: this.createVectorFilter(options),
    }

    const vectorResults = await withRetry(
      async () => {
        return await withTimeout(this.vectorStore.search(query, searchOptions), {
          timeoutMs: 30000,
          operation: 'semantic_search',
        })
      },
      'semantic_search_with_retry',
      { retries: 2, minTimeout: 1000 }
    )

    // Convert to standard SearchResult format
    return vectorResults.map((result: any) => ({
      content: result.content,
      score: result.score,
      semanticScore: result.score,
      metadata: result.metadata,
      chunkIndex: result.metadata.chunkIndex,
    }))
  }

  private async executeKeywordSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const endTiming = startTiming('keyword_search', {
      query: query.substring(0, 50),
      topK: options.topK,
      component: 'SearchService',
    })

    try {
      let files = await this.fileRepository.getAllFiles()

      // Apply file type filters
      if (options.fileTypes && options.fileTypes.length > 0) {
        files = files.filter((file) => options.fileTypes!.includes(file.fileType.toLowerCase()))
      }

      const results: SearchResult[] = []
      const searchQuery = query.toLowerCase()

      // Enhanced keyword search with better scoring
      for (const file of files.slice(0, (options.topK || 10) * 3)) {
        try {
          const chunks = await this.chunkRepository.getDocumentChunks(file.id)

          for (const chunk of chunks) {
            const content = chunk.content.toLowerCase()

            if (content.includes(searchQuery)) {
              const score = this.calculateKeywordScore(content, searchQuery)

              results.push({
                content: chunk.content,
                score,
                keywordScore: score,
                metadata: {
                  fileId: file.id,
                  fileName: file.name,
                  filePath: file.path,
                  fileType: file.fileType,
                  createdAt: file.createdAt.toISOString(),
                  embeddingId: chunk.embeddingId,
                  chunkIndex: chunk.chunkIndex,
                },
                chunkIndex: chunk.chunkIndex,
              })
            }
          }
        } catch (error) {
          logger.warn('Error processing file in keyword search', {
            fileId: file.id,
            fileName: file.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Sort and limit results
      results.sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0))
      return results.slice(0, options.topK || 10)
    } finally {
      endTiming()
    }
  }

  private async executeHybridSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const semanticWeight = options.semanticWeight || this.config.search.semanticWeight
    const keywordWeight = 1 - semanticWeight

    // Execute both searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      this.executeSemanticSearch(query, { ...options, topK: (options.topK || 10) * 2 }),
      this.executeKeywordSearch(query, { ...options, topK: (options.topK || 10) * 2 }),
    ])

    // Hybrid result fusion with improved scoring
    return this.fuseHybridResults(
      semanticResults,
      keywordResults,
      semanticWeight,
      keywordWeight,
      options.topK || 10
    )
  }

  private async fuseResults(
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // If no fusion needed, return as-is
    if (results.length === 0) return results

    // Remove duplicates based on embedding ID or content similarity
    const uniqueResults = this.deduplicateResults(results)

    // Sort by score
    uniqueResults.sort((a, b) => b.score - a.score)

    return uniqueResults.slice(0, options.topK || 10)
  }

  private async rerankResults(
    query: string,
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    if (!this.config.search.rerankingEnabled || results.length <= 1) {
      return results
    }

    const endTiming = startTiming('result_reranking', {
      component: 'SearchService',
      resultCount: results.length,
    })

    try {
      // Select reranking pipeline
      const pipelineName = this.selectRerankingPipeline(options)
      const pipeline = this.rerankingPipelines.get(pipelineName)

      if (!pipeline) {
        logger.debug('No reranking pipeline available, skipping reranking')
        return results
      }

      const rerankedResults = await pipeline.rerank(query, results, {
        maxResults: options.topK || 10,
      })

      logger.debug('Results reranked', {
        originalCount: results.length,
        rerankedCount: rerankedResults.length,
        pipeline: pipelineName,
      })

      return rerankedResults
    } catch (error) {
      logger.warn('Reranking failed, returning original results', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return results
    } finally {
      endTiming()
    }
  }

  private async postProcessResults(
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Apply final filters and transformations
    let processedResults = results

    // Apply score threshold
    if (options.scoreThreshold) {
      processedResults = processedResults.filter(
        (result) => result.score >= options.scoreThreshold!
      )
    }

    // Add contextual information
    processedResults = await this.enrichResults(processedResults)

    return processedResults
  }

  private async fallbackSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    logger.info('Executing fallback search')

    try {
      // Simple keyword search as last resort
      return await this.executeKeywordSearch(query, {
        ...options,
        topK: Math.min(options.topK || 5, 5), // Limit to 5 results for fallback
      })
    } catch (error) {
      logger.error(
        'Fallback search also failed',
        error instanceof Error ? error : new Error(String(error))
      )
      return [] // Return empty results rather than throwing
    }
  }

  // Helper methods
  private determineSearchStrategy(options: SearchOptions): 'semantic' | 'keyword' | 'hybrid' {
    if (options.useHybridSearch && this.config.search.enableHybridSearch) {
      return 'hybrid'
    } else if (
      options.useSemanticSearch !== false &&
      this.vectorStore.capabilities?.supportsMetadataFiltering
    ) {
      return 'semantic'
    } else {
      return 'keyword'
    }
  }

  private selectQueryPipeline(options: SearchOptions): string {
    // Select based on query complexity and available features
    if (this.config.search.enableQueryRewriting && this.queryPipelines.has('advanced')) {
      return 'advanced'
    }
    return 'basic'
  }

  private selectRerankingPipeline(options: SearchOptions): string {
    if (this.rerankingPipelines.has('cross-encoder')) {
      return 'cross-encoder'
    }
    return 'similarity-based'
  }

  private basicQueryProcessing(query: string): ProcessedQuery {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)

    return {
      original: query,
      processed: [query],
      intent: {
        type: 'factual',
        confidence: 0.5,
      },
      metadata: {
        complexity: 'simple',
        categories: [],
        keywords: words,
      },
    }
  }

  private createVectorFilter(options: SearchOptions): any {
    const filter: any = {}

    if (options.fileTypes && options.fileTypes.length > 0) {
      filter.fileTypes = options.fileTypes
    }

    if (options.metadataFilters) {
      filter.metadata = options.metadataFilters
    }

    return filter
  }

  private calculateKeywordScore(content: string, query: string): number {
    const words = content.split(/\s+/)
    const queryWords = query.split(/\s+/)

    let matches = 0
    let totalMatches = 0

    for (const queryWord of queryWords) {
      const wordMatches = content.split(queryWord).length - 1
      if (wordMatches > 0) {
        matches++
        totalMatches += wordMatches
      }
    }

    // Combine match ratio and frequency
    const matchRatio = matches / queryWords.length
    const frequency = totalMatches / words.length

    return matchRatio * 0.7 + frequency * 0.3
  }

  private fuseHybridResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    semanticWeight: number,
    keywordWeight: number,
    topK: number
  ): SearchResult[] {
    const combined = new Map<string, SearchResult>()

    // Add semantic results
    for (const result of semanticResults) {
      const key = result.metadata.embeddingId || `${result.metadata.fileId}_${result.chunkIndex}`
      combined.set(key, {
        ...result,
        score: (result.semanticScore || result.score) * semanticWeight,
        hybridScore: (result.semanticScore || result.score) * semanticWeight,
      })
    }

    // Merge with keyword results
    for (const result of keywordResults) {
      const key = result.metadata.embeddingId || `${result.metadata.fileId}_${result.chunkIndex}`
      const existing = combined.get(key)

      if (existing) {
        // Combine scores
        const combinedScore =
          existing.hybridScore! + (result.keywordScore || result.score) * keywordWeight
        existing.score = combinedScore
        existing.hybridScore = combinedScore
        existing.keywordScore = result.keywordScore
      } else {
        // Keyword-only result
        combined.set(key, {
          ...result,
          score: (result.keywordScore || result.score) * keywordWeight,
          semanticScore: 0,
          hybridScore: (result.keywordScore || result.score) * keywordWeight,
        })
      }
    }

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>()
    return results.filter((result) => {
      const key = result.metadata.embeddingId || `${result.metadata.fileId}_${result.chunkIndex}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  private async enrichResults(results: SearchResult[]): Promise<SearchResult[]> {
    // Add context and metadata enrichment
    return results.map((result) => ({
      ...result,
      metadata: {
        ...result.metadata,
        searchTimestamp: new Date().toISOString(),
        relevanceContext: this.calculateRelevanceContext(result),
      },
    }))
  }

  private calculateRelevanceContext(result: SearchResult): string {
    // Simple relevance context calculation
    if (result.score > 0.8) return 'high'
    if (result.score > 0.5) return 'medium'
    return 'low'
  }

  private initializePipelines(): void {
    // Initialize basic pipelines
    this.queryPipelines.set('basic', new BasicQueryPipeline())
    this.searchPipelines.set('semantic', new SemanticSearchPipeline(this.vectorStore))
    this.searchPipelines.set(
      'keyword',
      new KeywordSearchPipeline(this.fileRepository, this.chunkRepository)
    )
    this.rerankingPipelines.set('similarity-based', new SimilarityRerankingPipeline())

    logger.debug('Search pipelines initialized', {
      queryPipelines: Array.from(this.queryPipelines.keys()),
      searchPipelines: Array.from(this.searchPipelines.keys()),
      rerankingPipelines: Array.from(this.rerankingPipelines.keys()),
    })
  }
}

// Basic pipeline implementations
class BasicQueryPipeline implements QueryProcessingPipeline {
  name = 'basic'

  async process(query: string, options?: SearchOptions): Promise<ProcessedQuery> {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)

    return {
      original: query,
      processed: [query],
      intent: {
        type: 'factual',
        confidence: 0.7,
      },
      metadata: {
        complexity: 'simple',
        categories: [],
        keywords: words,
      },
    }
  }
}

class SemanticSearchPipeline implements SearchPipeline {
  name = 'semantic'

  constructor(private vectorStore: VectorStoreProvider) {}

  async execute(query: ProcessedQuery, options?: SearchOptions): Promise<SearchResult[]> {
    // Implementation would go here
    return []
  }
}

class KeywordSearchPipeline implements SearchPipeline {
  name = 'keyword'

  constructor(private fileRepository: IFileRepository, private chunkRepository: IChunkRepository) {}

  async execute(query: ProcessedQuery, options?: SearchOptions): Promise<SearchResult[]> {
    // Implementation would go here
    return []
  }
}

class SimilarityRerankingPipeline implements RerankingPipeline {
  name = 'similarity-based'

  async rerank(query: string, results: SearchResult[], options?: any): Promise<SearchResult[]> {
    // Simple reranking based on content similarity
    return results.sort((a, b) => {
      const scoreA = this.calculateSimilarity(query, a.content)
      const scoreB = this.calculateSimilarity(query, b.content)
      return scoreB - scoreA
    })
  }

  private calculateSimilarity(query: string, content: string): number {
    // Very basic similarity calculation
    const queryWords = query.toLowerCase().split(/\s+/)
    const contentWords = content.toLowerCase().split(/\s+/)

    let commonWords = 0
    for (const word of queryWords) {
      if (contentWords.includes(word)) {
        commonWords++
      }
    }

    return commonWords / queryWords.length
  }
}
