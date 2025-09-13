/**
 * Ollama Services
 * Specialized Ollama services for different RAG operations
 */

export { EmbeddingService } from './embedding.js'
export { ChunkingService } from './chunking.js'
export { OllamaRerankingService } from './reranking.js'

// Re-export types for convenience
export type { ModelInfo } from '@/domains/rag/core/types.js'
export type { RerankingModelInfo, RerankingGenerationOptions, RerankingGenerationResponse } from './reranking.js'
