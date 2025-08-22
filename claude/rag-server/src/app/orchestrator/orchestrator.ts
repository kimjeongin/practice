/**
 * RAG Orchestrator - Pipeline-based RAG System
 * Based on domain-driven architecture patterns
 */

import { ServiceRegistry } from '@/shared/dependency-injection/service-registry.js';
import { ServerConfig } from '@/shared/config/config-factory.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { 
  StructuredError, 
  DatabaseError, 
  ConfigurationError, 
  ErrorCode 
} from '@/shared/errors/index.js';
import { errorMonitor, setupGlobalErrorHandling } from '@/shared/monitoring/error-monitor.js';
import { withTimeout } from '@/shared/utils/resilience.js';

export interface RAGPipeline {
  name: string;
  description: string;
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface OrchestrationContext {
  config: ServerConfig;
  services: ServiceRegistry;
  pipelines: Map<string, RAGPipeline>;
  metadata: Record<string, any>;
}

export class Orchestrator {
  private context: OrchestrationContext;
  private isInitialized = false;
  private isRunning = false;
  
  constructor(
    private config: ServerConfig,
    private services: ServiceRegistry
  ) {
    this.context = {
      config,
      services,
      pipelines: new Map(),
      metadata: {
        startTime: Date.now(),
        version: '2.0.0',
        nodeVersion: process.version,
      }
    };
  }

  /**
   * Initialize the RAG orchestrator and all pipelines
   */
  async initialize(): Promise<void> {
    const endTiming = startTiming('orchestrator_initialization', { 
      component: 'RAGOrchestrator' 
    });
    
    try {
      logger.info('Initializing RAG Orchestrator v2.0', {
        environment: this.config.nodeEnv,
        vectorStoreProvider: this.config.vectorStore.provider,
        features: Object.entries(this.config.features)
          .filter(([, enabled]) => enabled)
          .map(([feature]) => feature)
      });

      // Setup global error handling
      setupGlobalErrorHandling();
      
      // Register core services
      await this.registerCoreServices();
      
      // Initialize pipelines based on configuration
      await this.initializePipelines();
      
      // Perform health checks
      await this.performHealthChecks();
      
      this.isInitialized = true;
      
      logger.info('RAG Orchestrator initialized successfully', {
        pipelineCount: this.context.pipelines.size,
        serviceCount: this.context.services.getServiceNames().length,
        featuresEnabled: Object.keys(this.config.features).filter(
          key => this.config.features[key as keyof typeof this.config.features]
        ).length
      });
      
    } catch (error) {
      const initError = new StructuredError(
        `RAG Orchestrator initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.CONFIG_ERROR,
        500,
        {
          component: 'RAGOrchestrator',
          operation: 'initialization',
          config: {
            nodeEnv: this.config.nodeEnv,
            vectorStore: this.config.vectorStore.provider
          }
        }
      );
      
      errorMonitor.recordError(initError);
      logger.fatal('RAG Orchestrator initialization failed', initError);
      throw initError;
    } finally {
      endTiming();
    }
  }

  /**
   * Start all pipelines
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {
      logger.warn('RAG Orchestrator is already running');
      return;
    }

    const endTiming = startTiming('orchestrator_startup', { 
      component: 'RAGOrchestrator' 
    });

    try {
      logger.info('Starting RAG Orchestrator pipelines');

      // Start all pipelines in parallel
      const startPromises = Array.from(this.context.pipelines.values()).map(
        pipeline => this.startPipeline(pipeline)
      );

      await Promise.all(startPromises);
      
      this.isRunning = true;
      
      logger.info('RAG Orchestrator started successfully', {
        uptime: Date.now() - this.context.metadata.startTime,
        activePipelines: Array.from(this.context.pipelines.keys())
      });

    } catch (error) {
      const startError = new StructuredError(
        `RAG Orchestrator startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'RAGOrchestrator',
          operation: 'startup'
        }
      );
      
      errorMonitor.recordError(startError);
      logger.error('RAG Orchestrator startup failed', startError);
      throw startError;
    } finally {
      endTiming();
    }
  }

  /**
   * Graceful shutdown of all pipelines
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      logger.info('RAG Orchestrator is not running');
      return;
    }

    const endTiming = startTiming('orchestrator_shutdown', { 
      component: 'RAGOrchestrator' 
    });

    try {
      logger.info('Shutting down RAG Orchestrator');

      // Stop all pipelines in parallel with timeout
      const shutdownPromises = Array.from(this.context.pipelines.values()).map(
        pipeline => this.stopPipeline(pipeline)
      );

      await Promise.allSettled(shutdownPromises);

      this.isRunning = false;
      
      const uptime = Date.now() - this.context.metadata.startTime;
      logger.info('RAG Orchestrator shutdown completed', {
        uptime: `${Math.round(uptime / 1000)}s`,
        totalErrors: errorMonitor.getSystemHealth().totalErrors
      });

    } catch (error) {
      const shutdownError = new StructuredError(
        `RAG Orchestrator shutdown failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'RAGOrchestrator',
          operation: 'shutdown'
        }
      );
      
      errorMonitor.recordError(shutdownError);
      logger.error('RAG Orchestrator shutdown failed', shutdownError);
    } finally {
      endTiming();
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    isInitialized: boolean;
    isRunning: boolean;
    uptime: number;
    pipelines: Array<{
      name: string;
      description: string;
      status: 'healthy' | 'unhealthy' | 'unknown';
    }>;
    config: {
      environment: string;
      vectorStore: string;
      features: string[];
    };
  } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      uptime: Date.now() - this.context.metadata.startTime,
      pipelines: Array.from(this.context.pipelines.entries()).map(([name, pipeline]) => ({
        name,
        description: pipeline.description,
        status: 'unknown' // Will be populated by health checks
      })),
      config: {
        environment: this.config.nodeEnv,
        vectorStore: this.config.vectorStore.provider,
        features: Object.keys(this.config.features).filter(
          key => this.config.features[key as keyof typeof this.config.features]
        )
      }
    };
  }

  /**
   * Add a new pipeline to the orchestrator
   */
  addPipeline(pipeline: RAGPipeline): void {
    if (this.context.pipelines.has(pipeline.name)) {
      throw new Error(`Pipeline '${pipeline.name}' already exists`);
    }

    this.context.pipelines.set(pipeline.name, pipeline);
    logger.info('Pipeline added to orchestrator', { 
      pipelineName: pipeline.name,
      description: pipeline.description 
    });
  }

  /**
   * Get a pipeline by name
   */
  getPipeline(name: string): RAGPipeline | undefined {
    return this.context.pipelines.get(name);
  }

  /**
   * Get orchestration context
   */
  getContext(): OrchestrationContext {
    return this.context;
  }

  private async registerCoreServices(): Promise<void> {
    logger.debug('Registering core services');
    
    // Services will be registered by PipelineFactory
    // This method serves as a hook for custom service registration
    
    logger.debug('Core services registration completed');
  }

  private async initializePipelines(): Promise<void> {
    logger.info('Initializing pipelines based on configuration');

    // Core pipelines that are always initialized
    const coreServices = [
      'database', 'vectorStore', 'fileRepository', 'chunkRepository',
      'embeddingService', 'searchService', 'fileProcessingService'
    ];

    for (const serviceName of coreServices) {
      if (!this.context.services.isRegistered(serviceName)) {
        logger.warn(`Core service '${serviceName}' not registered`);
      }
    }

    logger.info('Pipelines initialization completed');
  }

  private async performHealthChecks(): Promise<void> {
    logger.debug('Performing health checks');

    const healthChecks = Array.from(this.context.pipelines.values()).map(
      async (pipeline) => {
        try {
          const isHealthy = await withTimeout(
            pipeline.isHealthy(),
            {
              timeoutMs: 5000,
              operation: `health_check_${pipeline.name}`
            }
          );
          
          if (!isHealthy) {
            logger.warn(`Pipeline '${pipeline.name}' health check failed`);
          }
          
          return { name: pipeline.name, healthy: isHealthy };
        } catch (error) {
          logger.error(`Health check failed for pipeline '${pipeline.name}'`, 
            error instanceof Error ? error : new Error(String(error)));
          return { name: pipeline.name, healthy: false };
        }
      }
    );

    const results = await Promise.allSettled(healthChecks);
    const failedChecks = results
      .filter(result => result.status === 'fulfilled' && !result.value.healthy)
      .map(result => result.status === 'fulfilled' ? result.value.name : 'unknown');

    if (failedChecks.length > 0) {
      logger.warn('Some pipeline health checks failed', { failedPipelines: failedChecks });
    } else {
      logger.info('All pipeline health checks passed');
    }
  }

  private async startPipeline(pipeline: RAGPipeline): Promise<void> {
    try {
      await withTimeout(
        pipeline.start(),
        {
          timeoutMs: 30000, // 30 seconds
          operation: `pipeline_start_${pipeline.name}`
        }
      );
      
      logger.info(`Pipeline '${pipeline.name}' started successfully`);
    } catch (error) {
      logger.error(`Failed to start pipeline '${pipeline.name}'`, 
        error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async stopPipeline(pipeline: RAGPipeline): Promise<void> {
    try {
      await withTimeout(
        pipeline.stop(),
        {
          timeoutMs: 10000, // 10 seconds
          operation: `pipeline_stop_${pipeline.name}`
        }
      );
      
      logger.info(`Pipeline '${pipeline.name}' stopped successfully`);
    } catch (error) {
      logger.warn(`Failed to stop pipeline '${pipeline.name}' gracefully`, 
        error instanceof Error ? error : new Error(String(error)));
      // Don't throw - we want to try stopping other pipelines
    }
  }
}