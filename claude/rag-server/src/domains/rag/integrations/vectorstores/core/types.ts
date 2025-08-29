/**
 * Vector Store Core Types
 */

export interface VectorDocument {
  id: string
  content: string
  metadata: Record<string, any>
  embedding?: number[]
}

export interface VectorSearchResult {
  id: string
  content: string
  metadata: Record<string, any>
  score: number
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
 * Provider-specific configurations
 */
export interface LanceDBConfig {
  uri?: string
  tableName?: string
  mode?: 'create' | 'overwrite' | 'append'
  enableFullTextSearch?: boolean
  indexColumns?: string[]
  storageOptions?: Record<string, any>
}

export interface QdrantConfig {
  url?: string
  apiKey?: string
  collectionName?: string
  vectorSize?: number
  distance?: string
  optimizersConfig?: any
  onDiskPayload?: boolean
}

/**
 * Common vector store configuration
 */
export interface VectorStoreConfig {
  provider: 'lancedb' | 'qdrant' | string
  config: LanceDBConfig | QdrantConfig | Record<string, any>
}
