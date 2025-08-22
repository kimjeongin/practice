/**
 * Vector Store Factory
 * 설정에 따라 적절한 Vector Store Provider를 생성합니다
 */

import { VectorStoreProvider } from '@/domains/rag/integrations/vectorstores/core/interfaces.js';
import { FaissProvider } from '@/domains/rag/integrations/vectorstores/providers/faiss.js';
import { QdrantProvider } from '@/domains/rag/integrations/vectorstores/providers/qdrant.js';
import { VectorStoreAdapter } from '@/domains/rag/integrations/vectorstores/adapter.js';
import { VectorStoreConfig } from './config-factory.js';
import { IVectorStoreService } from '@/shared/types/interfaces.js';

export class VectorStoreFactory {
  /**
   * 설정에 따라 VectorStoreProvider 생성
   */
  static createProvider(config: VectorStoreConfig): VectorStoreProvider {
    switch (config.provider.toLowerCase()) {
      case 'faiss':
        return new FaissProvider({
          indexPath: config.config.indexPath,
          dimensions: config.config.dimensions,
        });
      
      case 'qdrant':
        return new QdrantProvider({
          url: config.config.url,
          apiKey: config.config.apiKey,
          collectionName: config.config.collectionName,
          vectorSize: config.config.vectorSize,
          distance: config.config.distance,
        });
      
      default:
        throw new Error(`Unsupported vector store provider: ${config.provider}`);
    }
  }

  /**
   * 설정에 따라 VectorStoreAdapter 생성 (IVectorStoreService 호환)
   */
  static createService(config: VectorStoreConfig): IVectorStoreService {
    const provider = VectorStoreFactory.createProvider(config);
    return new VectorStoreAdapter(provider);
  }
}