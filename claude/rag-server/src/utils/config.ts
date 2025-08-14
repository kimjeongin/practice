import { config } from 'dotenv';
import { resolve } from 'path';
import { ServerConfig } from '../types/index.js';

// Load environment variables
config();

// Export the loaded config
export const appConfig = loadConfig();

export function loadConfig(): ServerConfig {
  return {
    databasePath: resolve(process.env['DATABASE_PATH'] || './data/rag.db'),
    dataDir: resolve(process.env['DATA_DIR'] || './data'),
    chunkSize: parseInt(process.env['CHUNK_SIZE'] || '1024', 10),
    chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '20', 10),
    similarityTopK: parseInt(process.env['SIMILARITY_TOP_K'] || '5', 10),
    embeddingModel: process.env['EMBEDDING_MODEL'] || 'BAAI/bge-small-en-v1.5',
    embeddingDevice: process.env['EMBEDDING_DEVICE'] || 'cpu',
    logLevel: process.env['LOG_LEVEL'] || 'info',
    // Vector DB configuration
    chromaServerUrl: process.env['CHROMA_SERVER_URL'] || 'http://localhost:8000',
    chromaCollectionName: process.env['CHROMA_COLLECTION_NAME'] || 'rag_documents',
    // Embedding configuration
    openaiApiKey: process.env['OPENAI_API_KEY'],
    embeddingService: process.env['EMBEDDING_SERVICE'] || 'openai',
    embeddingBatchSize: parseInt(process.env['EMBEDDING_BATCH_SIZE'] || '100', 10),
    embeddingDimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] || '1536', 10),
    similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] || '0.7')
  };
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

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}