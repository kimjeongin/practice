/**
 * Vector Store Core Types
 */

export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
}

export interface VectorSearchOptions {
  topK?: number;
  scoreThreshold?: number;
  filter?: Record<string, any> | ((metadata: any) => boolean);
  fileTypes?: string[];
  metadataFilters?: Record<string, string>;
}

export interface IndexStats {
  totalVectors: number;
  dimensions: number;
  indexSize?: number;
  lastUpdated?: Date;
}

/**
 * Provider-specific configurations
 */
export interface FaissConfig {
  indexType?: string;
  metric?: string;
  indexPath?: string;
  dimensions?: number;
}

export interface QdrantConfig {
  url?: string;
  apiKey?: string;
  collectionName?: string;
  vectorSize?: number;
  distance?: string;
  optimizersConfig?: any;
  onDiskPayload?: boolean;
}

/**
 * Common vector store configuration
 */
export interface VectorStoreConfig {
  provider: 'faiss' | 'qdrant' | string;
  config: FaissConfig | QdrantConfig | Record<string, any>;
}