/**
 * Vector Store Integration Exports
 */

// Core interfaces and types
export type { VectorStoreProvider, VectorStoreCapabilities } from './core/interfaces.js'
export type {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  IndexStats,
  LanceDBConfig,
  QdrantConfig,
  VectorStoreConfig,
} from './core/types.js'

// Providers
export { LanceDBProvider } from './providers/lancedb/index.js'
export { QdrantProvider } from './providers/qdrant.js'

// Universal adapter
export { VectorStoreAdapter } from './adapter.js'

// Provider factory utility
import { VectorStoreProvider } from './core/interfaces.js'

export function createVectorStoreProvider(config: {
  provider: string
  config?: any
}): VectorStoreProvider {
  switch (config.provider.toLowerCase()) {
    case 'lancedb':
      const { LanceDBProvider } = require('./providers/lancedb/index.js')
      return new LanceDBProvider(config.config)

    case 'qdrant':
      const { QdrantProvider } = require('./providers/qdrant.js')
      return new QdrantProvider(config.config)

    default:
      throw new Error(`Unsupported vector store provider: ${config.provider}`)
  }
}
