import { logger } from '@/shared/logger/index.js'
/**
 * Configuration Factory Pattern
 * Manages environment-specific configurations following 2025 best practices
 */

import { resolve } from 'path'

// Base server configuration interface
export interface BaseServerConfig {
  documentsDir: string // 사용자 파일 디렉토리 (파일 워처 대상)
  dataDir: string // 시스템 파일 디렉토리 (벡터DB, 캐시 등)
  chunkSize: number
  chunkOverlap: number
  similarityTopK: number
  embeddingModel: string
  embeddingDevice: string
  logLevel: string
  // Embedding configuration
  embeddingService: string
  embeddingBatchSize: number
  embeddingDimensions: number
  similarityThreshold: number
  // Ollama configuration
  ollamaBaseUrl?: string
  // Transformers.js configuration
  transformersCacheDir?: string
  nodeEnv: string
}

export interface ConfigProfile {
  name: string
  description: string
  config: Partial<ServerConfig>
  extends?: string
}

export interface VectorStoreConfig {
  provider: 'lancedb'
  config: {
    uri?: string
    tableName?: string
    mode?: 'create' | 'overwrite' | 'append'
    enableFullTextSearch?: boolean
    indexColumns?: string[]
    storageOptions?: Record<string, any>
  }
}

export interface MCPTransportConfig {
  type: 'stdio' | 'streamable-http'
  port?: number
  host?: string
  enableCors?: boolean
  sessionTimeout?: number
  allowedOrigins?: string[]
  enableDnsRebindingProtection?: boolean
}

export interface ServerConfig extends BaseServerConfig {
  // Vector store configuration
  vectorStore: VectorStoreConfig

  // Pipeline configuration
  pipeline: {
    maxConcurrentProcessing: number
    batchSize: number
    retryConfig: {
      maxRetries: number
      baseDelay: number
      maxDelay: number
    }
  }

  // Search configuration
  search: {
    enableHybridSearch: boolean
    enableQueryRewriting: boolean
    semanticWeight: number
    rerankingEnabled: boolean
  }

  // Model migration and compatibility settings
  modelMigration: {
    enableAutoMigration: boolean
    enableIncompatibilityDetection: boolean
    clearVectorsOnModelChange: boolean
    backupEmbeddingsBeforeMigration: boolean
    migrationTimeout: number
  }

  // MCP Transport configuration
  mcp: MCPTransportConfig
}

export class ConfigFactory {
  private profiles = new Map<string, ConfigProfile>()

  constructor() {
    this.initializeDefaultProfiles()
  }

  /**
   * Create configuration for development environment
   */
  static createDevelopmentConfig(): ServerConfig {
    const baseConfig = ConfigFactory.createBaseConfig()

    return {
      ...baseConfig,
      nodeEnv: 'development',
      logLevel: 'debug',
      vectorStore: {
        provider: 'lancedb',
        config: {
          uri: process.env['LANCEDB_URI'] || resolve('./.data/lancedb'),
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
        enableQueryRewriting: false, // Disable for faster dev iteration
        semanticWeight: 0.7,
        rerankingEnabled: false,
      },
      modelMigration: {
        enableAutoMigration: process.env['ENABLE_AUTO_MIGRATION'] !== 'false',
        enableIncompatibilityDetection: process.env['ENABLE_INCOMPATIBILITY_DETECTION'] !== 'false',
        clearVectorsOnModelChange: process.env['CLEAR_VECTORS_ON_MODEL_CHANGE'] !== 'false',
        backupEmbeddingsBeforeMigration:
          process.env['BACKUP_EMBEDDINGS_BEFORE_MIGRATION'] === 'true', // False by default in dev
        migrationTimeout: parseInt(process.env['MIGRATION_TIMEOUT'] || '300000'), // 5 minutes
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
  }

  /**
   * Create configuration for production environment
   */
  static createProductionConfig(): ServerConfig {
    const baseConfig = ConfigFactory.createBaseConfig()

    return {
      ...baseConfig,
      nodeEnv: 'production',
      logLevel: 'info',
      vectorStore: {
        provider: 'lancedb',
        config: {
          uri: process.env['LANCEDB_URI'] || `${baseConfig.dataDir}/lancedb`,
        },
      },
      pipeline: {
        maxConcurrentProcessing: parseInt(process.env['MAX_CONCURRENT_PROCESSING'] || '10'),
        batchSize: parseInt(process.env['BATCH_SIZE'] || '20'),
        retryConfig: {
          maxRetries: parseInt(process.env['MAX_RETRIES'] || '3'),
          baseDelay: parseInt(process.env['BASE_DELAY'] || '2000'),
          maxDelay: parseInt(process.env['MAX_DELAY'] || '10000'),
        },
      },
      search: {
        enableHybridSearch: process.env['ENABLE_HYBRID_SEARCH'] !== 'false',
        enableQueryRewriting: process.env['ENABLE_QUERY_REWRITING'] !== 'false',
        semanticWeight: parseFloat(process.env['SEMANTIC_WEIGHT'] || '0.7'),
        rerankingEnabled: process.env['ENABLE_RERANKING'] !== 'false',
      },
      modelMigration: {
        enableAutoMigration: process.env['ENABLE_AUTO_MIGRATION'] !== 'false',
        enableIncompatibilityDetection: process.env['ENABLE_INCOMPATIBILITY_DETECTION'] !== 'false',
        clearVectorsOnModelChange: process.env['CLEAR_VECTORS_ON_MODEL_CHANGE'] !== 'false',
        backupEmbeddingsBeforeMigration:
          process.env['BACKUP_EMBEDDINGS_BEFORE_MIGRATION'] !== 'false', // True by default in production
        migrationTimeout: parseInt(process.env['MIGRATION_TIMEOUT'] || '600000'), // 10 minutes in production
      },
      mcp: {
        type: (process.env['MCP_TRANSPORT'] as any) || 'streamable-http',
        port: parseInt(process.env['MCP_PORT'] || '3000'),
        host: process.env['MCP_HOST'] || '0.0.0.0',
        enableCors: process.env['MCP_ENABLE_CORS'] !== 'false',
        sessionTimeout: parseInt(process.env['MCP_SESSION_TIMEOUT'] || '300000'),
        allowedOrigins: process.env['MCP_ALLOWED_ORIGINS']?.split(',') || ['*'],
        enableDnsRebindingProtection: process.env['MCP_DNS_REBINDING_PROTECTION'] === 'true',
      },
    }
  }

  /**
   * Create configuration for testing environment
   */
  static createTestConfig(): ServerConfig {
    const baseConfig = ConfigFactory.createBaseConfig()

    return {
      ...baseConfig,
      nodeEnv: 'test',
      logLevel: 'error',
      documentsDir: resolve('./tests/documents'),
      dataDir: resolve('./tests/.data'),
      vectorStore: {
        provider: 'lancedb',
        config: {
          uri: process.env['LANCEDB_URI'] || resolve('./tests/.data/lancedb'),
        },
      },
      pipeline: {
        maxConcurrentProcessing: 1,
        batchSize: 5,
        retryConfig: {
          maxRetries: 1,
          baseDelay: 100,
          maxDelay: 1000,
        },
      },
      search: {
        enableHybridSearch: true,
        enableQueryRewriting: false,
        semanticWeight: 0.7,
        rerankingEnabled: false,
      },
      modelMigration: {
        enableAutoMigration: false, // Disabled in tests to avoid interference
        enableIncompatibilityDetection: false,
        clearVectorsOnModelChange: false,
        backupEmbeddingsBeforeMigration: false,
        migrationTimeout: 30000, // Short timeout for tests
      },
      mcp: {
        type: 'stdio',
        port: 3002,
        host: 'localhost',
        enableCors: true,
        sessionTimeout: 30000,
        allowedOrigins: ['*'],
        enableDnsRebindingProtection: false,
      },
    }
  }

  /**
   * Register a custom configuration profile
   */
  registerProfile(profile: ConfigProfile): void {
    this.profiles.set(profile.name, profile)
  }

  /**
   * Get configuration by profile name
   */
  getConfig(profileName: string): ServerConfig {
    const profile = this.profiles.get(profileName)
    if (!profile) {
      throw new Error(`Configuration profile '${profileName}' not found`)
    }

    let config = ConfigFactory.createBaseConfig() as ServerConfig

    // Apply base configuration from extended profile
    if (profile.extends) {
      const parentConfig = this.getConfig(profile.extends)
      config = { ...config, ...parentConfig }
    }

    // Apply profile-specific configuration
    return { ...config, ...profile.config } as ServerConfig
  }

  /**
   * Get configuration based on current environment
   */
  static getCurrentConfig(): ServerConfig {
    const env = process.env['NODE_ENV'] || 'development'

    switch (env) {
      case 'production':
        return ConfigFactory.createProductionConfig()
      case 'test':
        return ConfigFactory.createTestConfig()
      case 'development':
      default:
        return ConfigFactory.createDevelopmentConfig()
    }
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: ServerConfig): void {
    const errors: string[] = []

    // Existing validations from original config.ts
    if (config.chunkSize < 100 || config.chunkSize > 8192) {
      errors.push('Chunk size must be between 100 and 8192')
    }

    if (config.chunkOverlap < 0 || config.chunkOverlap >= config.chunkSize) {
      errors.push('Chunk overlap must be between 0 and chunk size')
    }

    if (config.similarityTopK < 1 || config.similarityTopK > 100) {
      errors.push('Similarity top K must be between 1 and 100')
    }

    // New validations for advanced features
    if (config.pipeline.maxConcurrentProcessing < 1) {
      errors.push('Max concurrent processing must be at least 1')
    }

    if (config.search.semanticWeight < 0 || config.search.semanticWeight > 1) {
      errors.push('Semantic weight must be between 0 and 1')
    }

    // LanceDB validation
    if (!config.vectorStore.config.uri) {
      errors.push('LanceDB URI is required')
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
    }
  }

  private static createBaseConfig(): Omit<
    ServerConfig,
    'vectorStore' | 'pipeline' | 'search' | 'modelMigration' | 'mcp'
  > {
    const service = process.env['EMBEDDING_SERVICE'] || 'transformers'
    const dataDir = resolve(process.env['DATA_DIR'] || './.data')
    const documentsDir = resolve(process.env['DOCUMENTS_DIR'] || './documents')
    const embeddingModel =
      process.env['EMBEDDING_MODEL'] || ConfigFactory.getDefaultEmbeddingModel(service)

    // Get model-specific configuration
    const modelDimensions = ConfigFactory.getModelDimensions(service, embeddingModel)
    const modelBatchSize = ConfigFactory.getModelBatchSize(service, embeddingModel)

    return {
      nodeEnv: process.env['NODE_ENV'] || 'development',
      documentsDir,
      dataDir,
      chunkSize: parseInt(process.env['CHUNK_SIZE'] || '1024', 10),
      chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '20', 10),
      similarityTopK: parseInt(process.env['SIMILARITY_TOP_K'] || '5', 10),
      embeddingModel,
      embeddingDevice: process.env['EMBEDDING_DEVICE'] || 'cpu',
      logLevel: process.env['LOG_LEVEL'] || 'info',
      embeddingService: service,
      // Use model-specific batch size, but allow environment override
      embeddingBatchSize: parseInt(
        process.env['EMBEDDING_BATCH_SIZE'] || modelBatchSize.toString(),
        10
      ),
      // Use model-specific dimensions, but allow environment override for debugging
      embeddingDimensions: parseInt(
        process.env['EMBEDDING_DIMENSIONS'] || modelDimensions.toString(),
        10
      ),
      similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] || '0.1'),
      ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
      transformersCacheDir:
        process.env['TRANSFORMERS_CACHE_DIR'] || `${dataDir}/.cache/transformers`,
    }
  }

  private initializeDefaultProfiles(): void {
    // High performance profile
    this.registerProfile({
      name: 'high-performance',
      description: 'Optimized for maximum performance',
      config: {
        search: {
          enableHybridSearch: true,
          enableQueryRewriting: true,
          semanticWeight: 0.8,
          rerankingEnabled: true,
        },
      },
    })

    // Memory optimized profile
    this.registerProfile({
      name: 'memory-optimized',
      description: 'Optimized for low memory usage',
      config: {
        chunkSize: 512,
        embeddingBatchSize: 5,
        search: {
          enableHybridSearch: false,
          enableQueryRewriting: false,
          semanticWeight: 0.5,
          rerankingEnabled: false,
        },
      },
    })
  }

  private static getDefaultEmbeddingModel(service: string): string {
    switch (service) {
      case 'ollama':
        return 'nomic-embed-text'
      case 'transformers':
        return 'paraphrase-multilingual-MiniLM-L12-v2'
      default:
        return 'paraphrase-multilingual-MiniLM-L12-v2'
    }
  }

  private static getDefaultEmbeddingDimensions(service: string): string {
    switch (service) {
      case 'ollama':
        return '768'
      case 'transformers':
        return '384' // Changed to maintain compatibility
      default:
        return '384'
    }
  }

  /**
   * Get model-specific dimensions
   */
  private static getModelDimensions(service: string, modelName: string): number {
    if (service === 'transformers') {
      try {
        // Use dynamic import for ES modules compatibility
        const transformersModule = require('../../domains/rag/integrations/embeddings/providers/transformers')
        return transformersModule.TransformersEmbeddings.getModelDimensions(modelName)
      } catch (error) {
        // logger.warn(`Could not get model dimensions for ${modelName}, using fallback`)
        return parseInt(ConfigFactory.getDefaultEmbeddingDimensions(service), 10)
      }
    } else if (service === 'ollama') {
      try {
        // Use dynamic import for ES modules compatibility
        const ollamaModule = require('../../domains/rag/integrations/embeddings/providers/ollama')
        return ollamaModule.OllamaEmbeddings.getModelDimensions(modelName)
      } catch (error) {
        // logger.warn(`Could not get model dimensions for ${modelName}, using fallback`)
        return parseInt(ConfigFactory.getDefaultEmbeddingDimensions(service), 10)
      }
    }
    return parseInt(ConfigFactory.getDefaultEmbeddingDimensions(service), 10)
  }

  /**
   * Get model-specific batch size
   */
  private static getModelBatchSize(service: string, modelName: string): number {
    if (service === 'transformers') {
      try {
        // Use dynamic import for ES modules compatibility
        const transformersModule = require('../../domains/rag/integrations/embeddings/providers/transformers')
        return transformersModule.TransformersEmbeddings.getModelBatchSize(modelName)
      } catch (error) {
        // logger.warn(`Could not get model batch size for ${modelName}, using fallback`)
        return 10 // fallback
      }
    } else if (service === 'ollama') {
      try {
        // Use dynamic import for ES modules compatibility
        const ollamaModule = require('../../domains/rag/integrations/embeddings/providers/ollama')
        return ollamaModule.OllamaEmbeddings.getModelBatchSize(modelName)
      } catch (error) {
        // logger.warn(`Could not get model batch size for ${modelName}, using fallback`)
        return 8 // fallback
      }
    }
    return 10 // default batch size
  }
}

// Export factory instance and current config
export const configFactory = new ConfigFactory()
export const currentConfig = ConfigFactory.getCurrentConfig()
