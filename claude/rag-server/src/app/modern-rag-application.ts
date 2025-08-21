/**
 * Modern RAG Application - 2025 Architecture
 * Fully refactored with Orchestrator pattern, DI container, and Pipeline-based search
 */

import { RAGOrchestrator } from '@/app/orchestrator/rag-orchestrator.js';
import { PipelineFactory } from '@/app/factories/pipeline-factory.js';
import { AdvancedServerConfig, ConfigFactory } from '@/infrastructure/config/config-factory.js';
import { serviceRegistry } from '@/shared/di/service-registry.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { 
  StructuredError, 
  ConfigurationError, 
  ErrorCode 
} from '@/shared/errors/index.js';
import { errorMonitor, setupGlobalErrorHandling } from '@/shared/monitoring/error-monitor.js';
import { monitoringDashboard } from '@/infrastructure/dashboard/monitoring-dashboard.js';

/**
 * Modern RAG Application using 2025 architectural patterns
 */
export class ModernRAGApplication {
  private orchestrator: RAGOrchestrator | null = null;
  private config: AdvancedServerConfig;
  private isInitialized = false;
  private isRunning = false;

  constructor(config?: AdvancedServerConfig) {
    this.config = config || ConfigFactory.getCurrentConfig();
    
    // Validate configuration
    ConfigFactory.validateConfig(this.config);
    
    logger.info('Modern RAG Application created', {
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
      logger.warn('Modern RAG Application is already initialized');
      return;
    }

    const endTiming = startTiming('modern_rag_initialization', { 
      component: 'ModernRAGApplication',
      environment: this.config.nodeEnv 
    });

    try {
      logger.info('Initializing Modern RAG Application v2.0', {
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
      await this.orchestrator.initialize();
      
      this.isInitialized = true;
      
      logger.info('Modern RAG Application initialized successfully', {
        initializationTime: endTiming(),
        services: serviceRegistry.getServiceNames().length,
        orchestratorStatus: this.orchestrator.getStatus()
      });
      
    } catch (error) {
      const initError = new StructuredError(
        `Modern RAG Application initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.CONFIG_ERROR,
        500,
        {
          component: 'ModernRAGApplication',
          operation: 'initialization',
          config: {
            nodeEnv: this.config.nodeEnv,
            vectorStore: this.config.vectorStore.provider
          }
        }
      );
      
      errorMonitor.recordError(initError);
      logger.fatal('Modern RAG Application initialization failed', initError);
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
      logger.warn('Modern RAG Application is already running');
      return;
    }

    const endTiming = startTiming('modern_rag_startup', { 
      component: 'ModernRAGApplication' 
    });

    try {
      if (!this.orchestrator) {
        throw new ConfigurationError('Orchestrator not initialized', 'orchestrator_missing');
      }

      logger.info('Starting Modern RAG Application');

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
        `Modern RAG Application startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'ModernRAGApplication',
          operation: 'startup'
        }
      );
      
      errorMonitor.recordError(startError);
      logger.error('Modern RAG Application startup failed', startError);
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
      logger.info('Modern RAG Application is not running');
      return;
    }

    const endTiming = startTiming('modern_rag_shutdown', { 
      component: 'ModernRAGApplication' 
    });

    try {
      logger.info('Shutting down Modern RAG Application');

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
      logger.info('Modern RAG Application shutdown completed', {
        shutdownTime: endTiming(),
        systemHealth: {
          status: finalHealth.status,
          totalErrors: finalHealth.totalErrors,
          uptime: finalHealth.uptime
        }
      });

    } catch (error) {
      const shutdownError = new StructuredError(
        `Modern RAG Application shutdown failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATIONAL_ERROR,
        500,
        {
          component: 'ModernRAGApplication',
          operation: 'shutdown'
        }
      );
      
      errorMonitor.recordError(shutdownError);
      logger.error('Modern RAG Application shutdown failed', shutdownError);
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
    orchestrator?: ReturnType<RAGOrchestrator['getStatus']>;
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
  getOrchestrator(): RAGOrchestrator | null {
    return this.orchestrator;
  }

  /**
   * Get configuration
   */
  getConfig(): AdvancedServerConfig {
    return this.config;
  }

  /**
   * Update configuration (requires restart)
   */
  updateConfig(newConfig: Partial<AdvancedServerConfig>): void {
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

  private async createOrchestrator(): Promise<RAGOrchestrator> {
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
    console.log('🎯 Modern RAG Application v2.0 Started!');
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
  static createDevelopment(): ModernRAGApplication {
    return new ModernRAGApplication(ConfigFactory.createDevelopmentConfig());
  }

  static createProduction(): ModernRAGApplication {
    return new ModernRAGApplication(ConfigFactory.createProductionConfig());
  }

  static createTest(): ModernRAGApplication {
    return new ModernRAGApplication(ConfigFactory.createTestConfig());
  }

  static createWithConfig(config: AdvancedServerConfig): ModernRAGApplication {
    return new ModernRAGApplication(config);
  }
}