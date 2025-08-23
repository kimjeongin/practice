import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface SwitchEmbeddingModelArgs {
  modelName: string;
}

export interface DownloadModelArgs {
  modelName?: string;
}

export interface IModelManagementService {
  getAvailableModels(): Promise<Record<string, any>>;
  getCurrentModelInfo(): Promise<any>;
  switchEmbeddingModel(modelName: string): Promise<void>;
  downloadModel(modelName?: string): Promise<any>;
  getModelCacheInfo(): Promise<any>;
  getDownloadProgress(): Promise<any>;
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

  async handleGetCurrentModelInfo() {
    const currentModel = await this.modelService.getCurrentModelInfo();
    
    return {
      currentModel,
      status: 'active',
      usage: {
        changeModel: 'Use switch_embedding_model tool to change to a different model',
        listModels: 'Use list_available_models tool to see all available models',
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

  getTools(): Tool[] {
      return [{
            name: 'list_available_models',
            description: 'List all available embedding models with their specifications',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'get_current_model_info',
            description: 'Get information about the currently selected embedding model',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'switch_embedding_model',
            description: 'Switch to a different embedding model',
            inputSchema: {
              type: 'object',
              properties: {
                modelName: {
                  type: 'string',
                  description: 'The name of the model to switch to',
                  enum: ['all-MiniLM-L6-v2', 'all-MiniLM-L12-v2', 'bge-small-en', 'bge-base-en'],
                },
              },
              required: ['modelName'],
            },
          }
          ]    
    }
}