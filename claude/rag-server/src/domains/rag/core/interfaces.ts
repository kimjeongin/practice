/**
 * RAG Core Interfaces
 * Service interfaces for RAG components
 */

import type {
  SearchOptions,
  SearchResult,
  VectorDocument,
  VectorSearchResult,
  ModelInfo,
  IndexInfo,
} from './types.js'

// Re-export types that are used in interfaces
export type { ModelInfo, IndexInfo } from './types.js'

/**
 * Search Service Interface
 */
export interface ISearchService {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}

/**
 * File Processing Service Interface
 */
export interface IFileProcessingService {
  processFile(filePath: string): Promise<void>
  removeFile(filePath: string): Promise<void>
}

/**
 * Embedding Service Interface
 */
export interface IEmbeddingService {
  embedQuery(text: string): Promise<number[]>
  embedDocuments(texts: string[]): Promise<number[][]>
  getModelInfo(): ModelInfo
}

/**
 * Vector Store Provider Interface
 */
export interface IVectorStoreProvider {
  // Core operations
  addDocuments(documents: VectorDocument[]): Promise<void>
  search(query: string, options?: any): Promise<VectorSearchResult[]>
  removeDocumentsByFileId(fileId: string): Promise<void>
  removeAllDocuments(): Promise<void>

  // Health and info
  isHealthy(): boolean
  getIndexStats(): Promise<any>

  getDocumentCount(): Promise<number>
  hasDocumentsForFileId(fileId: string): Promise<boolean>
  getAllFileMetadata(): Promise<Map<string, any>>
}

/**
 * Vector Store Capabilities
 */
export interface VectorStoreCapabilities {
  supportsHybridSearch: boolean
  supportsMetadataFiltering: boolean
  supportsFullTextSearch: boolean
  maxVectorDimensions: number
  supportedDistanceMetrics: string[]
}
