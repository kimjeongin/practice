/**
 * LanceDB 설정 (간소화 버전)
 * GPT Best Practice 방식에 맞는 간단한 설정
 */

/**
 * LanceDB 기본 상수들
 */
export const LANCEDB_CONSTANTS = {
  DEFAULT_VECTOR_DIMENSIONS: 768,
  DEFAULT_BATCH_SIZE: 100,
  DEFAULT_SEARCH_LIMIT: 10,
  MAX_SEARCH_LIMIT: 1000,
  DEFAULT_TABLE_NAME: 'documents',
} as const

/**
 * 간소화된 테이블 설정
 */
export interface LanceDBTableConfig {
  name: string
  embeddingDimensions: number
}
/**
 * 연결 옵션
 */
export interface LanceDBConnectionOptions {
  uri: string
  storageOptions?: {
    timeout?: string
    [key: string]: any
  }
}

/**
 * 기본 연결 설정
 */
export const DEFAULT_CONNECTION_OPTIONS: LanceDBConnectionOptions = {
  uri: './.data/lancedb',
  storageOptions: {
    timeout: '30s',
  },
}
