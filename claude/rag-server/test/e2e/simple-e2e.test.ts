import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseConnection } from '../../src/infrastructure/database/database-connection.js';
import { loadConfig } from '../../src/infrastructure/config/config.js';
import { createTestFile, removeTestFile } from '../helpers/test-helpers.js';
import fs from 'fs';
import path from 'path';

describe('E2E Simple Integration Tests', () => {
  let db: DatabaseConnection;
  let testFiles: string[] = [];

  beforeAll(async () => {
    // Configuration is already set up by setup.ts
    db = new DatabaseConnection();
  }, 30000);

  afterAll(async () => {
    // Clean up test files
    testFiles.forEach(filePath => removeTestFile(filePath));
    
    if (db) {
      await db.close();
    }
  });

  test('should verify test environment is properly configured', async () => {
    const config = loadConfig();
    
    // Test configuration values
    expect(config.nodeEnv).toBe('test');
    expect(config.logLevel).toBe('error');
    expect(config.chunkSize).toBe(512); // From test env
    expect(config.chunkOverlap).toBe(25); // From test env
    expect(config.similarityTopK).toBe(3); // From test env
  }, 10000);

  test('should connect to test database', async () => {
    const isHealthy = await db.isHealthy();
    expect(isHealthy).toBe(true);
  }, 10000);

  test('should create and manage test files', async () => {
    const testContent = `# Test Document
    
    This is a simple test document to verify file operations
    are working correctly in the e2e environment.`;

    const testFilePath = createTestFile('e2e-simple-test.md', testContent);
    testFiles.push(testFilePath);

    // Verify file was created
    expect(fs.existsSync(testFilePath)).toBe(true);
    
    // Verify file content
    const content = fs.readFileSync(testFilePath, 'utf8');
    expect(content).toContain('Test Document');
    expect(content).toContain('simple test document');
  }, 10000);

  test('should handle basic database operations', async () => {
    const testContent = 'Test content for database operations';
    const testFilePath = createTestFile('db-test.txt', testContent);
    testFiles.push(testFilePath);

    // Get file metadata
    const stats = fs.statSync(testFilePath);
    const fileMetadata = {
      path: testFilePath,
      name: path.basename(testFilePath),
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      fileType: 'txt',
      hash: `test-hash-${Date.now()}`
    };

    // Insert file into database
    const fileId = await db.insertFile(fileMetadata);
    expect(fileId).toBeDefined();
    expect(typeof fileId).toBe('string');

    // Retrieve file from database
    const retrievedFile = await db.getFileById(fileId);
    expect(retrievedFile).toBeDefined();
    expect(retrievedFile?.path).toBe(testFilePath);
    expect(retrievedFile?.name).toBe('db-test.txt');
  }, 20000);

  test('should handle concurrent operations', async () => {
    const concurrentOps = Array.from({ length: 3 }, (_, i) => 
      new Promise<string>(resolve => {
        setTimeout(() => {
          const testFilePath = createTestFile(`concurrent-${i}.txt`, `Content ${i}`);
          testFiles.push(testFilePath);
          resolve(testFilePath);
        }, Math.random() * 100);
      })
    );

    const filePaths = await Promise.all(concurrentOps);
    expect(filePaths).toHaveLength(3);
    
    // Verify all files exist
    filePaths.forEach(filePath => {
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }, 15000);

  test('should handle error scenarios gracefully', async () => {
    // Test with invalid file path
    const nonExistentFile = await db.getFileByPath('/path/does/not/exist.txt');
    expect(nonExistentFile).toBeNull();

    // Test database health during operations
    const isStillHealthy = await db.isHealthy();
    expect(isStillHealthy).toBe(true);
  }, 10000);
});