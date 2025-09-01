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

// Direct LanceDB provider export
export { LanceDBProvider } from './providers/lancedb/index.js'
