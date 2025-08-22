/**
 * Basic RAG Application Tests
 */

import { describe, test, expect, jest } from '@jest/globals';

// Mock all complex dependencies
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

describe('RAGApplication Basic Tests', () => {
  test('should create application with test config', () => {
    const config = ConfigFactory.createTestConfig();
    const app = new RAGApplication(config);
    
    expect(app).toBeInstanceOf(RAGApplication);
    
    const status = app.getStatus();
    expect(status.application.version).toBe('2.0.0');
    expect(status.application.environment).toBe('test');
  });

  test('should create static factory instances', () => {
    const devApp = RAGApplication.createDevelopment();
    const prodApp = RAGApplication.createProduction();
    const testApp = RAGApplication.createTest();
    
    expect(devApp).toBeInstanceOf(RAGApplication);
    expect(prodApp).toBeInstanceOf(RAGApplication);
    expect(testApp).toBeInstanceOf(RAGApplication);
  });

  test('should perform health check when not initialized', async () => {
    const app = RAGApplication.createTest();
    const health = await app.healthCheck();
    
    expect(health.status).toBe('unhealthy');
    expect(health.details.reason).toBe('Application not properly started');
  });
});