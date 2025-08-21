import { describe, test, expect, beforeEach } from '@jest/globals';
import { loadConfig, validateConfig } from '../../src/infrastructure/config/config.js';
import { TEST_DATA_DIR, TEST_DOCUMENTS_DIR } from '../setup.js';

describe('Configuration', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.EMBEDDING_SERVICE;
    delete process.env.CHUNK_SIZE;
    delete process.env.EMBEDDING_MODEL;
  });

  describe('loadConfig', () => {
    test('should load current configuration', () => {
      const config = loadConfig();
      
      expect(config).toBeDefined();
      expect(config.embeddingService).toBe('transformers');
      expect(config.chunkSize).toBe(1024); // From .env
      expect(config.chunkOverlap).toBe(25); // From test env
      expect(config.similarityTopK).toBe(3); // From test env  
      expect(config.embeddingModel).toBe('all-MiniLM-L6-v2');
      expect(config.logLevel).toBe('error'); // From test env
      expect(config.nodeEnv).toBe('test');
    });

    test('should respect environment variables', () => {
      process.env.EMBEDDING_SERVICE = 'ollama';
      process.env.CHUNK_SIZE = '2048';
      process.env.EMBEDDING_MODEL = 'custom-model';
      process.env.LOG_LEVEL = 'debug';
      
      const config = loadConfig();
      
      expect(config.embeddingService).toBe('ollama');
      expect(config.chunkSize).toBe(2048);
      expect(config.embeddingModel).toBe('custom-model');
      expect(config.logLevel).toBe('debug');
    });

    test('should handle transformers service configuration', () => {
      process.env.EMBEDDING_SERVICE = 'transformers';
      process.env.EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
      
      const config = loadConfig();
      
      expect(config.embeddingService).toBe('transformers');
      expect(config.embeddingModel).toBe('sentence-transformers/all-MiniLM-L6-v2');
      expect(config.embeddingDimensions).toBe(384);
    });

    test('should handle ollama service configuration', () => {
      process.env.EMBEDDING_SERVICE = 'ollama';
      process.env.OLLAMA_BASE_URL = 'http://custom:11434';
      process.env.EMBEDDING_DIMENSIONS = '768';
      
      const config = loadConfig();
      
      expect(config.embeddingService).toBe('ollama');
      expect(config.ollamaBaseUrl).toBe('http://custom:11434');
      expect(config.embeddingDimensions).toBe(768);
    });
  });

  describe('validateConfig', () => {
    test('should validate correct configuration', () => {
      const validConfig = {
        documentsDir: TEST_DOCUMENTS_DIR,
        dataDir: TEST_DATA_DIR,
        chunkSize: 1024,
        chunkOverlap: 20,
        similarityTopK: 5,
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingDevice: 'cpu',
        logLevel: 'info',
        embeddingService: 'transformers',
        embeddingBatchSize: 10,
        embeddingDimensions: 384,
        similarityThreshold: 0.1,
        nodeEnv: 'test'
      };

      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    test('should reject invalid chunk size', () => {
      const config = {
        documentsDir: TEST_DOCUMENTS_DIR,
        dataDir: TEST_DATA_DIR,
        chunkSize: 50, // Too small
        chunkOverlap: 20,
        similarityTopK: 5,
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingDevice: 'cpu',
        logLevel: 'info',
        embeddingService: 'transformers',
        embeddingBatchSize: 10,
        embeddingDimensions: 384,
        similarityThreshold: 0.1,
        nodeEnv: 'test'
      };

      expect(() => validateConfig(config)).toThrow('Chunk size must be between 100 and 8192');
    });

    test('should reject invalid chunk overlap', () => {
      const config = {
        documentsDir: TEST_DOCUMENTS_DIR,
        dataDir: TEST_DATA_DIR,
        chunkSize: 1024,
        chunkOverlap: 1024, // Same as chunk size
        similarityTopK: 5,
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingDevice: 'cpu',
        logLevel: 'info',
        embeddingService: 'transformers',
        embeddingBatchSize: 10,
        embeddingDimensions: 384,
        similarityThreshold: 0.1,
        nodeEnv: 'test'
      };

      expect(() => validateConfig(config)).toThrow('Chunk overlap must be between 0 and chunk size');
    });

    test('should reject invalid embedding service', () => {
      const config = {
        documentsDir: TEST_DOCUMENTS_DIR,
        dataDir: TEST_DATA_DIR,
        chunkSize: 1024,
        chunkOverlap: 20,
        similarityTopK: 5,
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingDevice: 'cpu',
        logLevel: 'info',
        embeddingService: 'invalid-service',
        embeddingBatchSize: 10,
        embeddingDimensions: 384,
        similarityThreshold: 0.1,
        nodeEnv: 'test'
      };

      expect(() => validateConfig(config)).toThrow('Embedding service must be "ollama" or "transformers"');
    });

    test('should reject invalid similarity top K', () => {
      const config = {
        documentsDir: TEST_DOCUMENTS_DIR,
        dataDir: TEST_DATA_DIR,
        chunkSize: 1024,
        chunkOverlap: 20,
        similarityTopK: 0, // Too small
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingDevice: 'cpu',
        logLevel: 'info',
        embeddingService: 'transformers',
        embeddingBatchSize: 10,
        embeddingDimensions: 384,
        similarityThreshold: 0.1,
        nodeEnv: 'test'
      };

      expect(() => validateConfig(config)).toThrow('Similarity top K must be between 1 and 100');
    });

    test('should reject empty embedding model', () => {
      const config = {
        documentsDir: TEST_DOCUMENTS_DIR,
        dataDir: TEST_DATA_DIR,
        chunkSize: 1024,
        chunkOverlap: 20,
        similarityTopK: 5,
        embeddingModel: '', // Empty
        embeddingDevice: 'cpu',
        logLevel: 'info',
        embeddingService: 'transformers',
        embeddingBatchSize: 10,
        embeddingDimensions: 384,
        similarityThreshold: 0.1,
        nodeEnv: 'test'
      };

      expect(() => validateConfig(config)).toThrow('Embedding model must be specified');
    });
  });
});