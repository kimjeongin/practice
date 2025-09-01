/**
 * LanceDB Types (간소화 버전)
 * 기존 복잡한 77개 필드를 5개 필드로 간소화
 * GPT Best Practice 방식 적용
 */

// 새로운 간단한 스키마 re-export
export type {
  RAGDocumentRecord,
  DocumentMetadata,
  RAGSearchResult
} from './simple-schema.js'

export {
  createSimpleLanceDBSchema,
  convertToRAGDocument,
  convertSearchResultToLegacy,
  buildSimpleWhereClause
} from './simple-schema.js'

import type { LanceDBEmbeddingFunction } from './embedding-bridge.js'

/**
 * LanceDB 테이블 생성 옵션 (간소화)
 */
export interface LanceDBTableOptions {
  tableName: string
  mode?: 'create' | 'overwrite' | 'append'
  embeddingFunction?: LanceDBEmbeddingFunction
}

/**
 * 검색 필터 옵션 (간소화)
 */
export interface SearchFilters {
  fileTypes?: string[]
  docIds?: string[]
  tags?: string[]
  dateRange?: {
    start: string
    end: string
  }
}

/**
 * 기본 테이블 옵션
 */
export const DEFAULT_TABLE_OPTIONS: LanceDBTableOptions = {
  tableName: 'documents',
  mode: 'create'
}

// 기존 복잡한 타입들은 더 이상 사용하지 않음
// 하위 호환성을 위해 필요한 경우에만 simple-schema.ts의 변환 함수 사용