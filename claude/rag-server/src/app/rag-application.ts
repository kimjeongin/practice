import { DatabaseConnection } from '@/infrastructure/database/database-connection.js';
import { SearchService } from '@/rag/services/search-service.js';
import { RAGWorkflow } from '@/rag/workflows/rag-workflow.js';
import { FileProcessingService } from '@/rag/services/file-processing-service.js';
import { ModelManagementService } from '@/rag/services/model-management-service.js';

import { FileRepository } from '@/rag/repositories/document-repository.js';
import { ChunkRepository } from '@/rag/repositories/chunk-repository.js';

import { SearchHandler } from '@/mcp/handlers/search-handler.js';
import { DocumentHandler } from '@/mcp/handlers/document-handler.js';
import { SystemHandler } from '@/mcp/handlers/system-handler.js';
import { ModelHandler } from '@/mcp/handlers/model-handler.js';

import { MCPServer } from '@/mcp/server/mcp-server.js';
import { VectorStoreAdapter } from '@/infrastructure/vectorstore/vector-store-adapter.js';
import { EmbeddingAdapter } from '@/infrastructure/embeddings/embedding-adapter.js';

import { FileWatcher } from '@/infrastructure/filesystem/watcher/file-watcher.js';
import { EmbeddingFactory } from '@/infrastructure/embeddings/index.js';
import { FaissVectorStoreManager } from '@/infrastructure/vectorstore/providers/faiss-vector-store.js';
import { ServerConfig } from '@/shared/types/index.js';
import { 
  StructuredError, 
  DatabaseError, 
  ConfigurationError, 
  ErrorCode 
} from '@/shared/errors/index.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { withTimeout, withRetry, CircuitBreakerManager } from '@/shared/utils/resilience.js';
import { errorMonitor, setupGlobalErrorHandling } from '@/shared/monitoring/error-monitor.js';
import { monitoringDashboard } from '@/infrastructure/dashboard/monitoring-dashboard.js';
import { VectorDbSyncManager } from '@/rag/services/data-integrity/vector-db-sync-manager.js';
import { VectorDbSyncScheduler } from '@/rag/services/data-integrity/vector-db-sync-scheduler.js';
import { VectorDbSyncTrigger } from '@/rag/services/data-integrity/vector-db-sync-trigger.js';

export class RAGApplication {
  private db: DatabaseConnection;
  private mcpController!: MCPServer;
  private fileWatcher!: FileWatcher;
  private ragWorkflowService!: RAGWorkflow;
  private syncScheduler!: VectorDbSyncScheduler;
  private syncTrigger!: VectorDbSyncTrigger;
  private isInitialized = false;
  private monitoringEnabled: boolean;

  constructor(private config: ServerConfig) {
    this.db = new DatabaseConnection(config.databasePath);
    this.monitoringEnabled = process.env['ENABLE_MONITORING'] !== 'false'; // 기본값: true
  }

  async initialize(): Promise<void> {
    const endTiming = startTiming('application_initialization', { component: 'RAGApplication' });
    
    // Setup global error handling
    setupGlobalErrorHandling();
    
    try {
      logger.info('Initializing RAG Application');
      
      // Initialize database with health check
      if (!this.db.isHealthy()) {
        throw new DatabaseError('Database is not healthy', 'health_check');
      }
      
      // Initialize repositories
      const fileRepository = new FileRepository(this.db);
      const chunkRepository = new ChunkRepository(this.db);
      logger.debug('Repositories initialized');

      // Initialize embedding service with retry
      logger.info('Setting up embedding service');
      const { embeddings, actualService } = await withRetry(
        () => EmbeddingFactory.createWithFallback(this.config),
        'embedding_service_initialization',
        { retries: 3, minTimeout: 2000 }
      );
      const embeddingAdapter = new EmbeddingAdapter(embeddings, actualService);

      // Initialize vector store with timeout
      logger.info('Initializing vector store');
      const faissVectorStore = new FaissVectorStoreManager(embeddings, this.config);
      await withTimeout(
        faissVectorStore.initialize(),
        {
          timeoutMs: 60000, // 1분
          operation: 'vector_store_initialization'
        }
      );
      const vectorStoreAdapter = new VectorStoreAdapter(faissVectorStore);

      // Initialize synchronization manager (without file processing service initially)
      const syncManager = new VectorDbSyncManager(
        fileRepository,
        chunkRepository,
        vectorStoreAdapter,
        this.config
      );

      // Perform startup synchronization check
      logger.info('Performing startup synchronization check');
      const syncReport = await withTimeout(
        syncManager.performStartupSync({
          autoFix: true,
          deepScan: true,
          includeNewFiles: true,
          maxConcurrency: 3
        }),
        {
          timeoutMs: 120000, // 2분
          operation: 'startup_synchronization'
        }
      );

      if (syncReport.summary.totalIssues > 0) {
        logger.warn('Synchronization issues detected and fixed on startup', {
          summary: syncReport.summary,
          fixedCount: syncReport.fixedIssues.length
        });
      } else {
        logger.info('All data is synchronized and consistent');
      }

      // Initialize sync scheduler for periodic checks
      this.syncScheduler = new VectorDbSyncScheduler(syncManager, {
        interval: 30 * 60 * 1000, // 30분마다 기본 동기화 체크
        deepScanInterval: 2 * 60 * 60 * 1000, // 2시간마다 깊은 스캔
        enabled: process.env['SYNC_SCHEDULER_ENABLED'] !== 'false',
        autoFix: true
      });

      // Initialize sync trigger for error-based sync
      this.syncTrigger = new VectorDbSyncTrigger(syncManager, {
        errorThreshold: 5, // 5개 에러 발생 시
        errorWindow: 5 * 60 * 1000, // 5분 윈도우
        minAutoSyncInterval: 10 * 60 * 1000 // 최소 10분 간격
      });

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
        embeddingAdapter
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
      const fileHandler = new DocumentHandler(fileRepository, fileProcessingService);
      const systemHandler = new SystemHandler(
        searchService, 
        fileRepository, 
        chunkRepository, 
        this.config,
        vectorStoreAdapter,
        fileProcessingService
      );
      const modelHandler = new ModelHandler(modelManagementService);
      logger.debug('Handlers initialized');

      // Initialize MCP controller
      this.mcpController = new MCPServer(
        searchHandler,
        fileHandler,
        systemHandler,
        modelHandler,
        fileRepository,
        this.config
      );

      // Initialize file watcher with enhanced error handling
      this.fileWatcher = new FileWatcher(this.db, this.config.documentsDir);
      this.fileWatcher.on('change', async (event) => {
        logger.info('File change detected', { 
          type: event.type, 
          path: event.path 
        });
        
        try {
          switch (event.type) {
            case 'added':
            case 'changed':
              await withTimeout(
                fileProcessingService.processFile(event.path),
                {
                  timeoutMs: 300000, // 5분
                  operation: 'file_change_processing'
                }
              );
              // Trigger sync check for added/changed files
              if (this.syncTrigger && event.path) {
                await this.syncTrigger.onFileChange(event.path, event.type);
              }
              break;
            case 'removed':
              await withTimeout(
                fileProcessingService.removeFile(event.path),
                {
                  timeoutMs: 30000, // 30초
                  operation: 'file_removal'
                }
              );
              // Trigger sync check for removed files
              if (this.syncTrigger && event.path) {
                await this.syncTrigger.onFileChange(event.path, event.type);
              }
              break;
          }
        } catch (error) {
          const fileError = new StructuredError(
            `Failed to handle file change: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ErrorCode.FILE_PARSE_ERROR,
            500,
            {
              component: 'FileWatcher',
              operation: `file_${event.type}`,
              filePath: event.path
            }
          );
          
          errorMonitor.recordError(fileError);
          logger.error('File change handling failed', fileError, {
            eventType: event.type,
            filePath: event.path
          });
          
          // On error, also trigger sync check to ensure consistency
          if (this.syncTrigger && event && event.path && event.type) {
            try {
              await this.syncTrigger.onFileChange(event.path, event.type);
            } catch (syncError) {
              logger.error('Failed to trigger sync check after file error', syncError instanceof Error ? syncError : new Error(String(syncError)), {
                eventPath: event.path,
                eventType: event.type
              });
            }
          }
        }
      });

      // Start file watcher and sync directory
      this.fileWatcher.start();
      await withTimeout(
        this.fileWatcher.syncDirectory(),
        {
          timeoutMs: 120000, // 2분
          operation: 'directory_sync'
        }
      );

      // Start sync scheduler for periodic background synchronization
      if (this.syncScheduler) {
        try {
          this.syncScheduler.start();
          logger.info('Sync scheduler started', {
            interval: '30 minutes',
            deepScan: '2 hours',
            autoFix: true
          });
        } catch (error) {
          logger.error('Failed to start sync scheduler', error instanceof Error ? error : new Error(String(error)));
        }
      } else {
        logger.warn('Sync scheduler not available - background synchronization disabled');
      }

      // Sync trigger is now integrated with file watcher above

      // Process any unprocessed documents
      await this.processUnvectorizedDocuments(fileProcessingService, fileRepository);

      this.isInitialized = true;
      logger.info('RAG Application initialized successfully');
      
      // Start monitoring dashboard if enabled
      if (this.monitoringEnabled) {
        monitoringDashboard.start();
        logger.info('Monitoring dashboard started', { 
          url: 'http://localhost:3001',
          enabled: true 
        });
      }
      
      // Log system health
      const systemHealth = errorMonitor.getSystemHealth();
      logger.info('System health check', { status: systemHealth.status });
      
    } catch (error) {
      const initError = new StructuredError(
        `RAG Application initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.CONFIG_ERROR,
        500,
        {
          component: 'RAGApplication',
          operation: 'initialization'
        },
        false // Not operational error
      );
      
      errorMonitor.recordError(initError);
      logger.fatal('RAG Application initialization failed', initError);
      throw initError;
    } finally {
      endTiming();
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('🎯 Starting RAG MCP Server...');
    await this.mcpController.start();
    
    console.log('🎯 RAG Application started successfully');
    console.log(`📁 Documents directory: ${this.config.documentsDir}`);
    console.log(`💾 Storage directory: ${this.config.storageDir}`);
  }

  async shutdown(): Promise<void> {
    const endTiming = startTiming('application_shutdown', { component: 'RAGApplication' });
    
    logger.info('Shutting down RAG Application');
    const shutdownPromises: Promise<void>[] = [];
    
    try {
      // Graceful shutdown with timeout for each component
      if (this.syncScheduler) {
        shutdownPromises.push(
          Promise.resolve(this.syncScheduler.stop())
        );
      }

      if (this.fileWatcher) {
        shutdownPromises.push(
          withTimeout(
            Promise.resolve(this.fileWatcher.stop()),
            {
              timeoutMs: 5000,
              operation: 'file_watcher_shutdown'
            }
          )
        );
      }
      
      if (this.mcpController) {
        shutdownPromises.push(
          withTimeout(
            this.mcpController.shutdown(),
            {
              timeoutMs: 10000,
              operation: 'mcp_controller_shutdown'
            }
          )
        );
      }
      
      // Stop monitoring dashboard
      if (this.monitoringEnabled) {
        shutdownPromises.push(
          Promise.resolve(monitoringDashboard.stop())
        );
      }
      
      // Wait for all shutdowns to complete
      await Promise.allSettled(shutdownPromises);
      
      // Close database last
      if (this.db) {
        this.db.close();
      }
      
      // Reset circuit breakers
      CircuitBreakerManager.reset();
      
      // Final health report
      const finalHealth = errorMonitor.getSystemHealth();
      logger.info('Final system health before shutdown', {
        status: finalHealth.status,
        totalErrors: finalHealth.totalErrors,
        uptime: finalHealth.uptime
      });
      
      logger.info('RAG Application shutdown completed successfully');
    } catch (error) {
      const shutdownError = new StructuredError(
        `Error during shutdown: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'RAGApplication',
          operation: 'shutdown'
        }
      );
      
      errorMonitor.recordError(shutdownError);
      logger.error('Error during shutdown', shutdownError);
    } finally {
      endTiming();
    }
  }

  private async processUnvectorizedDocuments(
    fileProcessingService: FileProcessingService,
    fileRepository: FileRepository
  ): Promise<void> {
    const endTiming = startTiming('unvectorized_processing', { component: 'RAGApplication' });
    
    try {
      const allFiles = fileRepository.getAllFiles();
      logger.info('Processing unvectorized documents', { totalFiles: allFiles.length });

      const unvectorizedFiles = allFiles.filter(file => {
        const chunks = this.db.getDocumentChunks(file.id);
        return chunks.length === 0;
      });
      
      if (unvectorizedFiles.length === 0) {
        logger.info('All documents are already processed');
        return;
      }
      
      logger.info('Found unvectorized files', { count: unvectorizedFiles.length });
      
      // 배치 처리로 성능 최적화
      let processedCount = 0;
      const batchSize = 3; // 동시 처리 파일 수 제한
      
      for (let i = 0; i < unvectorizedFiles.length; i += batchSize) {
        const batch = unvectorizedFiles.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (file) => {
          try {
            logger.debug('Processing unvectorized file', { fileName: file.name });
            
            await withTimeout(
              fileProcessingService.processFile(file.path),
              {
                timeoutMs: 180000, // 3분
                operation: 'unvectorized_file_processing'
              }
            );
            
            return { success: true, file };
          } catch (error) {
            logger.warn('Failed to process unvectorized file', {
              fileName: file.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            return { success: false, file, error };
          }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.success) {
            processedCount++;
          }
        }
        
        logger.debug('Processed unvectorized batch', {
          batchNumber: Math.floor(i / batchSize) + 1,
          processed: processedCount,
          total: unvectorizedFiles.length
        });
      }
      
      logger.info('Unvectorized document processing completed', {
        processed: processedCount,
        total: unvectorizedFiles.length,
        failed: unvectorizedFiles.length - processedCount
      });
    } catch (error) {
      const processingError = new StructuredError(
        `Error processing unvectorized documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.FILE_PARSE_ERROR,
        500,
        {
          component: 'RAGApplication',
          operation: 'unvectorized_processing'
        }
      );
      
      errorMonitor.recordError(processingError);
      logger.error('Error processing unvectorized documents', processingError);
    } finally {
      endTiming();
    }
  }
}