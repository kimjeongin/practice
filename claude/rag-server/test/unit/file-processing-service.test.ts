// Mock the resilience utilities to avoid ESM module issues
jest.mock('../../src/shared/utils/resilience.js', () => ({
  withTimeout: jest.fn().mockImplementation((promise: any) => promise),
  withRetry: jest.fn().mockImplementation((...args: any[]) => args[0]()),
  BatchProcessor: {
    processBatch: jest.fn().mockImplementation((...args: any[]) => 
      Promise.all(args[0].map(args[1]))
    )
  }
}));

// Mock FileReader
jest.mock('../../src/rag/utils/file-reader.js', () => ({
  FileReader: jest.fn().mockImplementation(() => ({
    readFileContent: jest.fn().mockResolvedValue({
      pageContent: 'mock file content',
      metadata: { source: 'test' }
    })
  }))
}));

// Mock ChunkingService
jest.mock('../../src/rag/services/chunking-service.js', () => ({
  ChunkingService: jest.fn().mockImplementation(() => ({
    chunkDocument: jest.fn().mockReturnValue([
      { pageContent: 'chunk 1', metadata: {} },
      { pageContent: 'chunk 2', metadata: {} }
    ])
  }))
}));

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { FileProcessingService } from '../../src/rag/services/file-processing-service';
import { createMockConfig, createMockLogger } from '../helpers/test-helpers';
import { SAMPLE_DOCUMENTS } from '../fixtures/sample-documents';

const mockFileRepository = {
  getFileByPath: jest.fn(),
  getAllFiles: jest.fn(),
  insertFile: jest.fn(),
  deleteFile: jest.fn(),
  updateFile: jest.fn(),
  getFileById: jest.fn()
};

const mockChunkRepository = {
  deleteDocumentChunks: jest.fn(),
  insertDocumentChunk: jest.fn(),
  getChunksByFileId: jest.fn(),
  deleteChunk: jest.fn()
};

const mockVectorStoreService = {
  addDocuments: jest.fn(),
  removeDocumentsByFileId: jest.fn(),
  search: jest.fn(),
  similaritySearch: jest.fn()
};

describe('FileProcessingService', () => {
  let service: FileProcessingService;
  const mockConfig = createMockConfig();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileProcessingService(
      mockFileRepository as any,
      mockChunkRepository as any,
      mockVectorStoreService as any,
      mockConfig as any
    );
  });

  describe('processFile', () => {
    test('should process a file successfully', async () => {
      const filePath = '/test/sample.txt';
      const mockFile = {
        id: 'file-1',
        name: 'sample.txt',
        path: filePath,
        fileType: 'text/plain',
        createdAt: new Date()
      };

      mockFileRepository.getFileByPath.mockReturnValue(mockFile);
      mockChunkRepository.insertDocumentChunk.mockReturnValue('chunk-1');
      mockVectorStoreService.addDocuments.mockResolvedValue(undefined);

      await service.processFile(filePath);

      expect(mockFileRepository.getFileByPath).toHaveBeenCalledWith(filePath);
      expect(mockChunkRepository.deleteDocumentChunks).toHaveBeenCalledWith(mockFile.id);
      expect(mockVectorStoreService.removeDocumentsByFileId).toHaveBeenCalledWith(mockFile.id);
    });

    test('should skip processing if file not found in database', async () => {
      const filePath = '/test/nonexistent.txt';
      mockFileRepository.getFileByPath.mockReturnValue(null);

      await service.processFile(filePath);

      expect(mockFileRepository.getFileByPath).toHaveBeenCalledWith(filePath);
      expect(mockChunkRepository.deleteDocumentChunks).not.toHaveBeenCalled();
      expect(mockVectorStoreService.addDocuments).not.toHaveBeenCalled();
    });

    test('should not process same file twice concurrently', async () => {
      const filePath = '/test/sample.txt';
      const mockFile = {
        id: 'file-1',
        name: 'sample.txt',
        path: filePath,
        fileType: 'text/plain',
        createdAt: new Date()
      };

      mockFileRepository.getFileByPath.mockReturnValue(mockFile);
      mockVectorStoreService.addDocuments.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const promise1 = service.processFile(filePath);
      const promise2 = service.processFile(filePath);

      await Promise.all([promise1, promise2]);

      expect(mockFileRepository.getFileByPath).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeFile', () => {
    test('should remove file successfully', async () => {
      const filePath = '/test/sample.txt';
      const mockFile = {
        id: 'file-1',
        name: 'sample.txt',
        path: filePath,
        fileType: 'text/plain',
        createdAt: new Date()
      };

      mockFileRepository.getFileByPath.mockReturnValue(mockFile);
      mockVectorStoreService.removeDocumentsByFileId.mockResolvedValue(undefined);

      await service.removeFile(filePath);

      expect(mockFileRepository.getFileByPath).toHaveBeenCalledWith(filePath);
      expect(mockVectorStoreService.removeDocumentsByFileId).toHaveBeenCalledWith(mockFile.id);
    });

    test('should handle removal of non-existent file', async () => {
      const filePath = '/test/nonexistent.txt';
      mockFileRepository.getFileByPath.mockReturnValue(null);

      await service.removeFile(filePath);

      expect(mockFileRepository.getFileByPath).toHaveBeenCalledWith(filePath);
      expect(mockVectorStoreService.removeDocumentsByFileId).not.toHaveBeenCalled();
    });
  });

  describe('getProcessingStatus', () => {
    test('should return correct processing status', () => {
      const status = service.getProcessingStatus();
      
      expect(status).toEqual({
        isProcessing: false,
        queueSize: 0
      });
    });
  });

  describe('forceReindex', () => {
    test('should reindex all files', async () => {
      const mockFiles = [
        { id: 'file-1', path: '/test/file1.txt', name: 'file1.txt', fileType: 'text/plain', createdAt: new Date() },
        { id: 'file-2', path: '/test/file2.txt', name: 'file2.txt', fileType: 'text/plain', createdAt: new Date() }
      ];

      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      mockFileRepository.getFileByPath.mockImplementation((path: string) => 
        mockFiles.find(f => f.path === path)
      );
      mockVectorStoreService.addDocuments.mockResolvedValue(undefined);

      await service.forceReindex();

      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
      expect(mockFileRepository.getFileByPath).toHaveBeenCalledTimes(mockFiles.length);
    });

    test('should handle reindex with cache clearing', async () => {
      const mockFiles = [];
      mockFileRepository.getAllFiles.mockReturnValue(mockFiles);
      
      const mockVectorStoreWithRebuild = {
        ...mockVectorStoreService,
        rebuildIndex: jest.fn().mockResolvedValue(undefined)
      };

      const serviceWithRebuild = new FileProcessingService(
        mockFileRepository as any,
        mockChunkRepository as any,
        mockVectorStoreWithRebuild as any,
        mockConfig as any
      );

      await serviceWithRebuild.forceReindex(true);

      expect(mockVectorStoreWithRebuild.rebuildIndex).toHaveBeenCalled();
      expect(mockFileRepository.getAllFiles).toHaveBeenCalled();
    });
  });
});