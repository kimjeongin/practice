import { DatabaseManager } from '../../../infrastructure/database/connection.js';
import { DocumentChunk } from '../models/models.js';

export interface IChunkRepository {
  insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): string;
  getDocumentChunks(fileId: string): DocumentChunk[];
  deleteDocumentChunks(fileId: string): void;
}

export class ChunkRepository implements IChunkRepository {
  constructor(private db: DatabaseManager) {}

  insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): string {
    return this.db.insertDocumentChunk(chunk);
  }

  getDocumentChunks(fileId: string): DocumentChunk[] {
    return this.db.getDocumentChunks(fileId);
  }

  deleteDocumentChunks(fileId: string): void {
    this.db.deleteDocumentChunks(fileId);
  }
}