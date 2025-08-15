import { basename } from 'path';
import { createHash } from 'crypto';
import { IFileProcessingService, VectorDocument } from '../../shared/types/interfaces.js';
import { IFileRepository } from '../repositories/documentRepository.js';
import { IChunkRepository } from '../repositories/chunkRepository.js';
import { IVectorStoreService } from '../../shared/types/interfaces.js';
import { DocumentChunk, FileMetadata } from '../models/models.js';
import { ServerConfig } from '../../shared/types/index.js';
import { FileReaderService } from '../utils/fileUtils.js';
import { TextChunkingService } from './chunkingService.js';

export class FileProcessingService implements IFileProcessingService {
  private processingQueue = new Set<string>();
  private fileReader: FileReaderService;
  private textChunker: TextChunkingService;

  constructor(
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private vectorStoreService: IVectorStoreService,
    private config: ServerConfig
  ) {
    this.fileReader = new FileReaderService();
    this.textChunker = new TextChunkingService(config);
  }

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

      const content = this.fileReader.readFileContent(filePath);
      if (!content) {
        console.log(`❌ Could not read content from ${filePath}`);
        return;
      }

      const textChunks = await this.textChunker.chunkText(content, fileMetadata.fileType);
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


  getProcessingStatus() {
    return {
      isProcessing: this.processingQueue.size > 0,
      queueSize: this.processingQueue.size,
    };
  }
}