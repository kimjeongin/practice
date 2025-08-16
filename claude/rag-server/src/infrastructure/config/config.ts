import { config } from 'dotenv';
import { resolve } from 'path';
import { ServerConfig } from '@/shared/types/index';

// Load environment variables
config();

// Export the loaded config
export const appConfig = loadConfig();

export function loadConfig(): ServerConfig {
  const service = process.env['EMBEDDING_SERVICE'] || 'transformers';
  
  return {
    nodeEnv: process.env['NODE_ENV'] || 'development',
    databasePath: resolve(process.env['DATABASE_PATH'] || './data/rag.db'),
    dataDir: resolve(process.env['DATA_DIR'] || './data'),
    chunkSize: parseInt(process.env['CHUNK_SIZE'] || '1024', 10),
    chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '20', 10),
    similarityTopK: parseInt(process.env['SIMILARITY_TOP_K'] || '5', 10),
    embeddingModel: process.env['EMBEDDING_MODEL'] || getDefaultEmbeddingModel(service),
    embeddingDevice: process.env['EMBEDDING_DEVICE'] || 'cpu',
    logLevel: process.env['LOG_LEVEL'] || 'info',
    // Embedding configuration
    embeddingService: service,
    embeddingBatchSize: parseInt(process.env['EMBEDDING_BATCH_SIZE'] || '10', 10),
    embeddingDimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] || getDefaultEmbeddingDimensions(service), 10),
    similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] || '0.1'),
    // Ollama configuration
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
    // Transformers.js configuration
    transformersCacheDir: process.env['TRANSFORMERS_CACHE_DIR'] || './data/.transformers-cache',
  };
}

function getDefaultEmbeddingModel(service: string): string {
  switch (service) {
    case 'ollama':
      return 'nomic-embed-text';
    case 'transformers':
      return 'all-MiniLM-L6-v2';
    default:
      return 'all-MiniLM-L6-v2';
  }
}

function getDefaultEmbeddingDimensions(service: string): string {
  switch (service) {
    case 'ollama':
      return '768'; // nomic-embed-text default dimensions
    case 'transformers':
      return '384'; // all-MiniLM-L6-v2 default dimensions
    default:
      return '384';
  }
}

export function validateConfig(config: ServerConfig): void {
  const errors: string[] = [];

  if (config.chunkSize < 100 || config.chunkSize > 8192) {
    errors.push('Chunk size must be between 100 and 8192');
  }

  if (config.chunkOverlap < 0 || config.chunkOverlap >= config.chunkSize) {
    errors.push('Chunk overlap must be between 0 and chunk size');
  }

  if (config.similarityTopK < 1 || config.similarityTopK > 100) {
    errors.push('Similarity top K must be between 1 and 100');
  }

  if (!config.embeddingModel || config.embeddingModel.trim().length === 0) {
    errors.push('Embedding model must be specified');
  }

  // Validate embedding service specific configurations
  if (!['ollama', 'transformers'].includes(config.embeddingService)) {
    errors.push('Embedding service must be "ollama" or "transformers"');
  }

  if (config.embeddingService === 'ollama' && config.ollamaBaseUrl) {
    try {
      new URL(config.ollamaBaseUrl);
    } catch {
      errors.push('Ollama base URL must be a valid URL');
    }
  }

  if (config.embeddingDimensions < 1 || config.embeddingDimensions > 4096) {
    errors.push('Embedding dimensions must be between 1 and 4096');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}