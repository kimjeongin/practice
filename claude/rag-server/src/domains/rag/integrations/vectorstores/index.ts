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
  FaissConfig,
  QdrantConfig,
  VectorStoreConfig,
} from './core/types.js'

// Providers
export { FaissProvider } from './providers/faiss.js'
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
    case 'faiss':
      const { FaissProvider } = require('./providers/faiss.js')
      return new FaissProvider(config.config)

    case 'qdrant':
      const { QdrantProvider } = require('./providers/qdrant.js')
      return new QdrantProvider(config.config)

    default:
      throw new Error(`Unsupported vector store provider: ${config.provider}`)
  }
}
