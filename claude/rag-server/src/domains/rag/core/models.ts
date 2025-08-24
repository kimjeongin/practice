// Domain models
export interface FileMetadata {
  id: string
  path: string
  name: string
  size: number
  modifiedAt: Date
  createdAt: Date
  fileType: string
  hash: string
  indexedAt?: Date
}

export interface DocumentChunk {
  id: string
  fileId: string
  chunkIndex: number
  content: string
  embeddingId?: string
}

export interface CustomMetadata {
  fileId: string
  key: string
  value: string
}

export class FileChangeEvent {
  constructor(
    public readonly type: 'added' | 'changed' | 'removed',
    public readonly path: string
  ) {}
}

export class ProcessingStatus {
  constructor(
    public readonly isProcessing: boolean,
    public readonly queueSize: number,
    public readonly lastProcessedFile?: string
  ) {}
}
