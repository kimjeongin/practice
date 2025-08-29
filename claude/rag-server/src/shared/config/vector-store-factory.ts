/**
 * Vector Store Factory
 * 설정에 따라 적절한 Vector Store Provider를 생성합니다
 */

import { VectorStoreProvider } from '@/domains/rag/integrations/vectorstores/core/interfaces.js'
import { QdrantProvider } from '@/domains/rag/integrations/vectorstores/providers/qdrant.js'
import { LanceDBProvider } from '@/domains/rag/integrations/vectorstores/providers/lancedb/index.js'
import { VectorStoreAdapter } from '@/domains/rag/integrations/vectorstores/adapter.js'
import { VectorStoreConfig } from './config-factory.js'
import { IVectorStoreService } from '@/shared/types/interfaces.js'
export class VectorStoreFactory {
  /**
   * 설정에 따라 VectorStoreProvider 생성
   */
  static createProvider(config: VectorStoreConfig, serverConfig?: any): VectorStoreProvider {
    switch (config.provider.toLowerCase()) {
      case 'lancedb':
        return new LanceDBProvider(
          serverConfig,
          {
            uri: config.config.uri || './.data/lancedb',
            storageOptions: config.config.storageOptions || {}
          },
          {
            // 스키마 설정은 LanceDBProvider 내부에서 schema-config.ts를 통해 관리
          }
        )

      case 'qdrant':
        return new QdrantProvider({
          url: config.config.url,
          apiKey: config.config.apiKey,
          collectionName: config.config.collectionName,
          vectorSize: config.config.vectorSize,
          distance: config.config.distance,
        })

      default:
        throw new Error(`Unsupported vector store provider: ${config.provider}. Supported providers: lancedb, qdrant`)
    }
  }

  /**
   * 설정에 따라 VectorStoreAdapter 생성 (IVectorStoreService 호환)
   */
  static createService(config: VectorStoreConfig, serverConfig?: any): IVectorStoreService {
    const provider = VectorStoreFactory.createProvider(config, serverConfig)
    return new VectorStoreAdapter(provider)
  }
}
