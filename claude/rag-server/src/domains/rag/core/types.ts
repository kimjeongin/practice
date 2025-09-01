// Re-export domain models for backward compatibility
export type { FileMetadata, CustomMetadata, DocumentChunk } from './models.js'

// Search Types (consolidated from shared/types/interfaces.js and core/interfaces.ts)
export interface SearchOptions {
  topK?: number
  fileTypes?: string[]
  metadataFilters?: Record<string, string>
  searchType?: 'semantic' | 'hybrid' | 'keyword'
  useSemanticSearch?: boolean
  useHybridSearch?: boolean
  semanticWeight?: number
  scoreThreshold?: number
}

export interface SearchResult {
  content: string
  score: number
  semanticScore?: number
  keywordScore?: number
  hybridScore?: number
  metadata: Record<string, any>
  chunkIndex: number
}

// New unified VectorDocument and VectorSearchResult (re-export from vectorstore core)
export type { VectorDocument, VectorSearchResult } from '../integrations/vectorstores/core/types.js'

export interface ModelInfo {
  name: string
  service: string
  dimensions: number
  model?: string
}

export interface IndexInfo {
  documentCount: number
  indexPath?: string
}

// Service interfaces
export interface ISearchService {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}

export interface IFileProcessingService {
  processFile(filePath: string): Promise<void>
  removeFile(filePath: string): Promise<void>
}

export interface IEmbeddingService {
  embedQuery(text: string): Promise<number[]>
  embedDocuments(texts: string[]): Promise<number[][]>
  getModelInfo(): ModelInfo
}

// Import the types first
import type { VectorDocument, VectorSearchResult } from '../integrations/vectorstores/core/types.js'

export interface IVectorStoreService {
  addDocuments(documents: VectorDocument[]): Promise<void>
  search(query: string, options?: SearchOptions): Promise<VectorSearchResult[]>
  removeDocumentsByFileId(fileId: string): Promise<void>
  removeAllDocuments(): Promise<void>
  getIndexInfo(): IndexInfo
  isHealthy(): boolean
  getAllDocumentIds?(): string[]
  getDocumentCount?(): number
  hasDocumentsForFileId?(fileId: string): boolean
  getDocumentMetadata?(docId: string): Promise<any | null>
}
