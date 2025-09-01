/**
 * RAG MCP Server Entry Point
 * Production multi-transport MCP server with full RAG integration
 */

import 'dotenv/config'
import { ConfigFactory } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'
import { MCPServer } from '@/domains/mcp/server/server.js'
import { SearchHandler } from '@/domains/mcp/handlers/search.js'
import { InformationHandler } from '@/domains/mcp/handlers/information.js'
// SearchService and RAGWorkflow removed as part of VectorStore-only architecture
// These will be refactored in Phase 7 to work with VectorStore-only architecture

/**
 * Check model compatibility and handle migration if needed
 */
async function checkAndHandleModelMigration(modelCompatibilityService: any, config: any) {
  try {
    // Create model info based on config and service type
    const modelInfo = {
      name: config.embeddingModel,
      service: config.embeddingService,
      dimensions: config.embeddingDimensions,
      model: config.embeddingModel,
    }

    logger.info('🔍 Checking embedding model compatibility on startup', {
      service: config.embeddingService,
      model: config.embeddingModel,
      dimensions: modelInfo.dimensions,
      autoMigration: config.modelMigration.enableAutoMigration,
      clearOnChange: config.modelMigration.clearVectorsOnModelChange,
    })

    // Check compatibility
    const compatibility = await modelCompatibilityService.checkModelCompatibility(config, modelInfo)

    logger.info('📋 Model compatibility check result', {
      isCompatible: compatibility.isCompatible,
      requiresReindexing: compatibility.requiresReindexing,
      issues: compatibility.issues,
      hasCurrentMetadata: !!compatibility.currentMetadata,
      currentMetadataInfo: compatibility.currentMetadata
        ? {
            modelName: compatibility.currentMetadata.modelName,
            serviceName: compatibility.currentMetadata.serviceName,
            dimensions: compatibility.currentMetadata.dimensions,
            configHash: compatibility.currentMetadata.configHash,
          }
        : null,
    })

    if (!compatibility.isCompatible || compatibility.requiresReindexing) {
      if (config.modelMigration.enableAutoMigration) {
        logger.warn('🔄 Auto-migration enabled - handling model changes', {
          issues: compatibility.issues,
          requiresReindexing: compatibility.requiresReindexing,
          willClearVectors: config.modelMigration.clearVectorsOnModelChange,
        })

        await modelCompatibilityService.handleModelMigration(compatibility, config)
        logger.info('✅ Model migration completed successfully')
      } else {
        logger.warn('⚠️ Model incompatibility detected but auto-migration disabled', {
          issues: compatibility.issues,
          suggestion: 'Enable AUTO_MIGRATION=true to handle automatically or run manual migration',
          currentConfig: {
            service: config.embeddingService,
            model: config.embeddingModel,
            dimensions: config.embeddingDimensions,
          },
        })
      }
    } else {
      logger.info('✅ Model configuration is compatible, no migration needed')
    }

    // Update or create metadata
    const metadataId = await modelCompatibilityService.createOrUpdateMetadata(config, modelInfo, {
      documents: 0, // Will be updated as documents are processed
      vectors: 0,
    })

    logger.info('📝 Model metadata updated', {
      metadataId,
      modelName: modelInfo.name,
      serviceName: modelInfo.service,
    })
  } catch (error) {
    logger.error(
      '❌ Failed to check model compatibility',
      error instanceof Error ? error : new Error(String(error)),
      {
        service: config.embeddingService,
        model: config.embeddingModel,
        autoMigrationEnabled: config.modelMigration.enableAutoMigration,
      }
    )

    if (config.modelMigration.enableIncompatibilityDetection) {
      logger.warn(
        '⚠️ Model compatibility check failed - proceeding with caution. This may cause issues with vector search.'
      )
    } else {
      logger.info('ℹ️ Model compatibility detection is disabled, continuing startup')
    }
  }
}

/**
 * Initialize all dependencies and create MCPServer instance
 */
async function initializeServices(config: any) {
  // Initialize services with config passed directly

  // Initialize LanceDB provider directly
  const { LanceDBProvider } = await import('@/domains/rag/integrations/vectorstores/providers/lancedb/index.js')
  
  const vectorStoreProvider = new LanceDBProvider(config, {
    uri: config.vectorStore.config.uri,
  }, 'documents')

  // Initialize SearchService with direct LanceDB provider
  const { SearchService } = await import('@/domains/rag/services/search/search-service.js')
  const searchService = new SearchService(vectorStoreProvider)

  // Initialize ModelCompatibilityService for model migration
  const { ModelCompatibilityService } = await import('@/domains/rag/services/models/index.js')
  const modelCompatibilityService = new ModelCompatibilityService(vectorStoreProvider)

  // Check model compatibility and handle migration if needed
  await checkAndHandleModelMigration(modelCompatibilityService, config)

  // Initialize DocumentProcessor for file processing
  const { DocumentProcessor } = await import('@/domains/rag/services/document/processor.js')
  const documentProcessor = new DocumentProcessor(
    vectorStoreProvider,
    modelCompatibilityService,
    config
  )

  // Initialize FileWatcher for automatic file processing
  const { FileWatcher } = await import('@/domains/filesystem/index.js')
  const fileWatcher = new FileWatcher(config.documentsDir, documentProcessor)

  // Create a processing queue to limit concurrency
  const processingQueue: Promise<void>[] = []
  const MAX_CONCURRENT_PROCESSING = 3 // Limit concurrent file processing

  // Connect FileWatcher to DocumentProcessor
  fileWatcher.on('change', async (event) => {
    // Limit concurrent processing to prevent resource exhaustion
    if (processingQueue.length >= MAX_CONCURRENT_PROCESSING) {
      logger.warn('Processing queue full, waiting...', {
        queueSize: processingQueue.length,
        maxConcurrent: MAX_CONCURRENT_PROCESSING,
      })
      // Wait for at least one to complete
      await Promise.race(processingQueue)
    }

    const processingPromise = (async () => {
      try {
        if (event.type === 'added' || event.type === 'changed') {
          logger.info('File change detected, processing', {
            type: event.type,
            path: event.path,
            fileName: event.metadata?.name,
          })
          await documentProcessor.processFile(event.path)
        } else if (event.type === 'deleted') {
          logger.info('File deletion detected, removing from VectorStore', {
            path: event.path,
          })
          await documentProcessor.removeFile(event.path)
        }
      } catch (error) {
        logger.error(
          'Failed to process file change event',
          error instanceof Error ? error : new Error(String(error)),
          {
            eventType: event.type,
            filePath: event.path,
          }
        )
      }
    })()

    // Add to queue and clean up completed promises
    processingQueue.push(processingPromise)
    processingPromise.finally(() => {
      const index = processingQueue.indexOf(processingPromise)
      if (index > -1) {
        processingQueue.splice(index, 1)
      }
    })
  })

  // Start file watching (includes initial sync)
  logger.info('🧠 Starting FileWatcher with intelligent directory synchronization...', {
    documentsDir: config.documentsDir,
    smartSyncEnabled: true,
  })

  const startTime = Date.now()
  try {
    await fileWatcher.start()
    const duration = Date.now() - startTime
    logger.info('✅ FileWatcher started with smart directory sync completed', {
      durationMs: duration,
      documentsDir: config.documentsDir,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error(
      '⚠️ FileWatcher startup failed, but continuing',
      error instanceof Error ? error : new Error(String(error)),
      {
        durationMs: duration,
        documentsDir: config.documentsDir,
      }
    )
    // Continue startup even if file watcher fails
  }

  // Initialize MCP handlers with SearchService (high-level abstraction)
  const searchHandler = new SearchHandler(searchService)
  const informationHandler = new InformationHandler(vectorStoreProvider)

  // Create MCP Server
  const mcpServer = new MCPServer(searchHandler, informationHandler, config)

  // Store fileWatcher globally for cleanup
  ;(globalThis as any).fileWatcher = fileWatcher

  return mcpServer
}

async function main(): Promise<void> {
  let mcpServer: MCPServer | null = null

  try {
    const config = ConfigFactory.getCurrentConfig()

    logger.info('🎯 Starting Production RAG MCP Server', {
      version: '1.0.0',
      transport: config.mcp.type,
      port: config.mcp.port,
      host: config.mcp.host,
      nodeVersion: process.version,
      pid: process.pid,
    })

    // Initialize all services and create MCP server
    logger.info('🔧 Initializing RAG services and MCP server...')
    mcpServer = await initializeServices(config)

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`)

      if (mcpServer) {
        try {
          // Stop FileWatcher first
          const fileWatcher = (globalThis as any).fileWatcher
          if (fileWatcher) {
            logger.info('Stopping FileWatcher...')
            await fileWatcher.stop()
          }

          await mcpServer.shutdown()
          logger.info('MCP server shutdown completed')
        } catch (error) {
          logger.error(
            'Error during MCP server shutdown',
            error instanceof Error ? error : new Error(String(error))
          )
        }
      }

      // Graceful shutdown completed

      process.exit(0)
    }

    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught exception', error)
      gracefulShutdown('UNCAUGHT_EXCEPTION')
    })

    process.on('unhandledRejection', (reason) => {
      logger.fatal(
        'Unhandled promise rejection',
        reason instanceof Error ? reason : new Error(String(reason))
      )
      gracefulShutdown('UNHANDLED_REJECTION')
    })

    // Start the MCP server
    logger.info('🚀 Starting RAG MCP Server...')
    await mcpServer.start()

    logger.info('✅ Production RAG MCP Server started successfully', {
      transport: config.mcp.type,
      port: config.mcp.port,
      host: config.mcp.host,
      message: 'Server ready with full RAG capabilities and multi-transport support',
    })
  } catch (error) {
    logger.fatal(
      'Failed to start RAG MCP Server',
      error instanceof Error ? error : new Error(String(error))
    )

    if (mcpServer) {
      try {
        await mcpServer.shutdown()
      } catch (shutdownError) {
        logger.error(
          'Error during emergency shutdown',
          shutdownError instanceof Error ? shutdownError : new Error(String(shutdownError))
        )
      }
    }

    // Error handling completed

    process.exit(1)
  }
}

// Export for testing purposes
export { main }

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Fatal error:', error instanceof Error ? error : new Error(String(error)))
    process.exit(1)
  })
}
