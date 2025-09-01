import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { BaseServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

export interface ChunkingOptions {
  chunkSize: number
  overlap: number
  fileType: string
}

/**
 * LangChain RecursiveCharacterTextSplitter 기반 고급 청킹 서비스
 * 의미론적 경계를 고려한 스마트 청킹
 */
export class ChunkingService {
  private splitters: Map<string, RecursiveCharacterTextSplitter>

  constructor(private config: BaseServerConfig) {
    this.splitters = new Map()
    this.initializeSplitters()
  }

  private initializeSplitters(): void {
    // 기본 텍스트 스플리터
    this.splitters.set(
      'default',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''],
      })
    )

    // 마크다운 전용 스플리터
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
          '\n\n', // Code blocks and paragraphs
          '\n',
          '. ',
          '? ',
          '! ',
          '; ',
          ', ',
          ' ',
          '',
        ],
      })
    )

    // 코드 전용 스플리터 (JSON, XML 등)
    this.splitters.set(
      'code',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\n', '\n', '; ', ', ', ' ', ''],
      })
    )

    // CSV/표형식 데이터 스플리터
    this.splitters.set(
      'csv',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize * 2, // CSV는 더 큰 청크 허용
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\nRow ', '\n', ', ', ' ', ''],
      })
    )

    // PDF/DOCX 긴 문서 스플리터
    this.splitters.set(
      'document',
      new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: [
          '\n\n\n', // 섹션 구분
          '\n\n', // 문단 구분
          '\n', // 줄바꿈
          '. ', // 문장 끝
          '? ',
          '! ',
          '; ', // 다른 문장 끝 마크
          ', ', // 절 구분
          ' ', // 단어 구분
          '', // 문자 구분
        ],
      })
    )
  }

  async chunkDocument(document: Document): Promise<Document[]> {
    if (!document.pageContent || document.pageContent.length === 0) {
      return []
    }

    const fileType = document.metadata.fileType || 'txt'
    const splitter = this.getSplitterForFileType(fileType)

    try {
      logger.info(`🔄 Chunking ${fileType} document with ${splitter.constructor.name}`)

      const chunks = await splitter.splitDocuments([document])

      // 청크에 추가 메타데이터 추가
      const enrichedChunks = chunks.map((chunk, index) => {
        return new Document({
          pageContent: chunk.pageContent,
          metadata: {
            ...chunk.metadata,
            chunkIndex: index,
            chunkSize: chunk.pageContent.length,
            totalChunks: chunks.length,
            splitterType: this.getSplitterTypeForFileType(fileType),
          },
        })
      })

      logger.debug(
        `📄 Split into ${enrichedChunks.length} chunks using ${this.getSplitterTypeForFileType(
          fileType
        )} strategy`
      )

      return enrichedChunks
    } catch (error) {
      logger.error('❌ Error chunking document:', error instanceof Error ? error : new Error(String(error)))
      // Fallback to basic chunking
      return this.fallbackChunking(document)
    }
  }

  private getSplitterForFileType(fileType: string): RecursiveCharacterTextSplitter {
    switch (fileType.toLowerCase()) {
      case 'md': {
        const splitter = this.splitters.get('md')
        if (!splitter) throw new Error('Markdown splitter not initialized')
        return splitter
      }
      case 'json':
      case 'xml':
      case 'html': {
        const splitter = this.splitters.get('code')
        if (!splitter) throw new Error('Code splitter not initialized')
        return splitter
      }
      case 'csv': {
        const splitter = this.splitters.get('csv')
        if (!splitter) throw new Error('CSV splitter not initialized')
        return splitter
      }
      case 'pdf':
      case 'docx': {
        const splitter = this.splitters.get('document')
        if (!splitter) throw new Error('Document splitter not initialized')
        return splitter
      }
      default: {
        const splitter = this.splitters.get('default')
        if (!splitter) throw new Error('Default splitter not initialized')
        return splitter
      }
    }
  }

  private getSplitterTypeForFileType(fileType: string): string {
    switch (fileType.toLowerCase()) {
      case 'md':
        return 'markdown-aware'
      case 'json':
      case 'xml':
      case 'html':
        return 'structure-aware'
      case 'csv':
        return 'table-aware'
      case 'pdf':
      case 'docx':
        return 'document-semantic'
      default:
        return 'general-recursive'
    }
  }

  private fallbackChunking(document: Document): Document[] {
    logger.info('🔄 Using fallback basic chunking')

    const chunkSize = this.config.chunkSize
    const overlap = this.config.chunkOverlap
    const text = document.pageContent
    const chunks: Document[] = []
    let start = 0
    let chunkIndex = 0

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length)
      const chunkText = text.substring(start, end).trim()

      if (chunkText.length > 0) {
        chunks.push(
          new Document({
            pageContent: chunkText,
            metadata: {
              ...document.metadata,
              chunkIndex,
              chunkSize: chunkText.length,
              totalChunks: 0, // Will be updated after all chunks are created
              splitterType: 'fallback-basic',
            },
          })
        )
        chunkIndex++
      }

      start = end - overlap
      if (start <= (chunks.length > 1 ? start + overlap : 0)) {
        start = end
      }
    }

    // Update totalChunks for all chunks
    chunks.forEach((chunk) => (chunk.metadata.totalChunks = chunks.length))

    return chunks
  }

  // 간단한 텍스트 청킹 메서드 (DocumentProcessor에서 사용)
  async chunkText(text: string, options: { maxChunkSize: number; overlap: number }): Promise<{text: string}[]> {
    try {
      const document = new Document({
        pageContent: text,
        metadata: {}
      })

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: options.maxChunkSize,
        chunkOverlap: options.overlap,
        separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', '']
      })

      const chunks = await splitter.splitDocuments([document])
      
      return chunks.map(chunk => ({ text: chunk.pageContent }))
    } catch (error) {
      logger.error('Error in chunkText:', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  // 청킹 전략 정보 가져오기
  getChunkingStrategy(fileType: string): {
    splitterType: string
    chunkSize: number
    overlap: number
    separators: string[]
  } {
    const splitter = this.getSplitterForFileType(fileType)

    return {
      splitterType: this.getSplitterTypeForFileType(fileType),
      chunkSize: this.config.chunkSize,
      overlap: this.config.chunkOverlap,
      separators: (splitter as any).separators || ['default'],
    }
  }
}
