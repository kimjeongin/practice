/**
 * LanceDB Schema Definitions
 * 문서, 메타데이터, 벡터를 모두 포함하는 통합 스키마 정의
 */

import * as arrow from 'apache-arrow'
import type { LanceDBEmbeddingFunction } from './embedding-bridge.js'

/**
 * LanceDB 문서 레코드 타입 정의
 * 기존 Prisma 모델의 모든 필드를 포함하여 완전한 호환성 제공
 */
export interface LanceDBDocumentRecord {
  // 기본 문서 정보
  id: string
  content: string
  
  // 파일 메타데이터 (File 모델에서)
  fileId: string
  fileName: string
  filePath: string
  fileType: string
  fileSize: number
  fileHash: string
  fileModifiedAt: string // ISO string
  fileCreatedAt: string // ISO string
  
  // 청크 메타데이터 (DocumentChunk 모델에서)
  chunkIndex: number
  embeddingId?: string
  chunkCreatedAt: string // ISO string
  
  // 벡터 임베딩
  vector: number[]
  
  // 검색 및 색인 메타데이터
  indexedAt: string // ISO string
  updatedAt: string // ISO string
  
  // 추가 메타데이터 (확장 가능)
  tags?: string[]
  language?: string
  category?: string
  customMetadata?: Record<string, any>
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
 * @param embeddingDimensions 임베딩 벡터의 차원 수
 * @returns Apache Arrow Schema
 */
export function createLanceDBSchema(embeddingDimensions: number): arrow.Schema {
  const fields = [
    // 기본 필드
    arrow.Field.new('id', new arrow.Utf8()),
    arrow.Field.new('content', new arrow.Utf8()),
    
    // 파일 메타데이터
    arrow.Field.new('fileId', new arrow.Utf8()),
    arrow.Field.new('fileName', new arrow.Utf8()),
    arrow.Field.new('filePath', new arrow.Utf8()),
    arrow.Field.new('fileType', new arrow.Utf8()),
    arrow.Field.new('fileSize', new arrow.Int64()),
    arrow.Field.new('fileHash', new arrow.Utf8()),
    arrow.Field.new('fileModifiedAt', new arrow.Utf8()),
    arrow.Field.new('fileCreatedAt', new arrow.Utf8()),
    
    // 청크 메타데이터
    arrow.Field.new('chunkIndex', new arrow.Int32()),
    arrow.Field.new('embeddingId', new arrow.Utf8(), true), // nullable
    arrow.Field.new('chunkCreatedAt', new arrow.Utf8()),
    
    // 벡터 필드
    arrow.Field.new('vector', new arrow.FixedSizeList(embeddingDimensions, arrow.Field.new('item', new arrow.Float32()))),
    
    // 타임스탬프
    arrow.Field.new('indexedAt', new arrow.Utf8()),
    arrow.Field.new('updatedAt', new arrow.Utf8()),
    
    // 선택적 필드들
    arrow.Field.new('tags', new arrow.List(arrow.Field.new('item', new arrow.Utf8())), true), // nullable
    arrow.Field.new('language', new arrow.Utf8(), true), // nullable
    arrow.Field.new('category', new arrow.Utf8(), true), // nullable
    arrow.Field.new('customMetadata', new arrow.Utf8(), true), // JSON string, nullable
  ]

  return new arrow.Schema(fields)
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
 */
export function vectorDocumentToLanceDBRecord(
  doc: any, 
  vector: number[]
): LanceDBDocumentRecord {
  const now = new Date().toISOString()
  
  return {
    id: doc.id,
    content: doc.content,
    
    // 파일 메타데이터
    fileId: doc.metadata.fileId,
    fileName: doc.metadata.fileName || doc.metadata.filename || 'unknown',
    filePath: doc.metadata.filePath || doc.metadata.filepath || '',
    fileType: doc.metadata.fileType || doc.metadata.filetype || 'text',
    fileSize: doc.metadata.fileSize || doc.metadata.size || 0,
    fileHash: doc.metadata.fileHash || doc.metadata.hash || '',
    fileModifiedAt: doc.metadata.fileModifiedAt || doc.metadata.modifiedAt || now,
    fileCreatedAt: doc.metadata.fileCreatedAt || doc.metadata.createdAt || now,
    
    // 청크 메타데이터
    chunkIndex: doc.metadata.chunkIndex || 0,
    embeddingId: doc.metadata.embeddingId || null,
    chunkCreatedAt: doc.metadata.chunkCreatedAt || now,
    
    // 벡터
    vector: vector,
    
    // 타임스탬프
    indexedAt: now,
    updatedAt: doc.metadata.updatedAt || doc.metadata.processedAt || now,
    
    // 선택적 필드 (배열이나 null 값으로 초기화)
    tags: Array.isArray(doc.metadata.tags) ? doc.metadata.tags : (doc.metadata.tags ? [String(doc.metadata.tags)] : []),
    language: doc.metadata.language || null,
    category: doc.metadata.category || null,
    customMetadata: doc.metadata.customMetadata && typeof doc.metadata.customMetadata === 'object' ? doc.metadata.customMetadata : {}
  }
}

/**
 * LanceDB 검색 결과를 표준 SearchResult 형식으로 변환
 */
export function lanceDBResultToSearchResult(result: any): any {
  return {
    id: result.id,
    content: result.content,
    score: result._distance ? (1 - result._distance) : result.score || 0, // LanceDB는 거리를 반환하므로 유사도로 변환
    metadata: {
      fileId: result.fileId,
      fileName: result.fileName,
      filePath: result.filePath,
      fileType: result.fileType,
      fileSize: result.fileSize,
      fileHash: result.fileHash,
      fileModifiedAt: result.fileModifiedAt,
      fileCreatedAt: result.fileCreatedAt,
      chunkIndex: result.chunkIndex,
      embeddingId: result.embeddingId,
      chunkCreatedAt: result.chunkCreatedAt,
      indexedAt: result.indexedAt,
      updatedAt: result.updatedAt,
      tags: result.tags,
      language: result.language,
      category: result.category,
      customMetadata: result.customMetadata ? JSON.parse(result.customMetadata) : undefined
    },
    chunkIndex: result.chunkIndex,
    semanticScore: result._distance ? (1 - result._distance) : result.score || 0
  }
}

/**
 * 스키마 유효성 검사
 */
export function validateLanceDBRecord(record: Partial<LanceDBDocumentRecord>): string[] {
  const errors: string[] = []
  
  if (!record.id) errors.push('id is required')
  if (!record.content) errors.push('content is required')
  if (!record.fileId) errors.push('fileId is required')
  if (!record.fileName) errors.push('fileName is required')
  if (!record.vector || !Array.isArray(record.vector)) errors.push('vector is required and must be an array')
  if (typeof record.chunkIndex !== 'number') errors.push('chunkIndex must be a number')
  
  return errors
}