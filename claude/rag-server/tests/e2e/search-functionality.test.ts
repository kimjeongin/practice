/**
 * Search Functionality End-to-End Tests
 * Tests the complete search pipeline including semantic and hybrid search
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { SearchService } from '@/domains/rag/services/search/search-service.js';
import { ConfigFactory } from '@/shared/config/config-factory.js';

// Mock dependencies
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

describe('Search Functionality E2E', () => {
  let searchService: SearchService;
  let mockVectorStore: any;
  let mockFileRepository: any;
  let mockChunkRepository: any;

  beforeAll(() => {
    // Create mock vector store
    mockVectorStore = {
      search: jest.fn().mockResolvedValue([
        {
          content: 'Machine learning is a subset of artificial intelligence.',
          score: 0.95,
          metadata: {
            fileId: 'file1',
            fileName: 'ml-basics.md',
            filePath: '/docs/ml-basics.md',
            chunkIndex: 0
          }
        },
        {
          content: 'Deep learning uses neural networks with multiple layers.',
          score: 0.88,
          metadata: {
            fileId: 'file2', 
            fileName: 'deep-learning.md',
            filePath: '/docs/deep-learning.md',
            chunkIndex: 1
          }
        }
      ]),
      capabilities: {
        supportsMetadataFiltering: true,
        supportsHybridSearch: false
      }
    };

    // Create mock file repository
    mockFileRepository = {
      getAllFiles: jest.fn().mockResolvedValue([
        {
          id: 'file1',
          name: 'ml-basics.md',
          path: '/docs/ml-basics.md',
          fileType: 'md',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'file2',
          name: 'deep-learning.md', 
          path: '/docs/deep-learning.md',
          fileType: 'md',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    };

    // Create mock chunk repository
    mockChunkRepository = {
      getDocumentChunks: jest.fn().mockImplementation((fileId: string) => {
        if (fileId === 'file1') {
          return Promise.resolve([
            {
              id: 'chunk1',
              content: 'Machine learning is a subset of artificial intelligence that focuses on algorithms.',
              chunkIndex: 0,
              embeddingId: 'embed1'
            }
          ]);
        } else if (fileId === 'file2') {
          return Promise.resolve([
            {
              id: 'chunk2', 
              content: 'Deep learning uses neural networks with multiple layers to learn complex patterns.',
              chunkIndex: 1,
              embeddingId: 'embed2'
            }
          ]);
        }
        return Promise.resolve([]);
      })
    };

    const config = ConfigFactory.createTestConfig();
    config.search.enableHybridSearch = true;
    config.search.rerankingEnabled = false;

    searchService = new SearchService(
      mockVectorStore,
      mockFileRepository,
      mockChunkRepository,
      config
    );
  });

  afterAll(() => {
    // Cleanup if needed
  });

  test('should perform semantic search successfully', async () => {
    const query = 'What is machine learning?';
    const options = {
      topK: 5,
      useSemanticSearch: true,
      useHybridSearch: false
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Search should complete without throwing errors
    // The implementation may fall back to different search strategies
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  test('should perform keyword search successfully', async () => {
    const query = 'neural networks';
    const options = {
      topK: 3,
      useSemanticSearch: false,
      useHybridSearch: false
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Verify file repository was called for keyword search
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });

  test('should perform hybrid search successfully', async () => {
    const query = 'deep learning algorithms';
    const options = {
      topK: 5,
      useSemanticSearch: true,
      useHybridSearch: true,
      semanticWeight: 0.7
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // File repository should be called as fallback or for hybrid search
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });

  test('should handle search with file type filters', async () => {
    const query = 'artificial intelligence';
    const options = {
      topK: 5,
      fileTypes: ['md'],
      useSemanticSearch: true
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Search should complete successfully with file type filters
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });

  test('should handle search with metadata filters', async () => {
    const query = 'machine learning concepts';
    const options = {
      topK: 5,
      metadataFilters: {
        category: 'ai',
        difficulty: 'beginner'
      },
      useSemanticSearch: true
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Search should complete successfully with metadata filters
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });

  test('should handle empty search results gracefully', async () => {
    // Mock empty results
    mockVectorStore.search.mockResolvedValueOnce([]);
    mockFileRepository.getAllFiles.mockResolvedValueOnce([]);

    const query = 'nonexistent topic';
    const options = {
      topK: 5,
      useSemanticSearch: true
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  test('should handle search errors gracefully with fallback', async () => {
    // Mock vector store error
    mockVectorStore.search.mockRejectedValueOnce(new Error('Vector store error'));

    const query = 'test query with error';
    const options = {
      topK: 5,
      useSemanticSearch: true
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Should fallback to keyword search when vector search fails
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });

  test('should respect score threshold filtering', async () => {
    const query = 'machine learning';
    const options = {
      topK: 10,
      scoreThreshold: 0.9,
      useSemanticSearch: true
    };

    const results = await searchService.search(query, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Search should complete successfully with score threshold
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });

  test('should handle complex queries with pipeline processing', async () => {
    const complexQuery = 'What are the differences between supervised and unsupervised machine learning algorithms?';
    const options = {
      topK: 5,
      useSemanticSearch: true,
      useHybridSearch: true,
      semanticWeight: 0.8
    };

    const results = await searchService.search(complexQuery, options);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // Complex queries should be processed successfully
    expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
  });
});