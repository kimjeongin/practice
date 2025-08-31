import { IEmbeddingService } from '@/domains/rag/core/types.js'
import { logger } from '@/shared/logger/index.js'

interface IModelManagementService {
  getAvailableModels(): Promise<Record<string, any>>
  getCurrentModelInfo(): Promise<any>
  switchEmbeddingModel(modelName: string): Promise<void>
  downloadModel(modelName?: string): Promise<any>
  getModelCacheInfo(): Promise<any>
  getDownloadProgress(): Promise<any>
}

export class ModelManagementService implements IModelManagementService {
  constructor(private embeddingService: IEmbeddingService) {}

  async getAvailableModels(): Promise<Record<string, any>> {
    try {
      if ('getAvailableModels' in this.embeddingService) {
        return (this.embeddingService as any).getAvailableModels()
      }
      return {}
    } catch (error) {
      logger.error('Error getting available models:', error instanceof Error ? error : new Error(String(error)))
      return {}
    }
  }

  async getCurrentModelInfo(): Promise<any> {
    try {
      return this.embeddingService.getModelInfo()
    } catch (error) {
      logger.error('Error getting current model info:', error instanceof Error ? error : new Error(String(error)))
      return { error: 'Could not get model info' }
    }
  }

  async switchEmbeddingModel(modelName: string): Promise<void> {
    try {
      if ('switchModel' in this.embeddingService) {
        await (this.embeddingService as any).switchModel(modelName)
        logger.info(`✅ Successfully switched to model: ${modelName}`)
      } else {
        throw new Error('Model switching not supported for current embedding service')
      }
    } catch (error) {
      logger.error('Error switching model:', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  async downloadModel(modelName?: string): Promise<any> {
    try {
      if ('downloadModel' in this.embeddingService) {
        if (modelName && 'switchModel' in this.embeddingService) {
          await (this.embeddingService as any).switchModel(modelName)
        }
        await (this.embeddingService as any).downloadModel()
        return {
          message: `Model ${modelName || 'current'} downloaded successfully`,
          modelName: modelName || 'current',
        }
      } else {
        throw new Error('Model downloading not supported for current embedding service')
      }
    } catch (error) {
      logger.error('Error downloading model:', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  async getModelCacheInfo(): Promise<any> {
    try {
      if ('getCacheStats' in this.embeddingService) {
        return await (this.embeddingService as any).getCacheStats()
      }
      return { message: 'Cache info not available for current embedding service' }
    } catch (error) {
      logger.error('Error getting cache info:', error instanceof Error ? error : new Error(String(error)))
      return { error: 'Could not get cache info' }
    }
  }

  async getDownloadProgress(): Promise<any> {
    try {
      if ('getDownloadProgress' in this.embeddingService) {
        return (this.embeddingService as any).getDownloadProgress()
      }
      return {}
    } catch (error) {
      logger.error('Error getting download progress:', error instanceof Error ? error : new Error(String(error)))
      return {}
    }
  }
}