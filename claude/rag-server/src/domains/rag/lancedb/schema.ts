/**
 * LanceDB Schema - Simplified Document Schema
 * GPT Best Practice approach: 5 fields instead of 77 complex fields
 */

import * as lancedb from '@lancedb/lancedb'
import * as arrow from 'apache-arrow'
import { logger } from '@/shared/logger/index.js'
import type {
  RAGDocumentRecord,
  RAGSearchResult,
  DocumentMetadata,
  VectorDocument,
  VectorSearchResult,
} from '@/domains/rag/core/types.js'

/**
 * Create LanceDB schema using Apache Arrow
 * GPT approach: direct and intuitive schema composition
 */
export function createLanceDBSchema(embeddingDimensions: number = 768) {
  return new arrow.Schema([
    new arrow.Field(
      'vector',
      new arrow.FixedSizeList(embeddingDimensions, new arrow.Field('item', new arrow.Float32()))
    ),
    new arrow.Field('text', new arrow.Utf8()), // Original chunk text for LLM
    new arrow.Field('contextual_text', new arrow.Utf8()), // Contextual text used for embedding
    new arrow.Field('doc_id', new arrow.Utf8()),
    new arrow.Field('chunk_id', new arrow.Int32()),
    new arrow.Field('metadata', new arrow.Utf8()), // Stored as JSON string
    new arrow.Field('model_name', new arrow.Utf8()), // Embedding model name
  ])
}

/**
 * Convert Core VectorDocument to LanceDB RAGDocumentRecord
 * GPT approach: store metadata as JSON string
 */
export function convertVectorDocumentToRAGRecord(document: VectorDocument): RAGDocumentRecord {
  // Normalize metadata
  const documentMetadata: DocumentMetadata = {
    fileName: document.metadata.fileName || 'unknown',
    filePath: document.metadata.filePath || '',
    fileType: document.metadata.fileType || 'text',
    fileSize: document.metadata.fileSize || 0,
    fileHash: document.metadata.fileHash || '',
    createdAt: document.metadata.createdAt || new Date().toISOString(),
    modifiedAt: document.metadata.modifiedAt || new Date().toISOString(),
    processedAt: document.metadata.processedAt || new Date().toISOString(),

    // Optional fields
    tags: document.metadata.tags,
    category: document.metadata.category,
    language: document.metadata.language,
  }

  // Convert to LanceDB RAGDocumentRecord format
  return {
    vector: document.vector || [],
    text: document.content,
    contextual_text: document.content, // Use content as contextual_text for backward compatibility
    doc_id: document.doc_id,
    chunk_id: document.chunk_id,
    metadata: JSON.stringify(documentMetadata), // Store as JSON string
    model_name: document.modelName || 'unknown', // Store embedding model name
  }
}

/**
 * Convert LanceDB RAGSearchResult to Core VectorSearchResult
 * Improved conversion with proper normalized vector score calculation
 */
export function convertRAGResultToVectorSearchResult(result: any): VectorSearchResult {
  // Calculate score for cosine similarity with normalized vectors
  // For normalized vectors: cosine_distance = 2 * (1 - cosine_similarity)
  // Therefore: cosine_similarity = 1 - (cosine_distance / 2)
  // But we need to ensure cosine_distance is in [0, 2] range
  let score: number
  if (result._distance !== undefined) {
    // Proper conversion for normalized vectors: cosine similarity = 1 - (distance / 2)
    // Clamp distance to [0, 2] range for safety
    const clampedDistance = Math.max(0, Math.min(2, result._distance))
    score = Math.max(0, 1 - clampedDistance / 2)
  } else if (result.score !== undefined) {
    score = result.score
  } else {
    score = 0
  }

  logger.debug('🔍 LanceDB search result conversion (improved):', {
    rawDistance: result._distance,
    clampedDistance:
      result._distance !== undefined ? Math.max(0, Math.min(2, result._distance)) : undefined,
    calculatedScore: score,
    docId: result.doc_id,
    chunkId: result.chunk_id,
  })

  // Parse JSON string metadata
  let parsedMetadata: DocumentMetadata
  try {
    parsedMetadata =
      typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata
  } catch (error) {
    parsedMetadata = {
      fileName: 'unknown',
      filePath: 'unknown',
      fileType: 'text',
      fileSize: 0,
      fileHash: '',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    }
  }

  // Convert to Core VectorSearchResult format
  return {
    id: `${result.doc_id}_chunk_${result.chunk_id}`,
    content: result.text,
    score,
    metadata: {
      fileName: parsedMetadata.fileName,
      filePath: parsedMetadata.filePath,
      fileType: parsedMetadata.fileType,
      fileSize: parsedMetadata.fileSize,
      fileHash: parsedMetadata.fileHash,
      createdAt: parsedMetadata.createdAt,
      modifiedAt: parsedMetadata.modifiedAt,
      processedAt: parsedMetadata.processedAt,
      tags: parsedMetadata.tags,
      category: parsedMetadata.category,
      language: parsedMetadata.language,
    },
    chunkIndex: result.chunk_id,
  }
}
