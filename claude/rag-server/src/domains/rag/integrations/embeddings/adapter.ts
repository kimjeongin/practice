import { IEmbeddingService, ModelInfo } from '@/domains/rag/core/types.js'
import { Embeddings } from '@langchain/core/embeddings'
import { TransformersEmbeddings } from './providers/transformers.js'
import { OllamaEmbeddings } from './providers/ollama.js'

export class EmbeddingAdapter implements IEmbeddingService {
  constructor(private langchainEmbeddings: Embeddings, private actualService: string) {}

  async embedQuery(text: string): Promise<number[]> {
    return await this.langchainEmbeddings.embedQuery(text)
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return await this.langchainEmbeddings.embedDocuments(texts)
  }

  getModelInfo(): ModelInfo {
    try {
      if ('getModelInfo' in this.langchainEmbeddings) {
        const rawModelInfo = (this.langchainEmbeddings as any).getModelInfo()

        // Convert to standardized ModelInfo format
        return {
          name: rawModelInfo.model || rawModelInfo.name || 'Unknown Model',
          service: rawModelInfo.service || this.actualService,
          dimensions: rawModelInfo.dimensions || 384,
          model: rawModelInfo.model || rawModelInfo.name,
        }
      }

      // Fallback model info
      return {
        name: 'Unknown Model',
        service: this.actualService,
        dimensions: 384, // Default dimensions
        model: 'Unknown Model',
      }
    } catch (error) {
      console.warn('Could not get embedding model info:', error)
      return {
        name: 'Unknown Model',
        service: this.actualService,
        dimensions: 384,
        model: 'Unknown Model',
      }
    }
  }

  // Proxy methods for additional functionality
  async switchModel(modelName: string): Promise<void> {
    if ('switchModel' in this.langchainEmbeddings) {
      await (this.langchainEmbeddings as any).switchModel(modelName)
    } else {
      throw new Error('Model switching not supported')
    }
  }

  async downloadModel(): Promise<void> {
    if ('downloadModel' in this.langchainEmbeddings) {
      await (this.langchainEmbeddings as any).downloadModel()
    } else {
      throw new Error('Model downloading not supported')
    }
  }

  async getCacheStats(): Promise<any> {
    if ('getCacheStats' in this.langchainEmbeddings) {
      return await (this.langchainEmbeddings as any).getCacheStats()
    }
    return { message: 'Cache stats not available' }
  }

  getDownloadProgress(): any {
    if ('getDownloadProgress' in this.langchainEmbeddings) {
      return (this.langchainEmbeddings as any).getDownloadProgress()
    }
    return {}
  }

  async getAvailableModels(): Promise<Record<string, any>> {
    // Try to get models from the actual service first
    if ('getAvailableModels' in this.langchainEmbeddings) {
      try {
        return await (this.langchainEmbeddings as any).getAvailableModels()
      } catch (error) {
        console.warn('Could not get available models from service:', error)
      }
    }

    // Fallback to provider static methods
    try {
      if (this.actualService === 'transformers') {
        return TransformersEmbeddings.getAvailableModels()
      } else if (this.actualService === 'ollama') {
        return OllamaEmbeddings.getAvailableModels()
      }
    } catch (error) {
      console.warn('Could not get available models from provider:', error)
    }

    // Ultimate fallback
    return {
      'unknown-model': {
        dimensions: 384,
        description: 'Unknown model - check service configuration',
        modelId: 'unknown-model',
      },
    }
  }
}
