/**
 * RAG MCP Server Entry Point - Modern Architecture (2025)
 * Uses the new orchestrator pattern with dependency injection
 */

import { ModernRAGApplication } from '@/app/modern-rag-application.js';
import { logger } from '@/shared/logger/index.js';

async function main(): Promise<void> {
  let app: ModernRAGApplication | null = null;

  try {
    // Create application instance based on environment
    const nodeEnv = process.env['NODE_ENV'] || 'development';
    
    switch (nodeEnv) {
      case 'production':
        app = ModernRAGApplication.createProduction();
        break;
      case 'test':
        app = ModernRAGApplication.createTest();
        break;
      case 'development':
      default:
        app = ModernRAGApplication.createDevelopment();
        break;
    }

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      if (app) {
        try {
          await app.shutdown();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));
          process.exit(1);
        }
      } else {
        process.exit(0);
      }
    };

    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Start the application
    await app.start();

    // Log startup success
    logger.info('🎯 Modern RAG Application started successfully', {
      pid: process.pid,
      nodeVersion: process.version,
      environment: nodeEnv
    });

  } catch (error) {
    logger.fatal('Failed to start Modern RAG Application', error instanceof Error ? error : new Error(String(error)));
    
    if (app) {
      try {
        await app.shutdown();
      } catch (shutdownError) {
        logger.error('Error during emergency shutdown', shutdownError instanceof Error ? shutdownError : new Error(String(shutdownError)));
      }
    }
    
    process.exit(1);
  }
}

// Export for testing purposes
export { main, ModernRAGApplication };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}