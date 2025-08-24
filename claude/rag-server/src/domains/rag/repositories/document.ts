import { DatabaseConnection } from '@/shared/database/connection.js'
import { FileMetadata, DocumentChunk } from '../core/models.js'

export interface IFileRepository {
  insertFile(file: Omit<FileMetadata, 'id'>): Promise<string>
  updateFile(id: string, updates: Partial<Omit<FileMetadata, 'id'>>): Promise<void>
  getFileByPath(path: string): Promise<FileMetadata | null>
  getFileById(id: string): Promise<FileMetadata | null>
  getAllFiles(): Promise<FileMetadata[]>
  deleteFile(id: string): Promise<void>

  setFileMetadata(fileId: string, key: string, value: string): Promise<void>
  getFileMetadata(fileId: string): Promise<Record<string, string>>
  searchFilesByMetadata(key: string, value?: string): Promise<FileMetadata[]>
}

export class FileRepository implements IFileRepository {
  constructor(private db: DatabaseConnection) {}

  async insertFile(file: Omit<FileMetadata, 'id'>): Promise<string> {
    return await this.db.insertFile(file)
  }

  async updateFile(id: string, updates: Partial<Omit<FileMetadata, 'id'>>): Promise<void> {
    await this.db.updateFile(id, updates)
  }

  async getFileByPath(path: string): Promise<FileMetadata | null> {
    return await this.db.getFileByPath(path)
  }

  async getFileById(id: string): Promise<FileMetadata | null> {
    return await this.db.getFileById(id)
  }

  async getAllFiles(): Promise<FileMetadata[]> {
    return await this.db.getAllFiles()
  }

  async deleteFile(id: string): Promise<void> {
    await this.db.deleteFile(id)
  }

  async setFileMetadata(fileId: string, key: string, value: string): Promise<void> {
    await this.db.setFileMetadata(fileId, key, value)
  }

  async getFileMetadata(fileId: string): Promise<Record<string, string>> {
    return await this.db.getFileMetadata(fileId)
  }

  async searchFilesByMetadata(key: string, value?: string): Promise<FileMetadata[]> {
    return await this.db.searchFilesByMetadata(key, value)
  }
}
