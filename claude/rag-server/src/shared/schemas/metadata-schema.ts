/**
 * Unified Metadata Schema Definition
 * 
 * This file defines the single source of truth for all document metadata
 * used throughout the RAG system. It eliminates hardcoded field names
 * and ensures consistency across all components.
 * 
 * Based on 2024 RAG best practices:
 * - Hierarchical document structure
 * - Contextual metadata for enhanced retrieval
 * - Search optimization fields
 * - Comprehensive file tracking
 */

/**
 * Core file information
 */
export interface FileInfo {
  /** Unique identifier for the file (SHA-256 hash of path) */
  id: string
  /** Original filename */
  name: string
  /** Full file path */
  path: string
  /** File size in bytes */
  size: number
  /** Content hash for change detection */
  hash: string
  /** File extension/type */
  type: string
  /** MIME type */
  mimeType: string
  /** Character encoding (e.g., 'utf-8') */
  encoding: string
}

/**
 * Timestamp information
 */
export interface TimestampInfo {
  /** File creation time */
  created: Date
  /** File last modification time */
  modified: Date
  /** When the file was processed by RAG system */
  processed: Date
  /** When the document was indexed in vector store */
  indexed: Date
}

/**
 * Document structure and hierarchy
 */
export interface DocumentStructure {
  /** Chunk index within the document (0-based) */
  chunkIndex: number
  /** Total number of chunks in the document */
  totalChunks: number
  /** Parent document ID for hierarchical documents */
  parentDocumentId?: string
  /** Section/chapter title if available */
  sectionTitle?: string
  /** Page number for paginated documents */
  pageNumber?: number
  /** Hierarchy level (0=root, 1=chapter, 2=section, etc.) */
  hierarchyLevel?: number
}

/**
 * Content analysis metadata
 */
export interface ContentAnalysis {
  /** Detected language (ISO 639-1 code) */
  language?: string
  /** Document category/classification */
  category?: string
  /** Extracted keywords */
  keywords?: string[]
  /** Auto-generated summary */
  summary?: string
  /** Content importance score (0-1) */
  importance?: number
  /** Estimated reading time in minutes */
  readingTime?: number
  /** Word count */
  wordCount?: number
}

/**
 * Search optimization metadata
 */
export interface SearchOptimization {
  /** User-defined or auto-generated tags */
  tags?: string[]
  /** Enhanced searchable text with context */
  searchableText?: string
  /** Context headers for better retrieval */
  contextHeaders?: string[]
  /** Boost factor for search ranking */
  searchBoost?: number
}

/**
 * System and processing information
 */
export interface SystemInfo {
  /** Embedding model version used */
  modelVersion: string
  /** Embedding ID (if stored separately) */
  embeddingId?: string
  /** Processing pipeline version */
  processingVersion: string
  /** Source type */
  sourceType: 'local_file' | 'web' | 'database' | 'api' | 'manual'
  /** Processing status */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** Error message if processing failed */
  errorMessage?: string
  /** Processing duration in milliseconds */
  processingDuration?: number
}

/**
 * Unified Document Metadata - Single Source of Truth
 * 
 * This interface combines all metadata aspects and serves as the
 * canonical definition for document metadata throughout the system.
 */
export interface UnifiedDocumentMetadata {
  /** File information */
  file: FileInfo
  /** Timestamp information */
  timestamps: TimestampInfo
  /** Document structure and hierarchy */
  structure: DocumentStructure
  /** Content analysis results */
  content: ContentAnalysis
  /** Search optimization fields */
  search: SearchOptimization
  /** System and processing information */
  system: SystemInfo
}

/**
 * Schema field mappings for backward compatibility and external systems
 */
export const SCHEMA_FIELD_MAPPINGS = {
  // File info mappings
  fileId: 'file.id',
  fileName: 'file.name',
  filePath: 'file.path',
  fileSize: 'file.size',
  fileType: 'file.type',
  fileHash: 'file.hash',
  fileMimeType: 'file.mimeType',
  fileEncoding: 'file.encoding',
  
  // Timestamp mappings
  fileCreatedAt: 'timestamps.created',
  fileModifiedAt: 'timestamps.modified',
  processedAt: 'timestamps.processed',
  indexedAt: 'timestamps.indexed',
  createdAt: 'timestamps.created', // Backward compatibility
  updatedAt: 'timestamps.processed', // Backward compatibility
  
  // Structure mappings
  chunkIndex: 'structure.chunkIndex',
  totalChunks: 'structure.totalChunks',
  parentDocumentId: 'structure.parentDocumentId',
  sectionTitle: 'structure.sectionTitle',
  pageNumber: 'structure.pageNumber',
  
  // Content mappings
  language: 'content.language',
  category: 'content.category',
  keywords: 'content.keywords',
  summary: 'content.summary',
  importance: 'content.importance',
  
  // Search mappings
  tags: 'search.tags',
  searchableText: 'search.searchableText',
  contextHeaders: 'search.contextHeaders',
  
  // System mappings
  modelVersion: 'system.modelVersion',
  embeddingId: 'system.embeddingId',
  processingVersion: 'system.processingVersion',
  sourceType: 'system.sourceType',
  status: 'system.status',
} as const

/**
 * Required fields for different use cases
 */
const REQUIRED_FIELDS_MINIMAL = [
  'file.id',
  'file.name', 
  'file.path',
  'file.size',
  'file.type',
  'structure.chunkIndex',
  'timestamps.processed',
  'system.sourceType'
] as const

const REQUIRED_FIELDS_STANDARD = [
  ...REQUIRED_FIELDS_MINIMAL,
  'file.hash',
  'timestamps.created',
  'timestamps.modified',
  'timestamps.indexed',
  'structure.totalChunks',
  'system.modelVersion',
  'system.processingVersion'
] as const

const REQUIRED_FIELDS_ENHANCED = [
  ...REQUIRED_FIELDS_STANDARD,
  'content.language',
  'content.keywords',
  'search.tags',
  'search.contextHeaders'
] as const

export const REQUIRED_FIELDS = {
  minimal: REQUIRED_FIELDS_MINIMAL,
  standard: REQUIRED_FIELDS_STANDARD,
  enhanced: REQUIRED_FIELDS_ENHANCED
} as const

/**
 * Default values for optional fields
 */
export const DEFAULT_VALUES = {
  file: {
    mimeType: 'text/plain',
    encoding: 'utf-8'
  },
  structure: {
    hierarchyLevel: 0
  },
  content: {
    importance: 0.5
  },
  search: {
    searchBoost: 1.0
  },
  system: {
    sourceType: 'local_file' as const,
    status: 'pending' as const,
    processingVersion: '1.0.0',
    modelVersion: '1.0.0'
  }
} as const

/**
 * Type guard to check if metadata conforms to UnifiedDocumentMetadata
 */
export function isUnifiedDocumentMetadata(obj: any): obj is UnifiedDocumentMetadata {
  if (!obj || typeof obj !== 'object') return false
  
  // Check required nested objects exist
  if (!obj.file || !obj.timestamps || !obj.structure || 
      !obj.content || !obj.search || !obj.system) {
    return false
  }
  
  // Check essential fields exist
  return Boolean(
    obj.file.id &&
    obj.file.name &&
    obj.file.path &&
    typeof obj.file.size === 'number' &&
    obj.file.type &&
    typeof obj.structure.chunkIndex === 'number' &&
    obj.timestamps.processed &&
    obj.system.sourceType
  )
}

/**
 * Create a new UnifiedDocumentMetadata with defaults
 */
export function createUnifiedMetadata(
  partial: Partial<UnifiedDocumentMetadata>
): UnifiedDocumentMetadata {
  const now = new Date()
  
  return {
    file: {
      id: partial.file?.id || '',
      name: partial.file?.name || '',
      path: partial.file?.path || '',
      size: partial.file?.size || 0,
      hash: partial.file?.hash || '',
      type: partial.file?.type || 'text',
      mimeType: partial.file?.mimeType || 'text/plain',
      encoding: partial.file?.encoding || 'utf-8',
    },
    timestamps: {
      created: partial.timestamps?.created || now,
      modified: partial.timestamps?.modified || now,
      processed: partial.timestamps?.processed || now,
      indexed: partial.timestamps?.indexed || now,
    },
    structure: {
      chunkIndex: partial.structure?.chunkIndex || 0,
      totalChunks: partial.structure?.totalChunks || 1,
      hierarchyLevel: partial.structure?.hierarchyLevel || 0,
      parentDocumentId: partial.structure?.parentDocumentId,
      sectionTitle: partial.structure?.sectionTitle,
      pageNumber: partial.structure?.pageNumber,
    },
    content: {
      importance: partial.content?.importance || 0.5,
      language: partial.content?.language,
      category: partial.content?.category,
      keywords: partial.content?.keywords,
      summary: partial.content?.summary,
      readingTime: partial.content?.readingTime,
      wordCount: partial.content?.wordCount,
    },
    search: {
      searchBoost: partial.search?.searchBoost || 1.0,
      tags: partial.search?.tags || [],
      contextHeaders: partial.search?.contextHeaders || [],
      searchableText: partial.search?.searchableText,
    },
    system: {
      modelVersion: partial.system?.modelVersion || '1.0.0',
      processingVersion: partial.system?.processingVersion || '1.0.0',
      sourceType: partial.system?.sourceType || 'local_file',
      status: partial.system?.status || 'pending',
      embeddingId: partial.system?.embeddingId,
      errorMessage: partial.system?.errorMessage,
      processingDuration: partial.system?.processingDuration,
    }
  }
}