/**
 * Ollama Services
 * Ollama-based embedding and reranking services
 */

export { EmbeddingService } from './embedding.js'
export { RerankingService } from './reranker.js'

// Re-export types for convenience
export type { ModelInfo } from '@/domains/rag/core/types.js'
export type {
  RerankingInput,
  RerankingResult,
  RerankingOptions,
} from '@/domains/rag/core/types.js'