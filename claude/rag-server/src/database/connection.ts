import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { FileMetadata, CustomMetadata, DocumentChunk } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    const schema = `
-- Files table to store basic file information
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    modified_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    file_type TEXT NOT NULL,
    hash TEXT NOT NULL,
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Custom metadata table for flexible key-value storage
CREATE TABLE IF NOT EXISTS file_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    UNIQUE(file_id, key)
);

-- Document chunks table for storing processed text chunks
CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    UNIQUE(file_id, chunk_index)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
CREATE INDEX IF NOT EXISTS idx_files_modified_at ON files(modified_at);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);

CREATE INDEX IF NOT EXISTS idx_file_metadata_file_id ON file_metadata(file_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_key ON file_metadata(key);
CREATE INDEX IF NOT EXISTS idx_file_metadata_value ON file_metadata(value);

CREATE INDEX IF NOT EXISTS idx_document_chunks_file_id ON document_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index ON document_chunks(chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_id ON document_chunks(embedding_id);
    `;
    
    this.db.exec(schema);
  }

  // File operations
  insertFile(file: Omit<FileMetadata, 'id'>): string {
    const fileId = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO files (id, path, name, size, modified_at, created_at, file_type, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      fileId,
      file.path,
      file.name,
      file.size,
      file.modifiedAt.toISOString(),
      file.createdAt.toISOString(),
      file.fileType,
      file.hash
    );
    
    return fileId;
  }

  updateFile(id: string, updates: Partial<Omit<FileMetadata, 'id'>>): void {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.path) {
      fields.push('path = ?');
      values.push(updates.path);
    }
    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.size !== undefined) {
      fields.push('size = ?');
      values.push(updates.size);
    }
    if (updates.modifiedAt) {
      fields.push('modified_at = ?');
      values.push(updates.modifiedAt.toISOString());
    }
    if (updates.fileType) {
      fields.push('file_type = ?');
      values.push(updates.fileType);
    }
    if (updates.hash) {
      fields.push('hash = ?');
      values.push(updates.hash);
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      
      const stmt = this.db.prepare(`
        UPDATE files SET ${fields.join(', ')} WHERE id = ?
      `);
      stmt.run(...values);
    }
  }

  getFileByPath(path: string): FileMetadata | null {
    const stmt = this.db.prepare('SELECT * FROM files WHERE path = ?');
    const row = stmt.get(path) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      size: row.size,
      modifiedAt: new Date(row.modified_at),
      createdAt: new Date(row.created_at),
      fileType: row.file_type,
      hash: row.hash
    };
  }

  getFileById(id: string): FileMetadata | null {
    const stmt = this.db.prepare('SELECT * FROM files WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      size: row.size,
      modifiedAt: new Date(row.modified_at),
      createdAt: new Date(row.created_at),
      fileType: row.file_type,
      hash: row.hash
    };
  }

  getAllFiles(): FileMetadata[] {
    const stmt = this.db.prepare('SELECT * FROM files ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      path: row.path,
      name: row.name,
      size: row.size,
      modifiedAt: new Date(row.modified_at),
      createdAt: new Date(row.created_at),
      fileType: row.file_type,
      hash: row.hash
    }));
  }

  deleteFile(id: string): void {
    const stmt = this.db.prepare('DELETE FROM files WHERE id = ?');
    stmt.run(id);
  }

  // Metadata operations
  setFileMetadata(fileId: string, key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO file_metadata (file_id, key, value)
      VALUES (?, ?, ?)
    `);
    stmt.run(fileId, key, value);
  }

  getFileMetadata(fileId: string): Record<string, string> {
    const stmt = this.db.prepare('SELECT key, value FROM file_metadata WHERE file_id = ?');
    const rows = stmt.all(fileId) as { key: string; value: string }[];
    
    const metadata: Record<string, string> = {};
    for (const row of rows) {
      metadata[row.key] = row.value;
    }
    return metadata;
  }

  searchFilesByMetadata(key: string, value?: string): FileMetadata[] {
    let query: string;
    let params: any[];
    
    if (value) {
      query = `
        SELECT DISTINCT f.* FROM files f
        JOIN file_metadata fm ON f.id = fm.file_id
        WHERE fm.key = ? AND fm.value = ?
        ORDER BY f.created_at DESC
      `;
      params = [key, value];
    } else {
      query = `
        SELECT DISTINCT f.* FROM files f
        JOIN file_metadata fm ON f.id = fm.file_id
        WHERE fm.key = ?
        ORDER BY f.created_at DESC
      `;
      params = [key];
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      path: row.path,
      name: row.name,
      size: row.size,
      modifiedAt: new Date(row.modified_at),
      createdAt: new Date(row.created_at),
      fileType: row.file_type,
      hash: row.hash
    }));
  }

  // Document chunk operations
  insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): string {
    const chunkId = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO document_chunks (id, file_id, chunk_index, content, embedding_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(chunkId, chunk.fileId, chunk.chunkIndex, chunk.content, chunk.embeddingId || null);
    return chunkId;
  }

  getDocumentChunks(fileId: string): DocumentChunk[] {
    const stmt = this.db.prepare('SELECT * FROM document_chunks WHERE file_id = ? ORDER BY chunk_index');
    const rows = stmt.all(fileId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      fileId: row.file_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      embeddingId: row.embedding_id
    }));
  }

  deleteDocumentChunks(fileId: string): void {
    const stmt = this.db.prepare('DELETE FROM document_chunks WHERE file_id = ?');
    stmt.run(fileId);
  }

  close(): void {
    this.db.close();
  }

  // Health check
  isHealthy(): boolean {
    try {
      const stmt = this.db.prepare('SELECT 1');
      stmt.get();
      return true;
    } catch {
      return false;
    }
  }
}