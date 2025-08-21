import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import { TEST_DOCUMENTS_DIR, TEST_DATA_DIR } from '../setup.js';
import { FileMetadata } from '../../src/rag/models/models.js';

/**
 * Helper function to wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a test file in the test documents directory
 */
export function createTestFile(fileName: string, content: string): string {
  const filePath = path.join(TEST_DOCUMENTS_DIR, fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/**
 * Remove a test file
 */
export function removeTestFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to remove test file ${filePath}:`, error);
  }
}

/**
 * Create multiple test files
 */
export function createTestFiles(files: Array<{ name: string; content: string }>): string[] {
  return files.map(file => createTestFile(file.name, file.content));
}

/**
 * Remove multiple test files
 */
export function removeTestFiles(filePaths: string[]): void {
  filePaths.forEach(removeTestFile);
}

/**
 * Get file stats compatible with current FileMetadata interface
 */
export function getFileMetadata(filePath: string): Omit<FileMetadata, 'id'> {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const fileType = path.extname(filePath).toLowerCase().slice(1) || 'txt';
  
  return {
    path: filePath,
    name: fileName,
    size: stats.size,
    modifiedAt: stats.mtime,
    createdAt: stats.birthtime,
    fileType,
    hash: `test-hash-${Date.now()}-${Math.random()}`
  };
}

/**
 * Clean up all test files in documents directory
 */
export function cleanupTestDocuments(): void {
  try {
    if (fs.existsSync(TEST_DOCUMENTS_DIR)) {
      const files = fs.readdirSync(TEST_DOCUMENTS_DIR);
      files.forEach(file => {
        const filePath = path.join(TEST_DOCUMENTS_DIR, file);
        removeTestFile(filePath);
      });
    }
  } catch (error) {
    console.warn('Failed to cleanup test documents:', error);
  }
}

/**
 * Check if vector store files exist
 */
export function vectorStoreFilesExist(): boolean {
  const indexPath = path.join(TEST_DATA_DIR, 'faiss_index.index');
  const mappingPath = path.join(TEST_DATA_DIR, 'faiss_mapping.json');
  return fs.existsSync(indexPath) && fs.existsSync(mappingPath);
}

/**
 * Clean up vector store files
 */
export function cleanupVectorStore(): void {
  const indexPath = path.join(TEST_DATA_DIR, 'faiss_index.index');
  const mappingPath = path.join(TEST_DATA_DIR, 'faiss_mapping.json');
  
  [indexPath, mappingPath].forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to remove vector store file ${filePath}:`, error);
    }
  });
}

/**
 * Create mock configuration for testing
 */
export function createMockConfig() {
  return {
    documentsDir: TEST_DOCUMENTS_DIR,
    dataDir: TEST_DATA_DIR,
    chunkSize: 512,
    chunkOverlap: 25,
    similarityTopK: 3,
    embeddingModel: 'all-MiniLM-L6-v2',
    embeddingDevice: 'cpu',
    logLevel: 'error',
    embeddingService: 'transformers',
    embeddingBatchSize: 5,
    embeddingDimensions: 384,
    similarityThreshold: 0.1,
    transformersCacheDir: path.join(TEST_DATA_DIR, '.cache/transformers'),
    nodeEnv: 'test'
  };
}

/**
 * Create test configuration
 */
export function createTestConfig() {
  return {
    documentsDir: TEST_DOCUMENTS_DIR,
    dataDir: TEST_DATA_DIR,
    chunkSize: 512,
    chunkOverlap: 25,
    similarityTopK: 3,
    embeddingModel: 'all-MiniLM-L6-v2',
    embeddingDevice: 'cpu',
    logLevel: 'error',
    embeddingService: 'transformers',
    embeddingBatchSize: 5,
    embeddingDimensions: 384,
    similarityThreshold: 0.1,
    transformersCacheDir: path.join(TEST_DATA_DIR, '.cache/transformers'),
    nodeEnv: 'test'
  };
}

/**
 * Wait for file to be processed (useful for async file operations)
 */
export async function waitForFileProcessing(
  checkFn: () => Promise<boolean>, 
  maxWaitTime: number = 10000,
  checkInterval: number = 100
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      if (await checkFn()) {
        return true;
      }
    } catch (error) {
      // Continue checking
    }
    await waitFor(checkInterval);
  }
  
  return false;
}

/**
 * Expect an async function to throw an error
 */
export async function expectAsyncThrow(
  fn: () => Promise<any>, 
  expectedMessage?: string
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected function to throw') {
      throw error; // Re-throw the 'function should throw' error
    }
    if (error instanceof Error) {
      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(`Expected error message to contain "${expectedMessage}", but got "${error.message}"`);
      }
      return error;
    }
    throw new Error('Expected error to be an instance of Error');
  }
}

/**
 * Create a mock file for testing
 */
export function createMockFile(fileName: string, content: string): string {
  return createTestFile(fileName, content);
}

/**
 * Remove a mock file for testing
 */
export function removeMockFile(filePath: string): void {
  removeTestFile(filePath);
}

/**
 * Create a mock logger for testing
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn()
  };
}

/**
 * Generate test content of various types
 */
export const TestContent = {
  simple: 'This is a simple test document with basic content.',
  
  technical: `
    This document covers advanced technical concepts in machine learning and artificial intelligence.
    
    ## Vector Embeddings
    Vector embeddings are dense representations of text in high-dimensional space.
    
    ## Retrieval Augmented Generation
    RAG combines information retrieval with text generation for improved AI responses.
    
    ## Implementation Details
    - Chunk size: 512 tokens
    - Overlap: 25 tokens
    - Similarity threshold: 0.1
  `,
  
  markdown: `# Test Document
  
This is a **markdown** test document.

## Features
- Lists
- *Italics*  
- **Bold text**

### Code Example
\`\`\`javascript
const test = "Hello World";
console.log(test);
\`\`\`

> This is a quote block.
  `,

  longDocument: Array(20).fill(`
    This is paragraph number with detailed information about various topics.
    It contains multiple sentences to test chunking and processing capabilities.
    The content is designed to span across multiple chunks when processed.
  `).map((para, i) => para.replace('number', `${i + 1}`)).join('\n\n'),

  codeDocument: `
    function calculateEmbedding(text) {
      // This is a code example
      const tokens = tokenize(text);
      const embedding = model.encode(tokens);
      return embedding;
    }
    
    class VectorStore {
      constructor(dimensions) {
        this.dimensions = dimensions;
        this.vectors = [];
      }
      
      add(vector, metadata) {
        this.vectors.push({ vector, metadata });
      }
      
      search(query, topK = 5) {
        const similarities = this.vectors.map(item => ({
          ...item,
          similarity: cosineSimilarity(query, item.vector)
        }));
        
        return similarities
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, topK);
      }
    }
  `
};