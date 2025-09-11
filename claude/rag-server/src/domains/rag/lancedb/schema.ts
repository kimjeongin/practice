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
    new arrow.Field('text', new arrow.Utf8()), // Original chunk text for LLM (English FTS)
    new arrow.Field('contextual_text', new arrow.Utf8()), // Contextual text used for embedding
    new arrow.Field('doc_id', new arrow.Utf8()),
    new arrow.Field('chunk_id', new arrow.Int32()),
    new arrow.Field('metadata', new arrow.Utf8()), // Stored as JSON string
    new arrow.Field('model_name', new arrow.Utf8()), // Embedding model name
    
    // Multilingual fields for simplified ko/en support
    new arrow.Field('language', new arrow.Utf8()), // 'ko' | 'en'
    new arrow.Field('tokenized_text', new arrow.Utf8()), // Korean tokenized text (Korean FTS)
    new arrow.Field('initial_consonants', new arrow.Utf8()), // Korean initial consonants (ㄱㄴㄷ search)
  ])
}

/**
 * Convert Core VectorDocument to LanceDB RAGDocumentRecord
 * Enhanced to support multilingual fields (ko/en)
 */
export function convertVectorDocumentToRAGRecord(
  document: VectorDocument & { 
    language?: 'ko' | 'en';
    tokenized_text?: string; 
    initial_consonants?: string; 
  }
): RAGDocumentRecord {
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

  // Convert to LanceDB RAGDocumentRecord format with multilingual support
  return {
    vector: document.vector || [],
    text: document.content,
    contextual_text: document.content, // Use content as contextual_text for backward compatibility
    doc_id: document.doc_id,
    chunk_id: document.chunk_id,
    metadata: JSON.stringify(documentMetadata), // Store as JSON string
    model_name: document.modelName || 'unknown', // Store embedding model name
    
    // Multilingual fields
    language: document.language || 'en', // Default to English
    tokenized_text: document.tokenized_text || '', // Empty for English documents
    initial_consonants: document.initial_consonants || '', // Empty for English documents
  }
}

/**
 * Convert LanceDB RAGSearchResult to Core VectorSearchResult
 * Converts cosine distance to cosine similarity score
 */
export function convertRAGResultToVectorSearchResult(result: any): VectorSearchResult {
  // Convert cosine distance to cosine similarity
  // LanceDB returns cosine distance in range [0, 2] where distance = 1 - similarity
  // Therefore: cosine_similarity = 1 - cosine_distance
  let score: number
  if (result._distance !== undefined) {
    // Convert cosine distance to cosine similarity
    // Ensure result is in valid similarity range [0, 1]
    score = Math.max(0, Math.min(1, 1 - result._distance))
  } else if (result._relevance_score !== undefined) {
    score = result._relevance_score
  } else if (result._score !== undefined) {
    score = result._score
  } else {
    score = 0
  }

  logger.debug('🔍 LanceDB search result conversion:', {
    rawDistance: result._distance,
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
    searchType: 'semantic' as const, // Default to semantic search
  }
}
