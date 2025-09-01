/**
 * Search Service - Simplified RAG Search
 * Direct implementation with semantic and hybrid search capabilities
 */

import { ISearchService, SearchOptions, SearchResult } from '@/domains/rag/core/types.js'
import { LanceDBProvider } from '../../integrations/vectorstores/providers/lancedb/index.js'
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
            'Search failed',
            query.substring(0, 100),
            'semantic',
            error instanceof Error ? error : new Error(String(error))
          )

      logger.error('❌ Search failed', searchError)
      endTiming()
      errorMonitor.recordError(searchError)
      throw searchError
    }
  }

  private async performSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const searchType = options.searchType || 'semantic'
    
    switch (searchType) {
      case 'semantic':
        return this.performSemanticSearch(query, options)
      case 'hybrid':
        return this.performHybridSearch(query, options)
      case 'keyword':
        return this.performKeywordSearch(query, options)
      default:
        return this.performSemanticSearch(query, options)
    }
  }

  private async performSemanticSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const vectorResults = await this.vectorStore.search(query, {
      topK: options.topK || 10,
      scoreThreshold: options.scoreThreshold,
    })

    return vectorResults.map(result => ({
      content: result.content,
      score: result.score || 0,
      semanticScore: result.score || 0,
      metadata: result.metadata,
      chunkIndex: result.chunkIndex || result.metadata?.chunkIndex || 0,
    }))
  }

  private async performKeywordSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Get more results for keyword filtering
    const vectorResults = await this.vectorStore.search(query, {
      topK: (options.topK || 10) * 2,
      scoreThreshold: 0.1,
    })

    const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2)
    
    return vectorResults
      .map(result => {
        const content = result.content.toLowerCase()
        let keywordScore = 0
        let matchCount = 0

        keywords.forEach(keyword => {
          const matches = (content.match(new RegExp(keyword, 'g')) || []).length
          if (matches > 0) {
            keywordScore += matches * 0.1
            matchCount++
          }
        })

        const finalScore = matchCount > 0 ? Math.min(keywordScore, 1.0) : (result.score || 0) * 0.3

        return {
          content: result.content,
          score: finalScore,
          keywordScore: keywordScore,
          metadata: result.metadata,
          chunkIndex: result.metadata?.chunkIndex || 0,
        }
      })
      .filter(result => result.score > (options.scoreThreshold || 0.1))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK || 10)
  }

  private async performHybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const [semanticResults, keywordResults] = await Promise.all([
      this.performSemanticSearch(query, { ...options, topK: (options.topK || 10) }),
      this.performKeywordSearch(query, { ...options, topK: (options.topK || 10) })
    ])

    // Combine results using semantic weight
    const semanticWeight = options.semanticWeight || 0.7
    const keywordWeight = 1.0 - semanticWeight
    
    const combinedMap = new Map<string, SearchResult>()

    // Add semantic results
    semanticResults.forEach(result => {
      const key = `${result.metadata.fileName || 'unknown'}_${result.chunkIndex}`
      combinedMap.set(key, {
        ...result,
        score: (result.score || 0) * semanticWeight,
        hybridScore: (result.score || 0) * semanticWeight,
      })
    })

    // Add keyword results
    keywordResults.forEach(result => {
      const key = `${result.metadata.fileName || 'unknown'}_${result.chunkIndex}`
      const existing = combinedMap.get(key)
      
      if (existing) {
        existing.hybridScore = (existing.hybridScore || 0) + (result.score || 0) * keywordWeight
        existing.score = Math.max(existing.score, existing.hybridScore)
        existing.keywordScore = result.keywordScore
      } else {
        combinedMap.set(key, {
          ...result,
          score: (result.score || 0) * keywordWeight,
          hybridScore: (result.score || 0) * keywordWeight,
        })
      }
    })

    return Array.from(combinedMap.values())
      .sort((a, b) => (b.hybridScore || b.score) - (a.hybridScore || a.score))
      .slice(0, options.topK || 10)
  }
}
