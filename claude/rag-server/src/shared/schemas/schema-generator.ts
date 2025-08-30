/**
 * Schema-based Code Generation Utilities
 * 
 * Generates TypeScript interfaces, Arrow schemas, SQL queries, and validation
 * functions from the unified metadata schema to eliminate hardcoding.
 */

import * as arrow from 'apache-arrow'
import type { 
  UnifiedDocumentMetadata
} from './metadata-schema.js'
import { 
  SCHEMA_FIELD_MAPPINGS,
  REQUIRED_FIELDS,
  DEFAULT_VALUES
} from './metadata-schema.js'

// Re-export UnifiedDocumentMetadata for external use
export type { UnifiedDocumentMetadata }

/**
 * Arrow schema generation for LanceDB
 */
export class ArrowSchemaGenerator {
  /**
   * Generate Apache Arrow schema for LanceDB table creation
   */
  static generateLanceDBSchema(embeddingDimensions: number): arrow.Schema {
    const fields = [
      // Basic document fields
      arrow.Field.new('id', new arrow.Utf8()),
      arrow.Field.new('content', new arrow.Utf8()),
      
      // File information fields
      arrow.Field.new('fileId', new arrow.Utf8()),
      arrow.Field.new('fileName', new arrow.Utf8()),
      arrow.Field.new('filePath', new arrow.Utf8()),
      arrow.Field.new('fileSize', new arrow.Int64()),
      arrow.Field.new('fileType', new arrow.Utf8()),
      arrow.Field.new('fileHash', new arrow.Utf8()),
      arrow.Field.new('fileMimeType', new arrow.Utf8(), true), // nullable
      arrow.Field.new('fileEncoding', new arrow.Utf8(), true), // nullable
      
      // Timestamp fields (stored as ISO strings)
      arrow.Field.new('fileCreatedAt', new arrow.Utf8()),
      arrow.Field.new('fileModifiedAt', new arrow.Utf8()),
      arrow.Field.new('processedAt', new arrow.Utf8()),
      arrow.Field.new('indexedAt', new arrow.Utf8()),
      
      // Structure fields
      arrow.Field.new('chunkIndex', new arrow.Int32()),
      arrow.Field.new('totalChunks', new arrow.Int32()),
      arrow.Field.new('parentDocumentId', new arrow.Utf8(), true), // nullable
      arrow.Field.new('sectionTitle', new arrow.Utf8(), true), // nullable
      arrow.Field.new('pageNumber', new arrow.Int32(), true), // nullable
      arrow.Field.new('hierarchyLevel', new arrow.Int32(), true), // nullable
      
      // Content analysis fields
      arrow.Field.new('language', new arrow.Utf8(), true), // nullable
      arrow.Field.new('category', new arrow.Utf8(), true), // nullable
      arrow.Field.new('keywords', new arrow.List(arrow.Field.new('item', new arrow.Utf8())), true), // nullable
      arrow.Field.new('summary', new arrow.Utf8(), true), // nullable
      arrow.Field.new('importance', new arrow.Float32(), true), // nullable
      arrow.Field.new('readingTime', new arrow.Int32(), true), // nullable
      arrow.Field.new('wordCount', new arrow.Int32(), true), // nullable
      
      // Search optimization fields
      arrow.Field.new('tags', new arrow.List(arrow.Field.new('item', new arrow.Utf8())), true), // nullable
      arrow.Field.new('searchableText', new arrow.Utf8(), true), // nullable
      arrow.Field.new('contextHeaders', new arrow.List(arrow.Field.new('item', new arrow.Utf8())), true), // nullable
      arrow.Field.new('searchBoost', new arrow.Float32(), true), // nullable
      
      // System fields
      arrow.Field.new('modelVersion', new arrow.Utf8()),
      arrow.Field.new('embeddingId', new arrow.Utf8(), true), // nullable
      arrow.Field.new('processingVersion', new arrow.Utf8()),
      arrow.Field.new('sourceType', new arrow.Utf8()),
      arrow.Field.new('status', new arrow.Utf8()),
      arrow.Field.new('errorMessage', new arrow.Utf8(), true), // nullable
      arrow.Field.new('processingDuration', new arrow.Int64(), true), // nullable
      
      // Vector embedding field
      arrow.Field.new('vector', new arrow.FixedSizeList(
        embeddingDimensions, 
        arrow.Field.new('item', new arrow.Float32())
      )),
      
      // Legacy compatibility fields
      arrow.Field.new('createdAt', new arrow.Utf8()), // Maps to fileCreatedAt
      arrow.Field.new('updatedAt', new arrow.Utf8()), // Maps to processedAt
    ]

    return new arrow.Schema(fields)
  }

  /**
   * Get all field names for SELECT queries
   */
  static getAllFieldNames(): string[] {
    return [
      'id', 'content',
      // File fields
      'fileId', 'fileName', 'filePath', 'fileSize', 'fileType', 'fileHash', 
      'fileMimeType', 'fileEncoding',
      // Timestamp fields
      'fileCreatedAt', 'fileModifiedAt', 'processedAt', 'indexedAt',
      // Structure fields
      'chunkIndex', 'totalChunks', 'parentDocumentId', 'sectionTitle', 
      'pageNumber', 'hierarchyLevel',
      // Content fields
      'language', 'category', 'keywords', 'summary', 'importance', 
      'readingTime', 'wordCount',
      // Search fields
      'tags', 'searchableText', 'contextHeaders', 'searchBoost',
      // System fields
      'modelVersion', 'embeddingId', 'processingVersion', 'sourceType', 
      'status', 'errorMessage', 'processingDuration',
      // Legacy fields
      'createdAt', 'updatedAt'
    ]
  }

  /**
   * Get essential field names for basic queries
   */
  static getEssentialFieldNames(): string[] {
    return [
      'fileId', 'fileName', 'filePath', 'fileType', 'fileSize', 'fileHash',
      'fileCreatedAt', 'fileModifiedAt', 'processedAt', 'chunkIndex',
      'totalChunks', 'modelVersion', 'processingVersion', 'sourceType', 'status'
    ]
  }

  /**
   * Get metadata field names only (excluding content and vector)
   */
  static getMetadataFieldNames(): string[] {
    return this.getAllFieldNames().filter(name => !['id', 'content', 'vector'].includes(name))
  }
}

/**
 * Query generation utilities
 */
export class QueryGenerator {
  /**
   * Generate SELECT clause for metadata queries
   */
  static generateSelectClause(fields: 'all' | 'essential' | 'metadata' | string[]): string {
    let fieldNames: string[]
    
    if (Array.isArray(fields)) {
      fieldNames = fields
    } else {
      switch (fields) {
        case 'all':
          fieldNames = ArrowSchemaGenerator.getAllFieldNames()
          break
        case 'essential':
          fieldNames = ArrowSchemaGenerator.getEssentialFieldNames()
          break
        case 'metadata':
          fieldNames = ArrowSchemaGenerator.getMetadataFieldNames()
          break
        default:
          fieldNames = ArrowSchemaGenerator.getEssentialFieldNames()
      }
    }
    
    // Quote field names for LanceDB SQL queries
    return fieldNames.map(name => `"${name}"`).join(', ')
  }

  /**
   * Generate WHERE clause for file ID queries
   */
  static generateFileIdWhereClause(fileId: string): string {
    return `"fileId" = '${fileId}'`
  }

  /**
   * Generate WHERE clause for multiple file IDs
   */
  static generateFileIdsWhereClause(fileIds: string[]): string {
    const quotedIds = fileIds.map(id => `'${id}'`).join(', ')
    return `"fileId" IN (${quotedIds})`
  }

  /**
   * Generate WHERE clause for file type filter
   */
  static generateFileTypeWhereClause(fileTypes: string[]): string {
    const quotedTypes = fileTypes.map(type => `'${type}'`).join(', ')
    return `"fileType" IN (${quotedTypes})`
  }

  /**
   * Generate WHERE clause for date range filter
   */
  static generateDateRangeWhereClause(
    dateField: 'fileCreatedAt' | 'fileModifiedAt' | 'processedAt' | 'indexedAt',
    startDate: string,
    endDate: string
  ): string {
    return `"${dateField}" >= '${startDate}' AND "${dateField}" <= '${endDate}'`
  }

  /**
   * Generate WHERE clause for tags filter (array contains)
   */
  static generateTagsWhereClause(tags: string[]): string {
    const conditions = tags.map(tag => `array_contains(tags, '${tag}')`).join(' OR ')
    return `(${conditions})`
  }

  /**
   * Combine WHERE clauses with AND
   */
  static combineWhereClausesAnd(clauses: string[]): string {
    const validClauses = clauses.filter(clause => clause.trim().length > 0)
    return validClauses.length > 0 ? validClauses.join(' AND ') : ''
  }

  /**
   * Combine WHERE clauses with OR
   */
  static combineWhereClausesOr(clauses: string[]): string {
    const validClauses = clauses.filter(clause => clause.trim().length > 0)
    return validClauses.length > 0 ? `(${validClauses.join(' OR ')})` : ''
  }
}

/**
 * Data transformation utilities
 */
export class DataTransformer {
  /**
   * Convert UnifiedDocumentMetadata to flat LanceDB record
   */
  static unifiedToLanceDBRecord(
    metadata: UnifiedDocumentMetadata,
    content: string,
    vector: number[]
  ): Record<string, any> {
    const now = new Date().toISOString()
    
    return {
      // Basic fields
      id: `${metadata.file.id}_${metadata.structure.chunkIndex}`,
      content,
      vector,
      
      // File fields
      fileId: metadata.file.id,
      fileName: metadata.file.name,
      filePath: metadata.file.path,
      fileSize: metadata.file.size,
      fileType: metadata.file.type,
      fileHash: metadata.file.hash,
      fileMimeType: metadata.file.mimeType || null,
      fileEncoding: metadata.file.encoding || null,
      
      // Timestamp fields (as ISO strings)
      fileCreatedAt: metadata.timestamps.created.toISOString(),
      fileModifiedAt: metadata.timestamps.modified.toISOString(),
      processedAt: metadata.timestamps.processed.toISOString(),
      indexedAt: metadata.timestamps.indexed.toISOString(),
      
      // Structure fields
      chunkIndex: metadata.structure.chunkIndex,
      totalChunks: metadata.structure.totalChunks,
      parentDocumentId: metadata.structure.parentDocumentId || null,
      sectionTitle: metadata.structure.sectionTitle || null,
      pageNumber: metadata.structure.pageNumber || null,
      hierarchyLevel: metadata.structure.hierarchyLevel || null,
      
      // Content analysis fields
      language: metadata.content.language || null,
      category: metadata.content.category || null,
      keywords: metadata.content.keywords || null,
      summary: metadata.content.summary || null,
      importance: metadata.content.importance || null,
      readingTime: metadata.content.readingTime || null,
      wordCount: metadata.content.wordCount || null,
      
      // Search optimization fields
      tags: metadata.search.tags || null,
      searchableText: metadata.search.searchableText || null,
      contextHeaders: metadata.search.contextHeaders || null,
      searchBoost: metadata.search.searchBoost || null,
      
      // System fields
      modelVersion: metadata.system.modelVersion,
      embeddingId: metadata.system.embeddingId || null,
      processingVersion: metadata.system.processingVersion,
      sourceType: metadata.system.sourceType,
      status: metadata.system.status,
      errorMessage: metadata.system.errorMessage || null,
      processingDuration: metadata.system.processingDuration || null,
      
      // Legacy compatibility
      createdAt: metadata.timestamps.created.toISOString(),
      updatedAt: metadata.timestamps.processed.toISOString(),
    }
  }

  /**
   * Convert flat LanceDB record to UnifiedDocumentMetadata
   */
  static lanceDBRecordToUnified(record: Record<string, any>): UnifiedDocumentMetadata {
    return {
      file: {
        id: record.fileId || '',
        name: record.fileName || '',
        path: record.filePath || '',
        size: record.fileSize || 0,
        hash: record.fileHash || '',
        type: record.fileType || 'text',
        mimeType: record.fileMimeType || 'text/plain',
        encoding: record.fileEncoding || 'utf-8'
      },
      timestamps: {
        created: new Date(record.fileCreatedAt || record.createdAt || Date.now()),
        modified: new Date(record.fileModifiedAt || Date.now()),
        processed: new Date(record.processedAt || record.updatedAt || Date.now()),
        indexed: new Date(record.indexedAt || Date.now())
      },
      structure: {
        chunkIndex: record.chunkIndex || 0,
        totalChunks: record.totalChunks || 1,
        parentDocumentId: record.parentDocumentId || undefined,
        sectionTitle: record.sectionTitle || undefined,
        pageNumber: record.pageNumber || undefined,
        hierarchyLevel: record.hierarchyLevel || undefined
      },
      content: {
        language: record.language || undefined,
        category: record.category || undefined,
        keywords: record.keywords || undefined,
        summary: record.summary || undefined,
        importance: record.importance || undefined,
        readingTime: record.readingTime || undefined,
        wordCount: record.wordCount || undefined
      },
      search: {
        tags: record.tags || undefined,
        searchableText: record.searchableText || undefined,
        contextHeaders: record.contextHeaders || undefined,
        searchBoost: record.searchBoost || undefined
      },
      system: {
        modelVersion: record.modelVersion || '1.0.0',
        embeddingId: record.embeddingId || undefined,
        processingVersion: record.processingVersion || '1.0.0',
        sourceType: record.sourceType || 'local_file',
        status: record.status || 'completed',
        errorMessage: record.errorMessage || undefined,
        processingDuration: record.processingDuration || undefined
      }
    }
  }
}

/**
 * Validation utilities
 */
export class MetadataValidator {
  /**
   * Validate required fields are present
   */
  static validateRequiredFields(
    metadata: Partial<UnifiedDocumentMetadata>,
    level: keyof typeof REQUIRED_FIELDS = 'standard'
  ): { isValid: boolean; missingFields: string[] } {
    const requiredFields = REQUIRED_FIELDS[level]
    const missingFields: string[] = []
    
    for (const fieldPath of requiredFields) {
      if (!this.hasNestedProperty(metadata, fieldPath)) {
        missingFields.push(fieldPath)
      }
    }
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    }
  }

  /**
   * Check if nested property exists
   */
  private static hasNestedProperty(obj: any, path: string): boolean {
    const keys = path.split('.')
    let current = obj
    
    for (const key of keys) {
      if (current == null || typeof current !== 'object' || !(key in current)) {
        return false
      }
      current = current[key]
    }
    
    return current !== null && current !== undefined
  }

  /**
   * Validate field types
   */
  static validateFieldTypes(metadata: UnifiedDocumentMetadata): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    
    // Validate file fields
    if (typeof metadata.file.id !== 'string') errors.push('file.id must be a string')
    if (typeof metadata.file.name !== 'string') errors.push('file.name must be a string')
    if (typeof metadata.file.path !== 'string') errors.push('file.path must be a string')
    if (typeof metadata.file.size !== 'number') errors.push('file.size must be a number')
    if (typeof metadata.file.type !== 'string') errors.push('file.type must be a string')
    
    // Validate timestamp fields
    if (!(metadata.timestamps.created instanceof Date)) {
      errors.push('timestamps.created must be a Date')
    }
    if (!(metadata.timestamps.modified instanceof Date)) {
      errors.push('timestamps.modified must be a Date')
    }
    if (!(metadata.timestamps.processed instanceof Date)) {
      errors.push('timestamps.processed must be a Date')
    }
    if (!(metadata.timestamps.indexed instanceof Date)) {
      errors.push('timestamps.indexed must be a Date')
    }
    
    // Validate structure fields
    if (typeof metadata.structure.chunkIndex !== 'number') {
      errors.push('structure.chunkIndex must be a number')
    }
    if (typeof metadata.structure.totalChunks !== 'number') {
      errors.push('structure.totalChunks must be a number')
    }
    
    // Validate system fields
    if (typeof metadata.system.modelVersion !== 'string') {
      errors.push('system.modelVersion must be a string')
    }
    if (typeof metadata.system.processingVersion !== 'string') {
      errors.push('system.processingVersion must be a string')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
}

/**
 * Index configuration generator
 */
export class IndexConfigGenerator {
  /**
   * Generate LanceDB index configuration
   */
  static generateLanceDBIndexConfig() {
    return {
      // Full-text search indices
      fullTextSearchColumns: [
        'content',
        'fileName', 
        'sectionTitle',
        'summary',
        'searchableText'
      ],
      
      // Scalar indices for filtering
      scalarIndices: [
        'fileId',
        'fileType',
        'fileHash',
        'chunkIndex',
        'language',
        'category',
        'sourceType',
        'status',
        'modelVersion'
      ],
      
      // Composite indices for common query patterns
      compositeIndices: [
        ['fileId', 'chunkIndex'],  // For document retrieval
        ['fileType', 'language'],   // For content filtering
        ['sourceType', 'status'],   // For system queries
        ['processedAt', 'fileType'] // For recent documents
      ]
    }
  }
}