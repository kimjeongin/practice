// Shared types for cross-domain compatibility
// Re-export common types for backward compatibility
export type { FileMetadata, CustomMetadata, DocumentChunk } from '@/domains/rag/core/models.js'
export type { 
  SearchResult, 
  SearchOptions, 
  VectorDocument, 
  VectorSearchResult, 
  ModelInfo, 
  IndexInfo,
  ISearchService,
  IFileProcessingService,
  IEmbeddingService,
  IVectorStoreService
} from '@/domains/rag/core/types.js'
export type { McpTool, McpRequest, McpResponse } from '@/domains/mcp/core/types.js'
export type { BaseServerConfig, ServerConfig } from '@/shared/config/config-factory.js'
