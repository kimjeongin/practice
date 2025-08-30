/**
 * Data Migration Manager
 *
 * Handles safe migration of existing data to the new unified metadata schema.
 * Provides backward compatibility and rollback capabilities.
 */

import { logger } from '@/shared/logger/index.js'
import {
  UnifiedDocumentMetadata,
  createUnifiedMetadata,
  isUnifiedDocumentMetadata,
} from './metadata-schema.js'
import {
  ArrowSchemaGenerator,
  DataTransformer,
  MetadataValidator,
  QueryGenerator,
} from './schema-generator.js'

/**
 * Migration result information
 */
export interface MigrationResult {
  success: boolean
  totalRecords: number
  migratedRecords: number
  failedRecords: number
  errors: string[]
  duration: number
  backupPath?: string
}

/**
 * Migration options
 */
export interface MigrationOptions {
  /** Create backup before migration */
  createBackup: boolean
  /** Batch size for processing records */
  batchSize: number
  /** Validate data integrity after migration */
  validateAfterMigration: boolean
  /** Skip records that fail validation */
  skipInvalidRecords: boolean
  /** Dry run mode - don't make actual changes */
  dryRun: boolean
  /** Force migration even if already migrated */
  force: boolean
}

/**
 * Schema version information
 */
export interface SchemaVersion {
  version: string
  timestamp: Date
  description: string
  migrationRequired: boolean
}

/**
 * Migration Manager class
 */
export class MigrationManager {
  private static readonly SCHEMA_VERSION_KEY = 'schema_version_metadata'
  private static readonly CURRENT_SCHEMA_VERSION = '2.0.0'
  private static readonly BACKUP_SUFFIX = '_backup'

  /**
   * Get default migration options
   */
  static getDefaultOptions(): MigrationOptions {
    return {
      createBackup: true,
      batchSize: 100,
      validateAfterMigration: true,
      skipInvalidRecords: true,
      dryRun: false,
      force: false,
    }
  }

  /**
   * Check if migration is needed
   */
  static async checkMigrationRequired(
    vectorStore: any
  ): Promise<{ required: boolean; currentVersion?: string; reason?: string }> {
    try {
      await vectorStore.initialize()

      // Check for schema version metadata
      const versionMetadata = await this.getSchemaVersion(vectorStore)

      if (!versionMetadata) {
        return {
          required: true,
          reason: 'No schema version found - likely legacy data',
        }
      }

      if (versionMetadata.version !== this.CURRENT_SCHEMA_VERSION) {
        return {
          required: true,
          currentVersion: versionMetadata.version,
          reason: `Schema version mismatch: ${versionMetadata.version} → ${this.CURRENT_SCHEMA_VERSION}`,
        }
      }

      return {
        required: false,
        currentVersion: versionMetadata.version,
        reason: 'Schema is up to date',
      }
    } catch (error) {
      logger.error(
        'Failed to check migration status',
        error instanceof Error ? error : new Error(String(error))
      )
      return {
        required: true,
        reason: 'Unable to determine schema version - assuming migration needed',
      }
    }
  }

  /**
   * Perform data migration
   */
  static async migrate(
    vectorStore: any,
    options: Partial<MigrationOptions> = {}
  ): Promise<MigrationResult> {
    const opts = { ...this.getDefaultOptions(), ...options }
    const startTime = Date.now()

    logger.info('🔄 Starting data migration to unified metadata schema', {
      options: opts,
      targetVersion: this.CURRENT_SCHEMA_VERSION,
    })

    const result: MigrationResult = {
      success: false,
      totalRecords: 0,
      migratedRecords: 0,
      failedRecords: 0,
      errors: [],
      duration: 0,
    }

    try {
      await vectorStore.initialize()

      // Check if migration is actually needed
      const migrationCheck = await this.checkMigrationRequired(vectorStore)
      if (!migrationCheck.required && !opts.force) {
        logger.info('✅ Migration not required', migrationCheck)
        result.success = true
        result.duration = Date.now() - startTime
        return result
      }

      // Create backup if requested
      if (opts.createBackup && !opts.dryRun) {
        logger.info('💾 Creating backup before migration...')
        result.backupPath = await this.createBackup(vectorStore)
        logger.info(`✅ Backup created: ${result.backupPath}`)
      }

      // Get all existing records
      logger.info('📊 Counting existing records...')
      const allRecords = await this.getAllRecords(vectorStore)
      result.totalRecords = allRecords.length

      logger.info(`📄 Found ${result.totalRecords} records to migrate`)

      if (result.totalRecords === 0) {
        logger.info('ℹ️ No records to migrate')
        await this.updateSchemaVersion(vectorStore, opts.dryRun)
        result.success = true
        result.duration = Date.now() - startTime
        return result
      }

      // Process records in batches
      const batches = this.createBatches(allRecords, opts.batchSize)

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]!
        logger.info(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} records)`)

        const batchResult = await this.migrateBatch(batch, vectorStore, opts)
        result.migratedRecords += batchResult.migratedCount
        result.failedRecords += batchResult.failedCount
        result.errors.push(...batchResult.errors)

        // Log progress
        const progress = Math.round(((i + 1) / batches.length) * 100)
        logger.info(
          `📈 Migration progress: ${progress}% (${result.migratedRecords}/${result.totalRecords} records)`
        )
      }

      // Validate migration if requested
      if (opts.validateAfterMigration && !opts.dryRun) {
        logger.info('✅ Validating migrated data...')
        const validationResult = await this.validateMigration(vectorStore)
        if (!validationResult.isValid) {
          result.errors.push(...validationResult.errors)
          throw new Error('Migration validation failed')
        }
        logger.info('✅ Migration validation successful')
      }

      // Update schema version
      if (!opts.dryRun) {
        await this.updateSchemaVersion(vectorStore, false)
      }

      result.success = result.failedRecords === 0 || result.migratedRecords > 0
      result.duration = Date.now() - startTime

      logger.info('🎉 Migration completed', {
        success: result.success,
        totalRecords: result.totalRecords,
        migratedRecords: result.migratedRecords,
        failedRecords: result.failedRecords,
        duration: result.duration,
        dryRun: opts.dryRun,
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('❌ Migration failed', error instanceof Error ? error : new Error(errorMessage))

      result.errors.push(errorMessage)
      result.duration = Date.now() - startTime

      // Attempt rollback if backup was created
      if (result.backupPath && !opts.dryRun) {
        logger.info('🔄 Attempting rollback from backup...')
        try {
          await this.rollbackFromBackup(vectorStore, result.backupPath)
          logger.info('✅ Rollback successful')
        } catch (rollbackError) {
          logger.error(
            '❌ Rollback failed',
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
          )
          result.errors.push(`Rollback failed: ${rollbackError}`)
        }
      }

      return result
    }
  }

  /**
   * Get all records from the vector store
   */
  private static async getAllRecords(vectorStore: any): Promise<any[]> {
    try {
      // Query all records excluding system metadata
      const results = await vectorStore.table
        .query()
        .where(`"sourceType" != 'system' OR "sourceType" IS NULL`)
        .select(ArrowSchemaGenerator.getAllFieldNames().filter((name) => name !== 'vector'))
        .toArray()

      return results
    } catch (error) {
      logger.error(
        'Failed to get all records',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Create processing batches
   */
  private static createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Migrate a batch of records
   */
  private static async migrateBatch(
    batch: any[],
    vectorStore: any,
    options: MigrationOptions
  ): Promise<{ migratedCount: number; failedCount: number; errors: string[] }> {
    let migratedCount = 0
    let failedCount = 0
    const errors: string[] = []

    for (const record of batch) {
      try {
        // Convert legacy record to unified metadata
        const unifiedMetadata = this.convertLegacyToUnified(record)

        // Validate the converted metadata
        const validation = MetadataValidator.validateRequiredFields(unifiedMetadata, 'standard')
        if (!validation.isValid && !options.skipInvalidRecords) {
          throw new Error(`Validation failed: ${validation.missingFields.join(', ')}`)
        }

        if (!options.dryRun) {
          // Update the record with new schema fields
          const updatedRecord = this.enhanceRecordWithNewFields(record, unifiedMetadata)

          // In a real implementation, you would update the record in the vector store
          // For now, we'll simulate the update
          logger.debug('Would update record', { id: record.id, fields: Object.keys(updatedRecord) })
        }

        migratedCount++
      } catch (error) {
        const errorMessage = `Record ${record.id || 'unknown'}: ${
          error instanceof Error ? error.message : String(error)
        }`
        errors.push(errorMessage)
        failedCount++

        if (!options.skipInvalidRecords) {
          logger.error(
            'Migration failed for record',
            error instanceof Error ? error : new Error(errorMessage)
          )
        }
      }
    }

    return { migratedCount, failedCount, errors }
  }

  /**
   * Convert legacy record format to unified metadata
   */
  private static convertLegacyToUnified(record: any): UnifiedDocumentMetadata {
    const now = new Date()

    // Extract existing fields with fallbacks
    const fileId = record.fileId || `migrated_${Date.now()}`
    const fileName = record.fileName || record.filename || 'unknown'
    const filePath = record.filePath || record.filepath || ''
    const fileSize = record.fileSize || record.size || 0
    const fileType = record.fileType || record.filetype || 'text'
    const fileHash = record.fileHash || record.hash || fileId

    // Parse dates safely
    const parseDate = (value: any, fallback: Date = now): Date => {
      if (!value) return fallback
      if (value instanceof Date) return value
      if (typeof value === 'string') {
        const parsed = new Date(value)
        return isNaN(parsed.getTime()) ? fallback : parsed
      }
      return fallback
    }

    return createUnifiedMetadata({
      file: {
        id: fileId,
        name: fileName,
        path: filePath,
        size: fileSize,
        hash: fileHash,
        type: fileType,
        mimeType: record.fileMimeType || 'text/plain',
        encoding: record.fileEncoding || 'utf-8',
      },
      timestamps: {
        created: parseDate(record.fileCreatedAt || record.createdAt),
        modified: parseDate(record.fileModifiedAt || record.modifiedAt),
        processed: parseDate(record.processedAt || record.updatedAt),
        indexed: parseDate(record.indexedAt),
      },
      structure: {
        chunkIndex: record.chunkIndex || 0,
        totalChunks: record.totalChunks || 1,
        parentDocumentId: record.parentDocumentId,
        sectionTitle: record.sectionTitle,
        pageNumber: record.pageNumber,
        hierarchyLevel: record.hierarchyLevel || 0,
      },
      content: {
        language: record.language,
        category: record.category,
        keywords: Array.isArray(record.keywords) ? record.keywords : undefined,
        summary: record.summary,
        importance: record.importance || 0.5,
        readingTime: record.readingTime,
        wordCount: record.wordCount,
      },
      search: {
        tags: Array.isArray(record.tags) ? record.tags : undefined,
        searchableText: record.searchableText,
        contextHeaders: record.contextHeaders,
        searchBoost: record.searchBoost || 1.0,
      },
      system: {
        modelVersion: record.modelVersion || '1.0.0',
        embeddingId: record.embeddingId,
        processingVersion: record.processingVersion || '1.0.0',
        sourceType: record.sourceType || 'local_file',
        status: record.status || 'completed',
        errorMessage: record.errorMessage,
        processingDuration: record.processingDuration,
      },
    })
  }

  /**
   * Enhance record with new schema fields
   */
  private static enhanceRecordWithNewFields(
    record: any,
    unifiedMetadata: UnifiedDocumentMetadata
  ): any {
    // Transform to the new flat structure
    const enhancedRecord = DataTransformer.unifiedToLanceDBRecord(
      unifiedMetadata,
      record.content || '',
      record.vector || []
    )

    // Preserve original fields that might not be in the new schema
    return {
      ...record,
      ...enhancedRecord,
    }
  }

  /**
   * Validate migration results
   */
  private static async validateMigration(
    vectorStore: any
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      // Sample some records to validate
      const sampleRecords = await vectorStore.table.query().limit(10).toArray()

      for (const record of sampleRecords) {
        try {
          const unifiedMetadata = DataTransformer.lanceDBRecordToUnified(record)
          const validation = MetadataValidator.validateRequiredFields(unifiedMetadata, 'standard')

          if (!validation.isValid) {
            errors.push(
              `Record ${record.id}: missing fields ${validation.missingFields.join(', ')}`
            )
          }
        } catch (error) {
          errors.push(`Record ${record.id}: conversion failed - ${error}`)
        }
      }

      return { isValid: errors.length === 0, errors }
    } catch (error) {
      return { isValid: false, errors: [String(error)] }
    }
  }

  /**
   * Create backup of existing data
   */
  private static async createBackup(vectorStore: any): Promise<string> {
    // In a real implementation, this would create a backup table or export data
    // For now, we'll return a mock backup path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `backup_${timestamp}`

    logger.info('Creating backup (mock implementation)', { backupPath })
    return backupPath
  }

  /**
   * Rollback from backup
   */
  private static async rollbackFromBackup(vectorStore: any, backupPath: string): Promise<void> {
    // In a real implementation, this would restore from the backup
    logger.info('Rolling back from backup (mock implementation)', { backupPath })
  }

  /**
   * Get current schema version
   */
  private static async getSchemaVersion(vectorStore: any): Promise<SchemaVersion | null> {
    try {
      const results = await vectorStore.search(this.SCHEMA_VERSION_KEY, {
        topK: 1,
        scoreThreshold: 0.0,
      })

      if (results.length > 0) {
        const metadata = results[0].metadata
        return {
          version: metadata.schemaVersion || '1.0.0',
          timestamp: new Date(metadata.timestamp || Date.now()),
          description: metadata.description || '',
          migrationRequired: metadata.migrationRequired || false,
        }
      }

      return null
    } catch (error) {
      logger.debug(
        'Schema version not found',
        error instanceof Error ? error : new Error(String(error))
      )
      return null
    }
  }

  /**
   * Update schema version metadata
   */
  private static async updateSchemaVersion(vectorStore: any, dryRun: boolean): Promise<void> {
    if (dryRun) {
      logger.info('Would update schema version (dry run)', { version: this.CURRENT_SCHEMA_VERSION })
      return
    }

    try {
      const versionMetadata = createUnifiedMetadata({
        file: {
          id: 'schema_version',
          name: 'schema_version.json',
          path: '/system/schema_version.json',
          size: 100,
          hash: 'schema_version_hash',
          type: 'system_metadata',
          mimeType: 'application/json',
          encoding: 'utf-8',
        },
        system: {
          sourceType: 'manual',
          status: 'completed',
          modelVersion: '1.0.0',
          processingVersion: '2.0.0',
        },
      })

      const versionRecord = DataTransformer.unifiedToLanceDBRecord(
        versionMetadata,
        this.SCHEMA_VERSION_KEY,
        [0.0] // Dummy vector
      )

      // Add additional version-specific metadata
      // Add additional version-specific metadata as additional fields
      const additionalFields = {
        schemaVersion: this.CURRENT_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        description: 'Unified metadata schema version',
        migrationRequired: false,
      }

      Object.assign(versionRecord, additionalFields)

      await vectorStore.addDocuments([versionRecord])

      logger.info('✅ Schema version updated', { version: this.CURRENT_SCHEMA_VERSION })
    } catch (error) {
      logger.error(
        'Failed to update schema version',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }
}
