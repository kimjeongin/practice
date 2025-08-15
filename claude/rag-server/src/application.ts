import { DatabaseManager } from './database/connection.js';
import { LangChainRAGService } from './services/langchain-rag-service.js';
import { SearchService } from './services/search-service.js';
import { FileProcessingService } from './services/file-processing-service.js';
import { ModelManagementService } from './services/model-management-service.js';

import { FileRepository } from './repositories/file-repository.js';
import { ChunkRepository } from './repositories/chunk-repository.js';

import { SearchHandler } from './handlers/search-handler.js';
import { FileHandler } from './handlers/file-handler.js';
import { SystemHandler } from './handlers/system-handler.js';
import { ModelHandler } from './handlers/model-handler.js';

import { MCPController } from './controllers/mcp-controller.js';
import { VectorStoreAdapter } from './infrastructure/vector-store-adapter.js';
import { EmbeddingAdapter } from './infrastructure/embedding-adapter.js';

import { FileWatcher } from './services/file-watcher.js';
import { EmbeddingFactory } from './services/embedding-factory.js';
import { FaissVectorStoreManager } from './services/faiss-vector-store.js';
import { ServerConfig } from './types/index.js';

export class RAGApplication {
  private db: DatabaseManager;
  private mcpController: MCPController;
  private fileWatcher: FileWatcher;
  private ragService: LangChainRAGService;
  private isInitialized = false;

  constructor(private config: ServerConfig) {
    this.db = new DatabaseManager(config.databasePath);
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing RAG Application...');
      
      // Initialize repositories
      const fileRepository = new FileRepository(this.db);
      const chunkRepository = new ChunkRepository(this.db);

      // Initialize embedding service
      console.log('🔍 Setting up embedding service...');
      const { embeddings, actualService } = await EmbeddingFactory.createWithFallback(this.config);
      const embeddingAdapter = new EmbeddingAdapter(embeddings, actualService);

      // Initialize vector store
      const faissVectorStore = new FaissVectorStoreManager(embeddings, this.config);
      await faissVectorStore.initialize();
      const vectorStoreAdapter = new VectorStoreAdapter(faissVectorStore);

      // Initialize services
      const searchService = new SearchService(
        vectorStoreAdapter,
        fileRepository,
        chunkRepository,
        this.config
      );

      const fileProcessingService = new FileProcessingService(
        fileRepository,
        chunkRepository,
        vectorStoreAdapter,
        this.config
      );

      const modelManagementService = new ModelManagementService(
        embeddingAdapter,
        vectorStoreAdapter,
        fileProcessingService,
        fileRepository
      );

      // Initialize handlers
      const searchHandler = new SearchHandler(searchService);
      const fileHandler = new FileHandler(fileRepository);
      const systemHandler = new SystemHandler(searchService, fileRepository, chunkRepository, this.config);
      const modelHandler = new ModelHandler(modelManagementService);

      // Initialize MCP controller
      this.mcpController = new MCPController(
        searchHandler,
        fileHandler,
        systemHandler,
        modelHandler,
        fileRepository,
        this.config
      );

      // Initialize file watcher
      this.fileWatcher = new FileWatcher(this.db, this.config.dataDir);
      this.fileWatcher.on('change', async (event) => {
        console.log(`📁 File ${event.type}: ${event.path}`);
        try {
          switch (event.type) {
            case 'added':
            case 'changed':
              await fileProcessingService.processFile(event.path);
              break;
            case 'removed':
              await fileProcessingService.removeFile(event.path);
              break;
          }
        } catch (error) {
          console.error(`❌ Error handling file change for ${event.path}:`, error);
        }
      });

      // Start file watcher and sync directory
      this.fileWatcher.start();
      await this.fileWatcher.syncDirectory();

      // Process any unprocessed documents
      await this.processUnvectorizedDocuments(fileProcessingService, fileRepository);

      this.isInitialized = true;
      console.log('✅ RAG Application initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize RAG Application:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('🎯 Starting RAG MCP Server...');
    await this.mcpController.start();
    
    console.log('🎯 RAG Application started successfully');
    console.log(`📁 Data directory: ${this.config.dataDir}`);
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down RAG Application...');
    try {
      if (this.fileWatcher) {
        this.fileWatcher.stop();
      }
      if (this.mcpController) {
        await this.mcpController.shutdown();
      }
      if (this.db) {
        this.db.close();
      }
      console.log('✅ RAG Application shutdown completed');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  private async processUnvectorizedDocuments(
    fileProcessingService: FileProcessingService,
    fileRepository: FileRepository
  ): Promise<void> {
    try {
      const allFiles = fileRepository.getAllFiles();
      console.log(`📊 Found ${allFiles.length} files in database`);

      let processedCount = 0;
      for (const file of allFiles) {
        const chunks = this.db.getDocumentChunks(file.id);
        
        if (chunks.length === 0) {
          console.log(`🔄 Processing unvectorized file: ${file.name}`);
          await fileProcessingService.processFile(file.path);
          processedCount++;
        }
      }
      
      if (processedCount > 0) {
        console.log(`✅ Processed ${processedCount} unvectorized documents`);
      } else {
        console.log('✅ All documents are already processed');
      }
    } catch (error) {
      console.error('❌ Error processing unvectorized documents:', error);
    }
  }
}