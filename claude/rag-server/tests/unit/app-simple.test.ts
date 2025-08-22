/**
 * Simple RAG Application Tests (without complex dependencies)
 */

import { describe, test, expect } from '@jest/globals';
import { ConfigFactory } from '@/shared/config/config-factory.js';

describe('RAG Application Configuration', () => {
  test('should create valid test configuration', () => {
    const config = ConfigFactory.createTestConfig();
    
    expect(config.nodeEnv).toBe('test');
    expect(config.vectorStore.provider).toBe('faiss');
    expect(config.monitoring.enabled).toBe(false);
    expect(config.pipeline.maxConcurrentProcessing).toBe(1);
  });

  test('should validate configuration parameters', () => {
    const config = ConfigFactory.createTestConfig();
    
    expect(() => ConfigFactory.validateConfig(config)).not.toThrow();
  });

  test('should create different environment configs', () => {
    const devConfig = ConfigFactory.createDevelopmentConfig();
    const prodConfig = ConfigFactory.createProductionConfig();
    const testConfig = ConfigFactory.createTestConfig();
    
    expect(devConfig.nodeEnv).toBe('development');
    expect(prodConfig.nodeEnv).toBe('production');
    expect(testConfig.nodeEnv).toBe('test');
    
    expect(devConfig.monitoring.enabled).toBe(true);
    expect(testConfig.monitoring.enabled).toBe(false);
  });
});