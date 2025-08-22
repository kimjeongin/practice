/**
 * End-to-End RAG Application Tests
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';

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

describe('RAG Application E2E', () => {
  let app: RAGApplication;

  beforeAll(async () => {
    const config = ConfigFactory.createTestConfig();
    config.monitoring.enabled = false;
    app = new RAGApplication(config);
  });

  afterAll(async () => {
    if (app) {
      try {
        await app.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
  });

  test('should complete full application lifecycle', async () => {
    // Initialize
    await app.initialize();
    let status = app.getStatus();
    expect(status.application.initialized).toBe(true);
    expect(status.application.running).toBe(false);

    // Start
    await app.start();
    status = app.getStatus();
    expect(status.application.running).toBe(true);

    // Health check
    const health = await app.healthCheck();
    expect(health.status).toBe('healthy');

    // Configuration update
    const originalChunkSize = app.getConfig().chunkSize;
    app.updateConfig({ chunkSize: originalChunkSize + 512 });
    expect(app.getConfig().chunkSize).toBe(originalChunkSize + 512);

    // Shutdown
    await app.shutdown();
    status = app.getStatus();
    expect(status.application.running).toBe(false);
  });
});