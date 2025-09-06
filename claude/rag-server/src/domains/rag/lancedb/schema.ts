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
  SearchFilters,
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
 * GPT approach: parse JSON string metadata
 */
export function convertRAGResultToVectorSearchResult(result: any): VectorSearchResult {
  // Calculate score for cosine similarity
  // LanceDB cosine distance is in [0, 2] range, closer to 0 means more similar
  // Convert to similarity: 1 - (distance / 2) or simply 1 - distance (for normalized vectors)
  let score: number
  if (result._distance !== undefined) {
    // Convert cosine distance to similarity (0~1 range)
    score = Math.max(0, 1 - result._distance / 2)
  } else if (result.score !== undefined) {
    score = result.score
  } else {
    score = 0
  }

  logger.info('🔍 LanceDB search result conversion:', {
    rawDistance: result._distance,
    calculatedScore: score,
    vectorScore: result.score,
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

/**
 * Build simple WHERE clause for filtering
 * Direct access to metadata object fields
 */
function buildWhereClause(filters?: SearchFilters): string | undefined {
  if (!filters) return undefined

  const conditions: string[] = []

  // File type filter
  if (filters.fileTypes?.length) {
    const types = filters.fileTypes.map((t) => `'${t}'`).join(', ')
    conditions.push(`metadata['fileType'] IN (${types})`)
  }

  // Document ID filter
  if (filters.docIds?.length) {
    const ids = filters.docIds.map((id) => `'${id}'`).join(', ')
    conditions.push(`doc_id IN (${ids})`)
  }

  // Tag filter
  if (filters.tags?.length) {
    const tagConditions = filters.tags
      .map((tag) => `array_contains(metadata['tags'], '${tag}')`)
      .join(' OR ')
    conditions.push(`(${tagConditions})`)
  }

  // Date range filter
  if (filters.dateRange) {
    conditions.push(`metadata['modifiedAt'] >= '${filters.dateRange.start}'`)
    conditions.push(`metadata['modifiedAt'] <= '${filters.dateRange.end}'`)
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined
}
