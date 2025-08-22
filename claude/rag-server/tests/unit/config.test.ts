/**
 * Configuration Tests
 */

import { describe, test, expect } from '@jest/globals';
import { ConfigFactory, ServerConfig } from '@/shared/config/config-factory.js';

describe('ConfigFactory', () => {
  test('should create development config', () => {
    const config = ConfigFactory.createDevelopmentConfig();
    
    expect(config.nodeEnv).toBe('development');
    expect(config.vectorStore.provider).toBe('faiss');
    expect(config.monitoring.enabled).toBe(true);
  });

  test('should create production config', () => {
    const config = ConfigFactory.createProductionConfig();
    
    expect(config.nodeEnv).toBe('production');
    expect(config.logLevel).toBe('info');
  });

  test('should create test config', () => {
    const config = ConfigFactory.createTestConfig();
    
    expect(config.nodeEnv).toBe('test');
    expect(config.logLevel).toBe('error');
    expect(config.monitoring.enabled).toBe(false);
  });

  test('should validate valid config', () => {
    const config = ConfigFactory.createDevelopmentConfig();
    
    expect(() => ConfigFactory.validateConfig(config)).not.toThrow();
  });

  test('should reject invalid chunk size', () => {
    const config = ConfigFactory.createDevelopmentConfig();
    config.chunkSize = 50; // Too small
    
    expect(() => ConfigFactory.validateConfig(config)).toThrow('Chunk size must be between 100 and 8192');
  });

  test('should reject invalid semantic weight', () => {
    const config = ConfigFactory.createDevelopmentConfig();
    config.search.semanticWeight = 1.5; // Too large
    
    expect(() => ConfigFactory.validateConfig(config)).toThrow('Semantic weight must be between 0 and 1');
  });
});