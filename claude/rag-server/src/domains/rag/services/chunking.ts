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

export interface ChunkingOptions {
  chunkSize: number
  overlap: number
  fileType: string
}

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
    // Default text splitter
    this.splitters.set(
      'default',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''],
      })
    )

    // Markdown-specific splitter
    this.splitters.set(
      'md',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: [
          '\n\n# ',
          '\n\n## ',
          '\n\n### ',
          '\n\n#### ',
          '\n\n##### ',
          '\n\n###### ', // Headers
          '\n\n---',
          '\n\n***',
          '\n\n___', // Horizontal rules
          '\n\n```',
          '\n\n',
          '\n',
          '. ',
          '? ',
          '! ',
          ' ',
          '',
        ],
      })
    )

    // Code-specific splitter
    this.splitters.set(
      'code',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: [
          '\n\nclass ',
          '\n\nfunction ',
          '\n\ndef ',
          '\n\nconst ',
          '\n\nlet ',
          '\n\nvar ',
          '\n\n// ',
          '\n\n/* ',
          '\n\n',
          '\n',
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
      const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'default'
      const splitter = this.getSplitterForFileType(fileType)

      logger.debug('🔄 Chunking text', {
        textLength: text.length,
        fileType,
        filePath,
        component: 'ChunkingService',
      })

      // Create document
      const document = new Document({
        pageContent: text,
        metadata: { source: filePath || 'unknown' },
      })

      // Split document
      const splitDocs = await splitter.splitDocuments([document])

      // Convert to our chunk format
      const chunks: TextChunk[] = splitDocs.map((doc, index) => ({
        content: doc.pageContent,
        index,
        metadata: doc.metadata,
      }))

      logger.debug('✅ Text chunking completed', {
        originalLength: text.length,
        chunksCount: chunks.length,
        averageChunkSize: Math.round(text.length / chunks.length),
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

  private getFileTypeFromPath(filePath: string): string {
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