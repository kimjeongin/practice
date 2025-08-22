import { PrismaClient } from '@prisma/client';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { FileMetadata, DocumentChunk } from '@/shared/types/index.js';

export class DatabaseConnection {
  private prisma: PrismaClient;

  constructor() {
    // Ensure the database directory exists
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './.data/database/rag.db';
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    this.prisma = new PrismaClient();
  }

  // File operations
  async insertFile(file: Omit<FileMetadata, 'id'>): Promise<string> {
    const result = await this.prisma.file.create({
      data: {
        path: file.path,
        name: file.name,
        size: file.size,
        modifiedAt: file.modifiedAt,
        createdAt: file.createdAt,
        fileType: file.fileType,
        hash: file.hash,
      },
    });
    
    return result.id;
  }

  async updateFile(id: string, updates: Partial<Omit<FileMetadata, 'id'>>): Promise<void> {
    const data: any = {};
    
    if (updates.path) data.path = updates.path;
    if (updates.name) data.name = updates.name;
    if (updates.size !== undefined) data.size = updates.size;
    if (updates.modifiedAt) data.modifiedAt = updates.modifiedAt;
    if (updates.fileType) data.fileType = updates.fileType;
    if (updates.hash) data.hash = updates.hash;
    
    if (Object.keys(data).length > 0) {
      await this.prisma.file.update({
        where: { id },
        data,
      });
    }
  }

  async getFileByPath(path: string): Promise<FileMetadata | null> {
    const file = await this.prisma.file.findUnique({
      where: { path },
    });
    
    if (!file) return null;
    
    return {
      id: file.id,
      path: file.path,
      name: file.name,
      size: file.size,
      modifiedAt: file.modifiedAt,
      createdAt: file.createdAt,
      fileType: file.fileType,
      hash: file.hash,
    };
  }

  async getFileById(id: string): Promise<FileMetadata | null> {
    const file = await this.prisma.file.findUnique({
      where: { id },
    });
    
    if (!file) return null;
    
    return {
      id: file.id,
      path: file.path,
      name: file.name,
      size: file.size,
      modifiedAt: file.modifiedAt,
      createdAt: file.createdAt,
      fileType: file.fileType,
      hash: file.hash,
    };
  }

  async getAllFiles(): Promise<FileMetadata[]> {
    const files = await this.prisma.file.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    return files.map((file: any): FileMetadata => ({
      id: file.id,
      path: file.path,
      name: file.name,
      size: file.size,
      modifiedAt: file.modifiedAt,
      createdAt: file.createdAt,
      fileType: file.fileType,
      hash: file.hash,
    }));
  }

  async deleteFile(id: string): Promise<void> {
    await this.prisma.file.delete({
      where: { id },
    });
  }

  // Metadata operations
  async setFileMetadata(fileId: string, key: string, value: string): Promise<void> {
    await this.prisma.fileMetadata.upsert({
      where: {
        fileId_key: {
          fileId,
          key,
        },
      },
      update: { value },
      create: { fileId, key, value },
    });
  }

  async getFileMetadata(fileId: string): Promise<Record<string, string>> {
    const metadata = await this.prisma.fileMetadata.findMany({
      where: { fileId },
      select: { key: true, value: true },
    });
    
    const result: Record<string, string> = {};
    for (const item of metadata) {
      result[item.key] = item.value;
    }
    return result;
  }

  async searchFilesByMetadata(key: string, value?: string): Promise<FileMetadata[]> {
    const whereCondition = value ? { key, value } : { key };
    
    const files = await this.prisma.file.findMany({
      where: {
        metadata: {
          some: whereCondition,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return files.map((file: any): FileMetadata => ({
      id: file.id,
      path: file.path,
      name: file.name,
      size: file.size,
      modifiedAt: file.modifiedAt,
      createdAt: file.createdAt,
      fileType: file.fileType,
      hash: file.hash,
    }));
  }

  // Document chunk operations
  async insertDocumentChunk(chunk: Omit<DocumentChunk, 'id'>): Promise<string> {
    const result = await this.prisma.documentChunk.create({
      data: {
        fileId: chunk.fileId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embeddingId: chunk.embeddingId || null,
      },
    });
    
    return result.id;
  }

  async getDocumentChunks(fileId: string): Promise<DocumentChunk[]> {
    const chunks = await this.prisma.documentChunk.findMany({
      where: { fileId },
      orderBy: { chunkIndex: 'asc' },
    });
    
    return chunks.map((chunk: any): DocumentChunk => ({
      id: chunk.id,
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embeddingId: chunk.embeddingId || undefined,
    }));
  }

  async deleteDocumentChunks(fileId: string): Promise<void> {
    await this.prisma.documentChunk.deleteMany({
      where: { fileId },
    });
  }

  async deleteAllDocumentChunks(): Promise<void> {
    await this.prisma.documentChunk.deleteMany({});
  }

  async getTotalChunkCount(): Promise<number> {
    return await this.prisma.documentChunk.count();
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}