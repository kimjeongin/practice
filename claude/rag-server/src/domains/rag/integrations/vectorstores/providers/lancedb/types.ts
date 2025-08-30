/**
 * LanceDB Schema Definitions
 * Updated to use the unified metadata schema and eliminate hardcoding
 */

import * as arrow from 'apache-arrow'
import type { LanceDBEmbeddingFunction } from './embedding-bridge.js'
import { 
  UnifiedDocumentMetadata,
  ArrowSchemaGenerator,
  DataTransformer
} from '@/shared/schemas/schema-generator.js'

/**
 * LanceDB 문서 레코드 타입 정의
 * Now based on the unified metadata schema
 */
export interface LanceDBDocumentRecord {
  // Basic document fields
  id: string
  content: string
  vector: number[]
  
  // File information (from UnifiedDocumentMetadata.file)
  fileId: string
  fileName: string
  filePath: string
  fileSize: number
  fileType: string
  fileHash: string
  fileMimeType?: string
  fileEncoding?: string
  
  // Timestamp information (from UnifiedDocumentMetadata.timestamps)
  fileCreatedAt: string // ISO string
  fileModifiedAt: string // ISO string
  processedAt: string // ISO string
  indexedAt: string // ISO string
  
  // Document structure (from UnifiedDocumentMetadata.structure)
  chunkIndex: number
  totalChunks: number
  parentDocumentId?: string
  sectionTitle?: string
  pageNumber?: number
  hierarchyLevel?: number
  
  // Content analysis (from UnifiedDocumentMetadata.content)
  language?: string
  category?: string
  keywords?: string[]
  summary?: string
  importance?: number
  readingTime?: number
  wordCount?: number
  
  // Search optimization (from UnifiedDocumentMetadata.search)
  tags?: string[]
  searchableText?: string
  contextHeaders?: string[]
  searchBoost?: number
  
  // System information (from UnifiedDocumentMetadata.system)
  modelVersion: string
  embeddingId?: string
  processingVersion: string
  sourceType: string
  status: string
  errorMessage?: string
  processingDuration?: number
  
  // Legacy compatibility fields
  createdAt: string // Maps to fileCreatedAt
  updatedAt: string // Maps to processedAt
  chunkCreatedAt?: string // Deprecated, use processedAt
  customMetadata?: Record<string, any> // Deprecated, use structured fields
}

/**
 * LanceDB 검색 결과 타입
 */
export interface LanceDBSearchResult {
  id: string
  content: string
  score: number
  metadata: {
    fileId: string
    fileName: string
    filePath: string
    fileType: string
    fileSize: number
    fileHash: string
    fileModifiedAt: string
    fileCreatedAt: string
    chunkIndex: number
    embeddingId?: string
    chunkCreatedAt: string
    indexedAt: string
    updatedAt: string
    tags?: string[]
    language?: string
    category?: string
    customMetadata?: Record<string, any>
  }
  chunkIndex: number
}

/**
 * LanceDB 테이블 생성을 위한 Apache Arrow 스키마 생성
 * Now delegates to the centralized ArrowSchemaGenerator
 * @param embeddingDimensions 임베딩 벡터의 차원 수
 * @returns Apache Arrow Schema
 */
export function createLanceDBSchema(embeddingDimensions: number): arrow.Schema {
  return ArrowSchemaGenerator.generateLanceDBSchema(embeddingDimensions)
}

/**
 * LanceDB 테이블 생성 옵션
 */
export interface LanceDBTableOptions {
  tableName: string
  mode?: 'create' | 'overwrite' | 'append'
  embeddingFunction?: LanceDBEmbeddingFunction
  enableFullTextSearch?: boolean
  indexColumns?: string[]
}

// DEFAULT_TABLE_OPTIONS는 config.ts로 이동됨

/**
 * LanceDB Document를 VectorDocument 형식으로 변환
 */
export function lanceDBRecordToVectorDocument(record: LanceDBDocumentRecord): any {
  return {
    id: record.id,
    content: record.content,
    metadata: {
      fileId: record.fileId,
      fileName: record.fileName,
      filePath: record.filePath,
      fileType: record.fileType,
      fileSize: record.fileSize,
      fileHash: record.fileHash,
      fileModifiedAt: record.fileModifiedAt,
      fileCreatedAt: record.fileCreatedAt,
      chunkIndex: record.chunkIndex,
      embeddingId: record.embeddingId,
      chunkCreatedAt: record.chunkCreatedAt,
      indexedAt: record.indexedAt,
      updatedAt: record.updatedAt,
      tags: record.tags,
      language: record.language,
      category: record.category,
      customMetadata: record.customMetadata
    }
  }
}

/**
 * VectorDocument를 LanceDB Record 형식으로 변환
 * Now uses the centralized DataTransformer
 */
export function vectorDocumentToLanceDBRecord(
  doc: any, 
  vector: number[]
): LanceDBDocumentRecord {
  // Convert old-style doc to UnifiedDocumentMetadata first
  const unifiedMetadata = convertLegacyDocToUnified(doc)
  
  // Use centralized transformer
  const record = DataTransformer.unifiedToLanceDBRecord(unifiedMetadata, doc.content || '', vector)
  
  return record as LanceDBDocumentRecord
}

/**
 * Convert legacy document format to UnifiedDocumentMetadata
 * Handles backward compatibility with existing document structures
 */
function convertLegacyDocToUnified(doc: any): UnifiedDocumentMetadata {
  const now = new Date()
  const metadata = doc.metadata || {}
  
  // Helper functions for robust field mapping
  const getStringField = (value: any, fallback: string = ''): string => {
    if (typeof value === 'string' && value) return value
    return fallback
  }
  
  const getNumberField = (value: any, fallback: number = 0): number => {
    const parsed = typeof value === 'number' ? value : parseInt(String(value || '0'), 10)
    return isNaN(parsed) ? fallback : parsed
  }
  
  const getDateField = (value: any, fallback: Date = now): Date => {
    if (!value) return fallback
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const parsed = new Date(value)
      return isNaN(parsed.getTime()) ? fallback : parsed
    }
    return fallback
  }
  
  return {
    file: {
      id: getStringField(metadata.fileId) || `file_${Date.now()}`,
      name: getStringField(metadata.fileName || metadata.filename, 'unknown'),
      path: getStringField(metadata.filePath || metadata.filepath),
      size: getNumberField(metadata.fileSize || metadata.size),
      hash: getStringField(metadata.fileHash || metadata.hash),
      type: getStringField(metadata.fileType || metadata.filetype, 'text'),
      mimeType: getStringField(metadata.fileMimeType, 'text/plain'),
      encoding: getStringField(metadata.fileEncoding, 'utf-8')
    },
    timestamps: {
      created: getDateField(metadata.fileCreatedAt || metadata.createdAt),
      modified: getDateField(metadata.fileModifiedAt || metadata.modifiedAt),
      processed: getDateField(metadata.processedAt || metadata.updatedAt),
      indexed: now
    },
    structure: {
      chunkIndex: getNumberField(metadata.chunkIndex),
      totalChunks: getNumberField(metadata.totalChunks, 1),
      parentDocumentId: metadata.parentDocumentId,
      sectionTitle: metadata.sectionTitle,
      pageNumber: metadata.pageNumber,
      hierarchyLevel: metadata.hierarchyLevel
    },
    content: {
      language: metadata.language,
      category: metadata.category,
      keywords: Array.isArray(metadata.keywords) ? metadata.keywords : 
                (metadata.keywords ? [String(metadata.keywords)] : undefined),
      summary: metadata.summary,
      importance: metadata.importance,
      readingTime: metadata.readingTime,
      wordCount: metadata.wordCount
    },
    search: {
      tags: Array.isArray(metadata.tags) ? metadata.tags : 
            (metadata.tags ? [String(metadata.tags)] : undefined),
      searchableText: metadata.searchableText,
      contextHeaders: metadata.contextHeaders,
      searchBoost: metadata.searchBoost
    },
    system: {
      modelVersion: metadata.modelVersion || '1.0.0',
      embeddingId: metadata.embeddingId,
      processingVersion: metadata.processingVersion || '1.0.0',
      sourceType: metadata.sourceType || 'local_file',
      status: metadata.status || 'completed',
      errorMessage: metadata.errorMessage,
      processingDuration: metadata.processingDuration
    }
  }
}

/**
 * LanceDB 검색 결과를 표준 SearchResult 형식으로 변환
 * Now uses centralized transformation and comprehensive metadata mapping
 */
export function lanceDBResultToSearchResult(result: any): any {
  // Convert LanceDB record back to unified metadata
  const unifiedMetadata = DataTransformer.lanceDBRecordToUnified(result)
  
  // Calculate score (LanceDB returns distance, convert to similarity)
  const score = result._distance ? (1 - result._distance) : result.score || 0
  
  return {
    id: result.id,
    content: result.content,
    score: score,
    semanticScore: score,
    metadata: {
      // File information
      fileId: unifiedMetadata.file.id,
      fileName: unifiedMetadata.file.name,
      filePath: unifiedMetadata.file.path,
      fileType: unifiedMetadata.file.type,
      fileSize: unifiedMetadata.file.size,
      fileHash: unifiedMetadata.file.hash,
      fileMimeType: unifiedMetadata.file.mimeType,
      fileEncoding: unifiedMetadata.file.encoding,
      
      // Timestamps
      fileCreatedAt: unifiedMetadata.timestamps.created.toISOString(),
      fileModifiedAt: unifiedMetadata.timestamps.modified.toISOString(),
      processedAt: unifiedMetadata.timestamps.processed.toISOString(),
      indexedAt: unifiedMetadata.timestamps.indexed.toISOString(),
      
      // Structure
      chunkIndex: unifiedMetadata.structure.chunkIndex,
      totalChunks: unifiedMetadata.structure.totalChunks,
      parentDocumentId: unifiedMetadata.structure.parentDocumentId,
      sectionTitle: unifiedMetadata.structure.sectionTitle,
      pageNumber: unifiedMetadata.structure.pageNumber,
      hierarchyLevel: unifiedMetadata.structure.hierarchyLevel,
      
      // Content analysis
      language: unifiedMetadata.content.language,
      category: unifiedMetadata.content.category,
      keywords: unifiedMetadata.content.keywords,
      summary: unifiedMetadata.content.summary,
      importance: unifiedMetadata.content.importance,
      readingTime: unifiedMetadata.content.readingTime,
      wordCount: unifiedMetadata.content.wordCount,
      
      // Search optimization
      tags: unifiedMetadata.search.tags,
      searchableText: unifiedMetadata.search.searchableText,
      contextHeaders: unifiedMetadata.search.contextHeaders,
      searchBoost: unifiedMetadata.search.searchBoost,
      
      // System information
      modelVersion: unifiedMetadata.system.modelVersion,
      embeddingId: unifiedMetadata.system.embeddingId,
      processingVersion: unifiedMetadata.system.processingVersion,
      sourceType: unifiedMetadata.system.sourceType,
      status: unifiedMetadata.system.status,
      errorMessage: unifiedMetadata.system.errorMessage,
      processingDuration: unifiedMetadata.system.processingDuration,
      
      // Legacy compatibility
      createdAt: unifiedMetadata.timestamps.created.toISOString(),
      updatedAt: unifiedMetadata.timestamps.processed.toISOString(),
      chunkCreatedAt: unifiedMetadata.timestamps.processed.toISOString(), // Deprecated
    },
    chunkIndex: unifiedMetadata.structure.chunkIndex
  }
}

/**
 * 스키마 유효성 검사 - 향상된 에러 메시지와 더 나은 검증
 */
export function validateLanceDBRecord(record: Partial<LanceDBDocumentRecord>): string[] {
  const errors: string[] = []
  
  // 필수 필드 검증
  if (!record.id || typeof record.id !== 'string') {
    errors.push(`id is required and must be a string (got: ${typeof record.id})`)
  }
  
  if (!record.content || typeof record.content !== 'string') {
    errors.push(`content is required and must be a string (got: ${typeof record.content})`)
  }
  
  if (!record.fileId || typeof record.fileId !== 'string') {
    errors.push(`fileId is required and must be a string (got: ${typeof record.fileId})`)
  }
  
  if (!record.fileName || typeof record.fileName !== 'string') {
    errors.push(`fileName is required and must be a string (got: ${typeof record.fileName})`)
  }
  
  if (!record.vector || !Array.isArray(record.vector)) {
    errors.push(`vector is required and must be an array (got: ${typeof record.vector})`)
  } else if (record.vector.length === 0) {
    errors.push('vector array cannot be empty')
  } else if (!record.vector.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))) {
    errors.push('vector must contain only finite numbers')
  }
  
  if (typeof record.chunkIndex !== 'number' || isNaN(record.chunkIndex) || record.chunkIndex < 0) {
    errors.push(`chunkIndex must be a non-negative number (got: ${typeof record.chunkIndex}, value: ${record.chunkIndex})`)
  }
  
  // 추가 필수 필드들 검증
  if (!record.filePath || typeof record.filePath !== 'string') {
    errors.push(`filePath is required and must be a string (got: ${typeof record.filePath})`)
  }
  
  if (!record.fileType || typeof record.fileType !== 'string') {
    errors.push(`fileType is required and must be a string (got: ${typeof record.fileType})`)
  }
  
  if (typeof record.fileSize !== 'number' || isNaN(record.fileSize) || record.fileSize < 0) {
    errors.push(`fileSize must be a non-negative number (got: ${typeof record.fileSize}, value: ${record.fileSize})`)
  }
  
  if (!record.fileHash || typeof record.fileHash !== 'string') {
    errors.push(`fileHash is required and must be a string (got: ${typeof record.fileHash})`)
  }
  
  // 날짜 필드 검증
  const dateFields = [
    { field: 'fileModifiedAt', value: record.fileModifiedAt },
    { field: 'fileCreatedAt', value: record.fileCreatedAt },
    { field: 'chunkCreatedAt', value: record.chunkCreatedAt },
    { field: 'indexedAt', value: record.indexedAt },
    { field: 'updatedAt', value: record.updatedAt }
  ]
  
  for (const { field, value } of dateFields) {
    if (!value || typeof value !== 'string') {
      errors.push(`${field} is required and must be a string (got: ${typeof value})`)
    } else {
      const date = new Date(value)
      if (isNaN(date.getTime())) {
        errors.push(`${field} must be a valid ISO date string (got: ${value})`)
      }
    }
  }
  
  // 선택적 필드 검증
  if (record.tags !== undefined && record.tags !== null && !Array.isArray(record.tags)) {
    errors.push(`tags must be an array if provided (got: ${typeof record.tags})`)
  }
  
  if (record.language !== undefined && record.language !== null && typeof record.language !== 'string') {
    errors.push(`language must be a string if provided (got: ${typeof record.language})`)
  }
  
  if (record.category !== undefined && record.category !== null && typeof record.category !== 'string') {
    errors.push(`category must be a string if provided (got: ${typeof record.category})`)
  }
  
  if (record.customMetadata !== undefined && record.customMetadata !== null && typeof record.customMetadata !== 'object') {
    errors.push(`customMetadata must be an object if provided (got: ${typeof record.customMetadata})`)
  }
  
  return errors
}