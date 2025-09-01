/**
 * LanceDB Simple Schema (GPT Best Practice 방식)
 * 복잡한 77개 필드를 5개 필드로 간소화
 */

import * as lancedb from '@lancedb/lancedb'
import * as arrow from 'apache-arrow'
import { logger } from '../../../../../../shared/logger/index.js'

/**
 * RAG 최적화된 간단한 문서 스키마
 * GPT 제안 방식: vector, text, doc_id, chunk_id, metadata (JSON 문자열)
 */
export interface RAGDocumentRecord {
  vector: number[] // 임베딩 벡터
  text: string // LLM에 전달할 원문 (청크 내용)
  doc_id: string // 문서 식별자 (파일 경로 기반)
  chunk_id: number // 청크 인덱스
  metadata: string // JSON 문자열로 저장된 메타데이터
}

/**
 * 문서 메타데이터 구조
 * 기존 복잡한 필드들을 필수 정보만으로 간소화
 */
export interface DocumentMetadata {
  // 파일 기본 정보
  fileName: string
  filePath: string
  fileType: string
  fileSize: number
  fileHash: string

  // 타임스탬프
  createdAt: string // ISO 문자열
  modifiedAt: string // ISO 문자열
  processedAt: string // ISO 문자열

  // 선택적 확장 필드들
  tags?: string[]
  category?: string
  language?: string

  // 기타 사용자 정의 필드 (필요시 확장)
  [key: string]: any
}

/**
 * LanceDB 스키마 정의 (GPT 방식)
 * Apache Arrow 스키마를 사용한 간단하고 직관적인 스키마 구성
 */
export function createSimpleLanceDBSchema(embeddingDimensions: number = 768) {
  // Apache Arrow를 사용한 직접적인 스키마 정의
  return new arrow.Schema([
    new arrow.Field(
      'vector',
      new arrow.FixedSizeList(embeddingDimensions, new arrow.Field('item', new arrow.Float32()))
    ),
    new arrow.Field('text', new arrow.Utf8()),
    new arrow.Field('doc_id', new arrow.Utf8()),
    new arrow.Field('chunk_id', new arrow.Int32()),
    new arrow.Field('metadata', new arrow.Utf8()), // JSON 문자열로 저장
  ])
}

/**
 * 검색 결과 타입 (간소화)
 */
export interface RAGSearchResult {
  vector: number[]
  text: string
  doc_id: string
  chunk_id: number
  metadata: DocumentMetadata
  _distance?: number // LanceDB에서 제공하는 거리 값
  score?: number // 계산된 유사도 점수
}

/**
 * Core VectorDocument를 LanceDB RAGDocumentRecord로 변환
 * GPT 방식: metadata를 JSON 문자열로 저장
 */
export function convertVectorDocumentToRAGRecord(document: {
  id: string
  doc_id: string
  chunk_id: number
  content: string
  vector?: number[]
  metadata: any
}): RAGDocumentRecord {
  // 메타데이터 정규화
  const documentMetadata: DocumentMetadata = {
    fileName: document.metadata.fileName || 'unknown',
    filePath: document.metadata.filePath || '',
    fileType: document.metadata.fileType || 'text',
    fileSize: document.metadata.fileSize || 0,
    fileHash: document.metadata.fileHash || '',
    createdAt: document.metadata.createdAt || new Date().toISOString(),
    modifiedAt: document.metadata.modifiedAt || new Date().toISOString(),
    processedAt: document.metadata.processedAt || new Date().toISOString(),

    // 선택적 필드들
    tags: document.metadata.tags,
    category: document.metadata.category,
    language: document.metadata.language,
  }

  // LanceDB RAGDocumentRecord 형식으로 변환
  return {
    vector: document.vector || [],
    text: document.content,
    doc_id: document.doc_id,
    chunk_id: document.chunk_id,
    metadata: JSON.stringify(documentMetadata), // JSON 문자열로 저장
  }
}

/**
 * LanceDB RAGSearchResult를 Core VectorSearchResult로 변환
 * GPT 방식: JSON 문자열 메타데이터를 파싱
 */
export function convertRAGResultToVectorSearchResult(result: any): {
  id: string
  content: string
  score: number
  metadata: any
  chunkIndex: number
} {
  // 코사인 유사도를 위한 스코어 계산
  // LanceDB 코사인 거리는 [0, 2] 범위, 0에 가까울수록 유사
  // 유사도로 변환: 1 - (distance / 2) 또는 간단히 1 - distance (정규화된 벡터의 경우)
  let score: number
  if (result._distance !== undefined) {
    // 코사인 거리를 유사도로 변환 (0~1 범위)
    score = Math.max(0, 1 - result._distance / 2)
  } else if (result.score !== undefined) {
    score = result.score
  } else {
    score = 0
  }

  logger.info('🔍 LanceDB search result conversion:', {
    rawDistance: result._distance,
    calculatedScore: score,
    originalScore: result.score,
    docId: result.doc_id,
    chunkId: result.chunk_id,
  })
  // JSON 문자열 메타데이터 파싱
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
      chunkIndex: result.chunk_id || 0,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    }
  }

  // Core VectorSearchResult 형식으로 변환
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
      chunkIndex: result.chunk_id,
      tags: parsedMetadata.tags,
      category: parsedMetadata.category,
      language: parsedMetadata.language,
    },
    chunkIndex: result.chunk_id,
  }
}

/**
 * 간단한 WHERE 절 생성기
 * metadata 객체에 직접 접근 가능
 */
export function buildSimpleWhereClause(filters?: {
  fileTypes?: string[]
  docIds?: string[]
  tags?: string[]
  dateRange?: { start: string; end: string }
}): string | undefined {
  if (!filters) return undefined

  const conditions: string[] = []

  // 파일 타입 필터
  if (filters.fileTypes?.length) {
    const types = filters.fileTypes.map((t) => `'${t}'`).join(', ')
    conditions.push(`metadata['fileType'] IN (${types})`)
  }

  // 문서 ID 필터
  if (filters.docIds?.length) {
    const ids = filters.docIds.map((id) => `'${id}'`).join(', ')
    conditions.push(`doc_id IN (${ids})`)
  }

  // 태그 필터
  if (filters.tags?.length) {
    const tagConditions = filters.tags
      .map((tag) => `array_contains(metadata['tags'], '${tag}')`)
      .join(' OR ')
    conditions.push(`(${tagConditions})`)
  }

  // 날짜 범위 필터
  if (filters.dateRange) {
    conditions.push(`metadata['modifiedAt'] >= '${filters.dateRange.start}'`)
    conditions.push(`metadata['modifiedAt'] <= '${filters.dateRange.end}'`)
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined
}
