/**
 * Test utilities and helper functions
 * Provides reusable testing utilities that focus on behavior verification
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { prismaClient } from '../setup.js';

/**
 * Creates a temporary test directory with sample files inside tests/temp
 */
export async function createTempTestDirectory(): Promise<string> {
  const tempDir = path.join(process.cwd(), 'tests', 'temp', 'temp-test-' + Date.now());
  await fs.mkdir(tempDir, { recursive: true });
  
  // Create sample files
  await fs.writeFile(
    path.join(tempDir, 'sample1.txt'), 
    'This is a sample document about machine learning algorithms and neural networks.'
  );
  await fs.writeFile(
    path.join(tempDir, 'sample2.md'), 
    '# Deep Learning\n\nDeep learning is a subset of machine learning that uses neural networks.'
  );
  await fs.writeFile(
    path.join(tempDir, 'sample3.txt'), 
    'Python programming language is widely used for data science and artificial intelligence.'
  );
  
  return tempDir;
}

/**
 * Cleans up temporary test directory
 */
export async function cleanupTempDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to cleanup temp directory:', error);
  }
}

/**
 * Waits for a condition to be true with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Creates test database records for testing
 */
export async function seedTestDatabase() {
  // Create test file records
  const testFile = await prismaClient.file.create({
    data: {
      id: 'test-file-1',
      name: 'test-document.txt',
      path: '/test/test-document.txt',
      fileType: 'txt',
      size: 500,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    }
  });

  // Create test chunks
  const testChunk = await prismaClient.chunk.create({
    data: {
      id: 'test-chunk-1',
      fileId: testFile.id,
      content: 'This is test content about machine learning and artificial intelligence.',
      chunkIndex: 0,
      embeddingId: 'embedding-1'
    }
  });

  return { testFile, testChunk };
}

/**
 * Mock MCP server for testing
 */
export function createMockMCPServer(): jest.Mocked<Server> {
  return {
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
    // Add other necessary properties/methods as mocks
  } as any;
}

/**
 * Validates search result structure
 */
export function validateSearchResult(result: any): boolean {
  return (
    typeof result.content === 'string' &&
    typeof result.score === 'number' &&
    result.score >= 0 && result.score <= 1 &&
    typeof result.metadata === 'object' &&
    typeof result.metadata.fileName === 'string' &&
    typeof result.metadata.filePath === 'string' &&
    typeof result.chunkIndex === 'number'
  );
}

/**
 * Validates MCP tool response structure
 */
export function validateMCPResponse(response: any): boolean {
  return (
    Array.isArray(response.content) &&
    response.content.length > 0 &&
    response.content[0].type === 'text' &&
    typeof response.content[0].text === 'string'
  );
}

/**
 * Creates a test configuration object
 */
export function createTestConfig(overrides: any = {}) {
  return {
    server: {
      name: 'test-rag-server',
      version: '1.0.0',
      transport: 'stdio' as const,
      capabilities: {
        tools: {}
      }
    },
    database: {
      url: process.env.DATABASE_URL || 'file:./test.db'
    },
    embedding: {
      provider: 'transformers' as const,
      model: 'test-model',
      dimensions: 384
    },
    vectorStore: {
      provider: 'lancedb' as const,
      indexPath: './test-lancedb'
    },
    search: {
      enableHybridSearch: true,
      semanticWeight: 0.7,
      rerankingEnabled: false,
      enableQueryRewriting: false
    },
    sync: {
      enableAutoSync: false,
      watchInterval: 1000,
      batchSize: 5
    },
    ...overrides
  };
}

/**
 * Asserts that search results are ordered by score (descending)
 */
export function assertResultsOrderedByScore(results: any[]): void {
  for (let i = 1; i < results.length; i++) {
    if (results[i - 1].score < results[i].score) {
      throw new Error(`Results not ordered by score: ${results[i - 1].score} < ${results[i].score}`);
    }
  }
}

/**
 * Creates a promise that resolves after specified delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Captures console output during test execution
 */
export function captureConsoleOutput(): { 
  logs: string[], 
  errors: string[], 
  restore: () => void 
} {
  const logs: string[] = [];
  const errors: string[] = [];
  
  const originalLog = console.log;
  const originalError = console.error;
  
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  
  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    }
  };
}

/**
 * Generates test vectors for embedding tests
 */
export function generateTestVectors(dimensions: number, count: number = 1): number[][] {
  const vectors: number[][] = [];
  
  for (let i = 0; i < count; i++) {
    const vector: number[] = [];
    for (let j = 0; j < dimensions; j++) {
      vector.push(Math.random() * 2 - 1); // Random values between -1 and 1
    }
    vectors.push(vector);
  }
  
  return vectors;
}

/**
 * Creates a temporary file path within tests/temp directory
 */
export function createTempFilePath(filename?: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const defaultFilename = `temp-test-${timestamp}-${randomSuffix}.txt`;
  return path.join(process.cwd(), 'tests', 'temp', filename || defaultFilename);
}

/**
 * Ensures tests/temp directory exists
 */
export async function ensureTempDirectory(): Promise<string> {
  const tempDir = path.join(process.cwd(), 'tests', 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Cleans up all temporary test files in tests/temp
 */
export async function cleanupAllTempFiles(): Promise<void> {
  try {
    const tempDir = path.join(process.cwd(), 'tests', 'temp');
    const files = await fs.readdir(tempDir);
    
    for (const file of files) {
      if (file !== '.gitkeep' && file.startsWith('temp-test-')) {
        const filePath = path.join(tempDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.isDirectory()) {
            await fs.rmdir(filePath, { recursive: true });
          } else {
            await fs.unlink(filePath);
          }
        } catch (error) {
          // Ignore individual file cleanup errors
        }
      }
    }
  } catch (error) {
    // Ignore if temp directory doesn't exist
  }
}

/**
 * Mock file system operations for testing
 */
export const mockFileSystem = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  readdir: jest.fn()
};