/**
 * RAG MCP Server Entry Point
 * Production multi-transport MCP server with full RAG integration
 */

import { ConfigFactory } from '@/shared/config/config-factory.js';
import { logger } from '@/shared/logger/index.js';
import { MCPServer } from '@/domains/mcp/server/server.js';
import { SearchHandler } from '@/domains/mcp/handlers/search.js';
import { DocumentHandler } from '@/domains/mcp/handlers/document.js';
import { SystemHandler } from '@/domains/mcp/handlers/system.js';
import { ModelHandler } from '@/domains/mcp/handlers/model.js';
import { RAGWorkflow } from '@/domains/rag/workflows/workflow.js';
import { FileRepository } from '@/domains/rag/repositories/document.js';
import { ChunkRepository } from '@/domains/rag/repositories/chunk.js';
import { SearchService } from '@/domains/rag/services/search/search-service.js';
import { DatabaseConnection } from '@/shared/database/connection.js';
import { serviceRegistry } from '@/shared/dependency-injection/service-registry.js';

/**
 * Initialize all dependencies and create MCPServer instance
 */
async function initializeServices(config: any) {
  // Initialize database connection
  const dbConnection = new DatabaseConnection();

  // Register services in dependency injection container
  serviceRegistry
    .registerInstance('config', config)
    .registerInstance('dbConnection', dbConnection)
    .register('fileRepository', FileRepository, { dependencies: ['dbConnection'] })
    .register('chunkRepository', ChunkRepository, { dependencies: ['dbConnection'] });

  // Initialize repositories
  const fileRepository = await serviceRegistry.resolve<FileRepository>('fileRepository');
  const chunkRepository = await serviceRegistry.resolve<ChunkRepository>('chunkRepository');

  // Initialize vector store and search service  
  const { VectorStoreFactory } = await import('@/shared/config/vector-store-factory.js');
  const vectorStoreProvider = VectorStoreFactory.createProvider(config.vectorStore);
  const vectorStore = VectorStoreFactory.createService(config.vectorStore);
  
  const searchService = new SearchService(vectorStoreProvider, fileRepository, chunkRepository, config);
  
  // Initialize RAG workflow
  const ragWorkflow = new RAGWorkflow(searchService, fileRepository, chunkRepository, config);

  // Initialize model management service
  let modelService;
  try {
    const { ModelManagementService } = await import('@/domains/rag/services/model-management.js');
    modelService = new ModelManagementService(config);
  } catch (error) {
    logger.warn('Model management service not available, using mock implementation');
    modelService = {
      getAvailableModels: async () => ({ 'all-MiniLM-L6-v2': { name: 'all-MiniLM-L6-v2', dimensions: 384 } }),
      getCurrentModelInfo: async () => ({ name: 'all-MiniLM-L6-v2', dimensions: 384 }),
      switchEmbeddingModel: async () => {},
      downloadModel: async () => ({ success: true, message: 'Mock download' }),
      getModelCacheInfo: async () => ({ cacheSize: 0, models: [] }),
      getDownloadProgress: async () => ({})
    };
  }

  // Initialize file processing service (optional)
  let fileProcessingService;
  try {
    const { FileProcessingService } = await import('@/domains/rag/services/document/processor.js');
    fileProcessingService = new FileProcessingService(fileRepository, chunkRepository, vectorStore, config);
  } catch (error) {
    logger.warn('File processing service not available');
  }

  // Initialize handlers
  const searchHandler = new SearchHandler(ragWorkflow);
  const documentHandler = new DocumentHandler(fileRepository, fileProcessingService!);
  const systemHandler = new SystemHandler(
    searchService, 
    fileRepository, 
    chunkRepository, 
    config,
    vectorStore,
    fileProcessingService
  );
  const modelHandler = new ModelHandler(modelService);

  // Create and return MCP Server
  return new MCPServer(
    searchHandler,
    documentHandler,
    systemHandler,
    modelHandler,
    fileRepository,
    config
  );
}

async function main(): Promise<void> {
  let mcpServer: MCPServer | null = null;

  try {
    const config = ConfigFactory.getCurrentConfig();
    
    logger.info('🎯 Starting Production RAG MCP Server', {
      version: '1.0.0',
      transport: config.mcp.type,
      port: config.mcp.port,
      host: config.mcp.host,
      nodeVersion: process.version,
      pid: process.pid
    });

    // Initialize all services and create MCP server
    logger.info('🔧 Initializing RAG services and dependencies...');
    mcpServer = await initializeServices(config);

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      if (mcpServer) {
        try {
          await mcpServer.shutdown();
        } catch (error) {
          logger.error('Error during MCP server shutdown', error instanceof Error ? error : new Error(String(error)));
        }
      }

      // Cleanup service registry
      serviceRegistry.clear();

      process.exit(0);
    };

    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Start the MCP server
    logger.info('🚀 Starting RAG MCP Server...');
    await mcpServer.start();

    logger.info('✅ Production RAG MCP Server started successfully', {
      transport: config.mcp.type,
      port: config.mcp.port,
      host: config.mcp.host,
      message: 'Server ready with full RAG capabilities and multi-transport support'
    });

  } catch (error) {
    logger.fatal('Failed to start RAG MCP Server', error instanceof Error ? error : new Error(String(error)));
    
    if (mcpServer) {
      try {
        await mcpServer.shutdown();
      } catch (shutdownError) {
        logger.error('Error during emergency shutdown', shutdownError instanceof Error ? shutdownError : new Error(String(shutdownError)));
      }
    }
    
    // Cleanup service registry on error
    serviceRegistry.clear();
    
    process.exit(1);
  }
}

// Export for testing purposes
export { main };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}