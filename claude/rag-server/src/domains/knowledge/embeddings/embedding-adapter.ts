import { IEmbeddingService, ModelInfo } from '../../../shared/types/interfaces.js';
import { Embeddings } from '@langchain/core/embeddings';

export class EmbeddingAdapter implements IEmbeddingService {
  constructor(
    private langchainEmbeddings: Embeddings,
    private actualService: string
  ) {}

  async embedQuery(text: string): Promise<number[]> {
    return await this.langchainEmbeddings.embedQuery(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return await this.langchainEmbeddings.embedDocuments(texts);
  }

  getModelInfo(): ModelInfo {
    try {
      if ('getModelInfo' in this.langchainEmbeddings) {
        return (this.langchainEmbeddings as any).getModelInfo();
      }
      
      // Fallback model info
      return {
        name: 'Unknown Model',
        service: this.actualService,
        dimensions: 384, // Default dimensions
      };
    } catch (error) {
      console.warn('Could not get embedding model info:', error);
      return {
        name: 'Unknown Model',
        service: this.actualService,
        dimensions: 384,
      };
    }
  }

  // Proxy methods for additional functionality
  async switchModel(modelName: string): Promise<void> {
    if ('switchModel' in this.langchainEmbeddings) {
      await (this.langchainEmbeddings as any).switchModel(modelName);
    } else {
      throw new Error('Model switching not supported');
    }
  }

  async downloadModel(): Promise<void> {
    if ('downloadModel' in this.langchainEmbeddings) {
      await (this.langchainEmbeddings as any).downloadModel();
    } else {
      throw new Error('Model downloading not supported');
    }
  }

  async getCacheStats(): Promise<any> {
    if ('getCacheStats' in this.langchainEmbeddings) {
      return await (this.langchainEmbeddings as any).getCacheStats();
    }
    return { message: 'Cache stats not available' };
  }

  getDownloadProgress(): any {
    if ('getDownloadProgress' in this.langchainEmbeddings) {
      return (this.langchainEmbeddings as any).getDownloadProgress();
    }
    return {};
  }

  static getAvailableModels(): Record<string, any> {
    // This would be implemented based on the actual embedding service
    return {
      'all-MiniLM-L6-v2': { dimensions: 384, description: 'Small, fast model' },
      'all-MiniLM-L12-v2': { dimensions: 384, description: 'Larger, more accurate model' },
      'bge-small-en': { dimensions: 384, description: 'BGE small English model' },
      'bge-base-en': { dimensions: 768, description: 'BGE base English model' },
    };
  }
}