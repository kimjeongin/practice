/**
 * Shared Types
 * Common types used across multiple domains
 */

// Common Result Types
export interface CommonResult<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp?: string
}

export interface ApiResponse<T = any> extends CommonResult<T> {
  statusCode?: number
}

// Base Metadata Types
export interface BaseMetadata {
  createdAt: string
  modifiedAt: string
  [key: string]: any
}

// Error Types
export interface ErrorResponse {
  error: string
  code?: string | number
  details?: Record<string, any>
  timestamp?: string
}

// Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type Timestamp = string // ISO string
export type UUID = string

// Configuration Types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Environment = 'development' | 'production' | 'test'

// File Event Types (moved from RAG types)
export interface FileWatcherEvent {
  type: 'added' | 'changed' | 'deleted'
  path: string
  metadata?: {
    id: string
    name: string
    path: string
    size: number
    fileType: string
    createdAt: string
    modifiedAt: string
    hash: string
  }
}