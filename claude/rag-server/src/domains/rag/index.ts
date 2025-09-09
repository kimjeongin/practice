/**
 * RAG Domain - Main Export
 * Consolidated exports for the refactored RAG domain
 */

// Main RAG Service - High-level facade (recommended for external use)
export { RAGService } from './rag-service.js'
export type { RagInfo } from './rag-service.js'

// Core types and interfaces
export * from './core/types.js'
export * from './core/interfaces.js'

// Internal services (for advanced use cases)
export { LanceDBProvider } from './lancedb/index.js'
export { SearchService } from './services/search.js'
export { DocumentProcessor } from './services/processor.js'
export { FileReader } from './services/reader.js'
export { ChunkingService, type TextChunk, type ContextualChunk } from './services/chunking.js'
