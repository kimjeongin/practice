/**
 * MCP Server End-to-End Tests
 * Tests the Model Context Protocol server functionality
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { DocumentHandler } from '@/domains/mcp/handlers/document.js';
import { SearchHandler } from '@/domains/mcp/handlers/search.js';
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

describe('MCP Server E2E', () => {
  let documentHandler: DocumentHandler;
  let searchHandler: SearchHandler;
  let mockFileRepository: any;
  let mockFileProcessingService: any;
  let mockRagWorkflow: any;

  beforeAll(() => {
    // Create mock file repository
    mockFileRepository = {
      getAllFiles: jest.fn().mockResolvedValue([
        {
          id: 'file1',
          name: 'document1.md',
          path: '/docs/document1.md',
          fileType: 'md',
          size: 1024,
          createdAt: new Date('2024-01-01'),
          modifiedAt: new Date('2024-01-02'),
          hash: 'hash1',
          metadata: { category: 'tutorial', author: 'test' }
        },
        {
          id: 'file2',
          name: 'document2.txt',
          path: '/docs/document2.txt',
          fileType: 'txt',
          size: 2048,
          createdAt: new Date('2024-01-03'),
          modifiedAt: new Date('2024-01-04'),
          hash: 'hash2',
          metadata: { category: 'reference', author: 'test' }
        }
      ]),
      getFileById: jest.fn().mockImplementation((id: string) => {
        const files = [
          {
            id: 'file1',
            name: 'document1.md',
            path: '/docs/document1.md',
            fileType: 'md',
            size: 1024,
            createdAt: new Date('2024-01-01'),
            modifiedAt: new Date('2024-01-02'),
            hash: 'hash1',
            metadata: { category: 'tutorial', author: 'test' }
          }
        ];
        return Promise.resolve(files.find(f => f.id === id) || null);
      }),
      getFileMetadata: jest.fn().mockResolvedValue({ category: 'tutorial', author: 'test' }),
      setFileMetadata: jest.fn().mockResolvedValue(true),
      updateFileMetadata: jest.fn().mockResolvedValue(true),
      searchFilesByMetadata: jest.fn().mockResolvedValue([])
    };

    // Create mock file processing service
    mockFileProcessingService = {
      processFile: jest.fn().mockResolvedValue(true),
      reindexAllFiles: jest.fn().mockResolvedValue(true),
      forceReindex: jest.fn().mockResolvedValue(true)
    };

    // Create mock RAG workflow
    mockRagWorkflow = {
      search: jest.fn().mockResolvedValue([
        {
          content: 'This is relevant search result content about machine learning.',
          score: 0.92,
          semanticScore: 0.92,
          keywordScore: 0.8,
          hybridScore: 0.88,
          metadata: {
            name: 'ml-guide.md',
            fileName: 'ml-guide.md',
            path: '/docs/ml-guide.md',
            filePath: '/docs/ml-guide.md',
            fileId: 'file1',
            chunkIndex: 0,
            embeddingId: 'embed1'
          },
          chunkIndex: 0
        },
        {
          content: 'Additional information about neural networks and deep learning.',
          score: 0.85,
          semanticScore: 0.85,
          keywordScore: 0.75,
          hybridScore: 0.82,
          metadata: {
            name: 'neural-nets.md',
            fileName: 'neural-nets.md', 
            path: '/docs/neural-nets.md',
            filePath: '/docs/neural-nets.md',
            fileId: 'file2',
            chunkIndex: 1,
            embeddingId: 'embed2'
          },
          chunkIndex: 1
        }
      ])
    };

    // Create handlers
    documentHandler = new DocumentHandler(mockFileRepository, mockFileProcessingService);
    searchHandler = new SearchHandler(mockRagWorkflow);
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Document Handler', () => {
    test('should list files successfully', async () => {
      const result = await documentHandler.handleListFiles({
        limit: 10,
        offset: 0
      });

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files.length).toBe(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(false);

      // Verify file structure
      const firstFile = result.files[0];
      expect(firstFile).toHaveProperty('id');
      expect(firstFile).toHaveProperty('name');
      expect(firstFile).toHaveProperty('path');
      expect(firstFile).toHaveProperty('fileType');
      expect(firstFile).toHaveProperty('size');
      expect(firstFile).toHaveProperty('createdAt');
      expect(firstFile).toHaveProperty('modifiedAt');
      expect(firstFile).toHaveProperty('customMetadata');

      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
    });

    test('should list files with type filter', async () => {
      const result = await documentHandler.handleListFiles({
        fileType: 'md',
        limit: 10,
        offset: 0
      });

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      
      // Should filter to only markdown files
      const mdFiles = result.files.filter(file => file.fileType === 'md');
      expect(mdFiles.length).toBeGreaterThan(0);

      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
    });

    test('should handle pagination correctly', async () => {
      const result = await documentHandler.handleListFiles({
        limit: 1,
        offset: 0
      });

      expect(result).toBeDefined();
      expect(result.files.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(true);
    });

    test('should get file metadata successfully', async () => {
      const result = await documentHandler.handleGetFileMetadata({
        fileId: 'file1'
      });

      expect(result).toBeDefined();
      expect(result.file).toBeDefined();
      expect(result.file.id).toBe('file1');
      expect(result.customMetadata).toBeDefined();
      expect(result.customMetadata.category).toBe('tutorial');

      expect(mockFileRepository.getFileById).toHaveBeenCalledWith('file1');
    });

    test('should handle non-existent file gracefully', async () => {
      // Mock repository to return null for non-existent file
      mockFileRepository.getFileById.mockResolvedValueOnce(null);

      try {
        await documentHandler.handleGetFileMetadata({
          fileId: 'nonexistent'
        });
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('File not found');
      }
    });

    test('should update file metadata successfully', async () => {
      // Mock updated metadata response
      mockFileRepository.getFileMetadata.mockResolvedValueOnce({
        category: 'advanced',
        tags: 'ai,ml',
        author: 'test'
      });

      const result = await documentHandler.handleUpdateFileMetadata({
        fileId: 'file1',
        metadata: {
          category: 'advanced',
          tags: 'ai,ml'
        }
      });

      expect(result).toBeDefined();
      expect(result.fileId).toBe('file1');
      expect(result.updatedMetadata).toBeDefined();
      expect(result.updatedMetadata.category).toBe('advanced');
      expect(result.updatedMetadata.tags).toBe('ai,ml');

      expect(mockFileRepository.setFileMetadata).toHaveBeenCalledWith('file1', 'category', 'advanced');
      expect(mockFileRepository.setFileMetadata).toHaveBeenCalledWith('file1', 'tags', 'ai,ml');
    });

    test('should force reindex successfully', async () => {
      const result = await documentHandler.handleForceReindex({
        clearCache: true
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('reindexing');

      expect(mockFileProcessingService.forceReindex).toHaveBeenCalled();
    });
  });

  describe('Search Handler', () => {
    test('should perform semantic search successfully', async () => {
      const result = await searchHandler.handleSearchDocuments({
        query: 'machine learning algorithms',
        topK: 5,
        useSemanticSearch: true,
        useHybridSearch: false
      });

      expect(result).toBeDefined();
      expect(result.query).toBe('machine learning algorithms');
      expect(result.searchType).toBe('semantic');
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(2);

      // Verify result structure
      const firstResult = result.results[0];
      expect(firstResult).toHaveProperty('content');
      expect(firstResult).toHaveProperty('score');
      expect(firstResult).toHaveProperty('semanticScore');
      expect(firstResult).toHaveProperty('metadata');
      expect(firstResult.metadata).toHaveProperty('fileName');
      expect(firstResult.metadata).toHaveProperty('filePath');
      expect(firstResult.metadata).toHaveProperty('chunkIndex');

      expect(mockRagWorkflow.search).toHaveBeenCalledWith(
        'machine learning algorithms',
        expect.objectContaining({
          topK: 5,
          useSemanticSearch: true,
          useHybridSearch: false
        })
      );
    });

    test('should perform hybrid search successfully', async () => {
      const result = await searchHandler.handleSearchDocuments({
        query: 'neural networks deep learning',
        topK: 3,
        useSemanticSearch: true,
        useHybridSearch: true,
        semanticWeight: 0.8
      });

      expect(result).toBeDefined();
      expect(result.query).toBe('neural networks deep learning');
      expect(result.searchType).toBe('hybrid');
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);

      // Verify hybrid search includes both semantic and keyword scores
      const firstResult = result.results[0];
      expect(firstResult).toHaveProperty('semanticScore');
      expect(firstResult).toHaveProperty('keywordScore'); 
      expect(firstResult).toHaveProperty('hybridScore');

      expect(mockRagWorkflow.search).toHaveBeenCalledWith(
        'neural networks deep learning',
        expect.objectContaining({
          topK: 3,
          useSemanticSearch: true,
          useHybridSearch: true,
          semanticWeight: 0.8
        })
      );
    });

    test('should perform keyword search successfully', async () => {
      const result = await searchHandler.handleSearchDocuments({
        query: 'artificial intelligence',
        topK: 5,
        useSemanticSearch: false,
        useHybridSearch: false
      });

      expect(result).toBeDefined();
      expect(result.query).toBe('artificial intelligence');
      expect(result.searchType).toBe('keyword');
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);

      expect(mockRagWorkflow.search).toHaveBeenCalledWith(
        'artificial intelligence',
        expect.objectContaining({
          topK: 5,
          useSemanticSearch: false,
          useHybridSearch: false
        })
      );
    });

    test('should handle search with file type filters', async () => {
      const result = await searchHandler.handleSearchDocuments({
        query: 'machine learning',
        topK: 5,
        fileTypes: ['md', 'txt'],
        useSemanticSearch: true
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      expect(mockRagWorkflow.search).toHaveBeenCalledWith(
        'machine learning',
        expect.objectContaining({
          fileTypes: ['md', 'txt']
        })
      );
    });

    test('should handle search with metadata filters', async () => {
      const result = await searchHandler.handleSearchDocuments({
        query: 'tutorials',
        topK: 5,
        metadataFilters: {
          category: 'tutorial',
          difficulty: 'beginner'
        },
        useSemanticSearch: true
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      expect(mockRagWorkflow.search).toHaveBeenCalledWith(
        'tutorials',
        expect.objectContaining({
          metadataFilters: {
            category: 'tutorial',
            difficulty: 'beginner'
          }
        })
      );
    });

    test('should handle empty search results', async () => {
      // Mock empty results
      mockRagWorkflow.search.mockResolvedValueOnce([]);

      const result = await searchHandler.handleSearchDocuments({
        query: 'nonexistent topic',
        topK: 5,
        useSemanticSearch: true
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(0);
    });

    test('should use default parameters correctly', async () => {
      const result = await searchHandler.handleSearchDocuments({
        query: 'test query'
      });

      expect(result).toBeDefined();
      expect(result.searchType).toBe('semantic'); // Default useSemanticSearch = true

      expect(mockRagWorkflow.search).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          topK: 5, // Default value
          useSemanticSearch: true, // Default value
          useHybridSearch: false, // Default value
          semanticWeight: 0.7 // Default value
        })
      );
    });
  });

  describe('MCP Server Integration', () => {
    test('should handle document listing and search workflow', async () => {
      // First list documents
      const listResult = await documentHandler.handleListFiles({
        limit: 10,
        offset: 0
      });

      expect(listResult.files.length).toBeGreaterThan(0);

      // Then search within those documents
      const searchResult = await searchHandler.handleSearchDocuments({
        query: 'machine learning',
        topK: 5,
        useSemanticSearch: true
      });

      expect(searchResult.results).toBeDefined();
      expect(searchResult.results.length).toBeGreaterThan(0);

      // Verify both operations completed successfully
      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
      expect(mockRagWorkflow.search).toHaveBeenCalled();
    });

    test('should handle metadata update and search workflow', async () => {
      // Update file metadata
      const updateResult = await documentHandler.handleUpdateFileMetadata({
        fileId: 'file1',
        metadata: {
          category: 'advanced',
          tags: 'ml,ai,algorithms'
        }
      });

      expect(updateResult.fileId).toBe('file1');

      // Search with updated metadata filters
      const searchResult = await searchHandler.handleSearchDocuments({
        query: 'algorithms',
        metadataFilters: {
          category: 'advanced'
        },
        useSemanticSearch: true
      });

      expect(searchResult.results).toBeDefined();

      // Verify both operations completed
      expect(mockFileRepository.setFileMetadata).toHaveBeenCalled();
      expect(mockRagWorkflow.search).toHaveBeenCalled();
    });
  });
});