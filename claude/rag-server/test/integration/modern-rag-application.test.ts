import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ModernRAGApplication } from '../../src/app/modern-rag-application.js';
import { ConfigFactory } from '../../src/infrastructure/config/config-factory.js';

describe('Modern RAG Application Integration Tests', () => {
  let app: ModernRAGApplication;

  beforeEach(() => {
    // Set test environment
    process.env['NODE_ENV'] = 'test';
    
    // Create test instance
    app = ModernRAGApplication.createTest();
  });

  afterEach(async () => {
    if (app) {
      try {
        await app.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
  });

  test('should create test application instance', () => {
    expect(app).toBeDefined();
    expect(app.getConfig().nodeEnv).toBe('test');
    expect(app.getConfig().vectorStore.provider).toBe('faiss');
  });

  test('should have correct test configuration', () => {
    const config = app.getConfig();
    
    expect(config.nodeEnv).toBe('test');
    expect(config.logLevel).toBe('error');
    expect(config.monitoring.enabled).toBe(false);
    expect(config.pipeline.maxConcurrentProcessing).toBe(1);
    expect(config.pipeline.batchSize).toBe(5);
  });

  test('should initialize successfully', async () => {
    await expect(app.initialize()).resolves.not.toThrow();
    
    const status = app.getStatus();
    expect(status.application.initialized).toBe(true);
    expect(status.orchestrator).toBeDefined();
  });

  test('should start and stop successfully', async () => {
    await app.initialize();
    
    // Start application
    await expect(app.start()).resolves.not.toThrow();
    
    let status = app.getStatus();
    expect(status.application.running).toBe(true);
    
    // Stop application
    await expect(app.shutdown()).resolves.not.toThrow();
    
    status = app.getStatus();
    expect(status.application.running).toBe(false);
  });

  test('should perform health check', async () => {
    await app.initialize();
    await app.start();
    
    const health = await app.healthCheck();
    expect(health).toBeDefined();
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    expect(health.details).toBeDefined();
    
    await app.shutdown();
  });

  test('should handle configuration update', () => {
    const originalConfig = app.getConfig();
    
    app.updateConfig({
      chunkSize: 2048,
      logLevel: 'debug'
    });
    
    const updatedConfig = app.getConfig();
    expect(updatedConfig.chunkSize).toBe(2048);
    expect(updatedConfig.logLevel).toBe('debug');
    expect(updatedConfig.nodeEnv).toBe(originalConfig.nodeEnv); // Should remain unchanged
  });

  test('should create different environment configurations', () => {
    const devApp = ModernRAGApplication.createDevelopment();
    const prodApp = ModernRAGApplication.createProduction();
    const testApp = ModernRAGApplication.createTest();
    
    expect(devApp.getConfig().nodeEnv).toBe('development');
    expect(prodApp.getConfig().nodeEnv).toBe('production');
    expect(testApp.getConfig().nodeEnv).toBe('test');
    
    // Test different default settings
    expect(devApp.getConfig().logLevel).toBe('debug');
    expect(prodApp.getConfig().logLevel).toBe('info');
    expect(testApp.getConfig().logLevel).toBe('error');
    
    expect(testApp.getConfig().monitoring.enabled).toBe(false);
    expect(devApp.getConfig().monitoring.enabled).toBe(true);
  });
});

describe('ConfigFactory Tests', () => {
  test('should create development configuration', () => {
    const config = ConfigFactory.createDevelopmentConfig();
    
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('debug');
    expect(config.vectorStore.provider).toBe('faiss');
    expect(config.pipeline.maxConcurrentProcessing).toBe(3);
    expect(config.search.enableHybridSearch).toBe(true);
  });

  test('should create production configuration', () => {
    const config = ConfigFactory.createProductionConfig();
    
    expect(config.nodeEnv).toBe('production');
    expect(config.logLevel).toBe('info');
    expect(config.vectorStore.provider).toBe('faiss');
    expect(config.monitoring.enabled).toBe(true);
  });

  test('should create test configuration', () => {
    const config = ConfigFactory.createTestConfig();
    
    expect(config.nodeEnv).toBe('test');
    expect(config.logLevel).toBe('error');
    expect(config.monitoring.enabled).toBe(false);
    expect(config.pipeline.maxConcurrentProcessing).toBe(1);
  });

  test('should validate configuration successfully', () => {
    const validConfig = ConfigFactory.createDevelopmentConfig();
    
    expect(() => ConfigFactory.validateConfig(validConfig)).not.toThrow();
  });

  test('should fail validation for invalid configuration', () => {
    const invalidConfig = ConfigFactory.createDevelopmentConfig();
    invalidConfig.chunkSize = 50; // Too small
    
    expect(() => ConfigFactory.validateConfig(invalidConfig)).toThrow(/Chunk size must be between/);
  });

  test('should get current configuration based on environment', () => {
    // Save original env
    const originalEnv = process.env['NODE_ENV'];
    
    try {
      // Test development
      process.env['NODE_ENV'] = 'development';
      let config = ConfigFactory.getCurrentConfig();
      expect(config.nodeEnv).toBe('development');
      
      // Test production
      process.env['NODE_ENV'] = 'production';
      config = ConfigFactory.getCurrentConfig();
      expect(config.nodeEnv).toBe('production');
      
      // Test test
      process.env['NODE_ENV'] = 'test';
      config = ConfigFactory.getCurrentConfig();
      expect(config.nodeEnv).toBe('test');
      
    } finally {
      // Restore original env
      if (originalEnv) {
        process.env['NODE_ENV'] = originalEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    }
  });
});