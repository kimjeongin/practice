/**
 * Pipeline Factory - Component Wiring for Modern RAG Systems
 * Follows 2025 Dependency Injection and Factory patterns
 */

import { ServiceRegistry } from '@/shared/di/service-registry.js';
import { AdvancedServerConfig } from '@/infrastructure/config/config-factory.js';
import { RAGOrchestrator } from '@/app/orchestrator/rag-orchestrator.js';

// Core infrastructure imports
import { DatabaseConnection } from '@/infrastructure/database/database-connection.js';
import { EmbeddingFactory } from '@/infrastructure/embeddings/index.js';
import { EmbeddingAdapter } from '@/infrastructure/embeddings/embedding-adapter.js';

// Repository imports
import { FileRepository } from '@/rag/repositories/document-repository.js';
import { ChunkRepository } from '@/rag/repositories/chunk-repository.js';

// Service imports
import { FileProcessingService } from '@/rag/services/file-processing-service.js';
import { AdvancedSearchService } from '@/rag/services/search/advanced-search-service.js';
import { ModelManagementService } from '@/rag/services/model-management-service.js';

// Workflow imports
import { RAGWorkflow } from '@/rag/workflows/rag-workflow.js';

// Handler imports
import { SearchHandler } from '@/mcp/handlers/search-handler.js';
import { DocumentHandler } from '@/mcp/handlers/document-handler.js';
import { SystemHandler } from '@/mcp/handlers/system-handler.js';
import { ModelHandler } from '@/mcp/handlers/model-handler.js';

// MCP Server import
import { MCPServer } from '@/mcp/server/mcp-server.js';

// File system imports
import { FileWatcher } from '@/infrastructure/filesystem/watcher/file-watcher.js';

// Monitoring imports
import { monitoringDashboard } from '@/infrastructure/dashboard/monitoring-dashboard.js';

// Sync imports
import { VectorDbSyncManager } from '@/rag/services/data-integrity/vector-db-sync-manager.js';
import { VectorDbSyncScheduler } from '@/rag/services/data-integrity/vector-db-sync-scheduler.js';
import { VectorDbSyncTrigger } from '@/rag/services/data-integrity/vector-db-sync-trigger.js';

import { logger } from '@/shared/logger/index.js';
import { withTimeout, withRetry } from '@/shared/utils/resilience.js';

export class PipelineFactory {
  
  /**
   * Create and configure RAG Orchestrator with all dependencies
   */
  static async createRAGOrchestrator(config: AdvancedServerConfig): Promise<RAGOrchestrator> {
    logger.info('Creating RAG Orchestrator with factory pattern');
    
    const serviceRegistry = new ServiceRegistry();
    
    // Register all services
    await PipelineFactory.registerInfrastructureServices(serviceRegistry, config);
    await PipelineFactory.registerDomainServices(serviceRegistry, config);
    await PipelineFactory.registerApplicationServices(serviceRegistry, config);
    
    const orchestrator = new RAGOrchestrator(config, serviceRegistry);
    
    logger.info('RAG Orchestrator created successfully', {
      registeredServices: serviceRegistry.getServiceNames().length,
      vectorStoreProvider: config.vectorStore.provider
    });
    
    return orchestrator;
  }

  /**
   * Register infrastructure layer services
   */
  private static async registerInfrastructureServices(
    registry: ServiceRegistry, 
    config: AdvancedServerConfig
  ): Promise<void> {
    logger.debug('Registering infrastructure services');

    // Database Connection
    registry.register(
      'database',
      () => new DatabaseConnection(),
      { lifecycle: 'singleton' }
    );

    // Vector Store Service (based on configuration)
    registry.register(
      'vectorStore',
      async () => {
        return await PipelineFactory.createVectorStoreService(config);
      },
      { dependencies: ['embeddingService'], lifecycle: 'singleton' }
    );

    // Embedding Service with fallback
    registry.register(
      'embeddingService',
      async () => {
        logger.info('Initializing embedding service with factory');
        const { embeddings, actualService } = await withRetry(
          () => EmbeddingFactory.createWithFallback(config),
          'embedding_service_initialization',
          { retries: 3, minTimeout: 2000 }
        );
        return new EmbeddingAdapter(embeddings, actualService);
      },
      { lifecycle: 'singleton' }
    );

    // File Watcher
    registry.register(
      'fileWatcher',
      () => {
        const database = registry.resolve('database');
        return new FileWatcher(database as any, config.documentsDir);
      },
      { dependencies: ['database'], lifecycle: 'singleton' }
    );

    logger.debug('Infrastructure services registered');
  }

  /**
   * Register domain layer services (repositories and core services)
   */
  private static async registerDomainServices(
    registry: ServiceRegistry,
    config: AdvancedServerConfig
  ): Promise<void> {
    logger.debug('Registering domain services');

    // Repositories
    registry.register(
      'fileRepository',
      (database: DatabaseConnection) => new FileRepository(database),
      { dependencies: ['database'], lifecycle: 'singleton' }
    );

    registry.register(
      'chunkRepository', 
      (database: DatabaseConnection) => new ChunkRepository(database),
      { dependencies: ['database'], lifecycle: 'singleton' }
    );

    // Core Business Services
    registry.register(
      'searchService',
      (vectorStore: any, fileRepo: any, chunkRepo: any) => 
        new AdvancedSearchService(vectorStore, fileRepo, chunkRepo, config),
      { 
        dependencies: ['vectorStore', 'fileRepository', 'chunkRepository'], 
        lifecycle: 'singleton' 
      }
    );

    registry.register(
      'fileProcessingService',
      (fileRepo: any, chunkRepo: any, vectorStore: any) =>
        new FileProcessingService(fileRepo, chunkRepo, vectorStore, config),
      {
        dependencies: ['fileRepository', 'chunkRepository', 'vectorStore'],
        lifecycle: 'singleton'
      }
    );

    registry.register(
      'modelManagementService',
      (embeddingService: EmbeddingAdapter) => new ModelManagementService(embeddingService),
      { dependencies: ['embeddingService'], lifecycle: 'singleton' }
    );

    // Synchronization Services
    registry.register(
      'syncManager',
      (fileRepo: any, chunkRepo: any, vectorStore: any) =>
        new VectorDbSyncManager(fileRepo, chunkRepo, vectorStore, config),
      {
        dependencies: ['fileRepository', 'chunkRepository', 'vectorStore'],
        lifecycle: 'singleton'
      }
    );

    registry.register(
      'syncScheduler',
      (syncManager: VectorDbSyncManager) => 
        new VectorDbSyncScheduler(syncManager, {
          interval: 30 * 60 * 1000, // 30분
          deepScanInterval: 2 * 60 * 60 * 1000, // 2시간
          enabled: process.env['SYNC_SCHEDULER_ENABLED'] !== 'false',
          autoFix: true
        }),
      { dependencies: ['syncManager'], lifecycle: 'singleton' }
    );

    registry.register(
      'syncTrigger',
      (syncManager: VectorDbSyncManager) =>
        new VectorDbSyncTrigger(syncManager, {
          errorThreshold: 5,
          errorWindow: 5 * 60 * 1000, // 5분
          minAutoSyncInterval: 10 * 60 * 1000 // 10분
        }),
      { dependencies: ['syncManager'], lifecycle: 'singleton' }
    );

    logger.debug('Domain services registered');
  }

  /**
   * Register application layer services
   */
  private static async registerApplicationServices(
    registry: ServiceRegistry,
    config: AdvancedServerConfig
  ): Promise<void> {
    logger.debug('Registering application services');

    // RAG Workflow
    registry.register(
      'ragWorkflow',
      (searchService: any, fileRepo: any, chunkRepo: any) =>
        new RAGWorkflow(searchService, fileRepo, chunkRepo, config),
      {
        dependencies: ['searchService', 'fileRepository', 'chunkRepository'],
        lifecycle: 'singleton'
      }
    );

    // MCP Handlers
    registry.register(
      'searchHandler',
      (ragWorkflow: RAGWorkflow) => new SearchHandler(ragWorkflow),
      { dependencies: ['ragWorkflow'], lifecycle: 'singleton' }
    );

    registry.register(
      'documentHandler',
      (fileRepo: any, fileProcessing: any) => new DocumentHandler(fileRepo, fileProcessing),
      { dependencies: ['fileRepository', 'fileProcessingService'], lifecycle: 'singleton' }
    );

    registry.register(
      'systemHandler',
      (searchService: any, fileRepo: any, chunkRepo: any, vectorStore: any, fileProcessing: any) =>
        new SystemHandler(searchService, fileRepo, chunkRepo, config, vectorStore, fileProcessing),
      {
        dependencies: ['searchService', 'fileRepository', 'chunkRepository', 'vectorStore', 'fileProcessingService'],
        lifecycle: 'singleton'
      }
    );

    registry.register(
      'modelHandler',
      (modelManagement: ModelManagementService) => new ModelHandler(modelManagement),
      { dependencies: ['modelManagementService'], lifecycle: 'singleton' }
    );

    // MCP Server
    registry.register(
      'mcpServer',
      (searchHandler: any, docHandler: any, systemHandler: any, modelHandler: any, fileRepo: any) =>
        new MCPServer(searchHandler, docHandler, systemHandler, modelHandler, fileRepo, config),
      {
        dependencies: ['searchHandler', 'documentHandler', 'systemHandler', 'modelHandler', 'fileRepository'],
        lifecycle: 'singleton'
      }
    );

    logger.debug('Application services registered');
  }

  /**
   * Create vector store service based on configuration
   */
  private static async createVectorStoreService(config: AdvancedServerConfig): Promise<any> {
    logger.info('Creating vector store service', { provider: config.vectorStore.provider });

    switch (config.vectorStore.provider) {
      case 'faiss':
        return await PipelineFactory.createFaissVectorStore(config);
      
      case 'qdrant':
        return await PipelineFactory.createQdrantVectorStore(config);
      
      case 'weaviate':
        return await PipelineFactory.createWeaviateVectorStore(config);
      
      case 'chroma':
        return await PipelineFactory.createChromaVectorStore(config);
      
      default:
        throw new Error(`Unsupported vector store provider: ${config.vectorStore.provider}`);
    }
  }

  private static async createFaissVectorStore(config: AdvancedServerConfig): Promise<any> {
    // Import FAISS implementation dynamically to avoid loading unused dependencies
    const { FaissVectorStoreManager } = await import('@/infrastructure/vectorstore/providers/faiss-vector-store.js');
    const { VectorStoreAdapter } = await import('@/infrastructure/vectorstore/vector-store-adapter.js');
    
    // Get embeddings from registry would be circular, so we'll create it here
    const { embeddings } = await EmbeddingFactory.createWithFallback(config);
    
    const faissStore = new FaissVectorStoreManager(embeddings, config);
    await withTimeout(
      faissStore.initialize(),
      {
        timeoutMs: 60000,
        operation: 'faiss_vector_store_initialization'
      }
    );
    
    return new VectorStoreAdapter(faissStore);
  }

  private static async createQdrantVectorStore(config: AdvancedServerConfig): Promise<any> {
    // TODO: Implement Qdrant vector store
    throw new Error('Qdrant vector store not yet implemented');
  }

  private static async createWeaviateVectorStore(config: AdvancedServerConfig): Promise<any> {
    // TODO: Implement Weaviate vector store
    throw new Error('Weaviate vector store not yet implemented');
  }

  private static async createChromaVectorStore(config: AdvancedServerConfig): Promise<any> {
    // TODO: Implement ChromaDB vector store
    throw new Error('ChromaDB vector store not yet implemented');
  }

  /**
   * Create development environment orchestrator with optimized settings
   */
  static async createDevelopmentOrchestrator(): Promise<RAGOrchestrator> {
    const { ConfigFactory } = await import('@/infrastructure/config/config-factory.js');
    const config = ConfigFactory.createDevelopmentConfig();
    return PipelineFactory.createRAGOrchestrator(config);
  }

  /**
   * Create production environment orchestrator with all features enabled
   */
  static async createProductionOrchestrator(): Promise<RAGOrchestrator> {
    const { ConfigFactory } = await import('@/infrastructure/config/config-factory.js');
    const config = ConfigFactory.createProductionConfig();
    ConfigFactory.validateConfig(config);
    return PipelineFactory.createRAGOrchestrator(config);
  }

  /**
   * Create test environment orchestrator with minimal footprint
   */
  static async createTestOrchestrator(): Promise<RAGOrchestrator> {
    const { ConfigFactory } = await import('@/infrastructure/config/config-factory.js');
    const config = ConfigFactory.createTestConfig();
    return PipelineFactory.createRAGOrchestrator(config);
  }
}