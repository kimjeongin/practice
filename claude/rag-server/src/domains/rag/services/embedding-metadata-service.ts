import { createHash } from 'crypto'
import { IEmbeddingMetadataRepository } from '../repositories/embedding-metadata.js'
import { EmbeddingMetadataModel } from '../core/models.js'
import { ModelInfo } from '@/shared/types/interfaces.js'
import { ServerConfig } from '@/shared/types/index.js'
import { logger } from '@/shared/logger/index.js'

export interface ModelCompatibilityResult {
  isCompatible: boolean
  currentMetadata?: EmbeddingMetadataModel
  newConfig: ModelInfo
  requiresReindexing: boolean
  issues: string[]
}

export class EmbeddingMetadataService {
  constructor(private embeddingMetadataRepository: IEmbeddingMetadataRepository) {}

  /**
   * Generate a unique hash for the current embedding configuration
   */
  private generateConfigHash(config: ServerConfig, modelInfo: ModelInfo): string {
    const configString = JSON.stringify({
      embeddingService: config.embeddingService,
      embeddingModel: config.embeddingModel,
      modelName: modelInfo.name,
      serviceName: modelInfo.service,
      dimensions: modelInfo.dimensions,
      modelVersion: modelInfo.model || modelInfo.name,
    })
    return createHash('sha256').update(configString).digest('hex').substring(0, 16)
  }

  /**
   * Check compatibility between current config and existing metadata
   */
  async checkModelCompatibility(config: ServerConfig, modelInfo: ModelInfo): Promise<ModelCompatibilityResult> {
    try {
      const configHash = this.generateConfigHash(config, modelInfo)
      const activeMetadata = await this.embeddingMetadataRepository.getActiveMetadata()
      
      logger.info('🔍 Checking model compatibility', {
        currentModel: modelInfo.name,
        currentService: modelInfo.service,
        currentDimensions: modelInfo.dimensions,
        configHash,
      })

      if (!activeMetadata) {
        // No existing metadata - this is a fresh setup
        logger.info('📝 No existing embedding metadata found - fresh setup')
        return {
          isCompatible: true,
          newConfig: modelInfo,
          requiresReindexing: false,
          issues: [],
        }
      }

      const issues: string[] = []
      let requiresReindexing = false
      let isCompatible = true

      // Check if configuration has changed
      if (activeMetadata.configHash !== configHash) {
        logger.warn('⚠️ Embedding configuration has changed')
        
        // Check specific compatibility issues
        if (activeMetadata.serviceName !== modelInfo.service) {
          issues.push(`Service changed: ${activeMetadata.serviceName} → ${modelInfo.service}`)
          requiresReindexing = true
        }

        if (activeMetadata.modelName !== modelInfo.name) {
          issues.push(`Model changed: ${activeMetadata.modelName} → ${modelInfo.name}`)
          requiresReindexing = true
        }

        if (activeMetadata.dimensions !== modelInfo.dimensions) {
          issues.push(`Dimensions changed: ${activeMetadata.dimensions} → ${modelInfo.dimensions}`)
          requiresReindexing = true
          isCompatible = false // Dimension changes are critical
        }

        if (requiresReindexing) {
          logger.warn('🔄 Model changes detected - reindexing required', { issues })
        }
      } else {
        logger.info('✅ Embedding configuration is compatible')
      }

      return {
        isCompatible,
        currentMetadata: activeMetadata,
        newConfig: modelInfo,
        requiresReindexing,
        issues,
      }

    } catch (error) {
      logger.error('❌ Failed to check model compatibility', error instanceof Error ? error : new Error(String(error)))
      return {
        isCompatible: false,
        newConfig: modelInfo,
        requiresReindexing: true,
        issues: ['Failed to check compatibility - assuming reindexing required'],
      }
    }
  }

  /**
   * Create or update embedding metadata
   */
  async createOrUpdateMetadata(config: ServerConfig, modelInfo: ModelInfo, vectorCounts: { documents: number; vectors: number } = { documents: 0, vectors: 0 }): Promise<string> {
    try {
      const configHash = this.generateConfigHash(config, modelInfo)
      
      // Check if metadata with this config already exists
      const existingMetadata = await this.embeddingMetadataRepository.getMetadataByConfigHash(configHash)
      
      if (existingMetadata) {
        // Update existing metadata
        await this.embeddingMetadataRepository.updateMetadata(existingMetadata.id, {
          isActive: true,
          totalDocuments: vectorCounts.documents,
          totalVectors: vectorCounts.vectors,
          lastUsedAt: new Date(),
        })
        
        // Deactivate other metadata
        const allMetadata = await this.embeddingMetadataRepository.getAllMetadata()
        for (const metadata of allMetadata) {
          if (metadata.id !== existingMetadata.id) {
            await this.embeddingMetadataRepository.updateMetadata(metadata.id, { isActive: false })
          }
        }
        
        logger.info('📝 Updated existing embedding metadata', {
          id: existingMetadata.id,
          model: modelInfo.name,
          service: modelInfo.service,
          dimensions: modelInfo.dimensions,
        })
        
        return existingMetadata.id
      } else {
        // Create new metadata
        await this.embeddingMetadataRepository.deactivateAllMetadata()
        
        const id = await this.embeddingMetadataRepository.createMetadata({
          modelName: modelInfo.name,
          serviceName: modelInfo.service,
          dimensions: modelInfo.dimensions,
          modelVersion: modelInfo.model || modelInfo.name,
          configHash,
          isActive: true,
          totalDocuments: vectorCounts.documents,
          totalVectors: vectorCounts.vectors,
        })
        
        logger.info('✅ Created new embedding metadata', {
          id,
          model: modelInfo.name,
          service: modelInfo.service,
          dimensions: modelInfo.dimensions,
          configHash,
        })
        
        return id
      }
    } catch (error) {
      logger.error('❌ Failed to create/update embedding metadata', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Update vector counts for active metadata
   */
  async updateVectorCounts(documents: number, vectors: number): Promise<void> {
    try {
      const activeMetadata = await this.embeddingMetadataRepository.getActiveMetadata()
      if (activeMetadata) {
        await this.embeddingMetadataRepository.updateMetadata(activeMetadata.id, {
          totalDocuments: documents,
          totalVectors: vectors,
          lastUsedAt: new Date(),
        })
        
        logger.debug('📊 Updated vector counts', { documents, vectors })
      }
    } catch (error) {
      logger.error('❌ Failed to update vector counts', error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Get current active metadata
   */
  async getActiveMetadata(): Promise<EmbeddingMetadataModel | null> {
    return await this.embeddingMetadataRepository.getActiveMetadata()
  }

  /**
   * Get all metadata history
   */
  async getAllMetadata(): Promise<EmbeddingMetadataModel[]> {
    return await this.embeddingMetadataRepository.getAllMetadata()
  }

  /**
   * Force model migration by deactivating current metadata
   */
  async forceMigration(): Promise<void> {
    await this.embeddingMetadataRepository.deactivateAllMetadata()
    logger.info('🔄 Forced model migration - all metadata deactivated')
  }
}