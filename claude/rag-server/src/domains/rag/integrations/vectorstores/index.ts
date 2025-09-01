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
// VectorStoreConfig 제거됨 - LanceDB 전용 설정은 provider에서 직접 관리

/**
 * Vector Store Factory - RAG 도메인 통합 팩토리
 * 기존 shared/config/vector-store-factory.ts 기능을 통합
 */
export class VectorStoreFactory {
  /**
   * LanceDB Provider 생성 (간소화)
   */
  static createProvider(serverConfig?: any, options?: {uri?: string, tableName?: string}): VectorStoreProvider {
    return new LanceDBProvider(
      serverConfig,
      {
        uri: options?.uri || './.data/lancedb',
        storageOptions: { timeout: '30s' }
      },
      options?.tableName || 'documents'
    )
  }

  /**
   * VectorStoreAdapter 생성 (IVectorStoreService 호환)
   */
  static createService(serverConfig?: any, options?: {uri?: string, tableName?: string}): IVectorStoreService {
    const provider = VectorStoreFactory.createProvider(serverConfig, options)
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
