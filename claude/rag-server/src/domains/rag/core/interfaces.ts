/**
 * RAG Core Interfaces
 * Service interfaces for RAG components
 */

import type {
  SearchOptions,
  SearchResult,
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  SearchType,
  ModelInfo,
  EmbeddingModelInfo,
} from './types.js'

// Re-export types that are used in interfaces (removed unused ModelInfo)

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
  getModelInfo(): EmbeddingModelInfo
}

/**
 * Vector Store Provider Interface
 */
export interface IVectorStoreProvider {
  // Core operations
  addDocuments(documents: VectorDocument[]): Promise<void>
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>
  removeDocumentsByFileId(fileId: string): Promise<void>
  removeAllDocuments(): Promise<void>

  // Health and info
  isHealthy(): boolean
  getVectorStoreInfo(): Promise<any>

  getDocumentCount(): Promise<number>
  hasDocumentsForFileId(fileId: string): Promise<boolean>
  getAllFileMetadata(): Promise<Map<string, any>>
}

