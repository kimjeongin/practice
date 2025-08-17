import { DatabaseConnection } from '@/infrastructure/database/database-connection.js';
import { DocumentChunk } from '@/rag/models/models.js';

export interface IChunkRepository {
  insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): string;
  getDocumentChunks(fileId: string): DocumentChunk[];
  getChunksByFileId(fileId: string): DocumentChunk[];
  deleteDocumentChunks(fileId: string): void;
  deleteAllDocumentChunks(): void;
  getTotalChunkCount(): number;
}

export class ChunkRepository implements IChunkRepository {
  constructor(private db: DatabaseConnection) {}

  insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): string {
    return this.db.insertDocumentChunk(chunk);
  }

  getDocumentChunks(fileId: string): DocumentChunk[] {
    return this.db.getDocumentChunks(fileId);
  }

  getChunksByFileId(fileId: string): DocumentChunk[] {
    return this.db.getDocumentChunks(fileId);
  }

  deleteDocumentChunks(fileId: string): void {
    this.db.deleteDocumentChunks(fileId);
  }

  deleteAllDocumentChunks(): void {
    this.db.deleteAllDocumentChunks();
  }

  getTotalChunkCount(): number {
    return this.db.getTotalChunkCount();
  }
}