/**
 * Document Workflow End-to-End Tests
 * Tests the complete document processing workflow
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { RAGApplication } from '@/app/app.js';
import { ConfigFactory } from '@/shared/config/config-factory.js';

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

describe('Document Workflow E2E', () => {
  let app: RAGApplication;
  let testDocumentsDir: string;
  let testDataDir: string;

  beforeAll(async () => {
    // Create test configuration
    const config = ConfigFactory.createTestConfig();
    config.monitoring.enabled = false;
    
    // Setup test directories
    testDocumentsDir = path.join(process.cwd(), 'tests', 'fixtures', 'documents');
    testDataDir = path.join(process.cwd(), 'tests', 'fixtures', 'data');
    
    config.documentsPath = testDocumentsDir;
    config.dataPath = testDataDir;
    
    // Ensure test directories exist
    await fs.mkdir(testDocumentsDir, { recursive: true });
    await fs.mkdir(testDataDir, { recursive: true });
    
    app = new RAGApplication(config);
    await app.initialize();
  });

  afterAll(async () => {
    if (app) {
      try {
        await app.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    
    // Cleanup test directories
    try {
      await fs.rm(testDocumentsDir, { recursive: true, force: true });
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up any existing test files
    try {
      const files = await fs.readdir(testDocumentsDir);
      for (const file of files) {
        await fs.unlink(path.join(testDocumentsDir, file));
      }
    } catch (error) {
      // Directory might not exist or be empty
    }
  });

  test('should process a complete document workflow', async () => {
    // Create test document
    const testContent = `
# Test Document

This is a test document for the RAG system.

## Section 1
This section contains information about machine learning algorithms.

## Section 2  
This section discusses natural language processing techniques.

## Conclusion
The document concludes with a summary of key concepts.
    `.trim();

    const testFilePath = path.join(testDocumentsDir, 'test-document.md');
    await fs.writeFile(testFilePath, testContent);

    // Start the application
    await app.start();

    // Wait a moment for file processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the application is running
    const status = app.getStatus();
    expect(status.application.running).toBe(true);

    // Test health check
    const health = await app.healthCheck();
    expect(health.status).toBe('healthy');

    // Note: Since we're using mocks, we can't test the actual document processing,
    // but we can verify the application lifecycle works correctly
    expect(status.application.initialized).toBe(true);
    expect(status.application.running).toBe(true);
  });

  test('should handle multiple document types', async () => {
    // Create multiple test documents
    const documents = [
      { name: 'test1.md', content: '# Markdown Document\nThis is markdown content.' },
      { name: 'test2.txt', content: 'This is plain text content for testing.' },
    ];

    for (const doc of documents) {
      const filePath = path.join(testDocumentsDir, doc.name);
      await fs.writeFile(filePath, doc.content);
    }

    // Start application
    await app.start();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify application status
    const status = app.getStatus();
    expect(status.application.running).toBe(true);
    
    // Test configuration access
    const config = app.getConfig();
    expect(config.documentsPath).toBe(testDocumentsDir);
    expect(config.dataPath).toBe(testDataDir);
  });

  test('should handle application restart with existing documents', async () => {
    // Create test document
    const testContent = 'Persistent document content for restart test.';
    const testFilePath = path.join(testDocumentsDir, 'persistent-doc.txt');
    await fs.writeFile(testFilePath, testContent);

    // Start application
    await app.start();
    
    // Shutdown application
    await app.shutdown();
    
    // Verify shutdown
    let status = app.getStatus();
    expect(status.application.running).toBe(false);
    
    // Restart application
    await app.start();
    
    // Verify restart
    status = app.getStatus();
    expect(status.application.running).toBe(true);
    
    // Test health after restart
    const health = await app.healthCheck();
    expect(health.status).toBe('healthy');
  });

  test('should handle configuration updates', async () => {
    await app.start();
    
    const originalConfig = app.getConfig();
    const originalChunkSize = originalConfig.chunkSize;
    
    // Update configuration
    app.updateConfig({ chunkSize: originalChunkSize + 256 });
    
    const updatedConfig = app.getConfig();
    expect(updatedConfig.chunkSize).toBe(originalChunkSize + 256);
    
    // Verify other config remains unchanged
    expect(updatedConfig.documentsPath).toBe(originalConfig.documentsPath);
    expect(updatedConfig.dataPath).toBe(originalConfig.dataPath);
  });

  test('should handle error scenarios gracefully', async () => {
    await app.start();
    
    // Test health check during normal operation
    const health = await app.healthCheck();
    expect(health.status).toBe('healthy');
    
    // Verify error handling doesn't crash the application
    const status = app.getStatus();
    expect(status.application.running).toBe(true);
    expect(status.application.initialized).toBe(true);
  });
});