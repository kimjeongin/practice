/**
 * LanceDB Utilities
 * 마이그레이션, 검색, 인덱싱 관련 유틸리티 함수들
 */

import type * as lancedb from '@lancedb/lancedb'
import type { RAGDocumentRecord } from './types.js'
import { logger } from '@/shared/logger/index.js'

/**
 * LanceDB 연결 옵션
 */
export interface LanceDBConnectionOptions {
  uri: string
  storageOptions?: {
    timeout?: string
    [key: string]: any
  }
}

/**
 * 검색 필터 옵션
 */
export interface LanceDBSearchFilter {
  fileTypes?: string[]
  fileIds?: string[]
  dateRange?: {
    start: string
    end: string
  }
  tags?: string[]
  customFilters?: Record<string, any>
}

/**
 * WHERE 절을 생성하는 유틸리티
 * @param filter 검색 필터
 * @returns SQL WHERE 절
 */
export function buildWhereClause(filter?: LanceDBSearchFilter): string | undefined {
  if (!filter) return undefined

  const conditions: string[] = []

  // 파일 타입 필터
  if (filter.fileTypes && filter.fileTypes.length > 0) {
    const fileTypes = filter.fileTypes.map(type => `'${type}'`).join(', ')
    conditions.push(`"fileType" IN (${fileTypes})`)
  }

  // 파일 ID 필터
  if (filter.fileIds && filter.fileIds.length > 0) {
    const fileIds = filter.fileIds.map(id => `'${id}'`).join(', ')
    conditions.push(`"fileId" IN (${fileIds})`)
  }

  // 날짜 범위 필터
  if (filter.dateRange) {
    conditions.push(`"fileModifiedAt" >= '${filter.dateRange.start}'`)
    conditions.push(`"fileModifiedAt" <= '${filter.dateRange.end}'`)
  }

  // 태그 필터 (배열 필드 검색)
  if (filter.tags && filter.tags.length > 0) {
    const tagConditions = filter.tags.map(tag => 
      `array_contains(tags, '${tag}')`
    ).join(' OR ')
    conditions.push(`(${tagConditions})`)
  }

  // 사용자 정의 필터
  if (filter.customFilters) {
    Object.entries(filter.customFilters).forEach(([key, value]) => {
      if (typeof value === 'string') {
        conditions.push(`${key} = '${value}'`)
      } else if (typeof value === 'number') {
        conditions.push(`${key} = ${value}`)
      } else if (Array.isArray(value)) {
        const values = value.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')
        conditions.push(`${key} IN (${values})`)
      }
    })
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined
}

/**
 * 검색 결과에 하이라이트 추가
 * @param content 원본 콘텐츠
 * @param query 검색 쿼리
 * @param maxLength 최대 길이
 * @returns 하이라이트가 적용된 스니펫
 */
export function highlightSearchResult(
  content: string,
  query: string,
  maxLength: number = 200
): { snippet: string; highlighted: boolean } {
  if (!query || query.trim().length === 0) {
    return {
      snippet: content.length > maxLength ? content.substring(0, maxLength) + '...' : content,
      highlighted: false
    }
  }

  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2)
  
  if (queryWords.length === 0) {
    return {
      snippet: content.length > maxLength ? content.substring(0, maxLength) + '...' : content,
      highlighted: false
    }
  }

  // 쿼리 단어들이 포함된 부분 찾기
  const lowerContent = content.toLowerCase()
  let bestStart = 0
  let bestScore = 0

  // 가장 많은 쿼리 단어가 포함된 구간 찾기
  for (let i = 0; i <= content.length - maxLength; i += Math.floor(maxLength / 4)) {
    const section = lowerContent.substring(i, i + maxLength)
    const score = queryWords.reduce((sum, word) => {
      return sum + (section.includes(word) ? 1 : 0)
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestStart = i
    }
  }

  let snippet = content.substring(bestStart, bestStart + maxLength)
  if (bestStart > 0) snippet = '...' + snippet
  if (bestStart + maxLength < content.length) snippet = snippet + '...'

  return {
    snippet,
    highlighted: bestScore > 0
  }
}

/**
 * 배치 처리를 위한 유틸리티
 * @param items 처리할 아이템 배열
 * @param batchSize 배치 크기
 * @param processor 배치 처리 함수
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = []
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    
    try {
      const batchResults = await processor(batch)
      results.push(...batchResults)
      
      logger.debug(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`, {
        processed: i + batch.length,
        total: items.length,
        component: 'LanceDB-Utils'
      })
    } catch (error) {
      logger.error(`Failed to process batch ${Math.floor(i / batchSize) + 1}`, error instanceof Error ? error : new Error(String(error)), {
        batchStart: i,
        batchSize: batch.length,
        component: 'LanceDB-Utils'
      })
      throw error
    }
  }
  
  return results
}

/**
 * LanceDB 테이블 상태 확인
 * @param table LanceDB 테이블
 * @returns 테이블 통계
 */
export async function getTableStats(table: any): Promise<{
  rowCount: number
  sizeBytes?: number
  lastModified?: string
  indexInfo?: any
}> {
  try {
    // LanceDB의 countRows 또는 유사한 메서드 사용
    const rowCount = await table.countRows()
    
    return {
      rowCount,
      lastModified: new Date().toISOString()
    }
  } catch (error) {
    logger.warn('Failed to get table stats', {
      error: error instanceof Error ? error.message : String(error),
      component: 'LanceDB-Utils'
    })
    
    return {
      rowCount: 0
    }
  }
}

/**
 * 중복 문서 제거 (간소화 버전)
 * @param records LanceDB 레코드 배열
 * @returns 중복 제거된 레코드 배열
 */
export function deduplicateRecords(records: RAGDocumentRecord[]): RAGDocumentRecord[] {
  const seen = new Set<string>()
  const deduplicated: RAGDocumentRecord[] = []

  for (const record of records) {
    // doc_id + chunk_id 조합으로 중복 체크
    const key = `${record.doc_id}_${record.chunk_id}`
    
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(record)
    }
  }

  logger.debug('Deduplicated records', {
    original: records.length,
    deduplicated: deduplicated.length,
    removed: records.length - deduplicated.length,
    component: 'LanceDB-Utils'
  })

  return deduplicated
}

/**
 * 검색 결과 스코어 정규화
 * @param results 검색 결과 배열
 * @returns 정규화된 검색 결과
 */
export function normalizeSearchScores(results: any[]): any[] {
  if (results.length === 0) return results

  const scores = results.map(r => r.score)
  const maxScore = Math.max(...scores)
  const minScore = Math.min(...scores)
  const scoreRange = maxScore - minScore

  if (scoreRange === 0) {
    return results.map(r => ({ ...r, score: 1.0 }))
  }

  return results.map(result => ({
    ...result,
    score: (result.score - minScore) / scoreRange
  }))
}

/**
 * 안전한 JSON 파싱
 * @param jsonString JSON 문자열
 * @param fallback 실패 시 기본값
 * @returns 파싱된 객체 또는 기본값
 */
export function safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback
  
  try {
    return JSON.parse(jsonString)
  } catch {
    return fallback
  }
}

/**
 * 메타데이터 정리 (순환 참조 제거 등)
 * @param metadata 메타데이터 객체
 * @returns 정리된 메타데이터
 */
export function sanitizeMetadata(metadata: any): Record<string, any> {
  try {
    // JSON 직렬화/역직렬화로 순환 참조 제거
    return JSON.parse(JSON.stringify(metadata))
  } catch (error) {
    logger.warn('Failed to sanitize metadata', {
      error: error instanceof Error ? error.message : String(error),
      component: 'LanceDB-Utils'
    })
    return {}
  }
}

/**
 * 임베딩 벡터 유효성 검사
 * @param vector 임베딩 벡터
 * @param expectedDimensions 예상 차원 수
 * @returns 유효성 검사 결과
 */
export function validateEmbeddingVector(
  vector: number[],
  expectedDimensions?: number
): { isValid: boolean; error?: string } {
  if (!Array.isArray(vector)) {
    return { isValid: false, error: 'Vector must be an array' }
  }

  if (vector.length === 0) {
    return { isValid: false, error: 'Vector cannot be empty' }
  }

  if (expectedDimensions && vector.length !== expectedDimensions) {
    return { 
      isValid: false, 
      error: `Vector dimension mismatch: expected ${expectedDimensions}, got ${vector.length}` 
    }
  }

  if (!vector.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))) {
    return { isValid: false, error: 'Vector must contain only finite numbers' }
  }

  return { isValid: true }
}