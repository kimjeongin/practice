/**
 * Ollama Reranking Service
 * Specialized service for document reranking using Ollama LLM models
 */

import fetch from 'node-fetch'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import type { RerankingOptions, RerankingResult, SearchResult } from '@/domains/rag/core/types.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { TimeoutWrapper } from '@/shared/utils/resilience.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'

export interface RerankingModelInfo {
  name: string
  service: string
  contextLength: number
}

export interface RerankingGenerationOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  stream?: boolean
}

export interface RerankingGenerationResponse {
  text: string
  model: string
  done: boolean
  totalDuration?: number
  loadDuration?: number
  promptEvalCount?: number
  evalCount?: number
}

export class OllamaRerankingService {
  private ollamaBaseUrl: string
  private defaultModel: string
  private isInitialized = false
  private availableModels: string[] = []

  constructor(private config: ServerConfig) {
    this.ollamaBaseUrl = config.ollamaBaseUrl
    this.defaultModel = config.llmRerankingModel || 'qwen3:4b'

    logger.info('🎯 Ollama Reranking Service initialized', {
      ollamaBaseUrl: this.ollamaBaseUrl,
      defaultModel: this.defaultModel,
      component: 'OllamaRerankingService',
    })
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    const endTiming = startTiming('ollama_reranking_initialization', {
      component: 'OllamaRerankingService',
    })

    try {
      logger.info('🔄 Initializing Ollama Reranking Service...', {
        component: 'OllamaRerankingService',
      })

      // Check if Ollama is available
      await this.checkOllamaHealth()

      // Get available models
      this.availableModels = await this.getAvailableModels()

      // Ensure default model is available
      if (!this.availableModels.includes(this.defaultModel)) {
        logger.warn(
          `⚠️ Default reranking model ${
            this.defaultModel
          } not available. Available models: ${this.availableModels.join(', ')}`,
          {
            component: 'OllamaRerankingService',
          }
        )

        // Use the first available model as fallback
        if (this.availableModels.length > 0) {
          this.defaultModel = this.availableModels[0]!
          logger.info(`🔄 Using fallback reranking model: ${this.defaultModel}`, {
            component: 'OllamaRerankingService',
          })
        }
      }

      this.isInitialized = true
      logger.info('✅ Ollama Reranking Service initialized successfully', {
        defaultModel: this.defaultModel,
        availableModels: this.availableModels,
        component: 'OllamaRerankingService',
      })
    } catch (error) {
      const structuredError = new StructuredError(
        'Failed to initialize Ollama reranking service',
        ErrorCode.INITIALIZATION_ERROR,
        'CRITICAL',
        { ollamaBaseUrl: this.ollamaBaseUrl },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      logger.error('❌ Ollama Reranking Service initialization failed', structuredError)
      throw structuredError
    } finally {
      endTiming()
    }
  }

  private async checkOllamaHealth(): Promise<void> {
    try {
      const response = await TimeoutWrapper.withTimeout(fetch(`${this.ollamaBaseUrl}/api/tags`), {
        timeoutMs: 10000,
        operation: 'ollama_health_check',
      })

      if (!response.ok) {
        throw new Error(`Ollama health check failed: ${response.status}`)
      }

      logger.debug('✅ Ollama health check passed', {
        component: 'OllamaRerankingService',
      })
    } catch (error) {
      throw new Error(
        `Failed to connect to Ollama: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async getAvailableModels(): Promise<string[]> {
    try {
      const response = await TimeoutWrapper.withTimeout(fetch(`${this.ollamaBaseUrl}/api/tags`), {
        timeoutMs: 15000,
        operation: 'get_available_models',
      })

      if (!response.ok) {
        throw new Error(`Failed to get models: ${response.status}`)
      }

      const data = (await response.json()) as { models: Array<{ name: string }> }
      const models = data.models.map((m) => m.name)

      logger.debug('📋 Available reranking models retrieved', {
        models,
        component: 'OllamaRerankingService',
      })

      return models
    } catch (error) {
      logger.warn('⚠️ Failed to get available models, using default', {
        error: error instanceof Error ? error.message : String(error),
        component: 'OllamaRerankingService',
      })
      return [this.defaultModel]
    }
  }

  async generateText(
    prompt: string,
    options: RerankingGenerationOptions = {}
  ): Promise<RerankingGenerationResponse> {
    await this.initialize()

    const endTiming = startTiming('reranking_generation', {
      model: options.model || this.defaultModel,
      promptLength: prompt.length,
      component: 'OllamaRerankingService',
    })

    try {
      const requestBody = {
        model: options.model || this.defaultModel,
        prompt,
        stream: options.stream || false,
        options: {
          temperature: options.temperature || 0.1,
          num_predict: options.maxTokens || 1000,
          top_p: options.topP || 0.9,
        },
      }

      logger.debug('🤖 Generating reranking response', {
        model: requestBody.model,
        promptLength: prompt.length,
        options: requestBody.options,
        component: 'OllamaRerankingService',
      })

      logger.debug('📝 Reranking request details', {
        model: requestBody.model,
        promptPreview: prompt.substring(0, 200) + '...',
        promptLength: prompt.length,
        component: 'OllamaRerankingService',
      })

      const response = await TimeoutWrapper.withTimeout(
        fetch(`${this.ollamaBaseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }),
        { timeoutMs: 120000, operation: 'reranking_generation' }
      )

      if (!response.ok) {
        throw new Error(`Reranking generation failed: ${response.status} ${response.statusText}`)
      }

      const result = (await response.json()) as any

      logger.debug('📥 Reranking response received', {
        responseLength: result.response?.length || 0,
        responsePreview: result.response?.substring(0, 200) + '...' || 'No response',
        done: result.done,
        model: result.model,
        component: 'OllamaRerankingService',
      })

      logger.info('✅ Reranking generation completed', {
        model: requestBody.model,
        responseLength: result.response?.length || 0,
        done: result.done,
        component: 'OllamaRerankingService',
      })

      return {
        text: result.response || '',
        model: requestBody.model,
        done: result.done,
        totalDuration: result.total_duration,
        loadDuration: result.load_duration,
        promptEvalCount: result.prompt_eval_count,
        evalCount: result.eval_count,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')
      
      logger.error('❌ Reranking generation failed', error instanceof Error ? error : new Error(String(error)), {
        model: options.model || this.defaultModel,
        promptLength: prompt.length,
        isTimeout,
        ollamaUrl: this.ollamaBaseUrl,
        component: 'OllamaRerankingService',
      })

      const structuredError = new StructuredError(
        `Reranking generation failed: ${errorMessage}${isTimeout ? ' (TIMEOUT - Consider increasing LLM_RERANKING_TIMEOUT_MS)' : ''}`,
        ErrorCode.LLM_ERROR,
        'HIGH',
        {
          model: options.model || this.defaultModel,
          promptLength: prompt.length,
          isTimeout,
          ollamaUrl: this.ollamaBaseUrl,
        },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      throw structuredError
    } finally {
      endTiming()
    }
  }

  async rerankDocuments(options: RerankingOptions): Promise<RerankingResult[]> {
    await this.initialize()

    const endTiming = startTiming('ollama_reranking', {
      documentCount: options.documents.length,
      topK: options.topK,
      component: 'OllamaRerankingService',
    })

    try {
      logger.info('🔄 Starting Ollama-based reranking', {
        query: options.query.substring(0, 100),
        documentCount: options.documents.length,
        topK: options.topK,
        model: options.model || this.defaultModel,
        component: 'OllamaRerankingService',
      })

      // Create reranking prompt
      const prompt = this.createRerankingPrompt(options.query, options.documents, options.topK)

      // Generate reranking response
      const response = await this.generateText(prompt, {
        model: options.model || this.defaultModel,
        temperature: options.temperature || 0.1,
        maxTokens: options.maxTokens || 2000,
      })

      // Parse reranking results (already filtered to topK by LLM)
      const rerankingResults = this.parseRerankingResponse(response.text, options.documents)

      // Sort by final score (LLM might not return them in perfect order)
      const finalResults = rerankingResults.sort((a, b) => b.finalScore - a.finalScore)

      logger.info('✅ Ollama reranking completed', {
        query: options.query.substring(0, 100),
        originalCount: options.documents.length,
        rerankedCount: finalResults.length,
        topFinalScore: finalResults[0]?.finalScore || 0,
        component: 'OllamaRerankingService',
      })

      return finalResults
    } catch (error) {
      const structuredError = new StructuredError(
        'Ollama reranking failed',
        ErrorCode.LLM_ERROR,
        'HIGH',
        {
          query: options.query.substring(0, 100),
          documentCount: options.documents.length,
          model: options.model || this.defaultModel,
        },
        error instanceof Error ? error : new Error(String(error))
      )
      errorMonitor.recordError(structuredError)
      logger.error('❌ Ollama reranking failed', structuredError)
      throw structuredError
    } finally {
      endTiming()
    }
  }

  private createRerankingPrompt(query: string, documents: SearchResult[], topK: number): string {
    const documentsText = documents
      .map((doc, index) => `Document ${index + 1} (ID: ${doc.id}):\n${doc.content.substring(0, 300)}...`)
      .join('\n\n')

    return `You are a helpful assistant that selects and ranks the most relevant documents for a query.

Query: "${query}"

Documents:
${documentsText}

Please select the top ${topK} most relevant documents and rank them by relevance. Consider:
1. Direct relevance to the query topic
2. Quality and completeness of information  
3. Specificity and detail level
4. Context appropriateness

Respond with ONLY the top ${topK} documents in this exact JSON format:
{
  "rankings": [
    {
      "document_id": "actual_document_id_here",
      "relevance_score": 0.95
    }
  ]
}

Important:
- Return exactly ${topK} documents (or fewer if less than ${topK} are truly relevant)
- Use exact document IDs provided
- Relevance scores between 0.0 and 1.0
`
  }

  private parseRerankingResponse(
    response: string,
    originalDocuments: SearchResult[]
  ): RerankingResult[] {
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in reranking response')
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        rankings: Array<{
          document_id: string
          relevance_score: number
          reasoning?: string
        }>
      }

      if (!parsed.rankings || !Array.isArray(parsed.rankings)) {
        throw new Error('Invalid rankings format in reranking response')
      }

      // Create results map
      const results: RerankingResult[] = []
      const documentMap = new Map(originalDocuments.map((doc) => [doc.id, doc]))

      for (const ranking of parsed.rankings) {
        const originalDoc = documentMap.get(ranking.document_id)
        if (originalDoc) {
          // Relevance score is already 0-1, no need to normalize
          const relevanceScore = Math.max(0, Math.min(1, ranking.relevance_score))

          // Calculate final score combining original score and LLM relevance
          const finalScore = originalDoc.score * 0.3 + relevanceScore * 0.7

          results.push({
            id: originalDoc.id,
            content: originalDoc.content,
            score: originalDoc.score,
            relevanceScore: relevanceScore,
            finalScore,
            metadata: originalDoc.metadata,
            chunkIndex: originalDoc.chunkIndex,
            searchType: originalDoc.searchType,
            reasoning: 'LLM selected as top relevant',
          })
        }
      }

      return results
    } catch (error) {
      logger.error(
        '❌ Failed to parse reranking response, using original scores',
        error instanceof Error ? error : new Error(String(error)),
        {
          response: response.substring(0, 200),
          component: 'OllamaRerankingService',
        }
      )

      // Fallback: return original documents as reranking results
      return originalDocuments.map((doc) => ({
        id: doc.id,
        content: doc.content,
        score: doc.score,
        relevanceScore: doc.score, // Use original score as relevance
        finalScore: doc.score,
        metadata: doc.metadata,
        chunkIndex: doc.chunkIndex,
        searchType: doc.searchType,
        reasoning: 'Fallback: LLM parsing failed',
      }))
    }
  }

  getModelInfo(): RerankingModelInfo {
    return {
      name: this.defaultModel,
      service: 'ollama',
      contextLength: 8192, // qwen3:4b typical context length
    }
  }

  isHealthy(): boolean {
    return this.isInitialized
  }
}
