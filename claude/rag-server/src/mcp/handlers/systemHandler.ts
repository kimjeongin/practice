import { ISearchService, IVectorStoreService, IFileProcessingService } from '@/shared/types/interfaces';
import { IFileRepository } from '@/rag/repositories/documentRepository';
import { IChunkRepository } from '@/rag/repositories/chunkRepository';
import { ServerConfig } from '@/shared/types/index';
import { VectorDbSyncHandler } from './vectorDbSyncHandler';

export class SystemHandler {
  private syncHandler?: VectorDbSyncHandler;

  constructor(
    private searchService: ISearchService,
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private config: ServerConfig,
    vectorStoreService?: IVectorStoreService,
    fileProcessingService?: IFileProcessingService
  ) {
    if (vectorStoreService) {
      this.syncHandler = new VectorDbSyncHandler(
        fileRepository,
        chunkRepository,
        vectorStoreService,
        config,
        fileProcessingService
      );
    }
  }

  async handleGetServerStatus() {
    const files = this.fileRepository.getAllFiles();
    const indexedFiles = files.length;
    
    let totalChunks = 0;
    for (const file of files) {
      const chunks = this.chunkRepository.getDocumentChunks(file.id);
      totalChunks += chunks.length;
    }

    // Get vector store info if available
    let vectorStoreInfo = null;
    try {
      if ('getVectorStoreInfo' in this.searchService) {
        vectorStoreInfo = await (this.searchService as any).getVectorStoreInfo();
      }
    } catch (error) {
      console.warn('Could not get vector store info:', error);
    }

    // Get integrity status if sync handler is available
    let integrityStatus = null;
    if (this.syncHandler) {
      try {
        integrityStatus = await this.syncHandler.getIntegrityStatus();
      } catch (error) {
        console.warn('Could not get integrity status:', error);
      }
    }

    const isReady = 'isReady' in this.searchService ? 
      (this.searchService as any).isReady() : true;

    return {
      status: {
        ready: isReady,
        database: true, // TODO: implement database health check
        documentsCount: indexedFiles,
        chunksCount: totalChunks,
        serviceType: 'rag',
        vectorStore: vectorStoreInfo,
        integrity: integrityStatus,
      },
      stats: {
        totalFiles: indexedFiles,
        totalChunks,
        avgChunksPerFile: indexedFiles > 0 ? 
          Math.round(totalChunks / indexedFiles) : 0,
        vectorDocuments: vectorStoreInfo?.count || 0,
      },
      config: {
        dataDirectory: this.config.dataDir,
        embeddingService: this.config.embeddingService,
        chunkSize: this.config.chunkSize,
        similarityTopK: this.config.similarityTopK,
      },
      supportedFormats: ['.txt', '.md', '.json', '.xml', '.html', '.csv'],
    };
  }

  // Sync-related methods
  async handleSyncCheck(args: any) {
    if (!this.syncHandler) {
      throw new Error('Sync functionality not available - vector store service not initialized');
    }
    return await this.syncHandler.handleToolCall('vector_db_sync_check', args);
  }

  async handleCleanupOrphaned(args: any) {
    if (!this.syncHandler) {
      throw new Error('Sync functionality not available - vector store service not initialized');
    }
    return await this.syncHandler.handleToolCall('vector_db_cleanup_orphaned', args);
  }

  async handleForceSync(args: any) {
    if (!this.syncHandler) {
      throw new Error('Sync functionality not available - vector store service not initialized');
    }
    return await this.syncHandler.handleToolCall('vector_db_force_sync', args);
  }

  async handleIntegrityReport(args: any) {
    if (!this.syncHandler) {
      throw new Error('Sync functionality not available - vector store service not initialized');
    }
    return await this.syncHandler.handleToolCall('vector_db_integrity_report', args);
  }

  getSyncTools() {
    return this.syncHandler ? this.syncHandler.getTools() : [];
  }
}