import OpenAI from 'openai';
import { ServerConfig } from '../types/index.js';

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private openai: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(config: ServerConfig) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key is required for OpenAI embedding service');
    }

    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.model = config.embeddingModel;
    this.dimensions = config.embeddingDimensions;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating OpenAI embedding:', error);
      throw error;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI');
      }

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Error generating OpenAI embeddings:', error);
      throw error;
    }
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

// Text processor utility for document chunking
export class TextProcessor {
  static splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    if (!text || text.length === 0) return [];
    
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);
      
      // Clean up the chunk
      const cleanedChunk = this.cleanText(chunk);
      
      if (cleanedChunk.trim().length > 0) {
        chunks.push(cleanedChunk);
      }
      
      // Move start position for next chunk with overlap
      start = end - overlap;
      
      // Avoid infinite loop if overlap >= chunkSize
      if (start <= (chunks.length > 1 ? (start + overlap) : 0)) {
        start = end;
      }
    }
    
    return chunks;
  }

  static cleanText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      // Trim
      .trim();
  }

  static extractTextFromFile(filePath: string, content: string): string {
    const ext = filePath.toLowerCase().split('.').pop() || '';
    
    switch (ext) {
      case 'txt':
      case 'md':
        return content;
      case 'json':
        try {
          const jsonData = JSON.parse(content);
          return JSON.stringify(jsonData, null, 2);
        } catch {
          return content;
        }
      case 'csv':
        // Simple CSV parsing - convert to readable text
        return content.split('\n')
          .map(line => line.split(',').join(' | '))
          .join('\n');
      case 'html':
      case 'xml':
        // Basic HTML/XML tag removal
        return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      default:
        return content;
    }
  }
}

export function createEmbeddingService(config: ServerConfig): EmbeddingService {
  switch (config.embeddingService) {
    case 'openai':
      return new OpenAIEmbeddingService(config);
    default:
      throw new Error(`Unsupported embedding service: ${config.embeddingService}`);
  }
}