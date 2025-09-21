/**
 * Reranking Service - Pure Document Reranking
 * Applies LLM-based reranking to improve document relevance ordering
 */

import type { 
  SearchResult, 
  RerankingOptions,
  RerankingResult
} from '@/domains/rag/core/types.js'
import { OllamaRerankingService } from '@/domains/rag/ollama/reranking.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'

export interface RerankingServiceOptions {
  enableLLMReranking?: boolean
  llmModel?: string
  rerankingTimeout?: number
}

export class RerankingService {
  private ollamaRerankingService: OllamaRerankingService
  private enableLLMReranking: boolean
  private llmModel: string
  private rerankingTimeout: number

  constructor(
    config: ServerConfig,
    options: RerankingServiceOptions = {}
  ) {
    this.ollamaRerankingService = new OllamaRerankingService(config)
    this.enableLLMReranking = options.enableLLMReranking ?? config.enableLLMReranking
    this.llmModel = options.llmModel || config.llmRerankingModel
    this.rerankingTimeout = options.rerankingTimeout || config.llmRerankingTimeout

    logger.info('🎯 Reranking Service initialized', {
      enableLLMReranking: this.enableLLMReranking,
      llmModel: this.llmModel,
      rerankingTimeout: this.rerankingTimeout,
      component: 'RerankingService',
    })
  }

  async initialize(): Promise<void> {
    if (this.enableLLMReranking) {
      await this.ollamaRerankingService.initialize()
      logger.info('✅ Reranking Service LLM initialized', {
        component: 'RerankingService',
      })
    }
  }

  /**
   * Rerank documents using LLM-based relevance evaluation
   * Takes a list of search results and reorders them by relevance to the query
   */
  async rerankDocuments(
    query: string, 
    documents: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    const endTiming = startTiming('document_reranking', {
      query: query.substring(0, 50),
      documentCount: documents.length,
      topK,
      enableLLMReranking: this.enableLLMReranking,
      component: 'RerankingService',
    })

    try {
      if (!this.enableLLMReranking || documents.length <= 1) {
        logger.info('🔄 LLM reranking disabled or insufficient documents, returning original order', {
          enableLLMReranking: this.enableLLMReranking,
          documentCount: documents.length,
          component: 'RerankingService',
        })
        return documents.slice(0, topK)
      }

      logger.info('🤖 Starting document reranking', {
        query: query.substring(0, 100),
        documentCount: documents.length,
        topK,
        model: this.llmModel,
        component: 'RerankingService',
      })

      // Apply LLM reranking
      const rerankingResults = await this.applyLLMReranking(query, documents, topK)
      const finalResults = this.convertRerankingResultsToSearchResults(rerankingResults)

      logger.info('✅ Document reranking completed', {
        query: query.substring(0, 100),
        originalCount: documents.length,
        rerankedCount: finalResults.length,
        topScore: finalResults[0]?.score || 0,
        component: 'RerankingService',
      })

      return finalResults
    } catch (error) {
      const structuredError = new StructuredError(
        'Document reranking failed',
        ErrorCode.LLM_ERROR,
        'HIGH',
        {
          query: query.substring(0, 100),
          documentCount: documents.length,
          topK,
        },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      logger.error('❌ Document reranking failed', structuredError)
      throw structuredError
    } finally {
      endTiming()
    }
  }

  /**
   * Apply LLM-based reranking to the documents
   */
  private async applyLLMReranking(
    query: string,
    documents: SearchResult[],
    topK: number
  ): Promise<RerankingResult[]> {
    if (!this.enableLLMReranking) {
      throw new Error('LLM reranking is disabled')
    }

    const endTiming = startTiming('llm_reranking_application', {
      query: query.substring(0, 50),
      documentCount: documents.length,
      topK,
      component: 'RerankingService',
    })

    try {
      logger.info('🤖 Applying LLM reranking', {
        query: query.substring(0, 100),
        documentCount: documents.length,
        topK,
        model: this.llmModel,
        component: 'RerankingService',
      })

      const rerankingOptions: RerankingOptions = {
        query,
        documents,
        topK,
        model: this.llmModel,
        temperature: 0.1,
        maxTokens: 2000,
      }

      const rerankingResults = await TimeoutWrapper.withTimeout(
        this.ollamaRerankingService.rerankDocuments(rerankingOptions),
        {
          timeoutMs: this.rerankingTimeout,
          operation: 'llm_reranking',
        }
      )

      logger.info('✅ LLM reranking applied successfully', {
        query: query.substring(0, 100),
        originalCount: documents.length,
        rerankedCount: rerankingResults.length,
        topFinalScore: rerankingResults[0]?.finalScore || 0,
        component: 'RerankingService',
      })

      return rerankingResults
    } catch (error) {
      logger.error('❌ LLM reranking failed',
        error instanceof Error ? error : new Error(String(error)), {
        query: query.substring(0, 100),
        documentCount: documents.length,
        component: 'RerankingService',
      })

      // Re-throw the error instead of providing fallback
      throw error
    } finally {
      endTiming()
    }
  }

  /**
   * Convert RerankingResult to SearchResult for compatibility
   */
  private convertRerankingResultsToSearchResults(
    rerankingResults: RerankingResult[]
  ): SearchResult[] {
    return rerankingResults.map(result => ({
      id: result.id,
      content: result.content,
      score: result.finalScore, // Use final score as the search score
      metadata: result.metadata,
      chunkIndex: result.chunkIndex,
      searchType: result.searchType,
    }))
  }

  /**
   * Get reranking service health status
   */
  isHealthy(): boolean {
    return !this.enableLLMReranking || this.ollamaRerankingService.isHealthy()
  }

  /**
   * Get reranking service configuration info
   */
  getServiceInfo(): {
    enableLLMReranking: boolean
    llmModel: string
    rerankingTimeout: number
    isHealthy: boolean
  } {
    return {
      enableLLMReranking: this.enableLLMReranking,
      llmModel: this.llmModel,
      rerankingTimeout: this.rerankingTimeout,
      isHealthy: this.isHealthy(),
    }
  }
}