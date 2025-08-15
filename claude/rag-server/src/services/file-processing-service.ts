import { readFileSync } from 'fs';
import { extname, basename } from 'path';
import { createHash } from 'crypto';
import { IFileProcessingService, VectorDocument } from '../domain/interfaces.js';
import { IFileRepository } from '../repositories/file-repository.js';
import { IChunkRepository } from '../repositories/chunk-repository.js';
import { IVectorStoreService } from '../domain/interfaces.js';
import { DocumentChunk, FileMetadata } from '../domain/models.js';
import { ServerConfig } from '../types/index.js';

export class FileProcessingService implements IFileProcessingService {
  private processingQueue = new Set<string>();

  constructor(
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private vectorStoreService: IVectorStoreService,
    private config: ServerConfig
  ) {}

  async processFile(filePath: string): Promise<void> {
    if (this.processingQueue.has(filePath)) {
      console.log(`⏳ File ${filePath} is already being processed`);
      return;
    }

    this.processingQueue.add(filePath);

    try {
      console.log(`🔄 Processing file: ${basename(filePath)}`);
      
      let fileMetadata = this.fileRepository.getFileByPath(filePath);
      if (!fileMetadata) {
        console.log(`❌ File ${filePath} not found in database, skipping`);
        return;
      }

      const content = this.readFileContent(filePath);
      if (!content) {
        console.log(`❌ Could not read content from ${filePath}`);
        return;
      }

      const textChunks = await this.smartChunkText(content, fileMetadata.fileType);
      console.log(`📄 Split ${basename(filePath)} into ${textChunks.length} chunks`);

      // Clear existing chunks for this file
      this.chunkRepository.deleteDocumentChunks(fileMetadata.id);
      await this.vectorStoreService.removeDocumentsByFileId(fileMetadata.id);

      // Process chunks in batches
      const batchSize = this.config.embeddingBatchSize || 10;
      
      for (let i = 0; i < textChunks.length; i += batchSize) {
        const batch = textChunks.slice(i, i + batchSize);
        await this.processBatch(fileMetadata, batch, i);
      }

      console.log(`✅ Successfully processed ${textChunks.length} chunks for ${basename(filePath)}`);
    } catch (error) {
      console.error(`❌ Error processing file ${filePath}:`, error);
    } finally {
      this.processingQueue.delete(filePath);
    }
  }

  async removeFile(filePath: string): Promise<void> {
    try {
      const fileMetadata = this.fileRepository.getFileByPath(filePath);
      if (fileMetadata) {
        await this.vectorStoreService.removeDocumentsByFileId(fileMetadata.id);
        console.log(`🗑️  Removed file ${basename(filePath)} from vector store`);
      }
    } catch (error) {
      console.error(`❌ Error removing file ${filePath} from vector store:`, error);
    }
  }

  private async processBatch(fileMetadata: FileMetadata, chunks: string[], startIndex: number): Promise<void> {
    try {
      console.log(`⚙️  Processing batch of ${chunks.length} chunks (starting at index ${startIndex})`);
      
      const vectorDocuments: VectorDocument[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkIndex = startIndex + i;
        const chunkId = this.generateChunkId(fileMetadata.id, chunkIndex);
        
        // Store in SQLite for metadata
        const dbChunk: Omit<DocumentChunk, 'id'> = {
          fileId: fileMetadata.id,
          chunkIndex,
          content: chunks[i],
          embeddingId: chunkId,
        };
        
        const insertedChunkId = this.chunkRepository.insertDocumentChunk(dbChunk);
        
        // Prepare for vector store
        const vectorDoc: VectorDocument = {
          id: chunkId,
          content: chunks[i],
          metadata: {
            fileId: fileMetadata.id,
            fileName: fileMetadata.name,
            filePath: fileMetadata.path,
            chunkIndex,
            fileType: fileMetadata.fileType,
            createdAt: fileMetadata.createdAt.toISOString(),
            sqliteId: insertedChunkId,
          },
        };

        vectorDocuments.push(vectorDoc);
      }

      // Add to vector store with embeddings
      await this.vectorStoreService.addDocuments(vectorDocuments);
      
      console.log(`✅ Processed batch of ${chunks.length} chunks`);
    } catch (error) {
      console.error(`❌ Error processing batch starting at index ${startIndex}:`, error);
      throw error;
    }
  }

  private generateChunkId(fileId: string, chunkIndex: number): string {
    const hash = createHash('sha256')
      .update(`${fileId}_${chunkIndex}`)
      .digest('hex')
      .substring(0, 16);
    return hash || `chunk_${fileId}_${chunkIndex}`;
  }

  private readFileContent(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf8');
      return this.extractTextFromFile(filePath, content);
    } catch (error) {
      console.error(`❌ Error reading file ${filePath}:`, error);
      return null;
    }
  }

  private extractTextFromFile(filePath: string, content: string): string {
    const ext = extname(filePath).toLowerCase().substring(1);
    
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
        return content.split('\n')
          .map(line => line.split(',').join(' | '))
          .join('\n');
      case 'html':
      case 'xml':
        return content.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
      default:
        return content;
    }
  }

  private async smartChunkText(text: string, fileType: string): Promise<string[]> {
    const chunkSize = this.config.chunkSize;
    const overlap = this.config.chunkOverlap;

    if (!text || text.length === 0) return [];

    switch (fileType.toLowerCase()) {
      case 'md':
        return this.chunkMarkdown(text, chunkSize, overlap);
      case 'json':
        return this.chunkJson(text, chunkSize, overlap);
      default:
        return this.chunkText(text, chunkSize, overlap);
    }
  }

  private chunkMarkdown(text: string, chunkSize: number, overlap: number): string[] {
    const sections = text.split(/\\n(?=#{1,6}\\s)/);
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= chunkSize) {
        chunks.push(section.trim());
      } else {
        chunks.push(...this.chunkText(section, chunkSize, overlap));
      }
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private chunkJson(text: string, chunkSize: number, overlap: number): string[] {
    try {
      const jsonData = JSON.parse(text);
      if (Array.isArray(jsonData)) {
        return jsonData.map((item, index) => 
          `Item ${index}: ${JSON.stringify(item, null, 2)}`
        ).filter(chunk => chunk.length <= chunkSize * 2);
      } else {
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
      return this.chunkText(text, chunkSize, overlap);
    }
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);
      
      const cleanedChunk = chunk
        .replace(/\\s+/g, ' ')
        .replace(/[\\x00-\\x1F\\x7F-\\x9F]/g, '')
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

  getProcessingStatus() {
    return {
      isProcessing: this.processingQueue.size > 0,
      queueSize: this.processingQueue.size,
    };
  }
}