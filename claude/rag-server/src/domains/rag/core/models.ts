/**
 * RAG Core Models (간소화 버전)
 * FileMetadata를 새로운 DocumentMetadata로 통합
 */

// 실제 파일 메타데이터 인터페이스 (FileWatcher와 extractFileMetadata에서 사용)
export interface FileMetadata {
  id: string
  name: string
  path: string
  size: number
  fileType: string
  createdAt: string   // ISO string
  modifiedAt: string  // ISO string
  hash: string
}

// VectorDB에 저장되는 문서 메타데이터 (새로운 통합된 메타데이터 타입)
import type { DocumentMetadata as ImportedDocumentMetadata } from './types.js'

// 새로운 메타데이터 타입 re-export
export type DocumentMetadata = ImportedDocumentMetadata

/**
 * 문서 청크 인터페이스 (간소화)
 */
export interface DocumentChunk {
  id: string
  fileId: string
  chunkIndex: number
  content: string
  embeddingId?: string
  metadata?: DocumentMetadata
}

/**
 * 사용자 정의 메타데이터 (간소화)
 */
export interface CustomMetadata {
  fileId: string
  key: string
  value: string
}

/**
 * 임베딩 모델 메타데이터
 */
export interface EmbeddingMetadataModel {
  id: string
  modelName: string
  serviceName: string
  dimensions: number
  modelVersion?: string
  configHash: string
  isActive: boolean
  totalDocuments: number
  totalVectors: number
  createdAt: Date
  lastUsedAt: Date
}

/**
 * 파일 변경 이벤트
 */
export class FileChangeEvent {
  constructor(
    public readonly type: 'added' | 'changed' | 'removed',
    public readonly path: string
  ) {}
}

/**
 * 처리 상태
 */
export class ProcessingStatus {
  constructor(
    public readonly isProcessing: boolean,
    public readonly queueSize: number,
    public readonly lastProcessedFile?: string
  ) {}
}

/**
 * DocumentMetadata를 legacy FileMetadata 형식으로 변환
 */
export function documentMetadataToLegacyFileMetadata(metadata: DocumentMetadata): any {
  return {
    id: metadata.filePath, // path를 id로 사용 (기존 방식)
    path: metadata.filePath,
    name: metadata.fileName,
    size: metadata.fileSize,
    modifiedAt: new Date(metadata.modifiedAt),
    createdAt: new Date(metadata.createdAt),
    fileType: metadata.fileType,
    hash: metadata.fileHash,
    indexedAt: new Date(metadata.processedAt)
  }
}