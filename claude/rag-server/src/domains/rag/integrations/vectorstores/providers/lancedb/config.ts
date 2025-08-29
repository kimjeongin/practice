/**
 * LanceDB Schema Configuration
 * 중앙화된 스키마 정의 - 환경변수가 아닌 코드로 관리
 */

export interface LanceDBTableConfig {
  name: string
  mode: 'create' | 'overwrite' | 'append'
  enableFullTextSearch: boolean
  indexColumns: string[]
  vectorColumn: string
  metadataColumns: string[]
  description?: string
}

export const LanceDBSchemaConfig = {
  /**
   * 기본 문서 테이블 - RAG 시스템의 메인 테이블
   */
  defaultTable: {
    name: 'documents',
    mode: 'create' as const,
    enableFullTextSearch: true,
    indexColumns: ['fileName', 'fileType', 'content', 'tags'],
    vectorColumn: 'embedding',
    metadataColumns: ['fileId', 'filePath', 'chunkIndex', 'createdAt', 'updatedAt'],
    description: 'Main documents table for RAG system'
  } satisfies LanceDBTableConfig,

  /**
   * 청크 테이블 - 문서 청크별 세부 정보 (필요시 사용)
   */
  chunksTable: {
    name: 'chunks',
    mode: 'create' as const,
    enableFullTextSearch: true,
    indexColumns: ['content', 'fileType'],
    vectorColumn: 'embedding',
    metadataColumns: ['parentFileId', 'chunkIndex', 'startOffset', 'endOffset'],
    description: 'Document chunks for granular search'
  } satisfies LanceDBTableConfig,

  /**
   * 메타데이터 테이블 - 파일 메타데이터 (필요시 사용)
   */
  metadataTable: {
    name: 'file_metadata',
    mode: 'create' as const,
    enableFullTextSearch: false,
    indexColumns: ['fileName', 'fileType'],
    vectorColumn: 'summary_embedding',
    metadataColumns: ['fileId', 'tags', 'categories', 'lastModified'],
    description: 'File metadata and summary information'
  } satisfies LanceDBTableConfig
} as const

/**
 * 기본 테이블 설정 가져오기
 */
export function getDefaultTableConfig(): LanceDBTableConfig {
  return LanceDBSchemaConfig.defaultTable
}

/**
 * 테이블 설정 가져오기 (이름으로)
 */
export function getTableConfig(tableName: keyof typeof LanceDBSchemaConfig): LanceDBTableConfig {
  return LanceDBSchemaConfig[tableName]
}

/**
 * 모든 테이블 설정 목록
 */
export function getAllTableConfigs(): LanceDBTableConfig[] {
  return Object.values(LanceDBSchemaConfig)
}

/**
 * LanceDB 기본 상수들
 */
export const LANCEDB_CONSTANTS = {
  DEFAULT_VECTOR_DIMENSIONS: 384,
  DEFAULT_BATCH_SIZE: 100,
  DEFAULT_SEARCH_LIMIT: 10,
  MAX_SEARCH_LIMIT: 1000,
  FTS_INDEX_NAME_SUFFIX: '_fts',
  VECTOR_INDEX_NAME_SUFFIX: '_vector'
} as const

/**
 * types.ts에서 이동된 기본 테이블 옵션
 */
export const DEFAULT_TABLE_OPTIONS = {
  tableName: 'documents',
  mode: 'create' as const,
  enableFullTextSearch: true,
  indexColumns: ['fileName', 'fileType', 'content', 'tags']
}