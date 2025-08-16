import { basename } from 'path';
import { createHash } from 'crypto';
import { IFileProcessingService, VectorDocument } from '../../shared/types/interfaces.js';
import { IFileRepository } from '../repositories/documentRepository.js';
import { IChunkRepository } from '../repositories/chunkRepository.js';
import { IVectorStoreService } from '../../shared/types/interfaces.js';
import { DocumentChunk, FileMetadata } from '../models/models.js';
import { Document } from '@langchain/core/documents';
import { ServerConfig } from '../../shared/types/index.js';
import { LangChainFileReader } from '../utils/langchainFileReader.js';
import { LangChainChunkingService } from './langchainChunkingService.js';

export class FileProcessingService implements IFileProcessingService {
  private processingQueue = new Set<string>();
  private fileReader: LangChainFileReader;
  private textChunker: LangChainChunkingService;

  constructor(
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private vectorStoreService: IVectorStoreService,
    private config: ServerConfig
  ) {
    this.fileReader = new LangChainFileReader();
    this.textChunker = new LangChainChunkingService(config);
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

      const document = await this.fileReader.readFileContent(filePath);
      if (!document) {
        console.log(`❌ Could not read content from ${filePath}`);
        return;
      }

      // Add file metadata to document metadata
      document.metadata = {
        ...document.metadata,
        fileId: fileMetadata.id,
        fileName: fileMetadata.name,
        filePath: fileMetadata.path,
        fileType: fileMetadata.fileType,
        createdAt: fileMetadata.createdAt.toISOString(),
      };

      const documentChunks = await this.textChunker.chunkDocument(document);
      console.log(`📄 Split ${basename(filePath)} into ${documentChunks.length} chunks`);

      // Clear existing chunks for this file
      this.chunkRepository.deleteDocumentChunks(fileMetadata.id);
      await this.vectorStoreService.removeDocumentsByFileId(fileMetadata.id);

      // Process chunks in batches
      const batchSize = this.config.embeddingBatchSize || 10;
      
      for (let i = 0; i < documentChunks.length; i += batchSize) {
        const batch = documentChunks.slice(i, i + batchSize);
        await this.processBatch(fileMetadata, batch, i);
      }

      console.log(`✅ Successfully processed ${documentChunks.length} chunks for ${basename(filePath)}`);
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

  private async processBatch(fileMetadata: FileMetadata, chunks: Document[], startIndex: number): Promise<void> {
    try {
      console.log(`⚙️  Processing batch of ${chunks.length} chunks (starting at index ${startIndex})`);
      
      const vectorDocuments: VectorDocument[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkIndex = startIndex + i;
        const chunkId = this.generateChunkId(fileMetadata.id, chunkIndex);
        
        // Prepare for vector store with enhanced metadata from LangChain
        const vectorDoc: VectorDocument = {
          id: chunkId,
          content: chunk.pageContent,
          metadata: {
            ...chunk.metadata, // Include all LangChain metadata
            fileId: fileMetadata.id,
            fileName: fileMetadata.name,
            filePath: fileMetadata.path,
            chunkIndex,
            fileType: fileMetadata.fileType,
            createdAt: fileMetadata.createdAt.toISOString(),
          },
        };

        vectorDocuments.push(vectorDoc);
        
        // Store in SQLite for metadata and reference (using same chunking result)
        const dbChunk: Omit<DocumentChunk, 'id'> = {
          fileId: fileMetadata.id,
          chunkIndex,
          content: chunk.pageContent,
          embeddingId: chunkId,
        };
        
        const insertedChunkId = this.chunkRepository.insertDocumentChunk(dbChunk);
        
        // Add SQLite ID to vector document metadata for cross-reference
        vectorDoc.metadata.sqliteId = insertedChunkId;
      }

      // Add to vector store with embeddings
      await this.vectorStoreService.addDocuments(vectorDocuments);
      
      console.log(`✅ Processed batch of ${chunks.length} chunks with synchronized storage`);
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


  async forceReindex(clearCache: boolean = false): Promise<void> {
    console.log('🔄 Force reindexing all files...');
    
    try {
      // Clear vector cache if requested
      if (clearCache) {
        console.log('🗑️ Clearing vector cache...');
        if ('rebuildIndex' in this.vectorStoreService) {
          await (this.vectorStoreService as any).rebuildIndex();
        }
      }
      
      // Reprocess all files
      const allFiles = this.fileRepository.getAllFiles();
      for (const file of allFiles) {
        await this.processFile(file.path);
      }
      
      console.log('✅ Force reindexing completed');
    } catch (error) {
      console.error('❌ Error during force reindex:', error);
      throw error;
    }
  }

  getProcessingStatus() {
    return {
      isProcessing: this.processingQueue.size > 0,
      queueSize: this.processingQueue.size,
    };
  }
}