import { IModelManagementService } from '../handlers/model-handler.js';
import { IEmbeddingService, IVectorStoreService } from '../domain/interfaces.js';
import { IFileProcessingService } from '../domain/interfaces.js';
import { IFileRepository } from '../repositories/file-repository.js';

export class ModelManagementService implements IModelManagementService {
  constructor(
    private embeddingService: IEmbeddingService,
    private vectorStoreService: IVectorStoreService,
    private fileProcessingService: IFileProcessingService,
    private fileRepository: IFileRepository
  ) {}

  async getAvailableModels(): Promise<Record<string, any>> {
    try {
      if ('getAvailableModels' in this.embeddingService) {
        return (this.embeddingService as any).getAvailableModels();
      }
      return {};
    } catch (error) {
      console.error('Error getting available models:', error);
      return {};
    }
  }

  async getCurrentModelInfo(): Promise<any> {
    try {
      return this.embeddingService.getModelInfo();
    } catch (error) {
      console.error('Error getting current model info:', error);
      return { error: 'Could not get model info' };
    }
  }

  async switchEmbeddingModel(modelName: string): Promise<void> {
    try {
      if ('switchModel' in this.embeddingService) {
        await (this.embeddingService as any).switchModel(modelName);
        console.log(`✅ Successfully switched to model: ${modelName}`);
      } else {
        throw new Error('Model switching not supported for current embedding service');
      }
    } catch (error) {
      console.error('Error switching model:', error);
      throw error;
    }
  }

  async downloadModel(modelName?: string): Promise<any> {
    try {
      if ('downloadModel' in this.embeddingService) {
        if (modelName && 'switchModel' in this.embeddingService) {
          await (this.embeddingService as any).switchModel(modelName);
        }
        await (this.embeddingService as any).downloadModel();
        return {
          message: `Model ${modelName || 'current'} downloaded successfully`,
          modelName: modelName || 'current'
        };
      } else {
        throw new Error('Model downloading not supported for current embedding service');
      }
    } catch (error) {
      console.error('Error downloading model:', error);
      throw error;
    }
  }

  async getModelCacheInfo(): Promise<any> {
    try {
      if ('getCacheStats' in this.embeddingService) {
        return await (this.embeddingService as any).getCacheStats();
      }
      return { message: 'Cache info not available for current embedding service' };
    } catch (error) {
      console.error('Error getting cache info:', error);
      return { error: 'Could not get cache info' };
    }
  }

  async getDownloadProgress(): Promise<any> {
    try {
      if ('getDownloadProgress' in this.embeddingService) {
        return (this.embeddingService as any).getDownloadProgress();
      }
      return {};
    } catch (error) {
      console.error('Error getting download progress:', error);
      return {};
    }
  }

  async forceReindex(clearCache: boolean = false): Promise<void> {
    console.log('🔄 Force reindexing all files...');
    
    try {
      // Clear vector cache if requested
      if (clearCache) {
        console.log('🗑️ Clearing vector cache...');
        if ('rebuildIndex' in this.vectorStoreService) {
          await (this.vectorStoreService as any).rebuildIndex();
        }
      }
      
      // Reprocess all files
      const allFiles = this.fileRepository.getAllFiles();
      for (const file of allFiles) {
        await this.fileProcessingService.processFile(file.path);
      }
      
      console.log('✅ Force reindexing completed');
    } catch (error) {
      console.error('❌ Error during force reindex:', error);
      throw error;
    }
  }
}