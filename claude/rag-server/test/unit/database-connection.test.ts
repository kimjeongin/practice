import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseConnection } from '../../src/infrastructure/database/database-connection.js';
import { getFileMetadata } from '../helpers/test-helpers.js';
import path from 'path';
import fs from 'fs';
import { TEST_DOCUMENTS_DIR } from '../setup.js';

describe('DatabaseConnection', () => {
  let db: DatabaseConnection;
  let testFilePath: string;

  beforeEach(async () => {
    db = new DatabaseConnection();
    
    // Create a unique test file for each test
    const testId = Math.random().toString(36).substring(2, 15);
    testFilePath = path.join(TEST_DOCUMENTS_DIR, `database-test-${testId}.txt`);
    fs.writeFileSync(testFilePath, 'Test content for database operations');
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('Health Check', () => {
    test('should report healthy database', async () => {
      const isHealthy = await db.isHealthy();
      expect(isHealthy).toBe(true);
    });
  });

  describe('File Operations', () => {
    test('should insert and retrieve file', async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      
      const fileId = await db.insertFile(fileMetadata);
      expect(fileId).toBeDefined();
      expect(typeof fileId).toBe('string');

      const retrievedFile = await db.getFileById(fileId);
      expect(retrievedFile).toBeDefined();
      expect(retrievedFile?.path).toBe(fileMetadata.path);
      expect(retrievedFile?.name).toBe(fileMetadata.name);
      expect(retrievedFile?.fileType).toBe(fileMetadata.fileType);
    });

    test('should get file by path', async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      const fileId = await db.insertFile(fileMetadata);

      const retrievedFile = await db.getFileByPath(fileMetadata.path);
      expect(retrievedFile).toBeDefined();
      expect(retrievedFile?.id).toBe(fileId);
      expect(retrievedFile?.path).toBe(fileMetadata.path);
    });

    test('should return null for non-existent file', async () => {
      const nonExistentFile = await db.getFileByPath('/path/does/not/exist.txt');
      expect(nonExistentFile).toBeNull();
    });

    test('should get all files', async () => {
      const fileMetadata1 = getFileMetadata(testFilePath);
      const fileMetadata2 = {
        ...fileMetadata1,
        path: path.join(TEST_DOCUMENTS_DIR, 'another-test.txt'),
        name: 'another-test.txt'
      };
      
      fs.writeFileSync(fileMetadata2.path, 'Another test file');

      await db.insertFile(fileMetadata1);
      await db.insertFile(fileMetadata2);

      const allFiles = await db.getAllFiles();
      expect(allFiles.length).toBeGreaterThanOrEqual(2);
      
      const paths = allFiles.map(f => f.path);
      expect(paths).toContain(fileMetadata1.path);
      expect(paths).toContain(fileMetadata2.path);

      // Cleanup
      fs.unlinkSync(fileMetadata2.path);
    });

    test('should update file metadata', async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      const fileId = await db.insertFile(fileMetadata);

      const updates = {
        name: 'updated-name.txt',
        size: 999
      };

      await db.updateFile(fileId, updates);
      
      const updatedFile = await db.getFileById(fileId);
      expect(updatedFile?.name).toBe(updates.name);
      expect(updatedFile?.size).toBe(updates.size);
    });

    test('should delete file', async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      const fileId = await db.insertFile(fileMetadata);

      await db.deleteFile(fileId);
      
      const deletedFile = await db.getFileById(fileId);
      expect(deletedFile).toBeNull();
    });
  });

  describe('File Metadata Operations', () => {
    let fileId: string;

    beforeEach(async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      fileId = await db.insertFile(fileMetadata);
    });

    test('should set and get file metadata', async () => {
      await db.setFileMetadata(fileId, 'author', 'test-author');
      await db.setFileMetadata(fileId, 'category', 'testing');

      const metadata = await db.getFileMetadata(fileId);
      expect(metadata.author).toBe('test-author');
      expect(metadata.category).toBe('testing');
    });

    test('should update existing metadata', async () => {
      await db.setFileMetadata(fileId, 'status', 'draft');
      await db.setFileMetadata(fileId, 'status', 'published');

      const metadata = await db.getFileMetadata(fileId);
      expect(metadata.status).toBe('published');
    });

    test('should search files by metadata', async () => {
      await db.setFileMetadata(fileId, 'category', 'technical');
      await db.setFileMetadata(fileId, 'tags', 'test,unit');

      const filesWithCategory = await db.searchFilesByMetadata('category', 'technical');
      expect(filesWithCategory.length).toBeGreaterThan(0);
      expect(filesWithCategory.some(f => f.id === fileId)).toBe(true);

      const filesWithTags = await db.searchFilesByMetadata('tags');
      expect(filesWithTags.length).toBeGreaterThan(0);
    });
  });

  describe('Document Chunk Operations', () => {
    let fileId: string;

    beforeEach(async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      fileId = await db.insertFile(fileMetadata);
    });

    test('should insert and retrieve document chunks', async () => {
      const chunk1 = {
        fileId,
        chunkIndex: 0,
        content: 'This is the first chunk of content.',
        embeddingId: 'embedding-1'
      };

      const chunk2 = {
        fileId,
        chunkIndex: 1,
        content: 'This is the second chunk of content.',
        embeddingId: 'embedding-2'
      };

      const chunkId1 = await db.insertDocumentChunk(chunk1);
      const chunkId2 = await db.insertDocumentChunk(chunk2);

      expect(chunkId1).toBeDefined();
      expect(chunkId2).toBeDefined();

      const retrievedChunks = await db.getDocumentChunks(fileId);
      expect(retrievedChunks.length).toBe(2);
      expect(retrievedChunks[0].content).toBe(chunk1.content);
      expect(retrievedChunks[1].content).toBe(chunk2.content);
      expect(retrievedChunks[0].chunkIndex).toBe(0);
      expect(retrievedChunks[1].chunkIndex).toBe(1);
    });

    test('should delete document chunks for file', async () => {
      const chunk = {
        fileId,
        chunkIndex: 0,
        content: 'Test chunk for deletion.',
        embeddingId: 'embedding-delete'
      };

      await db.insertDocumentChunk(chunk);
      let chunks = await db.getDocumentChunks(fileId);
      expect(chunks.length).toBe(1);

      await db.deleteDocumentChunks(fileId);
      chunks = await db.getDocumentChunks(fileId);
      expect(chunks.length).toBe(0);
    });

    test('should get total chunk count', async () => {
      const initialCount = await db.getTotalChunkCount();

      const chunk = {
        fileId,
        chunkIndex: 0,
        content: 'Test chunk for counting.',
        embeddingId: 'embedding-count'
      };

      await db.insertDocumentChunk(chunk);
      
      const newCount = await db.getTotalChunkCount();
      expect(newCount).toBe(initialCount + 1);
    });

    test('should delete all document chunks', async () => {
      const chunk = {
        fileId,
        chunkIndex: 0,
        content: 'Test chunk for global deletion.',
        embeddingId: 'embedding-global-delete'
      };

      await db.insertDocumentChunk(chunk);
      
      await db.deleteAllDocumentChunks();
      
      const totalCount = await db.getTotalChunkCount();
      expect(totalCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle duplicate file paths gracefully', async () => {
      const fileMetadata = getFileMetadata(testFilePath);
      
      await db.insertFile(fileMetadata);
      
      // Trying to insert the same file path again should throw an error
      await expect(db.insertFile(fileMetadata)).rejects.toThrow();
    });

    test('should handle invalid file ID operations', async () => {
      const invalidId = 'invalid-file-id';
      
      await expect(db.updateFile(invalidId, { name: 'test' })).rejects.toThrow();
      await expect(db.deleteFile(invalidId)).rejects.toThrow();
    });
  });
});