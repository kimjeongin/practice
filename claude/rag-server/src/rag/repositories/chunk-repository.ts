import { DatabaseConnection } from '@/infrastructure/database/database-connection.js';
import { DocumentChunk } from '@/rag/models/models.js';

export interface IChunkRepository {
  insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): Promise<string>;
  getDocumentChunks(fileId: string): Promise<DocumentChunk[]>;
  getChunksByFileId(fileId: string): Promise<DocumentChunk[]>;
  deleteDocumentChunks(fileId: string): Promise<void>;
  deleteAllDocumentChunks(): Promise<void>;
  getTotalChunkCount(): Promise<number>;
}

export class ChunkRepository implements IChunkRepository {
  constructor(private db: DatabaseConnection) {}

  async insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): Promise<string> {
    return await this.db.insertDocumentChunk(chunk);
  }

  async getDocumentChunks(fileId: string): Promise<DocumentChunk[]> {
    return await this.db.getDocumentChunks(fileId);
  }

  async getChunksByFileId(fileId: string): Promise<DocumentChunk[]> {
    return await this.db.getDocumentChunks(fileId);
  }

  async deleteDocumentChunks(fileId: string): Promise<void> {
    await this.db.deleteDocumentChunks(fileId);
  }

  async deleteAllDocumentChunks(): Promise<void> {
    await this.db.deleteAllDocumentChunks();
  }

  async getTotalChunkCount(): Promise<number> {
    return await this.db.getTotalChunkCount();
  }
}