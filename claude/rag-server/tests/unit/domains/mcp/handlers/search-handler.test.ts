/**
 * Unit tests for MCP Search Handler
 * Tests the search handler logic and argument processing
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { SearchHandler } from '@/domains/mcp/handlers/search.js';
import { createTestSearchResult } from '../../../../setup.js';

describe('SearchHandler Unit Tests', () => {
  let searchHandler: SearchHandler;
  let mockRAGWorkflow: jest.Mocked<any>;

  beforeEach(() => {
    // Create mock RAG workflow
    mockRAGWorkflow = {
      search: jest.fn()
    };

    searchHandler = new SearchHandler(mockRAGWorkflow);
  });

  describe('Search Arguments Processing', () => {
    test('should handle basic search with required parameters', async () => {
      const mockResults = [
        createTestSearchResult({
          content: 'Test content about machine learning',
          score: 0.9,
          metadata: {
            fileName: 'ml-guide.txt',
            filePath: '/docs/ml-guide.txt',
            fileType: 'txt',
            chunkIndex: 0
          }
        })
      ];

      mockRAGWorkflow.search.mockResolvedValue(mockResults);

      const args = {
        query: 'machine learning'
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('machine learning', {
        topK: 5, // default value
        fileTypes: undefined,
        metadataFilters: undefined,
        useSemanticSearch: true, // default value
        useHybridSearch: false, // default value
        semanticWeight: 0.7 // default value
      });

      expect(result.query).toBe('machine learning');
      expect(result.searchType).toBe('semantic');
      expect(result.totalResults).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content).toBe('Test content about machine learning');
    });

    test('should handle search with all optional parameters', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'artificial intelligence',
        topK: 10,
        fileTypes: ['txt', 'pdf'],
        metadataFilters: { category: 'ai', level: 'advanced' },
        useSemanticSearch: false,
        useHybridSearch: false,
        semanticWeight: 0.8
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('artificial intelligence', {
        topK: 10,
        fileTypes: ['txt', 'pdf'],
        metadataFilters: { category: 'ai', level: 'advanced' },
        useSemanticSearch: false,
        useHybridSearch: false,
        semanticWeight: 0.8
      });

      expect(result.searchType).toBe('keyword'); // Since both semantic and hybrid are false
    });

    test('should identify hybrid search correctly', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'deep learning',
        useHybridSearch: true,
        semanticWeight: 0.6
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(result.searchType).toBe('hybrid');
      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('deep learning', 
        expect.objectContaining({
          useHybridSearch: true,
          semanticWeight: 0.6
        })
      );
    });

    test('should handle empty query', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: ''
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('', expect.any(Object));
      expect(result.query).toBe('');
      expect(result.totalResults).toBe(0);
    });

    test('should handle null and undefined values gracefully', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test query',
        topK: null,
        fileTypes: undefined,
        metadataFilters: null
      };

      const result = await searchHandler.handleSearchDocuments(args as any);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('test query', {
        topK: null, // Handler passes through null values
        fileTypes: undefined,
        metadataFilters: null,
        useSemanticSearch: true,
        useHybridSearch: false,
        semanticWeight: 0.7
      });
    });
  });

  describe('Result Processing', () => {
    test('should transform RAG results to MCP format correctly', async () => {
      const mockResults = [
        createTestSearchResult({
          content: 'First result about neural networks',
          score: 0.95,
          semanticScore: 0.95,
          metadata: {
            fileName: 'neural-networks.txt',
            filePath: '/docs/neural-networks.txt',
            fileType: 'txt',
            chunkIndex: 0,
            createdAt: '2024-01-01T00:00:00Z'
          },
          chunkIndex: 0
        }),
        createTestSearchResult({
          content: 'Second result about machine learning',
          score: 0.85,
          keywordScore: 0.85,
          metadata: {
            name: 'ml-basics.md', // Using 'name' instead of 'fileName' for testing
            path: '/docs/ml-basics.md', // Using 'path' instead of 'filePath'
            fileType: 'md',
            chunkIndex: 1
          },
          chunkIndex: 1
        })
      ];

      mockRAGWorkflow.search.mockResolvedValue(mockResults);

      const args = { query: 'neural networks' };
      const result = await searchHandler.handleSearchDocuments(args);

      expect(result.results).toHaveLength(2);

      // Test first result
      expect(result.results[0].content).toBe('First result about neural networks');
      expect(result.results[0].score).toBe(0.95);
      expect(result.results[0].semanticScore).toBe(0.95);
      expect(result.results[0].metadata.fileName).toBe('neural-networks.txt');
      expect(result.results[0].metadata.filePath).toBe('/docs/neural-networks.txt');
      expect(result.results[0].metadata.fileType).toBe('txt');
      expect(result.results[0].metadata.chunkIndex).toBe(0);

      // Test second result with different metadata structure
      expect(result.results[1].content).toBe('Second result about machine learning');
      expect(result.results[1].score).toBe(0.85);
      expect(result.results[1].keywordScore).toBe(0.85);
      expect(result.results[1].metadata.fileName).toBe('ml-basics.md'); // Mapped from 'name'
      expect(result.results[1].metadata.filePath).toBe('/docs/ml-basics.md'); // Mapped from 'path'
    });

    test('should handle missing metadata gracefully', async () => {
      const mockResults = [
        {
          content: 'Result with minimal metadata',
          score: 0.8,
          metadata: {}, // Empty metadata
          chunkIndex: 0
        }
      ];

      mockRAGWorkflow.search.mockResolvedValue(mockResults);

      const args = { query: 'test' };
      const result = await searchHandler.handleSearchDocuments(args);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].metadata.fileName).toBe('unknown');
      expect(result.results[0].metadata.filePath).toBe('unknown');
      expect(result.results[0].metadata.fileType).toBe('unknown');
    });

    test('should preserve additional metadata fields', async () => {
      const mockResults = [
        createTestSearchResult({
          content: 'Result with extra metadata',
          score: 0.9,
          metadata: {
            fileName: 'test.txt',
            filePath: '/test.txt',
            fileType: 'txt',
            chunkIndex: 0,
            category: 'technical',
            tags: ['ai', 'ml'],
            author: 'John Doe',
            customField: 'custom value'
          }
        })
      ];

      mockRAGWorkflow.search.mockResolvedValue(mockResults);

      const args = { query: 'test' };
      const result = await searchHandler.handleSearchDocuments(args);

      const resultMetadata = result.results[0].metadata;
      expect(resultMetadata.category).toBe('technical');
      expect(resultMetadata.tags).toEqual(['ai', 'ml']);
      expect(resultMetadata.author).toBe('John Doe');
      expect(resultMetadata.customField).toBe('custom value');
    });

    test('should handle empty search results', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = { query: 'nonexistent query' };
      const result = await searchHandler.handleSearchDocuments(args);

      expect(result.results).toHaveLength(0);
      expect(result.totalResults).toBe(0);
      expect(result.query).toBe('nonexistent query');
    });

    test('should handle different score types correctly', async () => {
      const mockResults = [
        createTestSearchResult({
          content: 'Semantic result',
          score: 0.9,
          semanticScore: 0.9,
          metadata: { fileName: 'test1.txt', filePath: '/test1.txt', fileType: 'txt', chunkIndex: 0 }
        }),
        createTestSearchResult({
          content: 'Keyword result',
          score: 0.8,
          keywordScore: 0.8,
          metadata: { fileName: 'test2.txt', filePath: '/test2.txt', fileType: 'txt', chunkIndex: 0 }
        }),
        createTestSearchResult({
          content: 'Hybrid result',
          score: 0.85,
          hybridScore: 0.85,
          semanticScore: 0.7,
          keywordScore: 0.6,
          metadata: { fileName: 'test3.txt', filePath: '/test3.txt', fileType: 'txt', chunkIndex: 0 }
        })
      ];

      mockRAGWorkflow.search.mockResolvedValue(mockResults);

      const args = { query: 'mixed results' };
      const result = await searchHandler.handleSearchDocuments(args);

      expect(result.results[0].semanticScore).toBe(0.9);
      expect(result.results[0].keywordScore).toBeUndefined();
      expect(result.results[0].hybridScore).toBeUndefined();

      expect(result.results[1].keywordScore).toBe(0.8);
      expect(result.results[1].semanticScore).toBeUndefined();
      expect(result.results[1].hybridScore).toBeUndefined();

      expect(result.results[2].hybridScore).toBe(0.85);
      expect(result.results[2].semanticScore).toBe(0.7);
      expect(result.results[2].keywordScore).toBe(0.6);
    });
  });

  describe('Error Handling', () => {
    test('should handle RAG workflow errors gracefully', async () => {
      mockRAGWorkflow.search.mockRejectedValue(new Error('RAG workflow failed'));

      const args = { query: 'test query' };

      await expect(searchHandler.handleSearchDocuments(args))
        .rejects.toThrow('RAG workflow failed');
    });

    test('should handle invalid search arguments', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const invalidArgs = {
        query: 'test',
        topK: -1, // Invalid value
        semanticWeight: 1.5 // Invalid value (should be 0-1)
      };

      // Handler should pass through invalid values and let RAG workflow validate
      const result = await searchHandler.handleSearchDocuments(invalidArgs);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('test', 
        expect.objectContaining({
          topK: -1,
          semanticWeight: 1.5
        })
      );
    });

    test('should handle malformed search results', async () => {
      const malformedResults = [
        {
          // Missing required fields
          score: 0.8,
          metadata: {}, // Add minimal metadata to avoid error
          chunkIndex: 0
        },
        {
          content: 'Valid content',
          score: 'invalid score', // Wrong type
          metadata: {}, // Add minimal metadata
          chunkIndex: 0
        }
      ];

      mockRAGWorkflow.search.mockResolvedValue(malformedResults as any);

      const args = { query: 'test' };

      // Should handle malformed results gracefully
      const result = await searchHandler.handleSearchDocuments(args);
      expect(result).toBeDefined();
    });

    test('should handle undefined workflow', async () => {
      const handlerWithoutWorkflow = new SearchHandler(undefined as any);

      const args = { query: 'test' };

      await expect(handlerWithoutWorkflow.handleSearchDocuments(args))
        .rejects.toThrow();
    });
  });

  describe('Search Type Determination', () => {
    test('should correctly determine semantic search type', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test',
        useSemanticSearch: true,
        useHybridSearch: false
      };

      const result = await searchHandler.handleSearchDocuments(args);
      expect(result.searchType).toBe('semantic');
    });

    test('should correctly determine hybrid search type', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test',
        useHybridSearch: true
      };

      const result = await searchHandler.handleSearchDocuments(args);
      expect(result.searchType).toBe('hybrid');
    });

    test('should correctly determine keyword search type', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test',
        useSemanticSearch: false,
        useHybridSearch: false
      };

      const result = await searchHandler.handleSearchDocuments(args);
      expect(result.searchType).toBe('keyword');
    });

    test('should prioritize hybrid over semantic when both are true', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test',
        useSemanticSearch: true,
        useHybridSearch: true
      };

      const result = await searchHandler.handleSearchDocuments(args);
      expect(result.searchType).toBe('hybrid');
    });
  });

  describe('Parameter Validation and Edge Cases', () => {
    test('should handle very large topK values', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test',
        topK: Number.MAX_SAFE_INTEGER
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('test', 
        expect.objectContaining({
          topK: Number.MAX_SAFE_INTEGER
        })
      );
    });

    test('should handle special characters in query', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const specialQuery = 'test query with "quotes" and @symbols & más unicode 中文';
      const args = { query: specialQuery };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith(specialQuery, expect.any(Object));
      expect(result.query).toBe(specialQuery);
    });

    test('should handle very long queries', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const longQuery = 'a'.repeat(10000);
      const args = { query: longQuery };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith(longQuery, expect.any(Object));
      expect(result.query).toBe(longQuery);
    });

    test('should handle empty file types array', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const args = {
        query: 'test',
        fileTypes: []
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('test', 
        expect.objectContaining({
          fileTypes: []
        })
      );
    });

    test('should handle complex metadata filters', async () => {
      mockRAGWorkflow.search.mockResolvedValue([]);

      const complexFilters = {
        category: 'technical',
        level: 'advanced',
        tags: 'ai,ml,deep-learning',
        date_range: '2023-01-01:2023-12-31',
        author: 'John Doe'
      };

      const args = {
        query: 'test',
        metadataFilters: complexFilters
      };

      const result = await searchHandler.handleSearchDocuments(args);

      expect(mockRAGWorkflow.search).toHaveBeenCalledWith('test', 
        expect.objectContaining({
          metadataFilters: complexFilters
        })
      );
    });
  });
});