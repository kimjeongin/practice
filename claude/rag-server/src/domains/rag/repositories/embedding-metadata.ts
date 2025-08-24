import { DatabaseConnection } from '@/shared/database/connection.js'
import { EmbeddingMetadataModel } from '../core/models.js'

export interface IEmbeddingMetadataRepository {
  createMetadata(metadata: Omit<EmbeddingMetadataModel, 'id' | 'createdAt' | 'lastUsedAt'>): Promise<string>
  getActiveMetadata(): Promise<EmbeddingMetadataModel | null>
  getMetadataByConfigHash(configHash: string): Promise<EmbeddingMetadataModel | null>
  updateMetadata(id: string, updates: Partial<EmbeddingMetadataModel>): Promise<void>
  deactivateAllMetadata(): Promise<void>
  getAllMetadata(): Promise<EmbeddingMetadataModel[]>
  deleteMetadata(id: string): Promise<void>
}

export class EmbeddingMetadataRepository implements IEmbeddingMetadataRepository {
  constructor(private db: DatabaseConnection) {}

  async createMetadata(metadata: Omit<EmbeddingMetadataModel, 'id' | 'createdAt' | 'lastUsedAt'>): Promise<string> {
    return await this.db.createEmbeddingMetadata(metadata)
  }

  async getActiveMetadata(): Promise<EmbeddingMetadataModel | null> {
    return await this.db.getActiveEmbeddingMetadata()
  }

  async getMetadataByConfigHash(configHash: string): Promise<EmbeddingMetadataModel | null> {
    return await this.db.getEmbeddingMetadataByConfigHash(configHash)
  }

  async updateMetadata(id: string, updates: Partial<EmbeddingMetadataModel>): Promise<void> {
    await this.db.updateEmbeddingMetadata(id, updates)
  }

  async deactivateAllMetadata(): Promise<void> {
    await this.db.deactivateAllEmbeddingMetadata()
  }

  async getAllMetadata(): Promise<EmbeddingMetadataModel[]> {
    return await this.db.getAllEmbeddingMetadata()
  }

  async deleteMetadata(id: string): Promise<void> {
    await this.db.deleteEmbeddingMetadata(id)
  }
}