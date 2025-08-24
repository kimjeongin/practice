// Re-export domain models for backward compatibility
export type { FileMetadata, CustomMetadata, DocumentChunk } from '@/domains/rag/core/models.js'
export type { SearchResult, SearchOptions } from '@/shared/types/interfaces.js'

export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required?: string[]
  }
}

export interface McpRequest {
  jsonrpc: string
  id: string | number
  method: string
  params?: any
}

export interface McpResponse {
  jsonrpc: string
  id: string | number
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export interface ServerConfig {
  documentsDir: string // 사용자 파일 디렉토리 (파일 워처 대상)
  dataDir: string // 시스템 파일 디렉토리 (벡터DB, 캐시 등)
  chunkSize: number
  chunkOverlap: number
  similarityTopK: number
  embeddingModel: string
  embeddingDevice: string
  logLevel: string
  // Embedding configuration
  embeddingService: string
  embeddingBatchSize: number
  embeddingDimensions: number
  similarityThreshold: number
  // Ollama configuration
  ollamaBaseUrl?: string
  // Transformers.js configuration
  transformersCacheDir?: string
  nodeEnv: string
}
