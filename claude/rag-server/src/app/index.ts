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
import { serviceRegistry } from '@/shared/dependency-injection/service-registry.js'

/**
 * Check model compatibility and handle migration if needed
 */
async function checkAndHandleModelMigration(embeddingMetadataService: any, config: any) {
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
    })

    // Check compatibility
    const compatibility = await embeddingMetadataService.checkModelCompatibility(config, modelInfo)
    
    if (!compatibility.isCompatible || compatibility.requiresReindexing) {
      if (config.modelMigration.enableAutoMigration) {
        logger.warn('🔄 Auto-migration enabled - handling model changes', {
          issues: compatibility.issues,
          requiresReindexing: compatibility.requiresReindexing,
        })
        
        await embeddingMetadataService.handleModelMigration(compatibility, config)
      } else {
        logger.warn('⚠️ Model incompatibility detected but auto-migration disabled', {
          issues: compatibility.issues,
          suggestion: 'Enable AUTO_MIGRATION=true to handle automatically or run manual migration'
        })
      }
    }

    // Update or create metadata
    await embeddingMetadataService.createOrUpdateMetadata(config, modelInfo, {
      documents: 0, // Will be updated as documents are processed
      vectors: 0
    })

  } catch (error) {
    logger.error('Failed to check model compatibility', error instanceof Error ? error : new Error(String(error)))
    
    if (config.modelMigration.enableIncompatibilityDetection) {
      logger.warn('Model compatibility check failed - proceeding with caution')
    }
  }
}

/**
 * Initialize all dependencies and create MCPServer instance
 */
async function initializeServices(config: any) {
  // Register config in dependency injection container
  serviceRegistry.registerInstance('config', config)

  // Initialize vector store and search service
  const { VectorStoreFactory } = await import('@/shared/config/vector-store-factory.js')

  // IMPORTANT: Create only ONE provider instance and reuse it everywhere
  const vectorStoreProvider = VectorStoreFactory.createProvider(config.vectorStore, config)
  
  // Initialize SearchService with abstraction layer
  const { SearchService } = await import('@/domains/rag/services/search/search-service.js')
  const searchService = new SearchService(vectorStoreProvider, config)

  // Initialize EmbeddingMetadataService for model migration
  const { EmbeddingMetadataService } = await import('@/domains/rag/services/embedding-metadata-service.js')
  const embeddingMetadataService = new EmbeddingMetadataService(vectorStoreProvider)
  
  // Check model compatibility and handle migration if needed
  await checkAndHandleModelMigration(embeddingMetadataService, config)

  // Initialize DocumentProcessor for file processing
  const { DocumentProcessor } = await import('@/domains/rag/services/document/processor.js')
  const documentProcessor = new DocumentProcessor(vectorStoreProvider, embeddingMetadataService, config)
  
  // Initialize FileWatcher for automatic file processing
  const { FileWatcher } = await import('@/shared/filesystem/watcher.js')
  const fileWatcher = new FileWatcher(config.documentsDir)
  
  // Create a processing queue to limit concurrency
  const processingQueue: Promise<void>[] = []
  const MAX_CONCURRENT_PROCESSING = 3 // Limit concurrent file processing

  // Connect FileWatcher to DocumentProcessor
  fileWatcher.on('change', async (event) => {
    // Limit concurrent processing to prevent resource exhaustion
    if (processingQueue.length >= MAX_CONCURRENT_PROCESSING) {
      logger.warn('Processing queue full, waiting...', {
        queueSize: processingQueue.length,
        maxConcurrent: MAX_CONCURRENT_PROCESSING
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
            fileName: event.metadata?.name 
          })
          await documentProcessor.processFile(event.path)
        } else if (event.type === 'deleted') {
          logger.info('File deletion detected, removing from VectorStore', { 
            path: event.path 
          })
          await documentProcessor.removeFile(event.path)
        }
      } catch (error) {
        logger.error('Failed to process file change event', error instanceof Error ? error : new Error(String(error)), {
          eventType: event.type,
          filePath: event.path,
        })
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
  
  // Start file watching
  await fileWatcher.start()
  logger.info('FileWatcher started', { documentsDir: config.documentsDir })
  
  // Smart sync existing files on startup
  logger.info('🧠 Starting intelligent directory synchronization...')
  try {
    await documentProcessor.syncDirectoryWithVectorStore(config.documentsDir)
    logger.info('✅ Smart directory sync completed successfully')
  } catch (error) {
    logger.error('⚠️ Smart directory sync failed, but continuing startup', error instanceof Error ? error : new Error(String(error)))
  }

  // Initialize MCP handlers with SearchService (high-level abstraction)
  const searchHandler = new SearchHandler(searchService, config)
  const informationHandler = new InformationHandler(vectorStoreProvider, config)

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

      // Cleanup service registry
      serviceRegistry.clear()

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

    // Cleanup service registry on error
    serviceRegistry.clear()

    process.exit(1)
  }
}

// Export for testing purposes
export { main }

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
