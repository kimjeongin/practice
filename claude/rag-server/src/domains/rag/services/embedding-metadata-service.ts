import { createHash } from 'crypto'
import { EmbeddingMetadataModel } from '../core/models.js'
import { ModelInfo } from '@/shared/types/interfaces.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { VectorStoreProvider } from '../integrations/vectorstores/adapter.js'
import { logger } from '@/shared/logger/index.js'

export interface ModelCompatibilityResult {
  isCompatible: boolean
  currentMetadata?: EmbeddingMetadataModel
  newConfig: ModelInfo
  requiresReindexing: boolean
  issues: string[]
}

/**
 * Embedding Metadata Service - VectorStore-only architecture
 * Manages embedding model compatibility and migration without database dependencies
 */
export class EmbeddingMetadataService {
  private readonly METADATA_KEY = 'embedding_metadata'

  constructor(private vectorStore: VectorStoreProvider) {}

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
   * Get metadata from VectorStore metadata
   */
  private async getStoredMetadata(): Promise<EmbeddingMetadataModel | null> {
    try {
      // Check if VectorStore supports metadata queries
      const indexInfo = this.vectorStore.getIndexInfo()
      if (!indexInfo || !indexInfo.totalVectors || indexInfo.totalVectors === 0) {
        return null
      }

      // For LanceDB/Qdrant, we'll store metadata in a special document
      // This is a simple approach - in production, you might use a dedicated metadata table
      const metadataResults = await this.vectorStore.search(this.METADATA_KEY, {
        topK: 1,
        scoreThreshold: 0.0,
        // Removed metadataFilters since LanceDB schema doesn't have 'type' field
        // Content search is sufficient since METADATA_KEY is unique
      })

      if (metadataResults.length > 0 && metadataResults[0]) {
        const metadata = metadataResults[0].metadata || {}
        return {
          id: metadata.id || 'vectorstore',
          modelName: metadata.modelName || '',
          serviceName: metadata.serviceName || '',
          dimensions: metadata.dimensions || 0,
          modelVersion: metadata.modelVersion || '',
          configHash: metadata.configHash || '',
          isActive: metadata.isActive || false,
          totalDocuments: metadata.totalDocuments || 0,
          totalVectors: metadata.totalVectors || 0,
          createdAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
          lastUsedAt: metadata.lastUsedAt ? new Date(metadata.lastUsedAt) : new Date(),
        }
      }

      return null
    } catch (error) {
      logger.debug('No stored metadata found in VectorStore', error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }

  /**
   * Store metadata to VectorStore
   */
  private async storeMetadata(metadata: EmbeddingMetadataModel): Promise<void> {
    try {
      const metadataDocument = {
        id: `metadata_${metadata.configHash}`,
        content: this.METADATA_KEY, // Searchable content
        metadata: {
          type: 'embedding_metadata',
          id: metadata.id,
          modelName: metadata.modelName,
          serviceName: metadata.serviceName,
          dimensions: metadata.dimensions,
          modelVersion: metadata.modelVersion,
          configHash: metadata.configHash,
          isActive: metadata.isActive,
          totalDocuments: metadata.totalDocuments,
          totalVectors: metadata.totalVectors,
          createdAt: metadata.createdAt.toISOString(),
          lastUsedAt: metadata.lastUsedAt.toISOString(),
        }
      }

      await this.vectorStore.addDocuments([metadataDocument])
      logger.debug('Stored embedding metadata to VectorStore', { configHash: metadata.configHash })
    } catch (error) {
      logger.warn('Failed to store metadata to VectorStore', error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Check compatibility between current config and existing metadata
   */
  async checkModelCompatibility(config: ServerConfig, modelInfo: ModelInfo): Promise<ModelCompatibilityResult> {
    try {
      const configHash = this.generateConfigHash(config, modelInfo)
      const activeMetadata = await this.getStoredMetadata()
      
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
      const existingMetadata = await this.getStoredMetadata()
      
      const metadataId = `metadata_${configHash}`
      const metadata: EmbeddingMetadataModel = {
        id: metadataId,
        modelName: modelInfo.name,
        serviceName: modelInfo.service,
        dimensions: modelInfo.dimensions,
        modelVersion: modelInfo.model || modelInfo.name,
        configHash,
        isActive: true,
        totalDocuments: vectorCounts.documents,
        totalVectors: vectorCounts.vectors,
        createdAt: existingMetadata?.createdAt || new Date(),
        lastUsedAt: new Date(),
      }

      // Store metadata to VectorStore
      await this.storeMetadata(metadata)
      
      if (existingMetadata) {
        logger.info('📝 Updated existing embedding metadata', {
          id: metadataId,
          model: modelInfo.name,
          service: modelInfo.service,
          dimensions: modelInfo.dimensions,
        })
      } else {
        logger.info('✅ Created new embedding metadata', {
          id: metadataId,
          model: modelInfo.name,
          service: modelInfo.service,
          dimensions: modelInfo.dimensions,
          configHash,
        })
      }
      
      return metadataId
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
      const activeMetadata = await this.getStoredMetadata()
      if (activeMetadata) {
        activeMetadata.totalDocuments = documents
        activeMetadata.totalVectors = vectors
        activeMetadata.lastUsedAt = new Date()
        
        await this.storeMetadata(activeMetadata)
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
    return await this.getStoredMetadata()
  }

  /**
   * Get all metadata history (simplified for VectorStore-only architecture)
   */
  async getAllMetadata(): Promise<EmbeddingMetadataModel[]> {
    const activeMetadata = await this.getStoredMetadata()
    return activeMetadata ? [activeMetadata] : []
  }

  /**
   * Force model migration by clearing VectorStore
   */
  async forceMigration(): Promise<void> {
    try {
      await this.vectorStore.removeAllDocuments()
      logger.info('🔄 Forced model migration - VectorStore cleared')
    } catch (error) {
      logger.error('Failed to force migration', error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Handle model migration based on compatibility check
   */
  async handleModelMigration(compatibility: ModelCompatibilityResult, config: ServerConfig): Promise<void> {
    if (!compatibility.isCompatible || compatibility.requiresReindexing) {
      logger.warn('🔄 Starting model migration', {
        issues: compatibility.issues,
        requiresReindexing: compatibility.requiresReindexing,
      })

      if (config.modelMigration.clearVectorsOnModelChange) {
        // Backup if enabled
        if (config.modelMigration.backupEmbeddingsBeforeMigration) {
          logger.info('💾 Backing up embeddings before migration (skipped in VectorStore-only architecture)')
        }

        // Clear VectorStore
        await this.forceMigration()
        logger.info('🗑️ Cleared VectorStore for model migration')
      }

      logger.info('✅ Model migration completed')
    }
  }
}