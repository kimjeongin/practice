/**
 * Chunking Service
 * Advanced chunking service based on LangChain RecursiveCharacterTextSplitter
 * Smart chunking considering semantic boundaries
 */

import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'
import { extname } from 'path'
import type { EmbeddingService } from '../ollama/embedding.js'
import { ChunkingService as OllamaChunkingService } from '../ollama/chunking.js'

export interface TextChunk {
  content: string
  index: number
  metadata?: Record<string, any>
}

export interface ContextualChunk {
  chunk: TextChunk
  contextualText: string
}

interface TokenBudget {
  embeddingModelMaxTokens: number
  chunkTokens: number
  maxContextTokens: number
  safetyMargin: number
}

export class ChunkingService {
  private splitters: Map<string, RecursiveCharacterTextSplitter>
  private embeddingService?: EmbeddingService
  private tokenBudget?: TokenBudget
  private ollamaChunkingService: OllamaChunkingService

  constructor(private config: ServerConfig, embeddingService?: EmbeddingService) {
    this.splitters = new Map()
    this.embeddingService = embeddingService
    this.ollamaChunkingService = new OllamaChunkingService(config)

    if (this.embeddingService) {
      this.tokenBudget = this.calculateTokenBudget()
    }

    this.initializeSplitters()
  }

  private initializeSplitters(): void {
    // Default text splitter (enhanced separators for better semantic boundaries)
    this.splitters.set(
      'default',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\n', '\n', '. ', '? ', '! ', ': ', '; ', ', ', ' ', ''],
      })
    )

    // Markdown-specific splitter (enhanced with punctuation priority)
    this.splitters.set(
      'md',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: [
          '\n\n---',
          '\n\n***',
          '\n\n___', // Horizontal rules first
          '\n\n```', // Code blocks
          '\n\n', // Double newlines
          '\n# ',
          '\n## ',
          '\n### ',
          '\n#### ',
          '\n##### ',
          '\n###### ', // Headers - moved down to include more context
          '\n',
          '. ',
          '? ',
          '! ',
          ': ',
          '; ',
          ', ',
          ' ',
          '',
        ],
      })
    )

    // Code-specific splitter (enhanced with import/export and punctuation)
    this.splitters.set(
      'code',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: [
          '\n\nclass ',
          '\n\nfunction ',
          '\n\ndef ',
          '\n\nexport ',
          '\n\nimport ',
          '\n\nconst ',
          '\n\nlet ',
          '\n\nvar ',
          '\n\n// ',
          '\n\n/* ',
          '\n\n',
          '\n',
          '; ',
          ' ',
          '',
        ],
      })
    )

    // JSON-specific splitter
    this.splitters.set(
      'json',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\n', '\n', ', ', ' ', ''],
      })
    )

    logger.info('✅ Text splitters initialized', {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      splitterTypes: Array.from(this.splitters.keys()),
      component: 'ChunkingService',
    })
  }

  async chunkText(text: string, filePath?: string): Promise<TextChunk[]> {
    if (!text.trim()) {
      return []
    }

    try {
      // Preprocess text for better chunking
      const preprocessedText = this.preprocessText(text)

      const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'default'
      const splitter = this.getSplitterForFileType(fileType)

      // Create document with preprocessed text
      const document = new Document({
        pageContent: preprocessedText,
        metadata: { source: filePath || 'unknown' },
      })

      // Split document
      const splitDocs = await splitter.splitDocuments([document])

      // Convert to our chunk format and filter out too-short chunks
      const chunks: TextChunk[] = []
      const minChunkSize = this.config.minChunkSize // Minimum characters for a meaningful chunk

      for (let i = 0; i < splitDocs.length; i++) {
        const doc = splitDocs[i]!
        let content = doc.pageContent

        // If chunk is too short, try to merge with next chunk
        if (content.trim().length < minChunkSize && i < splitDocs.length - 1) {
          const nextDoc = splitDocs[i + 1]!
          content = content + '\n\n' + nextDoc.pageContent
          // Skip the next document since we merged it
          i++
        }

        chunks.push({
          content,
          index: chunks.length,
          metadata: doc.metadata,
        })
      }

      if (chunks.length > 10) {
        logger.debug('✅ Text chunking completed', {
          chunksCount: chunks.length,
          averageChunkSize: Math.round(preprocessedText.length / chunks.length),
          component: 'ChunkingService',
        })
      }

      return chunks
    } catch (error) {
      logger.error(
        '❌ Text chunking failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          textLength: text.length,
          filePath,
          component: 'ChunkingService',
        }
      )
      throw error
    }
  }

  protected getFileTypeFromPath(filePath: string): string {
    const extension = extname(filePath).slice(1).toLowerCase()

    // Map extensions to splitter types
    const typeMapping: Record<string, string> = {
      md: 'md',
      markdown: 'md',
      js: 'code',
      ts: 'code',
      jsx: 'code',
      tsx: 'code',
      py: 'code',
      java: 'code',
      cpp: 'code',
      c: 'code',
      cs: 'code',
      php: 'code',
      rb: 'code',
      go: 'code',
      rs: 'code',
      json: 'json',
    }

    return typeMapping[extension] || 'default'
  }

  private getSplitterForFileType(fileType: string): RecursiveCharacterTextSplitter {
    return this.splitters.get(fileType) || this.splitters.get('default')!
  }

  /**
   * Preprocess text for better chunking quality
   * Normalizes whitespace, punctuation, and sentence boundaries
   */
  private preprocessText(text: string): string {
    // 1. Remove excessive whitespace and normalize line breaks
    text = text.replace(/\n{3,}/g, '\n\n') // Max 2 consecutive line breaks
    text = text.replace(/[ \t]{2,}/g, ' ') // Remove multiple spaces/tabs

    // 2. Normalize special characters for better splitting
    text = text.replace(/[""]/g, '"') // Normalize quotes
    text = text.replace(/['']/g, "'") // Normalize apostrophes

    // 3. Ensure proper sentence ending punctuation spacing
    text = text.replace(/([.!?])\s*\n/g, '$1\n') // Consistent sentence-end spacing
    text = text.replace(/([.!?])([A-Z])/g, '$1 $2') // Space after sentence punctuation

    // 4. Clean up and trim
    return text.trim()
  }

  /**
   * Get chunking statistics
   */
  getChunkingStats() {
    return {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      availableSplitters: Array.from(this.splitters.keys()),
    }
  }

  /**
   * Update chunking configuration
   */
  updateConfig(newConfig: Partial<Pick<ServerConfig, 'chunkSize' | 'chunkOverlap'>>) {
    if (newConfig.chunkSize) {
      this.config.chunkSize = newConfig.chunkSize
    }
    if (newConfig.chunkOverlap) {
      this.config.chunkOverlap = newConfig.chunkOverlap
    }

    // Reinitialize splitters with new config
    this.initializeSplitters()

    logger.info('⚙️ Chunking configuration updated', {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      component: 'ChunkingService',
    })
  }

  /**
   * Optimized chunk text with contextual information using batched LLM calls
   */
  async chunkTextWithContext(text: string, filePath?: string): Promise<ContextualChunk[]> {
    if (!this.embeddingService || !this.tokenBudget) {
      throw new Error('EmbeddingService is required for contextual chunking')
    }

    // First, perform regular chunking
    const chunks = await this.chunkText(text, filePath)

    if (chunks.length === 0) {
      return []
    }

    logger.info('🔄 Generating contextual chunks with batched LLM calls', {
      totalChunks: chunks.length,
      textLength: text.length,
      filePath,
      component: 'ChunkingService',
    })

    const startTime = Date.now()

    // Generate contexts in batches for better performance
    const contextualChunks = await this.generateContextsInBatches(chunks, text, filePath)

    const processingTime = Date.now() - startTime
    const avgContextSize =
      contextualChunks.reduce(
        (acc, cc) =>
          acc + this.estimateTokens(cc.contextualText) - this.estimateTokens(cc.chunk.content),
        0
      ) / contextualChunks.length

    logger.info('✅ Optimized contextual chunking completed', {
      totalChunks: contextualChunks.length,
      processingTime: `${processingTime}ms`,
      avgTimePerChunk: `${Math.round(processingTime / chunks.length)}ms`,
      avgContextSize: Math.round(avgContextSize),
      component: 'ChunkingService',
    })

    return contextualChunks
  }

  /**
   * Generate contexts for chunks in batches to improve performance
   */
  private async generateContextsInBatches(
    chunks: TextChunk[],
    fullDocument: string,
    filePath?: string
  ): Promise<ContextualChunk[]> {
    const contextualChunks: ContextualChunk[] = []
    const batchSize = Math.min(5, chunks.length) // Process up to 5 chunks at once

    // Pre-compute common context information
    const fileType = this.getFileTypeFromPath(filePath || '')

    for (let i = 0; i < chunks.length; i += batchSize) {
      const chunkBatch = chunks.slice(i, i + batchSize)

      // Process batch in parallel with controlled concurrency
      const batchPromises = chunkBatch.map(async (chunk) => {
        try {
          const context = await this.generateAdaptiveContextOptimized(
            chunk.content,
            fullDocument,
            filePath,
            fileType
          )
          const contextualText = `${context}\n\n${chunk.content}`

          return {
            chunk,
            contextualText,
          }
        } catch (error) {
          logger.warn('Context generation failed, using simple context', {
            chunkIndex: chunk.index,
            error: error instanceof Error ? error.message : String(error),
            component: 'ChunkingService',
          })

          const simpleContext = this.generateSimpleFileContext(fullDocument, filePath)
          // Fallback to pre-computed simple context
          return {
            chunk,
            contextualText: `${simpleContext}\n\n${chunk.content}`,
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      contextualChunks.push(...batchResults)
    }

    return contextualChunks
  }

  /**
   * Create safe embedding that handles token overflow
   */
  async createSafeEmbedding(contextualText: string): Promise<number[]> {
    if (!this.embeddingService || !this.tokenBudget) {
      throw new Error('EmbeddingService is required for safe embedding')
    }

    const tokenCount = this.estimateTokens(contextualText)

    if (tokenCount > this.tokenBudget.embeddingModelMaxTokens) {
      logger.warn('Contextual text exceeds token limit, using original chunk only', {
        tokenCount,
        limit: this.tokenBudget.embeddingModelMaxTokens,
        component: 'ChunkingService',
      })

      // Fallback to original chunk only
      const originalChunk = this.extractOriginalChunk(contextualText)
      return await this.embeddingService.embedQuery(originalChunk)
    }

    return await this.embeddingService.embedQuery(contextualText)
  }

  /**
   * Calculate optimal token budget based on embedding model capabilities
   */
  private calculateTokenBudget(): TokenBudget {
    if (!this.embeddingService) {
      throw new Error('EmbeddingService is required for token budget calculation')
    }

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
   * Generate adaptive context for a chunk with optimizations
   */
  private async generateAdaptiveContextOptimized(
    chunk: string,
    fullDocument: string,
    filePath?: string,
    fileType?: string
  ): Promise<string> {
    if (!this.tokenBudget) {
      throw new Error('Token budget not initialized')
    }

    const chunkTokens = this.estimateTokens(chunk)
    const availableContextTokens =
      this.tokenBudget.embeddingModelMaxTokens - chunkTokens - this.tokenBudget.safetyMargin

    // Calculate target context tokens
    const targetContextTokens = Math.min(this.tokenBudget.maxContextTokens, availableContextTokens)

    if (targetContextTokens < 20) {
      // Not enough space for meaningful context
      const type = fileType || this.getFileTypeFromPath(filePath || '')
      return `[Content from ${type} file]`
    }

    try {
      // Use the new OllamaChunkingService
      const response = await this.ollamaChunkingService.generateContext(
        chunk,
        fullDocument,
        filePath,
        Math.floor(targetContextTokens * 1.2)
      )

      // Clean and truncate response
      const cleanedContext = this.cleanModelResponse(response.trim())
      return this.truncateToTokenLimit(cleanedContext, targetContextTokens)
    } catch (error) {
      // Fast fallback without additional processing
      const type = fileType || this.getFileTypeFromPath(filePath || '')
      return `[Text from ${type} file]`
    }
  }

  /**
   * Clean model response by removing unwanted patterns and noise
   */
  private cleanModelResponse(response: string): string {
    // Remove <think> tags and content
    response = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // Remove common noise patterns
    response = response.replace(/^(설명:|답변:|응답:|Description:|Answer:|Response:)/i, '').trim()

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
      return 'This text is part of the document'
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
   * Generate simple file-level context (no LLM call)
   */
  private generateSimpleFileContext(text: string, filePath?: string): string {
    const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'text'
    const fileName = filePath ? filePath.split('/').pop() || 'unknown' : 'unknown'

    // Simple context based on file type and first few lines
    const firstLines = text.split('\n').slice(0, 3).join(' ').substring(0, 200)

    return `This content is extracted from ${fileName} (${fileType} file). Document starts with: "${firstLines}..."`
  }
}
