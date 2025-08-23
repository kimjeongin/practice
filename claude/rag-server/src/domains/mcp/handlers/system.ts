import { ISearchService, IVectorStoreService, IFileProcessingService } from '@/shared/types/interfaces.js';
import { IFileRepository } from '@/domains/rag/repositories/document.js';
import { IChunkRepository } from '@/domains/rag/repositories/chunk.js';
import { ServerConfig } from '@/shared/types/index.js';
import { SyncHandler } from './sync.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export class SystemHandler {
  private syncHandler?: SyncHandler;

  constructor(
    private searchService: ISearchService,
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private config: ServerConfig,
    vectorStoreService?: IVectorStoreService,
    fileProcessingService?: IFileProcessingService
  ) {
    if (vectorStoreService) {
      this.syncHandler = new SyncHandler(
        fileRepository,
        chunkRepository,
        vectorStoreService,
        config,
        fileProcessingService
      );
    }
  }

  async handleGetServerStatus() {
    const files = await this.fileRepository.getAllFiles();
    const indexedFiles = files.length;
    
    let totalChunks = 0;
    for (const file of files) {
      const chunks = await this.chunkRepository.getDocumentChunks(file.id);
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
        dataDirectory: this.config.documentsDir,
        embeddingService: this.config.embeddingService,
        chunkSize: this.config.chunkSize,
        similarityTopK: this.config.similarityTopK,
      },
      supportedFormats: ['.txt', '.md', '.json', '.xml', '.html', '.csv'],
    };
  }

  getTools(): Tool[] {
    return [{
      name: 'get_server_status',
      description: 'Get the current status and statistics of the RAG server',
      inputSchema: { type: 'object', properties: {}, required: [] },
    }]    
  }
}