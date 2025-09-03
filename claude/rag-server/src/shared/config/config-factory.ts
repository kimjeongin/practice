import { logger } from '@/shared/logger/index.js'
import { resolve } from 'path'

/**
 * Configuration Factory - Simplified
 * Manages server configuration with only actively used options
 */

export interface VectorStoreConfig {
  provider: 'lancedb'
  config: {
    uri: string
  }
}

export interface MCPTransportConfig {
  type: 'stdio' | 'streamable-http'
  port: number
  host: string
  enableCors: boolean
  sessionTimeout: number
  allowedOrigins: string[]
  enableDnsRebindingProtection: boolean
}

export interface ServerConfig {
  // Basic configuration
  nodeEnv: string
  documentsDir: string
  dataDir: string
  logLevel: string

  // Document processing
  chunkSize: number
  chunkOverlap: number
  similarityTopK: number
  similarityThreshold: number

  // Embedding configuration
  embeddingService: 'transformers' | 'ollama'
  embeddingModel: string
  embeddingDevice: string
  embeddingBatchSize: number
  embeddingDimensions: number
  ollamaBaseUrl?: string
  transformersCacheDir?: string

  // Reranking configuration
  rerankingEnabled: boolean
  rerankingService: 'transformers'
  rerankingModel: string
  rerankingTopK: number

  // Vector store
  vectorStore: VectorStoreConfig

  // MCP Transport
  mcp: MCPTransportConfig
}

export class ConfigFactory {
  /**
   * Get current configuration based on NODE_ENV
   */
  static getCurrentConfig(): ServerConfig {
    const nodeEnv = process.env['NODE_ENV'] || 'development'
    
    if (nodeEnv === 'production') {
      return ConfigFactory.createProductionConfig()
    } else {
      return ConfigFactory.createDevelopmentConfig()
    }
  }

  /**
   * Create base configuration from environment variables
   */
  private static createBaseConfig(): ServerConfig {
    return {
      nodeEnv: process.env['NODE_ENV'] || 'development',
      documentsDir: process.env['DOCUMENTS_DIR'] || './documents',
      dataDir: process.env['DATA_DIR'] || './.data',
      logLevel: process.env['LOG_LEVEL'] || 'info',

      // Document processing
      chunkSize: parseInt(process.env['CHUNK_SIZE'] || '1024'),
      chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '20'),
      similarityTopK: parseInt(process.env['SIMILARITY_TOP_K'] || '5'),
      similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] || '0.75'),

      // Embedding configuration
      embeddingService: (process.env['EMBEDDING_SERVICE'] as 'transformers' | 'ollama') || 'transformers',
      embeddingModel: process.env['EMBEDDING_MODEL'] || 'gte-multilingual-base',
      embeddingDevice: process.env['EMBEDDING_DEVICE'] || 'cpu',
      embeddingBatchSize: parseInt(process.env['EMBEDDING_BATCH_SIZE'] || '10'),
      embeddingDimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] || '768'),
      ollamaBaseUrl: process.env['OLLAMA_BASE_URL'],
      transformersCacheDir: process.env['TRANSFORMERS_CACHE_DIR'],

      // Reranking configuration
      rerankingEnabled: process.env['RERANKING_ENABLED'] !== 'false',
      rerankingService: 'transformers',
      rerankingModel: process.env['RERANKING_MODEL'] || 'gte-multilingual-reranker-base',
      rerankingTopK: parseInt(process.env['RERANKING_TOP_K'] || '5'),

      // Vector store
      vectorStore: {
        provider: 'lancedb',
        config: {
          uri: process.env['LANCEDB_URI'] || resolve('./.data/lancedb'),
        },
      },

      // MCP Transport
      mcp: {
        type: (process.env['MCP_TRANSPORT'] as 'stdio' | 'streamable-http') || 'stdio',
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
   * Create development configuration
   */
  static createDevelopmentConfig(): ServerConfig {
    const baseConfig = ConfigFactory.createBaseConfig()
    
    return {
      ...baseConfig,
      nodeEnv: 'development',
      logLevel: 'debug',
    }
  }

  /**
   * Create production configuration
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
      mcp: {
        ...baseConfig.mcp,
        type: (process.env['MCP_TRANSPORT'] as 'stdio' | 'streamable-http') || 'streamable-http',
        host: process.env['MCP_HOST'] || '0.0.0.0',
      },
    }
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: ServerConfig): void {
    const errors: string[] = []

    // Basic validation
    if (!config.documentsDir) {
      errors.push('Documents directory is required')
    }

    if (!config.dataDir) {
      errors.push('Data directory is required')
    }

    // Document processing validation
    if (config.chunkSize < 100 || config.chunkSize > 8192) {
      errors.push('Chunk size must be between 100 and 8192')
    }

    if (config.chunkOverlap < 0 || config.chunkOverlap >= config.chunkSize) {
      errors.push('Chunk overlap must be between 0 and chunk size')
    }

    if (config.similarityTopK < 1 || config.similarityTopK > 100) {
      errors.push('Similarity top K must be between 1 and 100')
    }

    // Embedding validation
    if (!['transformers', 'ollama'].includes(config.embeddingService)) {
      errors.push('Embedding service must be "transformers" or "ollama"')
    }

    if (!config.embeddingModel) {
      errors.push('Embedding model is required')
    }

    if (config.embeddingBatchSize < 1) {
      errors.push('Embedding batch size must be at least 1')
    }

    // Vector store validation
    if (!config.vectorStore.config.uri) {
      errors.push('LanceDB URI is required')
    }

    // MCP validation
    if (!['stdio', 'streamable-http'].includes(config.mcp.type)) {
      errors.push('MCP transport type must be "stdio" or "streamable-http"')
    }

    if (config.mcp.port < 1 || config.mcp.port > 65535) {
      errors.push('MCP port must be between 1 and 65535')
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
    }

    logger.debug('✅ Configuration validation passed', {
      embeddingService: config.embeddingService,
      embeddingModel: config.embeddingModel,
      vectorStoreProvider: config.vectorStore.provider,
      mcpTransport: config.mcp.type,
    })
  }
}