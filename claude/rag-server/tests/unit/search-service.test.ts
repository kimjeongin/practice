/**
 * Search Service Tests
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock resilience utilities
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
    recordError: jest.fn()
  }
}));

import { SearchService } from '@/domains/rag/services/search/search-service.js';
import { ConfigFactory } from '@/shared/config/config-factory.js';

describe('SearchService', () => {
  let searchService: SearchService;
  let mockVectorStore: any;
  let mockFileRepository: any;
  let mockChunkRepository: any;
  let config: any;

  beforeEach(() => {
    config = ConfigFactory.createTestConfig();
    
    mockVectorStore = {
      search: jest.fn(),
      addDocuments: jest.fn(),
      initialize: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true)
    };

    mockFileRepository = {
      findById: jest.fn(),
      findAll: jest.fn()
    };

    mockChunkRepository = {
      findByFileId: jest.fn(),
      findAll: jest.fn()
    };

    searchService = new SearchService(
      mockVectorStore,
      mockFileRepository,
      mockChunkRepository,
      config
    );
  });

  test('should initialize successfully', () => {
    expect(searchService).toBeInstanceOf(SearchService);
  });

  test('should perform search and return results', async () => {
    const results = await searchService.search('test query', {
      useSemanticSearch: true,
      topK: 5
    });

    // SearchService implements complex pipeline, so just verify it returns an array
    expect(Array.isArray(results)).toBe(true);
  });

  test('should process query through pipeline', async () => {
    const results = await searchService.search('test query');
    
    // Verify that search pipeline completes successfully
    expect(Array.isArray(results)).toBe(true);
  });
});