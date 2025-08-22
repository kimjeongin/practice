/**
 * Global test setup and configuration
 * Sets up test environment, mocks, and cleanup utilities
 */

import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '@/shared/logger/index.js';
import { cleanupAllTempFiles } from './helpers/test-utils.js';

// Test database setup
const TEST_DB_PATH = path.join(process.cwd(), 'prisma', 'test.db');
let prismaClient: PrismaClient;

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  
  // Initialize test database
  prismaClient = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  // Ensure test database is clean
  try {
    await fs.unlink(TEST_DB_PATH);
  } catch (error) {
    // Ignore if file doesn't exist
  }

  logger.info('Test environment initialized');
});

// Global test cleanup
afterAll(async () => {
  if (prismaClient) {
    await prismaClient.$disconnect();
  }

  // Clean up test database
  try {
    await fs.unlink(TEST_DB_PATH);
  } catch (error) {
    // Ignore if file doesn't exist
  }

  // Clean up temporary test files
  await cleanupAllTempFiles();

  logger.info('Test environment cleaned up');
});

// Per-test setup
beforeEach(async () => {
  // Reset database state between tests
  if (prismaClient) {
    try {
      // Clean up all tables in reverse dependency order
      await prismaClient.chunk.deleteMany();
      await prismaClient.file.deleteMany();
    } catch (error) {
      // Database might not be initialized yet, ignore
    }
  }
});

// Per-test cleanup
afterEach(async () => {
  // Additional cleanup if needed
  jest.clearAllMocks();
});

// Export test utilities
export { prismaClient };
export const TEST_TIMEOUT = 30000;

// Mock implementations for external dependencies
export const mockEmbeddingService = {
  embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
  embedDocuments: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5]]),
  getModelInfo: jest.fn().mockReturnValue({
    name: 'test-model',
    service: 'test',
    dimensions: 5
  })
};

export const mockVectorStore = {
  addDocuments: jest.fn().mockResolvedValue(undefined),
  search: jest.fn().mockResolvedValue([]),
  removeDocumentsByFileId: jest.fn().mockResolvedValue(undefined),
  removeAllDocuments: jest.fn().mockResolvedValue(undefined),
  getIndexInfo: jest.fn().mockReturnValue({ documentCount: 0 }),
  isHealthy: jest.fn().mockReturnValue(true),
  capabilities: { supportsMetadataFiltering: true }
};

export const mockConfig = {
  server: {
    name: 'test-server',
    version: '1.0.0',
    transport: 'stdio' as const,
    capabilities: {
      tools: {}
    }
  },
  embedding: {
    provider: 'transformers' as const,
    model: 'test-model',
    dimensions: 5
  },
  vectorStore: {
    provider: 'faiss' as const,
    indexPath: './test-index'
  },
  search: {
    enableHybridSearch: true,
    semanticWeight: 0.7,
    rerankingEnabled: false,
    enableQueryRewriting: false
  },
  sync: {
    enableAutoSync: false,
    watchInterval: 5000,
    batchSize: 10
  }
};

// Test data generators
export const createTestFile = (overrides?: Partial<any>) => ({
  id: 'test-file-1',
  name: 'test.txt',
  path: '/test/test.txt',
  fileType: 'txt',
  size: 1000,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createTestChunk = (overrides?: Partial<any>) => ({
  id: 'test-chunk-1',
  fileId: 'test-file-1',
  content: 'This is test content for the chunk',
  chunkIndex: 0,
  embeddingId: 'test-embedding-1',
  createdAt: new Date(),
  ...overrides
});

export const createTestSearchResult = (overrides?: Partial<any>) => ({
  content: 'Test search result content',
  score: 0.8,
  metadata: {
    fileId: 'test-file-1',
    fileName: 'test.txt',
    filePath: '/test/test.txt',
    chunkIndex: 0,
    fileType: 'txt',
    createdAt: new Date().toISOString()
  },
  chunkIndex: 0,
  ...overrides
});