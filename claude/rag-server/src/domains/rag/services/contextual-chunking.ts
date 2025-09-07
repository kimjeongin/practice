/**
 * Contextual Chunking Service
 * Enhanced chunking with contextual information for better RAG performance
 * Based on Anthropic's Contextual Retrieval (2024)
 */

import { ChunkingService } from './chunking.js'
import { EmbeddingService } from '../ollama/embedding.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'
import fetch from 'node-fetch'

interface TextChunk {
  content: string
  index: number
  metadata?: Record<string, any>
}

interface ContextualChunk {
  chunk: TextChunk
  contextualText: string
}

interface TokenBudget {
  embeddingModelMaxTokens: number
  chunkTokens: number
  maxContextTokens: number
  safetyMargin: number
}

export class ContextualChunkingService extends ChunkingService {
  private tokenBudget: TokenBudget
  private ollamaBaseUrl: string
  private contextualModel: string

  constructor(config: ServerConfig, private embeddingService: EmbeddingService) {
    super(config)
    this.ollamaBaseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    this.contextualModel = config.contextualChunkingModel || 'qwen3:0.6b'
    this.tokenBudget = this.calculateTokenBudget()
  }

  /**
   * Generate text using Ollama API directly
   */
  private async generateWithOllama(request: {
    model: string
    prompt: string
    options?: {
      temperature?: number
      top_p?: number
      num_predict?: number
    }
  }): Promise<string> {
    const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        stream: false, // Get complete response at once
        options: request.options || {},
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { response: string }
    return data.response
  }

  /**
   * Calculate optimal token budget based on embedding model capabilities
   */
  private calculateTokenBudget(): TokenBudget {
    const modelInfo = this.embeddingService.getModelInfo()
    const maxTokens = modelInfo.maxTokens || 2048 // Fallback to conservative estimate

    return {
      embeddingModelMaxTokens: maxTokens,
      chunkTokens: Math.floor(maxTokens * 0.7), // 70% for chunk
      maxContextTokens: Math.floor(maxTokens * 0.2), // 20% for context
      safetyMargin: Math.floor(maxTokens * 0.1), // 10% safety margin
    }
  }

  /**
   * Estimate token count for text (approximation for Qwen models)
   */
  private estimateTokens(text: string): number {
    // Conservative estimation:
    // - Korean/Chinese/Japanese: ~1.5 tokens per character
    // - English: ~1.3 tokens per word
    // - Mixed content: Use character-based approach as conservative estimate
    return Math.ceil(text.length / 3)
  }

  /**
   * Generate adaptive context for a chunk with token limit consideration
   */
  private async generateAdaptiveContext(
    chunk: string,
    fullDocument: string,
    filePath?: string
  ): Promise<string> {
    const chunkTokens = this.estimateTokens(chunk)
    const availableContextTokens =
      this.tokenBudget.embeddingModelMaxTokens - chunkTokens - this.tokenBudget.safetyMargin

    // Calculate target context tokens
    const targetContextTokens = Math.min(this.tokenBudget.maxContextTokens, availableContextTokens)

    if (targetContextTokens < 20) {
      // Not enough space for meaningful context
      const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'unknown'
      return `[${fileType} 파일의 내용]`
    }

    // Simplified prompt to avoid model thinking noise
    const prompt = `주어진 청크가 문서에서 어떤 부분인지 한 문장으로 설명하세요. 무조건 다른 내용 없이 **설명**만 답변해줘.
문서: "${fullDocument}"

청크: "${chunk.substring(0, 200)}..."

설명:`

    try {
      const response = await this.generateWithOllama({
        model: this.contextualModel,
        prompt,
        options: {
          temperature: 0.1, // Deterministic output
          top_p: 0.8,
          num_predict: Math.floor(targetContextTokens * 1.2), // Short responses only
          // stop: ['\n\n', '<think>', '</think>', '청크:', '문서:'], // Removed due to type issue
        },
      })

      // Clean and extract actual context
      const cleanedContext = this.cleanModelResponse(response.trim())

      // Truncate to token limit while preserving sentence boundaries
      return this.truncateToTokenLimit(cleanedContext, targetContextTokens)
    } catch (error) {
      logger.warn('Context generation failed, using fallback', {
        error: error instanceof Error ? error.message : String(error),
        chunkLength: chunk.length,
        targetTokens: targetContextTokens,
        component: 'ContextualChunkingService',
      })

      // Fallback to basic context
      const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'unknown'
      return `[${fileType} 파일에서 추출된 텍스트]`
    }
  }

  /**
   * Clean model response by removing unwanted patterns and noise
   */
  private cleanModelResponse(response: string): string {
    // Remove <think> tags and content
    response = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // Remove common noise patterns
    response = response.replace(/^(설명:|답변:|응답:)/i, '').trim()

    // Remove multiple newlines
    response = response.replace(/\n{2,}/g, ' ').trim()

    // Remove very long responses (likely noise)
    if (response.length > 500) {
      const sentences = response.split(/[.!?]/)
      const firstSentence = sentences[0]
      if (firstSentence && firstSentence.length > 0) {
        response = firstSentence + (firstSentence.endsWith('.') ? '' : '.')
      } else {
        response = response.substring(0, 200) + '...'
      }
    }

    // If empty or too short, provide fallback
    if (!response || response.length < 10) {
      return '이 텍스트는 문서의 일부입니다'
    }

    return response
  }

  /**
   * Truncate text to token limit while preserving sentence boundaries
   */
  private truncateToTokenLimit(text: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(text)

    if (estimatedTokens <= maxTokens) {
      return text
    }

    // Try to cut at sentence boundaries
    const sentences = text.split(/[.!?]\s+/)
    let result = ''
    let tokenCount = 0

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence + '. ')
      if (tokenCount + sentenceTokens > maxTokens) {
        break
      }

      result += sentence + '. '
      tokenCount += sentenceTokens
    }

    // If no complete sentences fit, do character-based truncation
    if (result.trim() === '') {
      const charLimit = Math.floor(maxTokens * 3) // Conservative character estimate
      result = text.substring(0, charLimit).trim() + '...'
    }

    return result.trim()
  }

  /**
   * Extract original chunk from contextual text
   */
  private extractOriginalChunk(contextualText: string): string {
    // Simple extraction - assumes context is prepended with double newline separator
    const parts = contextualText.split('\n\n')
    return parts.length > 1 ? parts.slice(1).join('\n\n') : contextualText
  }

  /**
   * Create safe embedding that handles token overflow
   * Note: EmbeddingService now returns raw vectors, normalization handled by LanceDBEmbeddingBridge
   */
  async createSafeEmbedding(contextualText: string): Promise<number[]> {
    const tokenCount = this.estimateTokens(contextualText)

    if (tokenCount > this.tokenBudget.embeddingModelMaxTokens) {
      logger.warn('Contextual text exceeds token limit, using original chunk only', {
        tokenCount,
        limit: this.tokenBudget.embeddingModelMaxTokens,
        component: 'ContextualChunkingService',
      })

      // Fallback to original chunk only
      const originalChunk = this.extractOriginalChunk(contextualText)
      return await this.embeddingService.embedQuery(originalChunk)
    }

    return await this.embeddingService.embedQuery(contextualText)
  }

  /**
   * Chunk text with contextual information (using LLM for context generation)
   */
  async chunkTextWithContext(text: string, filePath?: string): Promise<ContextualChunk[]> {
    // First, perform regular chunking
    const chunks = await this.chunkText(text, filePath)

    if (chunks.length === 0) {
      return []
    }

    logger.info('🔄 Generating contextual chunks with LLM', {
      totalChunks: chunks.length,
      textLength: text.length,
      filePath,
      component: 'ContextualChunkingService',
    })

    const contextualChunks: ContextualChunk[] = []
    let contextOverflows = 0

    // Process chunks with LLM-generated context
    for (const chunk of chunks) {
      try {
        // Generate context using LLM for each chunk
        const context = await this.generateAdaptiveContext(chunk.content, text, filePath)
        const contextualText = `${context}\n\n${chunk.content}`

        // Check for token overflow
        const finalTokenCount = this.estimateTokens(contextualText)
        if (finalTokenCount > this.tokenBudget.embeddingModelMaxTokens) {
          contextOverflows++
        }

        contextualChunks.push({
          chunk,
          contextualText,
        })
      } catch (error) {
        logger.error(
          'Failed to generate context for chunk',
          error instanceof Error ? error : new Error(String(error)),
          {
            chunkIndex: chunk.index,
            chunkLength: chunk.content.length,
            component: 'ContextualChunkingService',
          }
        )

        // Fallback to simple context
        const simpleContext = this.generateSimpleFileContext(text, filePath)
        const fallbackContextualText = `${simpleContext}\n\n${chunk.content}`

        contextualChunks.push({
          chunk,
          contextualText: fallbackContextualText,
        })
      }
    }

    // Log metrics
    const avgContextSize =
      contextualChunks.reduce(
        (acc, cc) =>
          acc + this.estimateTokens(cc.contextualText) - this.estimateTokens(cc.chunk.content),
        0
      ) / contextualChunks.length

    logger.info('✅ Contextual chunking completed', {
      totalChunks: contextualChunks.length,
      contextOverflows,
      overflowRate: `${((contextOverflows / contextualChunks.length) * 100).toFixed(1)}%`,
      avgContextSize: Math.round(avgContextSize),
      component: 'ContextualChunkingService',
    })

    return contextualChunks
  }

  /**
   * Generate simple file-level context (no LLM call)
   */
  private generateSimpleFileContext(text: string, filePath?: string): string {
    const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'text'
    const fileName = filePath ? filePath.split('/').pop() || 'unknown' : 'unknown'

    // Simple context based on file type and first few lines
    const firstLines = text.split('\n').slice(0, 3).join(' ').substring(0, 200)

    return `이 내용은 ${fileName} (${fileType} 파일)에서 추출된 부분입니다. 문서 시작: "${firstLines}..."`
  }

  /**
   * Get file type from path (overridden from base class)
   */
  protected override getFileTypeFromPath(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() || ''

    const typeMapping: Record<string, string> = {
      md: 'markdown',
      markdown: 'markdown',
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      json: 'json',
      txt: 'text',
    }

    return typeMapping[extension] || 'text'
  }
}
