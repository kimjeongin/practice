/**
 * RAG Application - Domain-based Architecture
 * Refactored with Orchestrator pattern, DI container, and Pipeline-based search
 */

import { Orchestrator } from '@/app/orchestrator/orchestrator.js';
import { PipelineFactory } from '@/app/factories/pipeline-factory.js';
import { ServerConfig, ConfigFactory } from '@/shared/config/config-factory.js';
import { serviceRegistry } from '@/shared/dependency-injection/service-registry.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { 
  StructuredError, 
  ConfigurationError, 
  ErrorCode 
} from '@/shared/errors/index.js';
import { errorMonitor, setupGlobalErrorHandling } from '@/shared/monitoring/error-monitor.js';
import { monitoringDashboard } from '@/shared/monitoring/dashboard.js';

/**
 * RAG Application using domain-based architectural patterns
 */
export class RAGApplication {
  private orchestrator: Orchestrator | null = null;
  private config: ServerConfig;
  private isInitialized = false;
  private isRunning = false;

  constructor(config?: ServerConfig) {
    this.config = config || ConfigFactory.getCurrentConfig();
    
    // Validate configuration
    ConfigFactory.validateConfig(this.config);
    
    logger.info('RAG Application created', {
      version: '2.0.0',
      environment: this.config.nodeEnv,
      vectorStoreProvider: this.config.vectorStore.provider,
      featuresEnabled: Object.keys(this.config.features).filter(
        key => this.config.features[key as keyof typeof this.config.features]
      )
    });
  }

  /**
   * Initialize the modern RAG application
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('RAG Application is already initialized');
      return;
    }

    const endTiming = startTiming('modern_rag_initialization', { 
      component: 'RAGApplication',
      environment: this.config.nodeEnv 
    });

    try {
      logger.info('Initializing RAG Application v2.0', {
        environment: this.config.nodeEnv,
        config: {
          vectorStore: this.config.vectorStore.provider,
          pipeline: {
            maxConcurrency: this.config.pipeline.maxConcurrentProcessing,
            batchSize: this.config.pipeline.batchSize
          },
          search: {
            hybridEnabled: this.config.search.enableHybridSearch,
            rerankingEnabled: this.config.search.rerankingEnabled
          }
        }
      });

      // Setup global error handling first
      setupGlobalErrorHandling();

      // Create orchestrator using factory pattern
      this.orchestrator = await this.createOrchestrator();
      
      // Initialize orchestrator (this will set up all services and pipelines)
      await this.orchestrator!.initialize();
      
      this.isInitialized = true;
      
      logger.info('RAG Application initialized successfully', {
        initializationTime: endTiming(),
        services: serviceRegistry.getServiceNames().length,
        orchestratorStatus: this.orchestrator!.getStatus()
      });
      
    } catch (error) {
      const initError = new StructuredError(
        `RAG Application initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.CONFIG_ERROR,
        500,
        {
          component: 'RAGApplication',
          operation: 'initialization',
          config: {
            nodeEnv: this.config.nodeEnv,
            vectorStore: this.config.vectorStore.provider
          }
        }
      );
      
      errorMonitor.recordError(initError);
      logger.fatal('RAG Application initialization failed', initError);
      throw initError;
    } finally {
      endTiming();
    }
  }

  /**
   * Start the modern RAG application
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {
      logger.warn('RAG Application is already running');
      return;
    }

    const endTiming = startTiming('modern_rag_startup', { 
      component: 'RAGApplication' 
    });

    try {
      if (!this.orchestrator) {
        throw new ConfigurationError('Orchestrator not initialized', 'orchestrator_missing');
      }

      logger.info('Starting RAG Application');

      // Start orchestrator (this will start all pipelines)
      await this.orchestrator.start();
      
      // Start monitoring dashboard if enabled
      if (this.config.monitoring.enabled) {
        monitoringDashboard.start();
        logger.info('Monitoring dashboard started', { 
          url: `http://localhost:${this.config.monitoring.port}`,
          enabled: true 
        });
      }

      this.isRunning = true;

      // Display startup summary
      this.displayStartupSummary();
      
    } catch (error) {
      const startError = new StructuredError(
        `RAG Application startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'RAGApplication',
          operation: 'startup'
        }
      );
      
      errorMonitor.recordError(startError);
      logger.error('RAG Application startup failed', startError);
      throw startError;
    } finally {
      endTiming();
    }
  }

  /**
   * Graceful shutdown of the modern RAG application
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      logger.info('RAG Application is not running');
      return;
    }

    const endTiming = startTiming('modern_rag_shutdown', { 
      component: 'RAGApplication' 
    });

    try {
      logger.info('Shutting down RAG Application');

      const shutdownPromises: Promise<void>[] = [];

      // Stop orchestrator
      if (this.orchestrator) {
        shutdownPromises.push(this.orchestrator.shutdown());
      }

      // Stop monitoring dashboard
      if (this.config.monitoring.enabled) {
        shutdownPromises.push(
          Promise.resolve(monitoringDashboard.stop())
        );
      }

      // Wait for all shutdowns to complete
      await Promise.allSettled(shutdownPromises);

      // Clear service registry
      serviceRegistry.clear();

      this.isRunning = false;
      this.isInitialized = false;

      // Final system health report
      const finalHealth = errorMonitor.getSystemHealth();
      logger.info('RAG Application shutdown completed', {
        shutdownTime: endTiming(),
        systemHealth: {
          status: finalHealth.status,
          totalErrors: finalHealth.totalErrors,
          uptime: finalHealth.uptime
        }
      });

    } catch (error) {
      const shutdownError = new StructuredError(
        `RAG Application shutdown failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'RAGApplication',
          operation: 'shutdown'
        }
      );
      
      errorMonitor.recordError(shutdownError);
      logger.error('RAG Application shutdown failed', shutdownError);
    } finally {
      endTiming();
    }
  }

  /**
   * Get application status and health information
   */
  getStatus(): {
    application: {
      version: string;
      initialized: boolean;
      running: boolean;
      environment: string;
    };
    orchestrator?: ReturnType<Orchestrator['getStatus']>;
    system: {
      health: ReturnType<typeof errorMonitor.getSystemHealth>;
      services: string[];
    };
    configuration: {
      vectorStore: string;
      features: string[];
      monitoring: boolean;
    };
  } {
    return {
      application: {
        version: '2.0.0',
        initialized: this.isInitialized,
        running: this.isRunning,
        environment: this.config.nodeEnv
      },
      orchestrator: this.orchestrator?.getStatus(),
      system: {
        health: errorMonitor.getSystemHealth(),
        services: serviceRegistry.getServiceNames()
      },
      configuration: {
        vectorStore: this.config.vectorStore.provider,
        features: Object.keys(this.config.features).filter(
          key => this.config.features[key as keyof typeof this.config.features]
        ),
        monitoring: this.config.monitoring.enabled
      }
    };
  }

  /**
   * Get the orchestrator instance (for advanced usage)
   */
  getOrchestrator(): Orchestrator | null {
    return this.orchestrator;
  }

  /**
   * Get configuration
   */
  getConfig(): ServerConfig {
    return this.config;
  }

  /**
   * Update configuration (requires restart)
   */
  updateConfig(newConfig: Partial<ServerConfig>): void {
    if (this.isRunning) {
      logger.warn('Configuration update requested while application is running. Restart required for changes to take effect.');
    }

    this.config = { ...this.config, ...newConfig };
    ConfigFactory.validateConfig(this.config);
    
    logger.info('Configuration updated', {
      updatedKeys: Object.keys(newConfig)
    });
  }

  /**
   * Health check for external monitoring
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    if (!this.isInitialized || !this.isRunning || !this.orchestrator) {
      return {
        status: 'unhealthy',
        details: {
          initialized: this.isInitialized,
          running: this.isRunning,
          reason: 'Application not properly started'
        }
      };
    }

    const orchestratorStatus = this.orchestrator.getStatus();
    const systemHealth = errorMonitor.getSystemHealth();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (systemHealth.status === 'unhealthy' || !orchestratorStatus.isRunning) {
      status = 'unhealthy';
    } else if (systemHealth.status === 'degraded' || systemHealth.totalErrors > 10) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        application: {
          initialized: this.isInitialized,
          running: this.isRunning
        },
        orchestrator: orchestratorStatus,
        system: systemHealth,
        timestamp: new Date().toISOString()
      }
    };
  }

  private async createOrchestrator(): Promise<Orchestrator> {
    logger.debug('Creating orchestrator using factory pattern');
    
    // Use factory based on environment
    switch (this.config.nodeEnv) {
      case 'production':
        return PipelineFactory.createProductionOrchestrator();
      case 'test':
        return PipelineFactory.createTestOrchestrator();
      case 'development':
      default:
        return PipelineFactory.createDevelopmentOrchestrator();
    }
  }

  private displayStartupSummary(): void {
    const status = this.getStatus();
    
    console.log('\n🎯 ========================================');
    console.log('🎯 RAG Application v2.0 Started!');
    console.log('🎯 ========================================');
    console.log(`📁 Documents directory: ${this.config.documentsDir}`);
    console.log(`💾 Data directory: ${this.config.dataDir}`);
    console.log(`🔍 Vector store: ${this.config.vectorStore.provider}`);
    console.log(`🌐 Environment: ${this.config.nodeEnv}`);
    
    if (this.config.monitoring.enabled) {
      console.log(`📊 Monitoring: http://localhost:${this.config.monitoring.port}`);
    }
    
    console.log('\n🚀 Features enabled:');
    status.configuration.features.forEach(feature => {
      console.log(`   ✅ ${feature}`);
    });
    
    console.log('\n📋 Services registered:');
    status.system.services.forEach(service => {
      console.log(`   🔧 ${service}`);
    });
    
    console.log('\n🎯 Ready to process your documents and queries!');
    console.log('🎯 ========================================\n');
  }

  /**
   * Static factory methods for common configurations
   */
  static createDevelopment(): RAGApplication {
    return new RAGApplication(ConfigFactory.createDevelopmentConfig());
  }

  static createProduction(): RAGApplication {
    return new RAGApplication(ConfigFactory.createProductionConfig());
  }

  static createTest(): RAGApplication {
    return new RAGApplication(ConfigFactory.createTestConfig());
  }

  static createWithConfig(config: ServerConfig): RAGApplication {
    return new RAGApplication(config);
  }
}