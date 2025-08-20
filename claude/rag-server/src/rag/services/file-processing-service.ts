import { basename } from 'path';
import { createHash } from 'crypto';
import { IFileProcessingService, VectorDocument } from '@/shared/types/interfaces.js';
import { IFileRepository } from '@/rag/repositories/document-repository.js';
import { IChunkRepository } from '@/rag/repositories/chunk-repository.js';
import { IVectorStoreService } from '@/shared/types/interfaces.js';
import { DocumentChunk, FileMetadata } from '@/rag/models/models.js';
import { Document } from '@langchain/core/documents';
import { ServerConfig } from '@/shared/types/index.js';
import { FileReader } from '@/rag/utils/file-reader.js';
import { ChunkingService } from '@/rag/services/chunking-service.js';
import { 
  FileProcessingError, 
  VectorStoreError
} from '@/shared/errors/index.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { withTimeout, withRetry, BatchProcessor } from '@/shared/utils/resilience.js';
import { errorMonitor } from '@/shared/monitoring/error-monitor.js';

export class FileProcessingService implements IFileProcessingService {
  private processingQueue = new Set<string>();
  private fileReader: FileReader;
  private textChunker: ChunkingService;

  constructor(
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private vectorStoreService: IVectorStoreService,
    private config: ServerConfig
  ) {
    this.fileReader = new FileReader();
    this.textChunker = new ChunkingService(config);
  }

  async processFile(filePath: string): Promise<void> {
    if (this.processingQueue.has(filePath)) {
      logger.debug('File already being processed', { filePath, component: 'DocumentService' });
      return;
    }

    this.processingQueue.add(filePath);
    const endTiming = startTiming('file_processing', { filePath, component: 'DocumentService' });

    try {
      logger.info('Starting file processing', { filePath, fileName: basename(filePath) });
      
      let fileMetadata = await this.fileRepository.getFileByPath(filePath);
      if (!fileMetadata) {
        const error = new FileProcessingError(
          'File not found in database', 
          filePath, 
          'file_lookup'
        );
        errorMonitor.recordError(error);
        logger.warn('File not found in database, skipping', { filePath });
        return;
      }

      // 타임아웃 적용된 파일 읽기 (PDF 처리 시 오래 걸릴 수 있음)
      const document = await withTimeout(
        this.fileReader.readFileContent(filePath),
        {
          timeoutMs: 60000, // 1분
          operation: 'file_reading',
          fallback: async () => {
            logger.warn('File reading timed out, attempting fallback', { filePath });
            return null;
          }
        }
      );

      if (!document) {
        const error = new FileProcessingError(
          'Could not read file content', 
          filePath, 
          'content_reading'
        );
        errorMonitor.recordError(error);
        logger.error('Failed to read file content', error, { filePath });
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

      // 재시도 로직 적용된 청킹
      const documentChunks = await withRetry(
        () => this.textChunker.chunkDocument(document),
        'document_chunking',
        { retries: 2 }
      );
      
      logger.info('Document chunked successfully', { 
        filePath, 
        chunkCount: documentChunks.length 
      });

      // Clear existing chunks for this file
      await this.chunkRepository.deleteDocumentChunks(fileMetadata.id);
      await this.vectorStoreService.removeDocumentsByFileId(fileMetadata.id);

      // Process chunks in batches with enhanced error handling
      const batchSize = this.config.embeddingBatchSize || 10;
      
      for (let i = 0; i < documentChunks.length; i += batchSize) {
        const batch = documentChunks.slice(i, i + batchSize);
        await withRetry(
          () => this.processBatch(fileMetadata, batch, i),
          `batch_processing_${i}`,
          { retries: 3, minTimeout: 2000 }
        );
      }

      logger.info('File processing completed successfully', {
        filePath,
        fileName: basename(filePath),
        chunkCount: documentChunks.length
      });
    } catch (error) {
      const processingError = new FileProcessingError(
        `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'file_processing',
        error instanceof Error ? error : undefined
      );
      
      errorMonitor.recordError(processingError);
      logger.error('File processing failed', processingError, { filePath });
      throw processingError;
    } finally {
      this.processingQueue.delete(filePath);
      endTiming();
    }
  }

  async removeFile(filePath: string): Promise<void> {
    const endTiming = startTiming('file_removal', { filePath, component: 'DocumentService' });
    
    try {
      const fileMetadata = await this.fileRepository.getFileByPath(filePath);
      if (fileMetadata) {
        await withTimeout(
          this.vectorStoreService.removeDocumentsByFileId(fileMetadata.id),
          {
            timeoutMs: 30000, // 30초
            operation: 'vector_store_removal'
          }
        );
        
        logger.info('File removed from vector store', {
          filePath,
          fileName: basename(filePath),
          fileId: fileMetadata.id
        });
      } else {
        logger.warn('File not found for removal', { filePath });
      }
    } catch (error) {
      const removalError = new VectorStoreError(
        `Failed to remove file from vector store: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'file_removal',
        { filePath },
        error instanceof Error ? error : undefined
      );
      
      errorMonitor.recordError(removalError);
      logger.error('File removal failed', removalError, { filePath });
      throw removalError;
    } finally {
      endTiming();
    }
  }

  private async processBatch(fileMetadata: FileMetadata, chunks: Document[], startIndex: number): Promise<void> {
    const endTiming = startTiming('batch_processing', {
      fileId: fileMetadata.id,
      batchSize: chunks.length,
      startIndex,
      component: 'DocumentService'
    });
    
    try {
      logger.debug('Processing chunk batch', {
        fileId: fileMetadata.id,
        batchSize: chunks.length,
        startIndex
      });
      
      const vectorDocuments: VectorDocument[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkIndex = startIndex + i;
        const chunkId = this.generateChunkId(fileMetadata.id, chunkIndex);
        
        // Prepare for vector store with enhanced metadata from LangChain
        const vectorDoc: VectorDocument = {
          id: chunkId,
          content: chunk?.pageContent || '',
          metadata: {
            ...(chunk?.metadata || {}), // Include all LangChain metadata
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
          content: chunk?.pageContent || '',
          embeddingId: chunkId,
        };
        
        const insertedChunkId = await this.chunkRepository.insertDocumentChunk(dbChunk);
        
        // Add SQLite ID to vector document metadata for cross-reference
        vectorDoc.metadata.sqliteId = insertedChunkId;
      }

      // Add to vector store with embeddings (타임아웃 및 재시도 적용)
      await withTimeout(
        this.vectorStoreService.addDocuments(vectorDocuments),
        {
          timeoutMs: 120000, // 2분 (임베딩 생성 시간 고려)
          operation: 'vector_store_addition'
        }
      );
      
      logger.debug('Batch processed successfully', {
        fileId: fileMetadata.id,
        batchSize: chunks.length,
        startIndex
      });
    } catch (error) {
      const batchError = new VectorStoreError(
        `Failed to process batch starting at index ${startIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'batch_processing',
        {
          fileId: fileMetadata.id,
          batchSize: chunks.length,
          startIndex
        },
        error instanceof Error ? error : undefined
      );
      
      errorMonitor.recordError(batchError);
      logger.error('Batch processing failed', batchError);
      throw batchError;
    } finally {
      endTiming();
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
    const endTiming = startTiming('force_reindex', { clearCache, component: 'DocumentService' });
    
    try {
      logger.info('Starting force reindex', { clearCache });
      
      // Clear vector cache if requested
      if (clearCache) {
        logger.info('Clearing vector cache');
        if ('rebuildIndex' in this.vectorStoreService) {
          await withTimeout(
            (this.vectorStoreService as any).rebuildIndex(),
            {
              timeoutMs: 300000, // 5분
              operation: 'vector_cache_rebuild'
            }
          );
        }
      }
      
      // Reprocess all files with batch processing
      const allFiles = await this.fileRepository.getAllFiles();
      logger.info('Reprocessing all files', { fileCount: allFiles.length });
      
      await BatchProcessor.processBatch(
        allFiles,
        async (file) => {
          await this.processFile(file.path);
          return file;
        },
        {
          batchSize: 5, // 동시 처리 파일 수 제한
          concurrency: 2,
          operation: 'force_reindex_batch'
        }
      );
      
      logger.info('Force reindexing completed successfully', { 
        processedFiles: allFiles.length 
      });
    } catch (error) {
      const reindexError = new VectorStoreError(
        `Force reindex failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'force_reindex',
        { clearCache },
        error instanceof Error ? error : undefined
      );
      
      errorMonitor.recordError(reindexError);
      logger.error('Force reindex failed', reindexError);
      throw reindexError;
    } finally {
      endTiming();
    }
  }

  getProcessingStatus() {
    return {
      isProcessing: this.processingQueue.size > 0,
      queueSize: this.processingQueue.size,
    };
  }
}