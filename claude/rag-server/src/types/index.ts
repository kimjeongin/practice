export interface FileMetadata {
  id: string;
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
  fileType: string;
  hash: string;
}

export interface CustomMetadata {
  fileId: string;
  key: string;
  value: string;
}

export interface DocumentChunk {
  id: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  embeddingId?: string;
}

export interface SearchResult {
  content: string;
  score: number;
  metadata: FileMetadata & { [key: string]: any };
  chunkIndex: number;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface McpResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ServerConfig {
  databasePath: string;
  dataDir: string;
  chunkSize: number;
  chunkOverlap: number;
  similarityTopK: number;
  embeddingModel: string;
  embeddingDevice: string;
  logLevel: string;
  // Vector DB configuration (for future ChromaDB integration)
  chromaServerUrl: string;
  chromaCollectionName: string;
  // Embedding configuration
  openaiApiKey?: string | undefined;
  embeddingService: string;
  embeddingBatchSize: number;
  embeddingDimensions: number;
  similarityThreshold: number;
  // Ollama configuration
  ollamaBaseUrl?: string;
}