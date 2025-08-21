/**
 * Legacy Configuration Module - Backwards Compatibility
 * Wraps the new ConfigFactory for existing code compatibility
 */

import { ConfigFactory, AdvancedServerConfig } from '@/infrastructure/config/config-factory.js';
import { ServerConfig } from '@/shared/types/index.js';

// Load environment variables (handled by ConfigFactory)
// Export the loaded config with backward compatibility
export const appConfig = loadConfig();

export function loadConfig(): ServerConfig {
  const advancedConfig = ConfigFactory.getCurrentConfig();
  
  // Convert AdvancedServerConfig to legacy ServerConfig format
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
  };
}

export function validateConfig(config: ServerConfig): void {
  // Convert to AdvancedServerConfig for validation
  const advancedConfig: AdvancedServerConfig = {
    ...config,
    // Add default advanced config properties
    vectorStore: {
      provider: 'faiss',
      config: {
        indexPath: `${config.dataDir}/vectors`
      }
    },
    pipeline: {
      maxConcurrentProcessing: 3,
      batchSize: 10,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 5000,
      }
    },
    search: {
      enableHybridSearch: true,
      enableQueryRewriting: false,
      semanticWeight: 0.7,
      rerankingEnabled: false,
      compressionEnabled: false,
    },
    monitoring: {
      enabled: process.env['ENABLE_MONITORING'] !== 'false',
      port: 3001,
      metricsPath: '/metrics',
      healthCheckPath: '/health',
    },
    features: {
      conversationalRag: false,
      multiStepRetrieval: false,
      contextualCompression: false,
      adaptiveRetrieval: false,
    }
  };
  
  ConfigFactory.validateConfig(advancedConfig);
}

// Re-export ConfigFactory for new code
export { ConfigFactory };
export type { AdvancedServerConfig };