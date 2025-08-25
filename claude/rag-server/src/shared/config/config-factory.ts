/**
 * Configuration Factory Pattern
 * Manages environment-specific configurations following 2025 best practices
 */

import { resolve } from 'path'
import { ServerConfig as BaseServerConfig } from '@/shared/types/index.js'

export interface ConfigProfile {
  name: string
  description: string
  config: Partial<ServerConfig>
  extends?: string
}

export interface VectorStoreConfig {
  provider: 'faiss' | 'qdrant'
  config: {
    // FAISS specific
    indexPath?: string
    dimensions?: number

    // Qdrant specific
    url?: string
    apiKey?: string
    collectionName?: string
    vectorSize?: number
    distance?: string
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

  // Document synchronization settings
  enableAutoSync?: boolean

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
        provider: 'faiss',
        config: {
          indexPath: resolve('./.data/vectors'),
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
        backupEmbeddingsBeforeMigration: process.env['BACKUP_EMBEDDINGS_BEFORE_MIGRATION'] === 'true', // False by default in dev
        migrationTimeout: parseInt(process.env['MIGRATION_TIMEOUT'] || '300000'), // 5 minutes
      },
      // Document synchronization settings
      enableAutoSync: process.env['ENABLE_AUTO_SYNC'] !== 'false',
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
        provider: (process.env['VECTOR_STORE_PROVIDER'] as any) || 'faiss',
        config: {
          // FAISS config
          indexPath: process.env['FAISS_INDEX_PATH'] || `${baseConfig.dataDir}/vectors`,
          dimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] || '384'),

          // Qdrant config (if needed)
          url: process.env['QDRANT_URL'] || 'http://localhost:6333',
          apiKey: process.env['QDRANT_API_KEY'],
          collectionName: process.env['QDRANT_COLLECTION'] || 'documents',
          vectorSize: parseInt(process.env['EMBEDDING_DIMENSIONS'] || '384'),
          distance: 'cosine',
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
        backupEmbeddingsBeforeMigration: process.env['BACKUP_EMBEDDINGS_BEFORE_MIGRATION'] !== 'false', // True by default in production
        migrationTimeout: parseInt(process.env['MIGRATION_TIMEOUT'] || '600000'), // 10 minutes in production
      },
      // Document synchronization settings
      enableAutoSync: process.env['ENABLE_AUTO_SYNC'] !== 'false',
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
        provider: 'faiss',
        config: {
          indexPath: resolve('./tests/.data/vectors'),
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
      // Document synchronization settings (disabled for tests by default)
      enableAutoSync: process.env['ENABLE_AUTO_SYNC'] === 'true',
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

    if (config.vectorStore.provider === 'qdrant' && !config.vectorStore.config.url) {
      errors.push('Qdrant URL is required when using Qdrant provider')
    }

    if (config.vectorStore.provider === 'faiss' && !config.vectorStore.config.indexPath) {
      errors.push('FAISS index path is required when using FAISS provider')
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

    return {
      nodeEnv: process.env['NODE_ENV'] || 'development',
      documentsDir,
      dataDir,
      chunkSize: parseInt(process.env['CHUNK_SIZE'] || '1024', 10),
      chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '20', 10),
      similarityTopK: parseInt(process.env['SIMILARITY_TOP_K'] || '5', 10),
      embeddingModel:
        process.env['EMBEDDING_MODEL'] || ConfigFactory.getDefaultEmbeddingModel(service),
      embeddingDevice: process.env['EMBEDDING_DEVICE'] || 'cpu',
      logLevel: process.env['LOG_LEVEL'] || 'info',
      embeddingService: service,
      embeddingBatchSize: parseInt(process.env['EMBEDDING_BATCH_SIZE'] || '10', 10),
      embeddingDimensions: parseInt(
        process.env['EMBEDDING_DIMENSIONS'] || ConfigFactory.getDefaultEmbeddingDimensions(service),
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
        return 'all-MiniLM-L6-v2'
      default:
        return 'all-MiniLM-L6-v2'
    }
  }

  private static getDefaultEmbeddingDimensions(service: string): string {
    switch (service) {
      case 'ollama':
        return '768'
      case 'transformers':
        return '384'
      default:
        return '384'
    }
  }
}

// Export factory instance and current config
export const configFactory = new ConfigFactory()
export const currentConfig = ConfigFactory.getCurrentConfig()
