import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorMonitor } from '../src/shared/monitoring/error-monitor';

const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-rag.db');

beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  
  process.env.NODE_ENV = 'test';
  process.env.RAG_DB_PATH = TEST_DB_PATH;
  process.env.LOG_LEVEL = 'error';
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Clean up error monitor
  ErrorMonitor.resetForTesting();
  
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

export { TEST_DATA_DIR, TEST_DB_PATH };