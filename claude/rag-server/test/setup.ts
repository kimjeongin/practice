import { beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ErrorMonitor } from '../src/shared/monitoring/error-monitor.js';

// Test environment paths based on current config structure
const TEST_ROOT = path.join(process.cwd(), 'test');
const TEST_DATA_DIR = path.join(TEST_ROOT, '.data');
const TEST_DOCUMENTS_DIR = path.join(TEST_ROOT, 'documents');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'test-database.db');
const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

// Cache and storage paths for current architecture
const TEST_CACHE_DIR = path.join(TEST_DATA_DIR, '.cache');
const TEST_TRANSFORMERS_CACHE_DIR = path.join(TEST_CACHE_DIR, 'transformers');
const TEST_VECTOR_INDEX_PATH = path.join(TEST_DATA_DIR, 'faiss_index.index');
const TEST_VECTOR_MAPPING_PATH = path.join(TEST_DATA_DIR, 'faiss_mapping.json');

beforeAll(async () => {
  console.log('🧪 Setting up new test environment...');
  
  // Create all necessary directories
  const directories = [
    TEST_DATA_DIR,
    TEST_DOCUMENTS_DIR,
    TEST_CACHE_DIR,
    TEST_TRANSFORMERS_CACHE_DIR
  ];
  
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // Clean up any existing test files
  const filesToClean = [
    TEST_DB_PATH,
    TEST_VECTOR_INDEX_PATH,
    TEST_VECTOR_MAPPING_PATH
  ];
  
  for (const filePath of filesToClean) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  
  // Set test environment variables matching current config
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DATA_DIR = TEST_DATA_DIR;
  process.env.DOCUMENTS_DIR = TEST_DOCUMENTS_DIR;
  process.env.TRANSFORMERS_CACHE_DIR = TEST_TRANSFORMERS_CACHE_DIR;
  process.env.LOG_LEVEL = 'error';
  process.env.EMBEDDING_SERVICE = 'transformers';
  process.env.EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
  process.env.CHUNK_SIZE = '512';
  process.env.CHUNK_OVERLAP = '25';
  process.env.SIMILARITY_TOP_K = '3';
  process.env.SIMILARITY_THRESHOLD = '0.1';
  process.env.ENABLE_MONITORING = 'false'; // Disable monitoring in tests
  process.env.SYNC_SCHEDULER_ENABLED = 'false'; // Disable scheduler in tests
  
  // Run Prisma migration to create test database schema
  console.log('🗄️ Creating test database schema...');
  await new Promise<void>((resolve, reject) => {
    const migrateProcess = spawn('npx', ['prisma', 'db', 'push'], {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      cwd: process.cwd()
    });

    let output = '';
    migrateProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    migrateProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    migrateProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Test database schema created successfully');
        resolve();
      } else {
        console.error('❌ Database migration output:', output);
        reject(new Error(`Database migration failed with code ${code}`));
      }
    });

    migrateProcess.on('error', (error) => {
      reject(error);
    });
  });
}, 60000); // 60 second timeout for setup

afterAll(async () => {
  console.log('🧹 Cleaning up new test environment...');
  
  // Reset error monitor
  ErrorMonitor.resetForTesting();
  
  // Clean up test files and directories
  const itemsToClean = [
    TEST_DB_PATH,
    TEST_VECTOR_INDEX_PATH,
    TEST_VECTOR_MAPPING_PATH
  ];
  
  for (const item of itemsToClean) {
    try {
      if (fs.existsSync(item)) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) {
          fs.rmSync(item, { recursive: true, force: true });
        } else {
          fs.unlinkSync(item);
        }
      }
    } catch (error) {
      console.warn(`Failed to clean up ${item}:`, error);
    }
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

export { 
  TEST_ROOT,
  TEST_DATA_DIR, 
  TEST_DOCUMENTS_DIR,
  TEST_DB_PATH, 
  TEST_DATABASE_URL,
  TEST_CACHE_DIR,
  TEST_TRANSFORMERS_CACHE_DIR,
  TEST_VECTOR_INDEX_PATH,
  TEST_VECTOR_MAPPING_PATH
};