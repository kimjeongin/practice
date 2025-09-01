/**
 * Vector Store Core Types
 * Single Source of Truth: RAGDocumentRecord 기반으로 통일
 */

import { RAGDocumentRecord } from '../providers/lancedb/simple-schema.js'

// VectorDocument는 RAGDocumentRecord와 동일하되, 추가 필드 포함
export interface VectorDocument extends RAGDocumentRecord {
  id: string           // chunk 레벨의 고유 ID (doc_id + chunk_id 조합)
  content: string      // text 필드의 별칭 (하위 호환성)
}

import { RAGSearchResult } from '../providers/lancedb/simple-schema.js'

// VectorSearchResult도 RAGSearchResult 기반으로 통일
export interface VectorSearchResult extends RAGSearchResult {
  id: string           // chunk 레벨의 고유 ID  
  content: string      // text 필드의 별칭
}

export interface VectorSearchOptions {
  topK?: number
  scoreThreshold?: number
  filter?: Record<string, any> | ((metadata: any) => boolean)
  fileTypes?: string[]
  metadataFilters?: Record<string, string>
}

export interface IndexStats {
  totalVectors: number
  dimensions: number
  indexSize?: number
  lastUpdated?: Date
}

/**
 * LanceDB Configuration
 */
export interface LanceDBConfig {
  uri?: string
  tableName?: string
  mode?: 'create' | 'overwrite' | 'append'
  enableFullTextSearch?: boolean
  indexColumns?: string[]
  storageOptions?: Record<string, any>
}

/**
 * Vector store configuration - LanceDB only
 */
export interface VectorStoreConfig {
  provider: 'lancedb' | string
  config: LanceDBConfig | Record<string, any>
}
