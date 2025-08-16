import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ServerConfig } from '../../shared/types/index.js';

export interface ChunkingOptions {
  chunkSize: number;
  overlap: number;
  fileType: string;
}

/**
 * LangChain RecursiveCharacterTextSplitter 기반 고급 청킹 서비스
 * 의미론적 경계를 고려한 스마트 청킹
 */
export class ChunkingService {
  private splitters: Map<string, RecursiveCharacterTextSplitter>;

  constructor(private config: ServerConfig) {
    this.splitters = new Map();
    this.initializeSplitters();
  }

  private initializeSplitters(): void {
    // 기본 텍스트 스플리터
    this.splitters.set('default', new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''],
    }));

    // 마크다운 전용 스플리터
    this.splitters.set('md', new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: [
        '\n\n# ', '\n\n## ', '\n\n### ', '\n\n#### ', '\n\n##### ', '\n\n###### ',  // Headers
        '\n\n---', '\n\n***', '\n\n___',  // Horizontal rules
        '\n\n```', '\n\n',  // Code blocks and paragraphs
        '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''
      ],
    }));

    // 코드 전용 스플리터 (JSON, XML 등)
    this.splitters.set('code', new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: ['\n\n', '\n', '; ', ', ', ' ', ''],
    }));

    // CSV/표형식 데이터 스플리터
    this.splitters.set('csv', new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize * 2, // CSV는 더 큰 청크 허용
      chunkOverlap: this.config.chunkOverlap,
      separators: ['\n\nRow ', '\n', ', ', ' ', ''],
    }));

    // PDF/DOCX 긴 문서 스플리터
    this.splitters.set('document', new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: [
        '\n\n\n', // 섹션 구분
        '\n\n',   // 문단 구분
        '\n',     // 줄바꿈
        '. ',     // 문장 끝
        '? ', '! ', '; ',  // 다른 문장 끝 마크
        ', ',     // 절 구분
        ' ',      // 단어 구분
        ''        // 문자 구분
      ],
    }));
  }

  async chunkDocument(document: Document): Promise<Document[]> {
    if (!document.pageContent || document.pageContent.length === 0) {
      return [];
    }

    const fileType = document.metadata.fileType || 'txt';
    const splitter = this.getSplitterForFileType(fileType);
    
    try {
      console.log(`🔄 Chunking ${fileType} document with ${splitter.constructor.name}`);
      
      const chunks = await splitter.splitDocuments([document]);
      
      // 청크에 추가 메타데이터 추가
      const enrichedChunks = chunks.map((chunk, index) => {
        return new Document({
          pageContent: chunk.pageContent,
          metadata: {
            ...chunk.metadata,
            chunkIndex: index,
            chunkSize: chunk.pageContent.length,
            totalChunks: chunks.length,
            splitterType: this.getSplitterTypeForFileType(fileType)
          }
        });
      });

      console.log(`📄 Split into ${enrichedChunks.length} chunks using ${this.getSplitterTypeForFileType(fileType)} strategy`);
      
      return enrichedChunks;
    } catch (error) {
      console.error(`❌ Error chunking document:`, error);
      // Fallback to basic chunking
      return this.fallbackChunking(document);
    }
  }

  private getSplitterForFileType(fileType: string): RecursiveCharacterTextSplitter {
    switch (fileType.toLowerCase()) {
      case 'md':
        return this.splitters.get('md')!;
      case 'json':
      case 'xml':
      case 'html':
        return this.splitters.get('code')!;
      case 'csv':
        return this.splitters.get('csv')!;
      case 'pdf':
      case 'docx':
        return this.splitters.get('document')!;
      default:
        return this.splitters.get('default')!;
    }
  }

  private getSplitterTypeForFileType(fileType: string): string {
    switch (fileType.toLowerCase()) {
      case 'md':
        return 'markdown-aware';
      case 'json':
      case 'xml':
      case 'html':
        return 'structure-aware';
      case 'csv':
        return 'table-aware';
      case 'pdf':
      case 'docx':
        return 'document-semantic';
      default:
        return 'general-recursive';
    }
  }

  private fallbackChunking(document: Document): Document[] {
    console.log('🔄 Using fallback basic chunking');
    
    const chunkSize = this.config.chunkSize;
    const overlap = this.config.chunkOverlap;
    const text = document.pageContent;
    const chunks: Document[] = [];
    let start = 0;
    let chunkIndex = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.substring(start, end).trim();
      
      if (chunkText.length > 0) {
        chunks.push(new Document({
          pageContent: chunkText,
          metadata: {
            ...document.metadata,
            chunkIndex,
            chunkSize: chunkText.length,
            totalChunks: 0, // Will be updated after all chunks are created
            splitterType: 'fallback-basic'
          }
        }));
        chunkIndex++;
      }
      
      start = end - overlap;
      if (start <= (chunks.length > 1 ? (start + overlap) : 0)) {
        start = end;
      }
    }
    
    // Update totalChunks for all chunks
    chunks.forEach(chunk => chunk.metadata.totalChunks = chunks.length);
    
    return chunks;
  }

  // 청킹 전략 정보 가져오기
  getChunkingStrategy(fileType: string): {
    splitterType: string;
    chunkSize: number;
    overlap: number;
    separators: string[];
  } {
    const splitter = this.getSplitterForFileType(fileType);
    
    return {
      splitterType: this.getSplitterTypeForFileType(fileType),
      chunkSize: this.config.chunkSize,
      overlap: this.config.chunkOverlap,
      separators: (splitter as any).separators || ['default']
    };
  }
}