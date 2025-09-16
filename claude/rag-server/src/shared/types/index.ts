/**
 * Shared Types
 * Common types used across multiple domains
 */

// File Event Types (used by RAG types)
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