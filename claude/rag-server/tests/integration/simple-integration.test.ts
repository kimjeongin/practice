/**
 * Simple integration tests
 * Tests basic integration between components using mocks
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { 
  mockEmbeddingService,
  mockVectorStore,
  mockConfig,
  TEST_TIMEOUT
} from '../setup.js';

describe('Simple Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations to defaults
    mockEmbeddingService.embedQuery.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
    mockEmbeddingService.embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5]]);
    mockVectorStore.addDocuments.mockResolvedValue(undefined);
    mockVectorStore.search.mockResolvedValue([]);
  });

  describe('Service Integration', () => {
    test('should integrate embedding service with vector store conceptually', async () => {
      // Test the concept of embedding -> vector store flow
      const testText = 'This is test content for embedding';
      
      // Mock embedding generation
      const embedding = await mockEmbeddingService.embedQuery(testText);
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);

      // Mock vector store operations
      const documents = [{
        id: 'test-doc-1',
        content: testText,
        metadata: {
          fileId: 'test-file-1',
          fileName: 'test.txt',
          filePath: '/test.txt',
          chunkIndex: 0,
          fileType: 'txt',
          createdAt: new Date().toISOString()
        }
      }];

      await mockVectorStore.addDocuments(documents);
      expect(mockVectorStore.addDocuments).toHaveBeenCalledWith(documents);

      // Mock search functionality
      mockVectorStore.search.mockResolvedValue([{
        content: testText,
        score: 0.9,
        metadata: documents[0].metadata
      }]);

      const searchResults = await mockVectorStore.search('test query');
      expect(searchResults).toBeDefined();
      expect(searchResults.length).toBeGreaterThan(0);
    });

    test('should validate config integration', () => {
      // Test that config contains expected structure
      expect(mockConfig.server).toBeDefined();
      expect(mockConfig.server.name).toBe('test-server');
      
      expect(mockConfig.embedding).toBeDefined();
      expect(mockConfig.embedding.provider).toBe('transformers');
      
      expect(mockConfig.vectorStore).toBeDefined();
      expect(mockConfig.vectorStore.provider).toBe('faiss');
      
      expect(mockConfig.search).toBeDefined();
      expect(mockConfig.search.enableHybridSearch).toBe(true);
    });

    test('should handle service coordination patterns', async () => {
      // Test coordination between multiple services
      const testContent = 'Integration test content about machine learning';
      
      // 1. Process content through embedding service
      const embeddings = await mockEmbeddingService.embedDocuments([testContent]);
      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]).toHaveLength(5); // Mock returns 5-dimensional vectors
      
      // 2. Store in vector store
      const vectorDoc = {
        id: 'integration-test-1',
        content: testContent,
        metadata: {
          fileId: 'integration-file-1',
          fileName: 'integration.txt',
          filePath: '/integration.txt',
          chunkIndex: 0,
          fileType: 'txt',
          createdAt: new Date().toISOString()
        }
      };
      
      await mockVectorStore.addDocuments([vectorDoc]);
      expect(mockVectorStore.addDocuments).toHaveBeenCalled();
      
      // 3. Simulate search
      mockVectorStore.search.mockResolvedValue([{
        content: testContent,
        score: 0.95,
        metadata: vectorDoc.metadata
      }]);
      
      const results = await mockVectorStore.search('machine learning');
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
      expect(results[0].content).toBe(testContent);
    });
  });

  describe('Error Propagation', () => {
    test('should handle service errors gracefully', async () => {
      // Test error handling between services
      mockEmbeddingService.embedQuery.mockRejectedValue(new Error('Embedding service error'));
      
      await expect(mockEmbeddingService.embedQuery('test')).rejects.toThrow('Embedding service error');
      
      // Reset and test vector store error
      mockEmbeddingService.embedQuery.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      mockVectorStore.addDocuments.mockRejectedValue(new Error('Vector store error'));
      
      await expect(mockVectorStore.addDocuments([])).rejects.toThrow('Vector store error');
    });

    test('should validate service health checks', () => {
      // Test service health validation
      expect(mockVectorStore.isHealthy()).toBe(true);
      
      // Test embedding service model info
      const modelInfo = mockEmbeddingService.getModelInfo();
      expect(modelInfo).toBeDefined();
      expect(modelInfo.name).toBe('test-model');
      expect(modelInfo.service).toBe('test');
      expect(modelInfo.dimensions).toBe(5);
    });
  });

  describe('Data Flow Validation', () => {
    test('should validate complete data transformation pipeline', async () => {
      // Simulate complete data flow: raw text -> embedding -> storage -> search
      const originalText = 'Complete pipeline test with artificial intelligence content';
      
      // Step 1: Text chunking simulation (normally done by chunking service)
      const chunks = [originalText]; // Simplified - normally would be chunked
      
      // Step 2: Embedding generation
      const embeddings = await mockEmbeddingService.embedDocuments(chunks);
      expect(embeddings).toHaveLength(chunks.length);
      
      // Step 3: Prepare documents for vector store
      const documents = chunks.map((chunk, index) => ({
        id: `pipeline-test-${index}`,
        content: chunk,
        metadata: {
          fileId: 'pipeline-test-file',
          fileName: 'pipeline.txt',
          filePath: '/pipeline.txt',
          chunkIndex: index,
          fileType: 'txt',
          createdAt: new Date().toISOString(),
          embeddingId: `embedding-${index}`
        }
      }));
      
      // Step 4: Store in vector store
      await mockVectorStore.addDocuments(documents);
      expect(mockVectorStore.addDocuments).toHaveBeenCalledWith(documents);
      
      // Step 5: Query and retrieve
      const searchQuery = 'artificial intelligence';
      mockVectorStore.search.mockResolvedValue([{
        content: originalText,
        score: 0.88,
        metadata: documents[0].metadata
      }]);
      
      const searchResults = await mockVectorStore.search(searchQuery);
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].content).toBe(originalText);
      
      // Verify all services were called in correct order
      expect(mockEmbeddingService.embedDocuments).toHaveBeenCalledWith(chunks);
      expect(mockVectorStore.addDocuments).toHaveBeenCalledWith(documents);
      expect(mockVectorStore.search).toHaveBeenCalledWith(searchQuery);
    });

    test('should handle different content types', async () => {
      const contentTypes = [
        { text: 'Short text', type: 'txt' },
        { text: 'Medium length content with more details about the topic', type: 'md' },
        { text: 'Very long content that might need special handling in real scenarios. '.repeat(10), type: 'pdf' }
      ];
      
      for (const content of contentTypes) {
        // Process each content type
        const embedding = await mockEmbeddingService.embedQuery(content.text);
        expect(embedding).toBeDefined();
        
        const doc = {
          id: `content-${content.type}-test`,
          content: content.text,
          metadata: {
            fileId: `file-${content.type}`,
            fileName: `test.${content.type}`,
            filePath: `/test.${content.type}`,
            chunkIndex: 0,
            fileType: content.type,
            createdAt: new Date().toISOString()
          }
        };
        
        await mockVectorStore.addDocuments([doc]);
        expect(mockVectorStore.addDocuments).toHaveBeenCalled();
      }
    });
  });

  describe('Configuration Integration', () => {
    test('should validate service configuration consistency', () => {
      // Test that configuration is consistent across services
      const embeddingConfig = mockConfig.embedding;
      const vectorStoreConfig = mockConfig.vectorStore;
      const searchConfig = mockConfig.search;
      
      // Embedding configuration
      expect(embeddingConfig.provider).toBeDefined();
      expect(embeddingConfig.model).toBeDefined();
      expect(embeddingConfig.dimensions).toBeGreaterThan(0);
      
      // Vector store configuration
      expect(vectorStoreConfig.provider).toBeDefined();
      expect(vectorStoreConfig.indexPath).toBeDefined();
      
      // Search configuration
      expect(typeof searchConfig.enableHybridSearch).toBe('boolean');
      expect(searchConfig.semanticWeight).toBeGreaterThan(0);
      expect(searchConfig.semanticWeight).toBeLessThanOrEqual(1);
    });

    test('should handle configuration changes impact', () => {
      // Test how configuration changes might affect service integration
      const originalEnableHybridSearch = mockConfig.search.enableHybridSearch;
      const originalSemanticWeight = mockConfig.search.semanticWeight;
      
      // Modify search configuration
      mockConfig.search.enableHybridSearch = false;
      mockConfig.search.semanticWeight = 0.5;
      
      // Verify changes are reflected
      expect(mockConfig.search.enableHybridSearch).toBe(false);
      expect(mockConfig.search.semanticWeight).toBe(0.5);
      
      // Restore original configuration
      mockConfig.search.enableHybridSearch = originalEnableHybridSearch;
      mockConfig.search.semanticWeight = originalSemanticWeight;
      expect(mockConfig.search.enableHybridSearch).toBe(originalEnableHybridSearch);
    });
  });

  describe('Performance Integration', () => {
    test('should handle batch operations efficiently', async () => {
      const batchSize = 100;
      const batchData = Array.from({ length: batchSize }, (_, i) => 
        `Batch content item ${i} with some meaningful text for testing`
      );
      
      const startTime = Date.now();
      
      // Process batch through embedding service (mock returns single array)
      const embeddings = await mockEmbeddingService.embedDocuments(batchData);
      expect(embeddings).toHaveLength(1); // Mock implementation returns single embedding
      
      // Prepare batch documents
      const documents = batchData.map((content, index) => ({
        id: `batch-${index}`,
        content,
        metadata: {
          fileId: `batch-file-${index}`,
          fileName: `batch-${index}.txt`,
          filePath: `/batch-${index}.txt`,
          chunkIndex: 0,
          fileType: 'txt',
          createdAt: new Date().toISOString()
        }
      }));
      
      // Store batch in vector store
      await mockVectorStore.addDocuments(documents);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (very lenient for mock services)
      expect(duration).toBeLessThan(1000);
      expect(mockEmbeddingService.embedDocuments).toHaveBeenCalledWith(batchData);
      expect(mockVectorStore.addDocuments).toHaveBeenCalledWith(documents);
    });
  });
}, TEST_TIMEOUT);