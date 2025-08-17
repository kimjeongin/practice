import { jest, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

export const createMockFile = (filename: string, content: string): string => {
  const filePath = path.join(process.cwd(), 'test', 'fixtures', filename);
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  return filePath;
};

export const removeMockFile = (filePath: string): void => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const createMockConfig = () => ({
  server: {
    port: 0,
    host: '127.0.0.1'
  },
  database: {
    path: ':memory:'
  },
  embeddings: {
    provider: 'transformers',
    model: 'sentence-transformers/all-MiniLM-L6-v2'
  },
  vectorStore: {
    provider: 'faiss',
    dimension: 384
  },
  chunking: {
    chunkSize: 1000,
    chunkOverlap: 200
  },
  monitoring: {
    enabled: false
  }
});

export const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => createMockLogger())
});

export const createMockEmbeddingProvider = () => ({
  embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
});

export const createMockVectorStore = () => ({
  addDocument: jest.fn(),
  search: jest.fn().mockResolvedValue([]),
  addDocuments: jest.fn(),
  similaritySearch: jest.fn().mockResolvedValue([])
});

export const createMockDocument = (id: string, content: string) => ({
  id,
  filename: `test-${id}.txt`,
  content,
  metadata: {
    size: content.length,
    mimeType: 'text/plain',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
});

export const createMockChunk = (id: string, content: string, documentId: string) => ({
  id,
  documentId,
  content,
  startIndex: 0,
  endIndex: content.length,
  metadata: {
    chunkIndex: 0
  }
});

export const mockFetch = (response: any, status: number = 200) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(response),
    text: jest.fn().mockResolvedValue(JSON.stringify(response)),
    headers: new Headers()
  });
};

export const expectAsyncThrow = async (fn: () => Promise<any>, errorMessage?: string) => {
  let thrownError: any;
  try {
    await fn();
    thrownError = null;
  } catch (error: any) {
    thrownError = error;
  }
  
  if (!thrownError) {
    throw new Error('Expected function to throw');
  }
  
  if (errorMessage) {
    expect(thrownError.message).toContain(errorMessage);
  }
  
  return thrownError;
};