/**
 * Ollama Services
 * Specialized Ollama services for different RAG operations
 */

export { EmbeddingService } from './embedding.js'
export { ChunkingService } from './chunking.js'

// Re-export types for convenience
export type { ModelInfo } from '@/domains/rag/core/types.js'
