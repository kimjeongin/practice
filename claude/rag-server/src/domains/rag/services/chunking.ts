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

export interface TextChunk {
  content: string
  index: number
  metadata?: Record<string, any>
}

export class ChunkingService {
  private splitters: Map<string, RecursiveCharacterTextSplitter>

  constructor(private config: ServerConfig) {
    this.splitters = new Map()
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

      logger.debug('🔄 Chunking text', {
        originalLength: text.length,
        preprocessedLength: preprocessedText.length,
        fileType,
        filePath,
        component: 'ChunkingService',
      })

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

      logger.debug('✅ Text chunking completed', {
        originalLength: text.length,
        preprocessedLength: preprocessedText.length,
        chunksCount: chunks.length,
        averageChunkSize: Math.round(preprocessedText.length / chunks.length),
        fileType,
        component: 'ChunkingService',
      })

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
}