/**
 * RAG MCP Server Entry Point
 * Production multi-transport MCP server with full RAG integration
 */

import { ConfigFactory } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'
import { MCPServer } from '@/domains/mcp/server/server.js'
import { SearchHandler } from '@/domains/mcp/handlers/search.js'
import { InformationHandler } from '@/domains/mcp/handlers/information.js'
import { RAGWorkflow } from '@/domains/rag/workflows/workflow.js'
import { FileRepository } from '@/domains/rag/repositories/document.js'
import { ChunkRepository } from '@/domains/rag/repositories/chunk.js'
import { EmbeddingMetadataRepository } from '@/domains/rag/repositories/embedding-metadata.js'
import { SearchService } from '@/domains/rag/services/search/search-service.js'
import { EmbeddingMetadataService } from '@/domains/rag/services/embedding-metadata-service.js'
import { DatabaseConnection } from '@/shared/database/connection.js'
import { serviceRegistry } from '@/shared/dependency-injection/service-registry.js'

/**
 * Initialize all dependencies and create MCPServer instance
 */
async function initializeServices(config: any) {
  // Initialize database connection
  const dbConnection = new DatabaseConnection()

  // Register services in dependency injection container
  serviceRegistry
    .registerInstance('config', config)
    .registerInstance('dbConnection', dbConnection)
    .register('fileRepository', FileRepository, { dependencies: ['dbConnection'] })
    .register('chunkRepository', ChunkRepository, { dependencies: ['dbConnection'] })
    .register('embeddingMetadataRepository', EmbeddingMetadataRepository, { dependencies: ['dbConnection'] })

  // Initialize repositories
  const fileRepository = await serviceRegistry.resolve<FileRepository>('fileRepository')
  const chunkRepository = await serviceRegistry.resolve<ChunkRepository>('chunkRepository')
  const embeddingMetadataRepository = await serviceRegistry.resolve<EmbeddingMetadataRepository>('embeddingMetadataRepository')

  // Initialize embedding metadata service
  const embeddingMetadataService = new EmbeddingMetadataService(embeddingMetadataRepository)

  // Initialize vector store and search service
  const { VectorStoreFactory } = await import('@/shared/config/vector-store-factory.js')
  
  // IMPORTANT: Create only ONE provider instance and reuse it everywhere
  const vectorStoreProvider = VectorStoreFactory.createProvider(config.vectorStore, config, embeddingMetadataService)
  const vectorStore = new (await import('@/domains/rag/integrations/vectorstores/adapter.js')).VectorStoreAdapter(vectorStoreProvider)

  const searchService = new SearchService(
    vectorStoreProvider, // Use the same provider instance for consistent embeddings
    fileRepository,
    chunkRepository,
    config
  )

  // Initialize RAG workflow
  const ragWorkflow = new RAGWorkflow(searchService, fileRepository, chunkRepository, config)

  // Model management service removed - auto-managed through configuration

  // Initialize file processing service (optional)
  let fileProcessingService
  try {
    const { FileProcessingService } = await import('@/domains/rag/services/document/processor.js')
    fileProcessingService = new FileProcessingService(
      fileRepository,
      chunkRepository,
      vectorStore,
      config
    )
  } catch (error) {
    logger.warn('File processing service not available')
  }

  // Initialize sync manager for document synchronization
  const { SyncManager } = await import('@/domains/rag/workflows/sync-manager.js')
  const syncManager = new SyncManager(
    fileRepository,
    chunkRepository,
    vectorStore,
    config,
    fileProcessingService,
    embeddingMetadataService
  )

  // Perform startup document synchronization
  const enableAutoSync = config.enableAutoSync !== false
  if (enableAutoSync) {
    logger.info('🔄 Starting document synchronization...', {
      documentsDir: config.documentsDir,
      autoFix: true
    })
    
    try {
      const syncReport = await syncManager.performStartupSync({
        autoFix: true,
        deepScan: true,
        includeNewFiles: true
      })
      
      logger.info('📊 Document synchronization completed', {
        totalFiles: syncReport.totalFiles,
        totalVectors: syncReport.totalVectors,
        totalChunks: syncReport.totalChunks,
        newFiles: syncReport.fixedIssues.filter(issue => issue.type === 'new_file').length,
        processingTime: `${Date.now() - syncReport.timestamp.getTime()}ms`
      })
    } catch (error) {
      logger.warn('Document synchronization failed, continuing without sync', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  } else {
    logger.info('📋 Document auto-sync disabled via configuration')
  }

  // Initialize handlers
  const searchHandler = new SearchHandler(ragWorkflow, fileRepository)
  const informationHandler = new InformationHandler(fileRepository)

  // Create and return MCP Server
  return new MCPServer(searchHandler, informationHandler, fileRepository, config)
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
    logger.info('🔧 Initializing RAG services and dependencies...')
    mcpServer = await initializeServices(config)

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`)

      if (mcpServer) {
        try {
          await mcpServer.shutdown()
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
