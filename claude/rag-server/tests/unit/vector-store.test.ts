/**
 * Vector Store Tests
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { VectorStoreAdapter } from '@/domains/rag/integrations/vectorstores/adapter.js';

describe('VectorStoreAdapter', () => {
  let adapter: VectorStoreAdapter;
  let mockFaissStore: any;

  beforeEach(() => {
    mockFaissStore = {
      addDocuments: jest.fn(),
      search: jest.fn(),
      removeDocumentsByFileId: jest.fn(),
      initialize: jest.fn(),
      saveIndex: jest.fn(),
      getAllDocumentIds: jest.fn().mockReturnValue([]),
      getDocumentCount: jest.fn().mockReturnValue(0),
      removeAllDocuments: jest.fn(),
      hasDocumentsForFileId: jest.fn().mockReturnValue(false),
      getDocumentMetadata: jest.fn().mockResolvedValue(null),
      getIndexInfo: jest.fn().mockReturnValue({
        totalVectors: 0,
        dimensions: 384,
        indexSize: 0,
        lastUpdated: new Date()
      }),
      isHealthy: jest.fn().mockReturnValue(true),
      deleteDocuments: jest.fn(),
      capabilities: {
        supportsMetadataFiltering: true,
        supportsHybridSearch: false
      }
    };

    adapter = new VectorStoreAdapter(mockFaissStore);
  });

  test('should initialize successfully', async () => {
    await adapter.initialize();
    expect(mockFaissStore.initialize).toHaveBeenCalled();
  });

  test('should add documents', async () => {
    const documents = [
      { id: '1', content: 'test content', metadata: { fileId: 'file1' } }
    ];

    await adapter.addDocuments(documents);
    expect(mockFaissStore.addDocuments).toHaveBeenCalledWith(documents);
  });

  test('should search documents', async () => {
    const mockResults = [
      { content: 'test result', score: 0.9, metadata: { fileId: 'file1' } }
    ];
    mockFaissStore.search.mockResolvedValue(mockResults);

    const results = await adapter.search('test query', { topK: 5 });

    expect(mockFaissStore.search).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ topK: 5 })
    );
    expect(results).toEqual(mockResults);
  });

  test('should remove documents by file ID', async () => {
    await adapter.removeDocumentsByFileId('file1');
    expect(mockFaissStore.removeDocumentsByFileId).toHaveBeenCalledWith('file1');
  });

  test('should return index info', () => {
    const info = adapter.getIndexInfo();
    expect(info).toHaveProperty('documentCount');
    expect(info).toHaveProperty('indexPath');
  });

  test('should check health status', () => {
    const isHealthy = adapter.isHealthy();
    expect(typeof isHealthy).toBe('boolean');
  });
});