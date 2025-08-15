import { DatabaseManager } from '../../../infrastructure/database/connection.js';
import { FileMetadata, DocumentChunk } from '../models/models.js';

export interface IFileRepository {
  insertFile(file: Omit<FileMetadata, 'id'>): string;
  updateFile(id: string, updates: Partial<Omit<FileMetadata, 'id'>>): void;
  getFileByPath(path: string): FileMetadata | null;
  getFileById(id: string): FileMetadata | null;
  getAllFiles(): FileMetadata[];
  deleteFile(id: string): void;
  
  setFileMetadata(fileId: string, key: string, value: string): void;
  getFileMetadata(fileId: string): Record<string, string>;
  searchFilesByMetadata(key: string, value?: string): FileMetadata[];
}

export class FileRepository implements IFileRepository {
  constructor(private db: DatabaseManager) {}

  insertFile(file: Omit<FileMetadata, 'id'>): string {
    return this.db.insertFile(file);
  }

  updateFile(id: string, updates: Partial<Omit<FileMetadata, 'id'>>): void {
    this.db.updateFile(id, updates);
  }

  getFileByPath(path: string): FileMetadata | null {
    return this.db.getFileByPath(path);
  }

  getFileById(id: string): FileMetadata | null {
    return this.db.getFileById(id);
  }

  getAllFiles(): FileMetadata[] {
    return this.db.getAllFiles();
  }

  deleteFile(id: string): void {
    this.db.deleteFile(id);
  }

  setFileMetadata(fileId: string, key: string, value: string): void {
    this.db.setFileMetadata(fileId, key, value);
  }

  getFileMetadata(fileId: string): Record<string, string> {
    return this.db.getFileMetadata(fileId);
  }

  searchFilesByMetadata(key: string, value?: string): FileMetadata[] {
    return this.db.searchFilesByMetadata(key, value);
  }
}