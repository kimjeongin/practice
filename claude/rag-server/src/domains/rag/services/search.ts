/**
 * Search Service - Simplified RAG Search
 * Direct implementation with semantic and hybrid search capabilities
 */

import type { ISearchService } from '@/domains/rag/core/interfaces.js'
import type { SearchOptions, SearchResult } from '@/domains/rag/core/types.js'
import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import { SearchError } from '@/shared/errors/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'

export class SearchService implements ISearchService {
  constructor(private vectorStore: LanceDBProvider) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const endTiming = startTiming('search', {
      query: query.substring(0, 50),
      searchType: options.searchType || 'semantic',
      component: 'SearchService',
    })

    try {
      logger.info('🔍 Starting search', {
        query: query.substring(0, 100),
        searchType: options.searchType || 'semantic',
        topK: options.topK || 10,
        component: 'SearchService',
      })

      const searchResults = await TimeoutWrapper.withTimeout(
        this.performSearch(query, options),
        {
          timeoutMs: parseInt(process.env.SEARCH_PIPELINE_TIMEOUT_MS || '60000'),
          operation: 'search',
        }
      )

      logger.info('✅ Search completed', {
        query: query.substring(0, 100),
        resultsCount: searchResults.length,
        topScore: searchResults[0]?.score || 0,
        component: 'SearchService',
      })

      endTiming()
      return searchResults
    } catch (error) {
      const searchError = error instanceof SearchError
        ? error
        : new SearchError(
            error instanceof Error ? error.message : String(error),
            query.substring(0, 100),
            options.searchType || 'semantic',
            error instanceof Error ? error : undefined
          )

      errorMonitor.recordError(searchError)
      endTiming()
      throw searchError
    }
  }

  private async performSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Perform vector search using LanceDB
    const vectorResults = await this.vectorStore.search(query, {
      topK: options.topK || 10,
      scoreThreshold: options.scoreThreshold || 0.0,
    })

    // Convert vector search results to search results
    return vectorResults.map(result => ({
      content: result.content,
      score: result.score,
      semanticScore: result.score, // For semantic search, score is semantic score
      metadata: result.metadata,
      chunkIndex: result.chunkIndex,
    }))
  }
}