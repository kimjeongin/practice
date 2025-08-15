import { ISearchService } from '../../shared/types/interfaces.js';
import { IFileRepository } from '../../rag/repositories/documentRepository.js';
import { IChunkRepository } from '../../rag/repositories/chunkRepository.js';
import { ServerConfig } from '../../shared/types/index.js';

export class SystemHandler {
  constructor(
    private searchService: ISearchService,
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private config: ServerConfig
  ) {}

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
}