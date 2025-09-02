/**
 * LanceDB Configuration - Simplified
 * Simple configuration following GPT Best Practices
 */

/**
 * LanceDB default constants
 */
export const LANCEDB_CONSTANTS = {
  DEFAULT_VECTOR_DIMENSIONS: 768,
  DEFAULT_BATCH_SIZE: 100,
  DEFAULT_SEARCH_LIMIT: 10,
  MAX_SEARCH_LIMIT: 1000,
  DEFAULT_TABLE_NAME: 'documents',
} as const

/**
 * Simplified table configuration
 */
export interface LanceDBTableConfig {
  name: string
  embeddingDimensions: number
}

/**
 * Connection options
 */
export interface LanceDBConnectionOptions {
  uri: string
  storageOptions?: {
    timeout?: string
    [key: string]: any
  }
}

/**
 * Default connection configuration
 */
export const DEFAULT_CONNECTION_OPTIONS: LanceDBConnectionOptions = {
  uri: './.data/lancedb',
  storageOptions: {
    timeout: '30s',
  },
}