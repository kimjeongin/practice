import { ServerConfig } from '../../shared/types/index.js';

export interface ChunkingOptions {
  chunkSize: number;
  overlap: number;
  fileType: string;
}

/**
 * 텍스트 청킹 서비스
 * 파일 타입에 따른 적응적 청킹 로직
 */
export class TextChunkingService {
  constructor(private config: ServerConfig) {}

  async chunkText(text: string, fileType: string): Promise<string[]> {
    const chunkSize = this.config.chunkSize;
    const overlap = this.config.chunkOverlap;

    if (!text || text.length === 0) return [];

    switch (fileType.toLowerCase()) {
      case 'md':
        return this.chunkMarkdown(text, chunkSize, overlap);
      case 'json':
        return this.chunkJson(text, chunkSize, overlap);
      default:
        return this.chunkPlainText(text, chunkSize, overlap);
    }
  }

  private chunkMarkdown(text: string, chunkSize: number, overlap: number): string[] {
    // Markdown 헤더 기반 청킹
    const sections = text.split(/\n(?=#{1,6}\s)/);
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= chunkSize) {
        chunks.push(section.trim());
      } else {
        // 큰 섹션은 일반 청킹으로 처리
        chunks.push(...this.chunkPlainText(section, chunkSize, overlap));
      }
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private chunkJson(text: string, chunkSize: number, overlap: number): string[] {
    try {
      const jsonData = JSON.parse(text);
      if (Array.isArray(jsonData)) {
        // 배열인 경우 각 아이템을 청크로 처리
        return jsonData.map((item, index) => 
          `Item ${index}: ${JSON.stringify(item, null, 2)}`
        ).filter(chunk => chunk.length <= chunkSize * 2); // JSON은 좀 더 여유롭게
      } else {
        // 객체인 경우 키별로 청킹
        const chunks: string[] = [];
        for (const [key, value] of Object.entries(jsonData)) {
          const chunk = `${key}: ${JSON.stringify(value, null, 2)}`;
          if (chunk.length <= chunkSize * 2) {
            chunks.push(chunk);
          }
        }
        return chunks;
      }
    } catch {
      // JSON 파싱 실패 시 일반 텍스트로 처리
      return this.chunkPlainText(text, chunkSize, overlap);
    }
  }

  private chunkPlainText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);
      
      const cleanedChunk = chunk
        .replace(/\s+/g, ' ')
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        .trim();
      
      if (cleanedChunk.length > 0) {
        chunks.push(cleanedChunk);
      }
      
      start = end - overlap;
      if (start <= (chunks.length > 1 ? (start + overlap) : 0)) {
        start = end;
      }
    }
    
    return chunks;
  }
}