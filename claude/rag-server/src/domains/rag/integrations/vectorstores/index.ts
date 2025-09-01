/**
 * Vector Store Integration Exports - LanceDB Only
 */

// Core interfaces and types
export type { VectorStoreProvider, VectorStoreCapabilities } from './core/interfaces.js'
export type {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  IndexStats,
  LanceDBConfig,
  VectorStoreConfig,
} from './core/types.js'

// Providers
export { LanceDBProvider } from './providers/lancedb/index.js'

// Universal adapter
export { VectorStoreAdapter } from './adapter.js'

// Provider factory utility
import { VectorStoreProvider } from './core/interfaces.js'
import { VectorStoreAdapter } from './adapter.js'
import { LanceDBProvider } from './providers/lancedb/index.js'
import { IVectorStoreService } from '../../core/types.js'
import { VectorStoreConfig } from './core/types.js'

/**
 * Vector Store Factory - RAG 도메인 통합 팩토리
 * 기존 shared/config/vector-store-factory.ts 기능을 통합
 */
export class VectorStoreFactory {
  /**
   * LanceDB Provider 생성
   */
  static createProvider(config: VectorStoreConfig, serverConfig?: any): VectorStoreProvider {
    return new LanceDBProvider(
      serverConfig,
      {
        uri: config.config.uri || './.data/lancedb',
        storageOptions: config.config.storageOptions || {}
      },
      'documents' // 테이블 이름
    )
  }

  /**
   * VectorStoreAdapter 생성 (IVectorStoreService 호환)
   */
  static createService(config: VectorStoreConfig, serverConfig?: any): IVectorStoreService {
    const provider = VectorStoreFactory.createProvider(config, serverConfig)
    return new VectorStoreAdapter(provider)
  }
}

// 레거시 함수 (하위 호환성)
export function createVectorStoreProvider(config: {
  provider: string
  config?: any
}): VectorStoreProvider {
  return new LanceDBProvider(config.config)
}
