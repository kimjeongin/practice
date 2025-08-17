// Domain interfaces and types
export interface SearchOptions {
  topK?: number;
  fileTypes?: string[];
  metadataFilters?: Record<string, string>;
  useSemanticSearch?: boolean;
  useHybridSearch?: boolean;
  semanticWeight?: number;
  scoreThreshold?: number;
}

export interface SearchResult {
  content: string;
  score: number;
  semanticScore?: number;
  keywordScore?: number;
  hybridScore?: number;
  metadata: Record<string, any>;
  chunkIndex: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    fileId: string;
    fileName: string;
    filePath: string;
    chunkIndex: number;
    fileType: string;
    createdAt: string;
    [key: string]: any;
  };
}

export interface VectorSearchResult {
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export interface ModelInfo {
  name: string;
  service: string;
  dimensions: number;
  model?: string;
}

export interface IndexInfo {
  documentCount: number;
  indexPath?: string;
}

// Service interfaces
export interface ISearchService {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface IFileProcessingService {
  processFile(filePath: string): Promise<void>;
  removeFile(filePath: string): Promise<void>;
}

export interface IEmbeddingService {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
  getModelInfo(): ModelInfo;
}

export interface IVectorStoreService {
  addDocuments(documents: VectorDocument[]): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<VectorSearchResult[]>;
  removeDocumentsByFileId(fileId: string): Promise<void>;
  removeAllDocuments(): Promise<void>;
  getIndexInfo(): IndexInfo;
  isHealthy(): boolean;
  getAllDocumentIds?(): string[];
  getDocumentCount?(): number;
  hasDocumentsForFileId?(fileId: string): boolean;
  getDocumentMetadata?(docId: string): Promise<any | null>;
}