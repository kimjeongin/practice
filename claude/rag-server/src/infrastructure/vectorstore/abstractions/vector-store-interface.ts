/**
 * Vector Store Abstraction Layer
 * Unified interface for multiple vector database providers (2025)
 */

export interface VectorMetadata {
  fileId: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  fileType: string;
  createdAt: string;
  embeddingId?: string;
  [key: string]: any;
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: VectorMetadata;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorSearchOptions {
  topK?: number;
  scoreThreshold?: number;
  filter?: VectorFilter;
  hybridSearch?: {
    enabled: boolean;
    alpha?: number; // Weight for vector vs keyword search
  };
  rerank?: {
    enabled: boolean;
    model?: string;
  };
}

export interface VectorFilter {
  // Metadata-based filters
  metadata?: Record<string, any>;
  
  // File type filters
  fileTypes?: string[];
  
  // Date range filters
  dateRange?: {
    field: string;
    from?: string;
    to?: string;
  };
  
  // Custom filter function (for complex logic)
  custom?: (metadata: VectorMetadata) => boolean;
}

export interface IndexStats {
  totalVectors: number;
  dimensions: number;
  indexSize: number; // in bytes
  lastUpdated: Date;
}

export interface VectorStoreCapabilities {
  supportsMetadataFiltering: boolean;
  supportsHybridSearch: boolean;
  supportsReranking: boolean;
  supportsRealTimeUpdates: boolean;
  supportsBatchOperations: boolean;
  supportsScaling: boolean;
  maxDimensions: number;
  maxVectorsPerCollection?: number;
}

/**
 * Core interface that all vector store providers must implement
 */
export abstract class VectorStoreProvider {
  abstract readonly name: string;
  abstract readonly capabilities: VectorStoreCapabilities;

  // Core operations
  abstract initialize(): Promise<void>;
  abstract isInitialized(): boolean;
  abstract getStatus(): Promise<'healthy' | 'degraded' | 'unhealthy'>;

  // Document operations
  abstract addDocuments(documents: VectorDocument[]): Promise<void>;
  abstract updateDocument(id: string, document: Partial<VectorDocument>): Promise<void>;
  abstract deleteDocument(id: string): Promise<void>;
  abstract deleteDocuments(ids: string[]): Promise<void>;

  // Search operations  
  abstract search(query: string | number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  abstract similaritySearch(embedding: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  
  // Hybrid search (if supported)
  abstract hybridSearch?(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;

  // Index management
  abstract getIndexStats(): Promise<IndexStats>;
  abstract rebuildIndex(): Promise<void>;
  abstract clearIndex(): Promise<void>;

  // Lifecycle
  abstract close(): Promise<void>;

  // Utility methods
  protected validateDocument(document: VectorDocument): void {
    if (!document.id) {
      throw new Error('Document ID is required');
    }
    if (!document.content) {
      throw new Error('Document content is required');
    }
    if (!document.metadata) {
      throw new Error('Document metadata is required');
    }
    if (!document.metadata.fileId) {
      throw new Error('Document metadata must include fileId');
    }
  }

  protected validateSearchOptions(options?: VectorSearchOptions): VectorSearchOptions {
    return {
      topK: Math.max(1, Math.min(options?.topK || 10, 100)),
      scoreThreshold: Math.max(0, Math.min(options?.scoreThreshold || 0, 1)),
      filter: options?.filter,
      hybridSearch: options?.hybridSearch,
      rerank: options?.rerank,
    };
  }
}

/**
 * Configuration interfaces for different providers
 */
export interface FaissConfig {
  indexPath: string;
  indexType?: 'flat' | 'ivf' | 'hnsw';
  nlist?: number; // For IVF indices
  efConstruction?: number; // For HNSW indices
  efSearch?: number; // For HNSW indices
}

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  distance?: 'cosine' | 'euclidean' | 'dot';
  onDiskPayload?: boolean;
  optimizersConfig?: {
    deletedThreshold?: number;
    vacuumMinVectorNumber?: number;
    defaultSegmentNumber?: number;
  };
}

export interface WeaviateConfig {
  url: string;
  apiKey?: string;
  className: string;
  vectorizer?: string;
  moduleConfig?: Record<string, any>;
  additionalHeaders?: Record<string, string>;
}

export interface ChromaConfig {
  url?: string;
  collectionName: string;
  persistentClient?: boolean;
  settings?: {
    chroma_db_impl?: string;
    chroma_api_impl?: string;
    chroma_sysdb_impl?: string;
  };
}

/**
 * Factory for creating vector store providers
 */
export type VectorStoreConfig = {
  provider: 'faiss';
  config: FaissConfig;
} | {
  provider: 'qdrant';
  config: QdrantConfig;
} | {
  provider: 'weaviate';
  config: WeaviateConfig;
} | {
  provider: 'chroma';
  config: ChromaConfig;
};

export abstract class VectorStoreFactory {
  static async createProvider(config: VectorStoreConfig): Promise<VectorStoreProvider> {
    switch (config.provider) {
      case 'faiss':
        const { FaissProvider } = await import('../providers/faiss-provider.js');
        return new FaissProvider(config.config, {} as any);
      
      case 'qdrant':
        const { QdrantProvider } = await import('../providers/qdrant-provider.js');
        return new QdrantProvider(config.config as any);
      
      case 'weaviate':
        // const { WeaviateProvider } = await import('../providers/weaviate-provider.js');
        // return new WeaviateProvider(config.config);
        throw new Error('Weaviate provider not implemented yet');
      
      case 'chroma':
        // const { ChromaProvider } = await import('../providers/chroma-provider.js');
        // return new ChromaProvider(config.config);
        throw new Error('Chroma provider not implemented yet');
      
      default:
        throw new Error(`Unsupported vector store provider: ${(config as any).provider}`);
    }
  }

  static getSupportedProviders(): string[] {
    return ['faiss', 'qdrant', 'weaviate', 'chroma'];
  }

  static getProviderCapabilities(provider: string): VectorStoreCapabilities {
    switch (provider) {
      case 'faiss':
        return {
          supportsMetadataFiltering: true,
          supportsHybridSearch: false,
          supportsReranking: false,
          supportsRealTimeUpdates: false,
          supportsBatchOperations: true,
          supportsScaling: false,
          maxDimensions: 65536,
        };
      
      case 'qdrant':
        return {
          supportsMetadataFiltering: true,
          supportsHybridSearch: true,
          supportsReranking: true,
          supportsRealTimeUpdates: true,
          supportsBatchOperations: true,
          supportsScaling: true,
          maxDimensions: 65536,
          maxVectorsPerCollection: undefined, // Unlimited
        };
      
      case 'weaviate':
        return {
          supportsMetadataFiltering: true,
          supportsHybridSearch: true,
          supportsReranking: true,
          supportsRealTimeUpdates: true,
          supportsBatchOperations: true,
          supportsScaling: true,
          maxDimensions: 65536,
        };
      
      case 'chroma':
        return {
          supportsMetadataFiltering: true,
          supportsHybridSearch: false,
          supportsReranking: false,
          supportsRealTimeUpdates: true,
          supportsBatchOperations: true,
          supportsScaling: false,
          maxDimensions: 1536,
          maxVectorsPerCollection: 100000000, // 100M
        };
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}