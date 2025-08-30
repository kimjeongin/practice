/**
 * Legacy Configuration Module - Backwards Compatibility
 * Wraps the new ConfigFactory for existing code compatibility
 */

import { ConfigFactory, ServerConfig, BaseServerConfig } from './config-factory.js'

// Load environment variables (handled by ConfigFactory)
// Export the loaded config with backward compatibility
export const appConfig = loadConfig()

export function loadConfig(): BaseServerConfig {
  const advancedConfig = ConfigFactory.getCurrentConfig()

  // Convert ServerConfig to legacy BaseServerConfig format
  return {
    nodeEnv: advancedConfig.nodeEnv,
    documentsDir: advancedConfig.documentsDir,
    dataDir: advancedConfig.dataDir,
    chunkSize: advancedConfig.chunkSize,
    chunkOverlap: advancedConfig.chunkOverlap,
    similarityTopK: advancedConfig.similarityTopK,
    embeddingModel: advancedConfig.embeddingModel,
    embeddingDevice: advancedConfig.embeddingDevice,
    logLevel: advancedConfig.logLevel,
    embeddingService: advancedConfig.embeddingService,
    embeddingBatchSize: advancedConfig.embeddingBatchSize,
    embeddingDimensions: advancedConfig.embeddingDimensions,
    similarityThreshold: advancedConfig.similarityThreshold,
    ollamaBaseUrl: advancedConfig.ollamaBaseUrl,
    transformersCacheDir: advancedConfig.transformersCacheDir,
  }
}

export function validateConfig(config: BaseServerConfig): void {
  // Convert to ServerConfig for validation
  const advancedConfig: ServerConfig = {
    ...config,
    // Add default advanced config properties
    vectorStore: {
      provider: 'lancedb',
      config: {
        uri: `${config.dataDir}/lancedb`,
        tableName: 'documents',
        mode: 'create',
      },
    },
    pipeline: {
      maxConcurrentProcessing: 3,
      batchSize: 10,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 5000,
      },
    },
    search: {
      enableHybridSearch: true,
      enableQueryRewriting: false,
      semanticWeight: 0.7,
      rerankingEnabled: false,
    },
    modelMigration: {
      enableAutoMigration: true,
      enableIncompatibilityDetection: true,
      clearVectorsOnModelChange: true,
      backupEmbeddingsBeforeMigration: false,
      migrationTimeout: 300000,
    },
    mcp: {
      type: (process.env['MCP_TRANSPORT'] as any) || 'stdio',
      port: parseInt(process.env['MCP_PORT'] || '3000'),
      host: process.env['MCP_HOST'] || 'localhost',
      enableCors: process.env['MCP_ENABLE_CORS'] !== 'false',
      sessionTimeout: parseInt(process.env['MCP_SESSION_TIMEOUT'] || '300000'),
      allowedOrigins: process.env['MCP_ALLOWED_ORIGINS']?.split(',') || ['*'],
      enableDnsRebindingProtection: process.env['MCP_DNS_REBINDING_PROTECTION'] === 'true',
    },
  }

  ConfigFactory.validateConfig(advancedConfig)
}

// Re-export ConfigFactory for new code
export { ConfigFactory }
export type { ServerConfig }
