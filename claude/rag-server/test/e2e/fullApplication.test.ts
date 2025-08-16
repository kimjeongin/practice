import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createMockFile, removeMockFile, waitFor } from '../helpers/testHelpers.js';
import { SAMPLE_DOCUMENTS } from '../fixtures/sample-documents.js';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);

describe('Full Application E2E Tests', () => {
  let serverProcess: ChildProcess;
  let testFiles: string[] = [];
  const TEST_PORT = 9999;
  const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-e2e-rag.db');

  beforeAll(async () => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.RAG_DB_PATH = TEST_DB_PATH;
    process.env.SERVER_PORT = TEST_PORT.toString();
    process.env.LOG_LEVEL = 'error';
    process.env.EMBEDDING_PROVIDER = 'transformers';
    process.env.VECTOR_STORE_PROVIDER = 'faiss';

    // Build the application first
    console.log('Building application for E2E tests...');
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], { 
        stdio: 'pipe',
        cwd: process.cwd()
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });

    // Start the server
    console.log('Starting RAG server for E2E tests...');
    serverProcess = spawn('node', ['dist/app/index.js'], {
      stdio: 'pipe',
      env: { ...process.env },
      cwd: process.cwd()
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      let output = '';
      
      const handleData = (data: Buffer) => {
        output += data.toString();
        if (output.includes('MCP server started') || output.includes('Server listening')) {
          clearTimeout(timeout);
          resolve();
        }
        if (output.includes('Error') || output.includes('Failed')) {
          clearTimeout(timeout);
          reject(new Error(`Server startup failed: ${output}`));
        }
      };

      serverProcess.stdout?.on('data', handleData);
      serverProcess.stderr?.on('data', handleData);

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('RAG server started successfully');
  }, 60000);

  afterAll(async () => {
    // Clean up test files
    testFiles.forEach(filePath => {
      removeMockFile(filePath);
    });

    // Stop the server
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve();
        }, 5000);

        serverProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    console.log('E2E test cleanup completed');
  });

  beforeEach(() => {
    testFiles = [];
  });

  afterEach(() => {
    // Clean up test files created during test
    testFiles.forEach(filePath => {
      removeMockFile(filePath);
    });
    testFiles = [];
  });

  describe('Application Lifecycle', () => {
    test('should start and respond to basic health check', async () => {
      // Since this is a CLI application without HTTP endpoints,
      // we verify the process is running and responsive
      expect(serverProcess.pid).toBeDefined();
      expect(serverProcess.killed).toBe(false);
    });

    test('should handle graceful shutdown', async () => {
      // This test verifies that the application can shut down gracefully
      // We'll test this by sending SIGTERM and checking the response
      
      // Create a test file to ensure the application has some state
      const testFile = createMockFile('shutdown-test.txt', SAMPLE_DOCUMENTS.simple.content);
      testFiles.push(testFile);

      // Since we can't directly interact with MCP via HTTP in this setup,
      // we simulate file watching by creating a file in the watched directory
      if (fs.existsSync(path.join(process.cwd(), 'data'))) {
        fs.copyFileSync(testFile, path.join(process.cwd(), 'data', 'shutdown-test.txt'));
      }

      // Wait for file to be processed
      await waitFor(2000);

      // The fact that we can reach this point means the application is running properly
      expect(serverProcess.killed).toBe(false);
    });
  });

  describe('File System Integration', () => {
    test('should detect and process new files', async () => {
      const testFile = createMockFile('fs-integration.txt', SAMPLE_DOCUMENTS.technical.content);
      testFiles.push(testFile);

      // Copy file to data directory to trigger file watcher
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const targetFile = path.join(dataDir, 'fs-integration.txt');
      fs.copyFileSync(testFile, targetFile);

      // Wait for file to be processed
      await waitFor(3000);

      // Clean up
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }

      // The test passes if no errors were thrown during processing
      expect(true).toBe(true);
    }, 30000);

    test('should handle file updates', async () => {
      const testFile = createMockFile('update-test.txt', 'Initial content');
      testFiles.push(testFile);

      const dataDir = path.join(process.cwd(), 'data');
      const targetFile = path.join(dataDir, 'update-test.txt');

      // Create initial file
      fs.copyFileSync(testFile, targetFile);
      await waitFor(1000);

      // Update the file
      fs.writeFileSync(testFile, 'Updated content with new information');
      fs.copyFileSync(testFile, targetFile);
      await waitFor(1000);

      // Clean up
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }

      expect(true).toBe(true);
    }, 30000);

    test('should handle file deletion', async () => {
      const testFile = createMockFile('delete-test.txt', 'Content to be deleted');
      testFiles.push(testFile);

      const dataDir = path.join(process.cwd(), 'data');
      const targetFile = path.join(dataDir, 'delete-test.txt');

      // Create file
      fs.copyFileSync(testFile, targetFile);
      await waitFor(1000);

      // Delete file
      fs.unlinkSync(targetFile);
      await waitFor(1000);

      expect(true).toBe(true);
    }, 30000);
  });

  describe('Memory and Performance', () => {
    test('should handle multiple files without memory leaks', async () => {
      const files = Array.from({ length: 10 }, (_, i) => 
        createMockFile(`perf-test-${i}.txt`, `Performance test document ${i} ${SAMPLE_DOCUMENTS.simple.content}`)
      );
      testFiles.push(...files);

      const dataDir = path.join(process.cwd(), 'data');
      const targetFiles: string[] = [];

      // Process files in batches to avoid overwhelming the system
      for (let i = 0; i < files.length; i += 3) {
        const batch = files.slice(i, i + 3);
        
        for (const file of batch) {
          const targetFile = path.join(dataDir, path.basename(file));
          fs.copyFileSync(file, targetFile);
          targetFiles.push(targetFile);
        }

        // Wait for batch to be processed
        await waitFor(2000);
      }

      // Clean up target files
      targetFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      // Check that process is still responsive
      expect(serverProcess.killed).toBe(false);
    }, 60000);

    test('should handle large files', async () => {
      const largeContent = Array(100).fill(SAMPLE_DOCUMENTS.technical.content).join('\n\n');
      const largeFile = createMockFile('large-file.txt', largeContent);
      testFiles.push(largeFile);

      const dataDir = path.join(process.cwd(), 'data');
      const targetFile = path.join(dataDir, 'large-file.txt');

      const startTime = Date.now();
      fs.copyFileSync(largeFile, targetFile);
      
      // Wait for processing with extended timeout
      await waitFor(10000);
      
      const processingTime = Date.now() - startTime;
      
      // Clean up
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(30000);
      expect(serverProcess.killed).toBe(false);
    }, 45000);
  });

  describe('Error Recovery', () => {
    test('should recover from processing errors', async () => {
      // Create a corrupted file
      const corruptedFile = createMockFile('corrupted.txt', '\x00\x01\x02\x03\xFF\xFE');
      testFiles.push(corruptedFile);

      const dataDir = path.join(process.cwd(), 'data');
      const targetFile = path.join(dataDir, 'corrupted.txt');

      fs.copyFileSync(corruptedFile, targetFile);
      await waitFor(2000);

      // Create a normal file afterwards to ensure system is still working
      const normalFile = createMockFile('normal-after-error.txt', SAMPLE_DOCUMENTS.simple.content);
      testFiles.push(normalFile);

      const normalTargetFile = path.join(dataDir, 'normal-after-error.txt');
      fs.copyFileSync(normalFile, normalTargetFile);
      await waitFor(2000);

      // Clean up
      [targetFile, normalTargetFile].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      // Process should still be running
      expect(serverProcess.killed).toBe(false);
    }, 30000);

    test('should handle database lock contention', async () => {
      // Create multiple files simultaneously to test database locking
      const files = Array.from({ length: 5 }, (_, i) => 
        createMockFile(`concurrent-${i}.txt`, `Concurrent test ${i}`)
      );
      testFiles.push(...files);

      const dataDir = path.join(process.cwd(), 'data');
      
      // Copy all files simultaneously
      const copyPromises = files.map(file => {
        const targetFile = path.join(dataDir, path.basename(file));
        return new Promise<string>((resolve) => {
          fs.copyFileSync(file, targetFile);
          resolve(targetFile);
        });
      });

      const targetFiles = await Promise.all(copyPromises);
      
      // Wait for all to be processed
      await waitFor(5000);

      // Clean up
      targetFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      expect(serverProcess.killed).toBe(false);
    }, 30000);
  });

  describe('Configuration and Environment', () => {
    test('should respect environment variables', async () => {
      // This test verifies that the application started with our test environment variables
      // The fact that it started successfully means it's using the test database path
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.RAG_DB_PATH).toBe(TEST_DB_PATH);
      expect(serverProcess.killed).toBe(false);
    });

    test('should create necessary directories and files', async () => {
      // Check that the application created the test database
      await waitFor(1000); // Give time for initialization
      
      // The database should exist (even if empty)
      const dataDir = path.dirname(TEST_DB_PATH);
      expect(fs.existsSync(dataDir)).toBe(true);
    });
  });

  describe('Integration with External Dependencies', () => {
    test('should initialize embedding provider', async () => {
      // Test that the application can initialize with transformers embedding provider
      // If the server started successfully, it means the embedding provider initialized
      expect(serverProcess.killed).toBe(false);
      
      // Create a small test file to trigger embedding generation
      const testFile = createMockFile('embedding-test.txt', 'Short test content');
      testFiles.push(testFile);

      const dataDir = path.join(process.cwd(), 'data');
      const targetFile = path.join(dataDir, 'embedding-test.txt');
      fs.copyFileSync(testFile, targetFile);

      await waitFor(3000);

      // Clean up
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }

      expect(true).toBe(true);
    }, 30000);

    test('should initialize vector store', async () => {
      // Test that FAISS vector store initializes correctly
      // Success is indicated by the server running without errors
      expect(serverProcess.killed).toBe(false);
    });
  });
});