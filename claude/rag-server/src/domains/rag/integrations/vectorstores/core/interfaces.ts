import { VectorDocument, VectorSearchResult, VectorSearchOptions, IndexStats } from './types.js'

/**
 * Vector Store Provider Interface
 * 모든 벡터 데이터베이스 구현체가 따라야 하는 핵심 인터페이스
 */
export interface VectorStoreProvider {
  // 필수 메서드
  addDocuments(documents: VectorDocument[]): Promise<void>
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>
  deleteDocuments(ids: string[]): Promise<void>
  removeDocumentsByFileId(fileId: string): Promise<void>
  removeAllDocuments(): Promise<void>
  getIndexInfo(): IndexStats
  isHealthy(): boolean

  // 선택적 메서드 (provider에 따라 구현)
  getAllDocumentIds?(): string[]
  getDocumentCount?(): number
  hasDocumentsForFileId?(fileId: string): boolean
  getDocumentMetadata?(docId: string): Promise<any | null>

  // 고급 기능
  initialize?(): Promise<void>
  saveIndex?(): Promise<void>
  rebuildIndex?(): Promise<void>
  getIndexStats?(): {
    total: number
    occupied: number
    sparsity: number
    needsCompaction: boolean
  } | null
  compactIndex?(): Promise<void>
  autoCompactIfNeeded?(): Promise<boolean>

  // Provider 메타데이터
  capabilities?: VectorStoreCapabilities
}

/**
 * Vector Store Capabilities
 * 각 provider가 지원하는 기능을 명시
 */
export interface VectorStoreCapabilities {
  supportsMetadataFiltering: boolean
  supportsHybridSearch: boolean
  supportsReranking?: boolean
  supportsRealTimeUpdates?: boolean
  supportsBatchOperations?: boolean
  supportsIndexCompaction?: boolean
}
