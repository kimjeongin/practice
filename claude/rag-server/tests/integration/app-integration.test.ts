/**
 * RAG Application Integration Tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock complex dependencies
jest.mock('@/shared/utils/resilience.js', () => ({
  withTimeout: jest.fn((fn) => fn),
  withRetry: jest.fn((fn) => fn),
  CircuitBreakerManager: {
    getInstance: jest.fn(() => ({
      execute: jest.fn((fn) => fn())
    }))
  }
}));

jest.mock('@/shared/monitoring/error-monitor.js', () => ({
  errorMonitor: {
    recordError: jest.fn(),
    getSystemHealth: jest.fn(() => ({ status: 'healthy', totalErrors: 0, uptime: 1000 }))
  },
  setupGlobalErrorHandling: jest.fn()
}));

jest.mock('@/shared/monitoring/dashboard.js', () => ({
  monitoringDashboard: {
    start: jest.fn(),
    stop: jest.fn()
  }
}));

jest.mock('@/app/factories/pipeline-factory.js', () => ({
  PipelineFactory: {
    createTestOrchestrator: jest.fn(() => Promise.resolve({
      initialize: jest.fn(),
      start: jest.fn(),
      shutdown: jest.fn(),
      getStatus: jest.fn(() => ({ isRunning: true, pipelines: [] }))
    }))
  }
}));

import { RAGApplication } from '@/app/app.js';
import { ConfigFactory } from '@/shared/config/config-factory.js';

describe('RAG Application Integration', () => {
  let app: RAGApplication;

  beforeEach(() => {
    const config = ConfigFactory.createTestConfig();
    config.monitoring.enabled = false; // Disable monitoring for tests
    app = new RAGApplication(config);
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

  test('should initialize and start application', async () => {
    await app.initialize();
    
    const status = app.getStatus();
    expect(status.application.initialized).toBe(true);
    expect(status.application.running).toBe(false);
    
    await app.start();
    
    const runningStatus = app.getStatus();
    expect(runningStatus.application.running).toBe(true);
  });

  test('should perform health check on running application', async () => {
    await app.initialize();
    await app.start();
    
    const health = await app.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.details.application.running).toBe(true);
  });

  test('should handle configuration updates', () => {
    const originalConfig = app.getConfig();
    expect(originalConfig.chunkSize).toBe(1024); // Test config uses base config default
    
    app.updateConfig({ chunkSize: 2048 });
    
    const updatedConfig = app.getConfig();
    expect(updatedConfig.chunkSize).toBe(2048);
  });
});