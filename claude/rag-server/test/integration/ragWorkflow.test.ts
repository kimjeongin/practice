import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { RAGWorkflow } from '../../src/rag/workflows/ragWorkflow';
import { ISearchService } from '../../src/shared/types/interfaces';
import { IFileRepository } from '../../src/rag/repositories/documentRepository';
import { IChunkRepository } from '../../src/rag/repositories/chunkRepository';
import { ServerConfig } from '../../src/shared/types/index';

describe('RAGWorkflow Integration Tests', () => {
  let ragWorkflow: RAGWorkflow;
  let mockSearchService: jest.Mocked<ISearchService>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockChunkRepository: jest.Mocked<IChunkRepository>;
  let testConfig: ServerConfig;

  beforeEach(() => {
    // Mock search service
    mockSearchService = {
      search: jest.fn(),
    } as any;

    // Mock file repository
    mockFileRepository = {
      getAllFiles: jest.fn(),
      getFileByPath: jest.fn(),
    } as any;

    // Mock chunk repository 
    mockChunkRepository = {
      getDocumentChunks: jest.fn(),
    } as any;

    // Test configuration
    testConfig = {
      databasePath: '/test/test.db',
      dataDir: '/test',
      chunkSize: 1000,
      chunkOverlap: 200,
      similarityTopK: 5,
      embeddingModel: 'all-MiniLM-L6-v2',
      embeddingDevice: 'cpu',
      logLevel: 'error',
      embeddingService: 'local',
      embeddingBatchSize: 10,
      embeddingDimensions: 384,
      similarityThreshold: 0.7,
      nodeEnv: 'test',
    };

    ragWorkflow = new RAGWorkflow(
      mockSearchService,
      mockFileRepository,
      mockChunkRepository,
      testConfig
    );
  });

  describe('search functionality', () => {
    test('should perform semantic search by default', async () => {
      const mockResults = [
        {
          content: 'Vector databases are specialized storage systems',
          chunkIndex: 0,
          metadata: {
            fileName: 'test.txt',
            filePath: '/test/test.txt',
            fileType: 'text/plain',
          },
          score: 0.9,
        },
      ];

      mockSearchService.search.mockResolvedValue(mockResults);

      const results = await ragWorkflow.search('vector databases');

      expect(mockSearchService.search).toHaveBeenCalledWith('vector databases', {
        topK: 5,
        fileTypes: undefined,
        metadataFilters: undefined,
      });
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('semanticScore', 0.9);
      expect(results[0].content).toContain('Vector databases');
    });

    test('should perform keyword search when semantic search is disabled', async () => {
      // Setup mock data for keyword search
      const mockFiles = [
        {
          id: 'file-1',
          name: 'test.txt',
          path: '/test/test.txt',
          fileType: 'text/plain',
          createdAt: new Date(),
        },
      ];

      const mockChunks = [
        {
          content: 'Vector databases are specialized storage systems for handling vector data',
          chunkIndex: 0,
          embeddingId: 'chunk-1',
        },
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue(mockChunks);

      const results = await ragWorkflow.search('vector databases', {
        useSemanticSearch: false,
      });

      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
      expect(mockChunkRepository.getDocumentChunks).toHaveBeenCalledWith('file-1');
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('keywordScore');
      expect(results[0].content).toContain('Vector databases');
    });

    test('should perform hybrid search when enabled', async () => {
      // Mock semantic search results
      const mockSemanticResults = [
        {
          content: 'Vector databases are specialized storage systems',
          chunkIndex: 0,
          metadata: {
            fileName: 'test.txt',
            filePath: '/test/test.txt',
            fileType: 'text/plain',
          },
          score: 0.8,
        },
      ];

      mockSearchService.search.mockResolvedValue(mockSemanticResults);

      // Mock keyword search data - ensure it matches the semantic results
      const mockFiles = [
        {
          id: 'file-1',
          name: 'test.txt',
          path: '/test/test.txt',
          fileType: 'text/plain',
          createdAt: new Date(),
        },
      ];

      const mockChunks = [
        {
          content: 'Vector databases are specialized storage systems',
          chunkIndex: 0,
          embeddingId: 'chunk-1',
        },
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockChunkRepository.getDocumentChunks.mockReturnValue(mockChunks);

      const results = await ragWorkflow.search('vector databases', {
        useHybridSearch: true,
        semanticWeight: 0.7,
        scoreThreshold: 0.1, // Lower threshold to ensure results pass
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('hybridScore');
      expect(results[0]).toHaveProperty('semanticScore');
      expect(results[0]).toHaveProperty('keywordScore');
    });

    test('should filter by file types', async () => {
      const mockResults = [
        {
          content: 'Test content',
          chunkIndex: 0,
          metadata: {
            fileName: 'test.txt',
            filePath: '/test/test.txt',
            fileType: 'text/plain',
          },
          score: 0.8,
        },
      ];

      mockSearchService.search.mockResolvedValue(mockResults);

      await ragWorkflow.search('test', {
        fileTypes: ['text/plain'],
      });

      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        topK: 5,
        fileTypes: ['text/plain'],
        metadataFilters: undefined,
      });
    });

    test('should respect score threshold', async () => {
      const mockResults = [
        {
          content: 'High score content',
          chunkIndex: 0,
          metadata: {
            fileName: 'test1.txt',
            filePath: '/test/test1.txt',
            fileType: 'text/plain',
          },
          score: 0.9,
        },
        {
          content: 'Low score content',
          chunkIndex: 0,
          metadata: {
            fileName: 'test2.txt',
            filePath: '/test/test2.txt',
            fileType: 'text/plain',
          },
          score: 0.5,
        },
      ];

      mockSearchService.search.mockResolvedValue(mockResults);

      const results = await ragWorkflow.search('content', {
        scoreThreshold: 0.8,
      });

      // Only results above threshold should be returned
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThanOrEqual(0.8);
    });

    test('should handle empty search results', async () => {
      mockSearchService.search.mockResolvedValue([]);

      const results = await ragWorkflow.search('nonexistent query');

      expect(results).toHaveLength(0);
    });

    test('should handle search errors gracefully', async () => {
      mockSearchService.search.mockRejectedValue(new Error('Search failed'));

      await expect(ragWorkflow.search('test query')).rejects.toThrow('Search failed');
    });
  });

  describe('configuration options', () => {
    test('should use config defaults for topK and threshold', async () => {
      mockSearchService.search.mockResolvedValue([]);

      await ragWorkflow.search('test');

      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        topK: testConfig.similarityTopK,
        fileTypes: undefined,
        metadataFilters: undefined,
      });
    });

    test('should override config with provided options', async () => {
      mockSearchService.search.mockResolvedValue([]);

      await ragWorkflow.search('test', {
        topK: 10,
      });

      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        topK: 10,
        fileTypes: undefined,
        metadataFilters: undefined,
      });
    });
  });

  describe('search types', () => {
    test('should log search type correctly for semantic search', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockSearchService.search.mockResolvedValue([]);

      await ragWorkflow.search('test query');

      expect(consoleSpy).toHaveBeenCalledWith('🔍 RAG Search: "test query" (semantic)');
      consoleSpy.mockRestore();
    });

    test('should log search type correctly for hybrid search', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockSearchService.search.mockResolvedValue([]);
      mockFileRepository.getAllFiles.mockReturnValue([]);

      await ragWorkflow.search('test query', { useHybridSearch: true });

      expect(consoleSpy).toHaveBeenCalledWith('🔍 RAG Search: "test query" (hybrid)');
      consoleSpy.mockRestore();
    });
  });
});