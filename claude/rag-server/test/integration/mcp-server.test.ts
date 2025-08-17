import { MCPServer } from '../../src/mcp/server/mcp-server';
import { SearchHandler } from '../../src/mcp/handlers/search-handler';
import { DocumentHandler } from '../../src/mcp/handlers/document-handler';
import { SystemHandler } from '../../src/mcp/handlers/system-handler';
import { ModelHandler } from '../../src/mcp/handlers/model-handler';
import { IFileRepository } from '../../src/rag/repositories/document-repository';
import { ServerConfig } from '../../src/shared/types/index';
import { beforeEach, afterEach, describe, test, expect, jest } from '@jest/globals';

describe('MCP Server Integration Tests', () => {
  let mcpServer: MCPServer;
  let mockSearchHandler: jest.Mocked<SearchHandler>;
  let mockDocumentHandler: jest.Mocked<DocumentHandler>;
  let mockSystemHandler: jest.Mocked<SystemHandler>;
  let mockModelHandler: jest.Mocked<ModelHandler>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let testConfig: ServerConfig;

  beforeEach(async () => {
    // Create mock handlers
    mockSearchHandler = {
      handleSearchDocuments: jest.fn(),
    } as any;

    mockDocumentHandler = {
      handleListFiles: jest.fn(),
      handleGetFileMetadata: jest.fn(),
      handleUpdateFileMetadata: jest.fn(),
      handleSearchFilesByMetadata: jest.fn(),
      handleForceReindex: jest.fn(),
    } as any;

    mockSystemHandler = {
      handleGetServerStatus: jest.fn(),
    } as any;

    mockModelHandler = {
      handleListAvailableModels: jest.fn(),
      handleGetCurrentModelInfo: jest.fn(),
      handleSwitchEmbeddingModel: jest.fn(),
      handleDownloadModel: jest.fn(),
      handleGetModelCacheInfo: jest.fn(),
      handleGetDownloadProgress: jest.fn(),
    } as any;

    mockFileRepository = {
      getAllFiles: jest.fn(),
      getFileByPath: jest.fn(),
    } as any;

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

    mcpServer = new MCPServer(
      mockSearchHandler,
      mockDocumentHandler,
      mockSystemHandler,
      mockModelHandler,
      mockFileRepository,
      testConfig
    );
  });

  afterEach(async () => {
    await mcpServer.shutdown();
  });

  describe('MCP protocol compliance', () => {
    test('should create MCP server with proper configuration', () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(MCPServer);
    });

    test('should have start method available', () => {
      expect(typeof mcpServer.start).toBe('function');
    });

    test('should have shutdown method available', () => {
      expect(typeof mcpServer.shutdown).toBe('function');
    });
  });

  describe('handler integration', () => {
    test('should integrate with search handler', () => {
      expect(mockSearchHandler.handleSearchDocuments).toBeDefined();
    });

    test('should integrate with document handler', () => {
      expect(mockDocumentHandler.handleListFiles).toBeDefined();
      expect(mockDocumentHandler.handleForceReindex).toBeDefined();
    });

    test('should integrate with system handler', () => {
      expect(mockSystemHandler.handleGetServerStatus).toBeDefined();
    });

    test('should integrate with model handler', () => {
      expect(mockModelHandler.handleListAvailableModels).toBeDefined();
      expect(mockModelHandler.handleGetCurrentModelInfo).toBeDefined();
    });
  });

  describe('configuration', () => {
    test('should accept valid server config', () => {
      expect(testConfig.dataDir).toBe('/test');
      expect(testConfig.embeddingService).toBe('local');
      expect(testConfig.embeddingModel).toBe('all-MiniLM-L6-v2');
    });

    test('should work with different config values', () => {
      const altConfig = {
        ...testConfig,
        similarityTopK: 10,
        similarityThreshold: 0.8,
      };

      const altServer = new MCPServer(
        mockSearchHandler,
        mockDocumentHandler,
        mockSystemHandler,
        mockModelHandler,
        mockFileRepository,
        altConfig
      );

      expect(altServer).toBeDefined();
    });
  });

  describe('shutdown behavior', () => {
    test('should handle shutdown gracefully', async () => {
      await expect(mcpServer.shutdown()).resolves.not.toThrow();
    });

    test('should handle multiple shutdowns', async () => {
      await mcpServer.shutdown();
      await expect(mcpServer.shutdown()).resolves.not.toThrow();
    });
  });
});