import { DatabaseManager } from '../infrastructure/database/connection.js';
import { SearchService } from '../rag/services/searchService.js';
import { RAGWorkflow } from '../rag/workflows/ragWorkflow.js';
import { FileProcessingService } from '../rag/services/documentService.js';
import { ModelManagementService } from '../rag/services/modelService.js';

import { FileRepository } from '../rag/repositories/documentRepository.js';
import { ChunkRepository } from '../rag/repositories/chunkRepository.js';

import { SearchHandler } from '../mcp/handlers/searchHandler.js';
import { DocumentHandler } from '../mcp/handlers/documentHandler.js';
import { SystemHandler } from '../mcp/handlers/systemHandler.js';
import { ModelHandler } from '../mcp/handlers/modelHandler.js';

import { MCPServer } from '../mcp/server/mcpServer.js';
import { VectorStoreAdapter } from '../infrastructure/vectorstore/base.js';
import { EmbeddingAdapter } from '../infrastructure/embeddings/base.js';

import { FileWatcher } from '../infrastructure/monitoring/fileWatcher.js';
import { EmbeddingFactory } from '../infrastructure/embeddings/index.js';
import { FaissVectorStoreManager } from '../infrastructure/vectorstore/providers/faiss.js';
import { ServerConfig } from '../shared/types/index.js';

export class RAGApplication {
  private db: DatabaseManager;
  private mcpController: MCPServer;
  private fileWatcher: FileWatcher;
  private ragWorkflowService: RAGWorkflow;
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

      // Initialize RAG workflow service
      this.ragWorkflowService = new RAGWorkflow(
        searchService,
        fileRepository,
        chunkRepository,
        this.config
      );

      // Initialize handlers
      const searchHandler = new SearchHandler(this.ragWorkflowService);
      const fileHandler = new DocumentHandler(fileRepository);
      const systemHandler = new SystemHandler(searchService, fileRepository, chunkRepository, this.config);
      const modelHandler = new ModelHandler(modelManagementService);

      // Initialize MCP controller
      this.mcpController = new MCPServer(
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