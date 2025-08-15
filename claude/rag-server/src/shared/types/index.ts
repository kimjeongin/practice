// Re-export domain models for backward compatibility
export type { FileMetadata, CustomMetadata, DocumentChunk } from '../../domains/documents/models/models.js';
export type { SearchResult, SearchOptions } from './interfaces.js';

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
  // Transformers.js configuration
  transformersCacheDir?: string;
  nodeEnv: string;
}