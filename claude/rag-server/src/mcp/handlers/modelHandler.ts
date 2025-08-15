export interface SwitchEmbeddingModelArgs {
  modelName: string;
}

export interface DownloadModelArgs {
  modelName?: string;
}

export interface ForceReindexArgs {
  clearCache?: boolean;
}

export interface IModelManagementService {
  getAvailableModels(): Promise<Record<string, any>>;
  getCurrentModelInfo(): Promise<any>;
  switchEmbeddingModel(modelName: string): Promise<void>;
  downloadModel(modelName?: string): Promise<any>;
  getModelCacheInfo(): Promise<any>;
  getDownloadProgress(): Promise<any>;
  forceReindex(clearCache?: boolean): Promise<void>;
}

export class ModelHandler {
  constructor(private modelService: IModelManagementService) {}

  async handleListAvailableModels() {
    const availableModels = await this.modelService.getAvailableModels();
    const currentModel = await this.modelService.getCurrentModelInfo();

    return {
      currentModel,
      models: availableModels,
      usage: {
        switchModel: 'Use switch_embedding_model tool to change models',
        downloadModel: 'Use download_model tool to pre-download models',
      },
    };
  }

  async handleSwitchEmbeddingModel(args: SwitchEmbeddingModelArgs) {
    const { modelName } = args;
    
    if (!modelName) {
      throw new Error('modelName is required');
    }

    await this.modelService.switchEmbeddingModel(modelName);
    const newModelInfo = await this.modelService.getCurrentModelInfo();

    return {
      success: true,
      message: `Successfully switched to model: ${modelName}`,
      newModel: newModelInfo,
      note: 'Vector index will be rebuilt with the new model when documents are reprocessed',
    };
  }

  async handleDownloadModel(args: DownloadModelArgs) {
    const { modelName } = args;
    const result = await this.modelService.downloadModel(modelName);

    return {
      success: true,
      ...result,
    };
  }

  async handleGetModelCacheInfo() {
    return await this.modelService.getModelCacheInfo();
  }

  async handleGetDownloadProgress() {
    const progress = await this.modelService.getDownloadProgress();

    return {
      downloadProgress: progress,
      isDownloading: Object.keys(progress).length > 0,
    };
  }

  async handleForceReindex(args: ForceReindexArgs) {
    const { clearCache = false } = args;
    
    await this.modelService.forceReindex(clearCache);

    return {
      success: true,
      message: 'Force reindexing completed successfully',
      clearedCache: clearCache,
    };
  }
}