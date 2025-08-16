// Mock the resilience utilities to avoid ESM module issues
jest.mock('../../src/shared/utils/resilience.js', () => ({
  withTimeout: jest.fn().mockImplementation((promise) => promise),
  withRetry: jest.fn().mockImplementation((fn) => fn()),
  CircuitBreakerManager: {
    getBreaker: jest.fn().mockImplementation((name, fn, options) => ({
      fire: jest.fn().mockImplementation(() => {
        // Circuit breaker should execute the function passed to getBreaker
        return fn();
      }),
      on: jest.fn(),
      stats: { failures: 0, successes: 0 }
    }))
  }
}));

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { SearchService } from '../../src/rag/services/searchService';
import { createMockConfig } from '../helpers/testHelpers';
import { SAMPLE_DOCUMENTS } from '../fixtures/sample-documents';

const mockVectorStoreService = {
  search: jest.fn(),
  addDocuments: jest.fn(),
  removeDocumentsByFileId: jest.fn(),
  similaritySearch: jest.fn()
};

const mockFileRepository = {
  getAllFiles: jest.fn(),
  getFileByPath: jest.fn(),
  getFileById: jest.fn(),
  getFileMetadata: jest.fn(),
  insertFile: jest.fn(),
  deleteFile: jest.fn(),
  updateFile: jest.fn()
};

const mockChunkRepository = {
  getDocumentChunks: jest.fn(),
  getChunksByFileId: jest.fn(),
  insertDocumentChunk: jest.fn(),
  deleteDocumentChunks: jest.fn(),
  deleteChunk: jest.fn()
};

describe('SearchService', () => {
  let service: SearchService;
  const mockConfig = {
    ...createMockConfig(),
    similarityTopK: 5,
    similarityThreshold: 0.7
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SearchService(
      mockVectorStoreService as any,
      mockFileRepository as any,
      mockChunkRepository as any,
      mockConfig as any
    );
  });

  describe('semantic search', () => {
    test('should perform semantic search successfully', async () => {
      const query = 'vector databases';
      const mockVectorResults = [
        {
          content: 'Vector databases are specialized storage systems',
          score: 0.9,
          id: 'chunk-1',
          metadata: {
            fileId: 'file-1',
            fileName: 'technical.txt',
            chunkIndex: 0
          }
        }
      ];

      mockVectorStoreService.search.mockResolvedValue(mockVectorResults);

      const results = await service.search(query, { useSemanticSearch: true });

      expect(mockVectorStoreService.search).toHaveBeenCalledWith(query, {
        topK: Math.max(mockConfig.similarityTopK, 20),
        fileTypes: undefined,
        metadataFilters: undefined,
        scoreThreshold: mockConfig.similarityThreshold
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe(mockVectorResults[0].content);
      expect(results[0].semanticScore).toBe(0.9);
    });

    test('should handle empty vector search results', async () => {
      const query = 'nonexistent content';
      mockVectorStoreService.search.mockResolvedValue([]);

      const results = await service.search(query, { useSemanticSearch: true });

      expect(results).toHaveLength(0);
    });

    test('should fallback to keyword search on vector search failure', async () => {
      const query = 'test query';
      mockVectorStoreService.search.mockRejectedValue(new Error('Vector search failed'));
      
      const mockFiles = [
        {
          id: 'file-1',
          name: 'test.txt',
          path: '/test/test.txt',
          fileType: 'text/plain',
          createdAt: new Date()
        }
      ];

      const mockChunks = [
        {
          content: 'This is a test query example',
          embeddingId: 'chunk-1',
          chunkIndex: 0
        }
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue(mockChunks);
      mockFileRepository.getFileMetadata.mockReturnValue({});

      const results = await service.search(query, { useSemanticSearch: true });

      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('test query');
      expect(results[0].keywordScore).toBeGreaterThan(0);
    });
  });

  describe('keyword search', () => {
    test('should perform keyword search successfully', async () => {
      const query = 'vector';
      const mockFiles = [
        {
          id: 'file-1',
          name: 'technical.txt',
          path: '/test/technical.txt',
          fileType: 'text/plain',
          createdAt: new Date()
        }
      ];

      const mockChunks = [
        {
          content: 'Vector databases are specialized storage systems for vector data',
          embeddingId: 'chunk-1',
          chunkIndex: 0
        }
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue(mockChunks);
      mockFileRepository.getFileMetadata.mockReturnValue({});

      const results = await service.search(query, { useSemanticSearch: false });

      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
      expect(mockChunkRepository.getDocumentChunks).toHaveBeenCalledWith('file-1');
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('vector');
      expect(results[0].keywordScore).toBeGreaterThan(0);
    });

    test('should filter by file types', async () => {
      const query = 'test';
      const mockFiles = [
        {
          id: 'file-1',
          name: 'test.txt',
          path: '/test/test.txt',
          fileType: 'text/plain',
          createdAt: new Date()
        },
        {
          id: 'file-2',
          name: 'test.pdf',
          path: '/test/test.pdf',
          fileType: 'application/pdf',
          createdAt: new Date()
        }
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue([]);

      await service.search(query, { 
        useSemanticSearch: false,
        fileTypes: ['text/plain']
      });

      expect(mockChunkRepository.getDocumentChunks).toHaveBeenCalledWith('file-1');
      expect(mockChunkRepository.getDocumentChunks).not.toHaveBeenCalledWith('file-2');
    });

    test('should handle case-insensitive search', async () => {
      const query = 'VECTOR';
      const mockFiles = [
        {
          id: 'file-1',
          name: 'test.txt',
          path: '/test/test.txt',
          fileType: 'text/plain',
          createdAt: new Date()
        }
      ];

      const mockChunks = [
        {
          content: 'vector databases are useful',
          embeddingId: 'chunk-1',
          chunkIndex: 0
        }
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue(mockChunks);
      mockFileRepository.getFileMetadata.mockReturnValue({});

      const results = await service.search(query, { useSemanticSearch: false });

      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('vector');
    });
  });

  describe('hybrid search', () => {
    test('should combine semantic and keyword results', async () => {
      const query = 'vector database';
      const mockVectorResults = [
        {
          content: 'Vector databases store high-dimensional data',
          score: 0.8,
          id: 'chunk-1',
          metadata: {
            fileId: 'file-1',
            fileName: 'technical.txt',
            chunkIndex: 0
          }
        }
      ];

      const mockFiles = [
        {
          id: 'file-1',
          name: 'technical.txt',
          path: '/test/technical.txt',
          fileType: 'text/plain',
          createdAt: new Date()
        }
      ];

      const mockChunks = [
        {
          content: 'Vector databases store high-dimensional data',
          embeddingId: 'chunk-1',
          chunkIndex: 0
        }
      ];

      mockVectorStoreService.search.mockResolvedValue(mockVectorResults);
      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue(mockChunks);
      mockFileRepository.getFileMetadata.mockReturnValue({});

      const results = await service.search(query, { 
        useSemanticSearch: true,
        useHybridSearch: true,
        semanticWeight: 0.7
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('semanticScore');
      expect(results[0]).toHaveProperty('keywordScore');
      expect(results[0]).toHaveProperty('hybridScore');
    });

    test('should handle different semantic weights', async () => {
      const query = 'test';
      const mockVectorResults = [
        {
          content: 'This is a test content',
          score: 0.9,
          id: 'chunk-1',
          metadata: {
            fileId: 'file-1',
            chunkIndex: 0
          }
        }
      ];

      mockVectorStoreService.search.mockResolvedValue(mockVectorResults);
      mockFileRepository.getAllFiles.mockReturnValue([]);

      const results1 = await service.search(query, { 
        useHybridSearch: true,
        semanticWeight: 0.9
      });

      const results2 = await service.search(query, { 
        useHybridSearch: true,
        semanticWeight: 0.1
      });

      // With higher semantic weight, the semantic score should contribute more
      expect(results1[0].score).toBeGreaterThan(results2[0].score);
    });
  });

  describe('error handling', () => {
    test('should handle vector store errors gracefully', async () => {
      const query = 'test query';
      mockVectorStoreService.search.mockRejectedValue(new Error('Connection failed'));
      mockFileRepository.getAllFiles.mockReturnValue([]);

      const results = await service.search(query);

      expect(results).toHaveLength(0);
      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
    });

    test('should throw error when both searches fail', async () => {
      const query = 'test query';
      mockVectorStoreService.search.mockRejectedValue(new Error('Vector search failed'));
      mockFileRepository.getAllFiles.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.search(query)).rejects.toThrow();
    });
  });
});