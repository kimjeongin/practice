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
  chunkingStrategy: 'contextual' | 'normal'
  contextualChunkingModel: string
  minChunkSize: number

  // File watcher configuration
  watcherDebounceDelay: number
  watcherMaxScanDepth: number
  watcherMaxProcessingQueue: number

  // Processing configuration
  maxConcurrentProcessing: number
  maxErrorHistory: number

  // Embedding configuration
  embeddingConcurrency: number

  // Search configuration
  semanticScoreThreshold: number

  // Ollama configuration
  embeddingModel: string
  embeddingBatchSize: number
  ollamaBaseUrl: string

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

      // Document processing (optimized for 2024 research)
      chunkSize: parseInt(process.env['CHUNK_SIZE'] || '400'),
      chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '100'),
      chunkingStrategy:
        (process.env['CHUNKING_STRATEGY'] as 'contextual' | 'normal') || 'contextual',
      contextualChunkingModel: process.env['CONTEXTUAL_CHUNKING_MODEL'] || 'qwen3:0.6b',
      minChunkSize: parseInt(process.env['MIN_CHUNK_SIZE'] || '300'),

      // File watcher configuration
      watcherDebounceDelay: parseInt(process.env['WATCHER_DEBOUNCE_DELAY'] || '300'),
      watcherMaxScanDepth: parseInt(process.env['WATCHER_MAX_SCAN_DEPTH'] || '5'),
      watcherMaxProcessingQueue: parseInt(process.env['WATCHER_MAX_PROCESSING_QUEUE'] || '100'),

      // Processing configuration
      maxConcurrentProcessing: parseInt(process.env['MAX_CONCURRENT_PROCESSING'] || '3'),
      maxErrorHistory: parseInt(process.env['MAX_ERROR_HISTORY'] || '1000'),

      // Embedding configuration
      embeddingConcurrency: parseInt(process.env['EMBEDDING_CONCURRENCY'] || '3'),

      // Search configuration
      semanticScoreThreshold: parseFloat(process.env['SEMANTIC_SCORE_THRESHOLD'] || '0.7'),

      // Ollama configuration
      embeddingModel: process.env['EMBEDDING_MODEL'] || 'dengcao/Qwen3-Embedding-0.6B:Q8_0',
      embeddingBatchSize: parseInt(process.env['EMBEDDING_BATCH_SIZE'] || '8'),
      ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',

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

    if (!['contextual', 'normal'].includes(config.chunkingStrategy)) {
      errors.push('Chunking strategy must be "contextual" or "normal"')
    }

    if (!config.contextualChunkingModel) {
      errors.push('Contextual chunking model is required')
    }

    // Ollama validation
    if (!config.embeddingModel) {
      errors.push('Embedding model is required')
    }

    if (config.embeddingBatchSize < 1) {
      errors.push('Embedding batch size must be at least 1')
    }

    if (!config.ollamaBaseUrl) {
      errors.push('Ollama base URL is required')
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
      embeddingModel: config.embeddingModel,
      ollamaBaseUrl: config.ollamaBaseUrl,
      vectorStoreProvider: config.vectorStore.provider,
      mcpTransport: config.mcp.type,
    })
  }
}
