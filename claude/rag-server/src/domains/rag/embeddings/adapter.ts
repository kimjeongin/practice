/**
 * Embedding Adapter
 * Adapter to connect LangChain embeddings with our service interface
 */

import type { IEmbeddingService, ModelInfo } from '@/domains/rag/core/interfaces.js'
import { Embeddings } from '@langchain/core/embeddings'
import { logger } from '@/shared/logger/index.js'

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
      logger.warn('Could not get embedding model info:', error instanceof Error ? error : new Error(String(error)))
      return {
        name: 'Unknown Model',
        service: this.actualService,
        dimensions: 384,
        model: 'Unknown Model',
      }
    }
  }

  // Proxy method for getting dimensions directly from service
  getDimensions(): number {
    try {
      if ('getDimensions' in this.langchainEmbeddings) {
        return (this.langchainEmbeddings as any).getDimensions()
      }
      return this.getModelInfo().dimensions
    } catch (error) {
      logger.warn('Could not get embedding dimensions:', error instanceof Error ? error : new Error(String(error)))
      return 384 // Default fallback
    }
  }

  // Proxy method for batch size optimization
  getOptimalBatchSize(): number {
    try {
      if ('getBatchSize' in this.langchainEmbeddings) {
        return (this.langchainEmbeddings as any).getBatchSize()
      }
      return 10 // Default batch size
    } catch (error) {
      logger.warn('Could not get optimal batch size:', error instanceof Error ? error : new Error(String(error)))
      return 10
    }
  }

  // Health check for the embedding service
  async isHealthy(): Promise<boolean> {
    try {
      // Test with a simple query
      const testEmbedding = await this.embedQuery('test')
      return Array.isArray(testEmbedding) && testEmbedding.length > 0
    } catch (error) {
      logger.error('Embedding service health check failed:', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }
}