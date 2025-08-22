/**
 * RAG Application Tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock complex dependencies first
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

import { RAGApplication } from '@/app/app.js';
import { ConfigFactory } from '@/shared/config/config-factory.js';

describe('RAGApplication', () => {
  let app: RAGApplication;

  beforeEach(() => {
    const config = ConfigFactory.createTestConfig();
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

  test('should create application with test config', () => {
    expect(app).toBeInstanceOf(RAGApplication);
    
    const status = app.getStatus();
    expect(status.application.version).toBe('2.0.0');
    expect(status.application.environment).toBe('test');
    expect(status.application.initialized).toBe(false);
  });

  test('should initialize successfully', async () => {
    await app.initialize();
    
    const status = app.getStatus();
    expect(status.application.initialized).toBe(true);
  });

  test('should start and shutdown successfully', async () => {
    await app.start();
    
    const status = app.getStatus();
    expect(status.application.running).toBe(true);
    
    await app.shutdown();
    
    const finalStatus = app.getStatus();
    expect(finalStatus.application.running).toBe(false);
  });

  test('should perform health check', async () => {
    const health = await app.healthCheck();
    
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('details');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
  });

  test('should create static factory methods', () => {
    const devApp = RAGApplication.createDevelopment();
    const prodApp = RAGApplication.createProduction();
    const testApp = RAGApplication.createTest();
    
    expect(devApp).toBeInstanceOf(RAGApplication);
    expect(prodApp).toBeInstanceOf(RAGApplication);
    expect(testApp).toBeInstanceOf(RAGApplication);
  });
});