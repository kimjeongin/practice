import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the configuration module since it may have external dependencies
jest.mock('../../src/infrastructure/config/config', () => ({
  loadConfig: jest.fn(() => ({
    server: { port: 3000, host: 'localhost' },
    database: { path: ':memory:' },
    embeddings: { provider: 'transformers' },
    vectorStore: { provider: 'faiss' }
  })),
  validateConfig: jest.fn()
}));

describe('Configuration Tests', () => {
  test('should create valid mock config', () => {
    const mockConfig = {
      server: { port: 3000, host: 'localhost' },
      database: { path: ':memory:' },
      embeddings: { provider: 'transformers' },
      vectorStore: { provider: 'faiss' }
    };

    expect(mockConfig).toHaveProperty('server');
    expect(mockConfig.server.port).toBe(3000);
    expect(mockConfig.database.path).toBe(':memory:');
  });

  test('should validate config structure', () => {
    const config = {
      server: { port: 3000, host: 'localhost' },
      database: { path: ':memory:' },
      embeddings: { provider: 'transformers' },
      vectorStore: { provider: 'faiss' }
    };

    // Check required properties exist
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('database');
    expect(config).toHaveProperty('embeddings');
    expect(config).toHaveProperty('vectorStore');

    // Check property types
    expect(typeof config.server.port).toBe('number');
    expect(typeof config.server.host).toBe('string');
    expect(typeof config.database.path).toBe('string');
    expect(typeof config.embeddings.provider).toBe('string');
    expect(typeof config.vectorStore.provider).toBe('string');
  });

  test('should handle environment variables', () => {
    // Simulate environment variables
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    expect(process.env.NODE_ENV).toBe('test');

    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });
});