import { existsSync, statSync, readdirSync } from 'fs'
import { join, dirname, extname, basename } from 'path'
import { createHash } from 'crypto'
import { IFileRepository } from '../repositories/document.js'
import { IChunkRepository } from '../repositories/chunk.js'
import { IVectorStoreService, IFileProcessingService } from '@/shared/types/interfaces.js'
import { FileMetadata } from '../core/models.js'
import { ServerConfig } from '@/shared/types/index.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { withTimeout, withRetry } from '@/shared/utils/resilience.js'

export interface VectorDbSyncIssue {
  type: 'missing_file' | 'orphaned_vector' | 'hash_mismatch' | 'missing_chunks' | 'new_file'
  filePath: string
  fileId?: string
  description: string
  severity: 'low' | 'medium' | 'high'
}

export interface VectorDbSyncReport {
  timestamp: Date
  totalFiles: number
  totalVectors: number
  totalChunks: number
  issues: VectorDbSyncIssue[]
  fixedIssues: VectorDbSyncIssue[]
  summary: {
    missingFiles: number
    orphanedVectors: number
    hashMismatches: number
    newFiles: number
    totalIssues: number
  }
}

export interface VectorDbSyncOptions {
  autoFix: boolean
  deepScan: boolean
  includeNewFiles: boolean
  maxConcurrency: number
}

/**
 * 벡터 데이터베이스와 SQLite 간 동기화 관리자
 * 프로그램 시작 시 일관성 검사 및 자동 복구 기능 제공
 */
export class SyncManager {
  private documentsDirectory: string

  constructor(
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private vectorStoreService: IVectorStoreService,
    private config: ServerConfig,
    private fileProcessingService?: IFileProcessingService
  ) {
    this.documentsDirectory = config.documentsDir
  }

  /**
   * 프로그램 시작 시 전체 동기화 검사 및 복구
   */
  async performStartupSync(
    options: Partial<VectorDbSyncOptions> = {}
  ): Promise<VectorDbSyncReport> {
    const endTiming = startTiming('startup_sync', { component: 'VectorDbSyncManager' })

    const opts: VectorDbSyncOptions = {
      autoFix: true,
      deepScan: true,
      includeNewFiles: true,
      maxConcurrency: 3,
      ...options,
    }

    try {
      logger.info('Starting comprehensive sync check on startup', opts)

      const report = await this.generateSyncReport(opts)

      if (opts.autoFix && report.issues.length > 0) {
        logger.info('Auto-fixing sync issues', { issueCount: report.issues.length })
        await this.fixSyncIssues(report.issues, opts)
      }

      // Auto-compact sparse index after sync if needed
      if (opts.autoFix && 'autoCompactIfNeeded' in this.vectorStoreService) {
        try {
          const compacted = await (this.vectorStoreService as any).autoCompactIfNeeded()
          if (compacted) {
            logger.info('Auto-compacted sparse vector index after sync')
          }
        } catch (error) {
          logger.warn(
            'Failed to auto-compact index after sync',
            error instanceof Error ? error : new Error(String(error))
          )
        }
      }

      // Regenerate embeddings for existing documents if needed
      await this.regenerateEmbeddingsIfNeeded()

      logger.info('Startup sync completed', {
        totalIssues: report.issues.length,
        fixedIssues: report.fixedIssues.length,
        summary: report.summary,
      })

      return report
    } catch (error) {
      logger.error('Startup sync failed', error instanceof Error ? error : new Error(String(error)))
      throw error
    } finally {
      endTiming()
    }
  }

  /**
   * 동기화 상태 보고서 생성
   */
  async generateSyncReport(options: VectorDbSyncOptions): Promise<VectorDbSyncReport> {
    const issues: VectorDbSyncIssue[] = []
    const fixedIssues: VectorDbSyncIssue[] = []

    // 1. 데이터베이스의 파일들이 실제로 존재하는지 확인
    await this.checkMissingFiles(issues)

    // 2. 파일 해시 변경사항 확인
    if (options.deepScan) {
      await this.checkHashMismatches(issues)
    }

    // 3. 새로운 파일 발견
    if (options.includeNewFiles) {
      await this.checkNewFiles(issues)
    }

    // 4. 고아 벡터 및 청크 확인
    await this.checkOrphanedData(issues)

    // 5. 벡터 스토어와 데이터베이스 간 일관성 확인
    await this.checkVectorConsistency(issues)

    const allFiles = await this.fileRepository.getAllFiles()
    const totalVectors = await this.getTotalVectorCount()
    const totalChunks = await this.chunkRepository.getTotalChunkCount()

    return {
      timestamp: new Date(),
      totalFiles: allFiles.length,
      totalVectors,
      totalChunks,
      issues,
      fixedIssues,
      summary: {
        missingFiles: issues.filter((i) => i.type === 'missing_file').length,
        orphanedVectors: issues.filter((i) => i.type === 'orphaned_vector').length,
        hashMismatches: issues.filter((i) => i.type === 'hash_mismatch').length,
        newFiles: issues.filter((i) => i.type === 'new_file').length,
        totalIssues: issues.length,
      },
    }
  }

  /**
   * 누락된 파일 확인 (DB에는 있지만 실제 파일이 없음)
   */
  private async checkMissingFiles(issues: VectorDbSyncIssue[]): Promise<void> {
    const allFiles = await this.fileRepository.getAllFiles()

    for (const file of allFiles) {
      if (!existsSync(file.path)) {
        issues.push({
          type: 'missing_file',
          filePath: file.path,
          fileId: file.id,
          description: `File exists in database but not on filesystem`,
          severity: 'high',
        })
      }
    }
  }

  /**
   * 파일 해시 변경사항 확인
   */
  private async checkHashMismatches(issues: VectorDbSyncIssue[]): Promise<void> {
    const allFiles = await this.fileRepository.getAllFiles()

    for (const file of allFiles) {
      if (existsSync(file.path)) {
        try {
          const currentHash = await this.calculateFileHash(file.path)
          if (currentHash !== file.hash) {
            issues.push({
              type: 'hash_mismatch',
              filePath: file.path,
              fileId: file.id,
              description: `File content has changed (hash mismatch)`,
              severity: 'medium',
            })
          }
        } catch (error) {
          logger.warn('Failed to calculate hash for file', { filePath: file.path, error })
        }
      }
    }
  }

  /**
   * 새로운 파일 발견 (파일 시스템에는 있지만 DB에 없음)
   */
  private async checkNewFiles(issues: VectorDbSyncIssue[]): Promise<void> {
    const supportedExtensions = ['.txt', '.md', '.pdf', '.csv', '.json']
    
    logger.info('📁 Scanning documents directory for new files', {
      directory: this.documentsDirectory,
      supportedExtensions
    })

    try {
      const initialCount = issues.length
      await this.scanDirectoryForNewFiles(this.documentsDirectory, supportedExtensions, issues)
      const newFileCount = issues.length - initialCount
      
      if (newFileCount > 0) {
        logger.info('🔍 New files discovered', {
          count: newFileCount,
          directory: this.documentsDirectory
        })
      } else {
        logger.info('✅ No new files found', {
          directory: this.documentsDirectory
        })
      }
    } catch (error) {
      logger.warn('Failed to scan directory for new files', {
        error,
        directory: this.documentsDirectory,
      })
    }
  }

  /**
   * 디렉토리 재귀적 스캔하여 새 파일 찾기
   */
  private async scanDirectoryForNewFiles(
    directory: string,
    supportedExtensions: string[],
    issues: VectorDbSyncIssue[]
  ): Promise<void> {
    if (!existsSync(directory)) {
      return
    }

    try {
      const entries = readdirSync(directory, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(directory, entry.name)

        if (entry.isDirectory()) {
          // 일부 디렉토리는 스킵 (예: node_modules, .git 등)
          if (!['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) {
            await this.scanDirectoryForNewFiles(fullPath, supportedExtensions, issues)
          }
        } else if (entry.isFile()) {
          const fileExt = extname(entry.name).toLowerCase()

          if (supportedExtensions.includes(fileExt)) {
            // 데이터베이스에 존재하지 않는 파일인지 확인
            if (!(await this.fileRepository.getFileByPath(fullPath))) {
              const stats = statSync(fullPath)
              logger.debug('📄 New file discovered', {
                filePath: fullPath,
                fileType: fileExt,
                size: stats.size,
                modifiedAt: stats.mtime
              })
              issues.push({
                type: 'new_file',
                filePath: fullPath,
                description: `New ${fileExt} file found (${stats.size} bytes)`,
                severity: 'low',
              })
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to read directory', { error, directory })
    }
  }

  /**
   * 고아 데이터 확인
   */
  private async checkOrphanedData(issues: VectorDbSyncIssue[]): Promise<void> {
    // 벡터 스토어에는 있지만 데이터베이스에 없는 문서들 확인
    if ('getAllDocumentIds' in this.vectorStoreService) {
      const vectorDocIds = await (this.vectorStoreService as any).getAllDocumentIds()
      const dbFileIds = new Set((await this.fileRepository.getAllFiles()).map((f) => f.id))

      for (const docId of vectorDocIds) {
        // 문서 ID에서 파일 ID 추출 (구현에 따라 다를 수 있음)
        const fileId = this.extractFileIdFromDocId(docId)
        if (fileId && !dbFileIds.has(fileId)) {
          issues.push({
            type: 'orphaned_vector',
            filePath: 'unknown',
            fileId,
            description: `Vector exists for deleted file: ${fileId}`,
            severity: 'medium',
          })
        }
      }
    }
  }

  /**
   * 벡터 스토어와 데이터베이스 간 일관성 확인
   */
  private async checkVectorConsistency(issues: VectorDbSyncIssue[]): Promise<void> {
    const allFiles = await this.fileRepository.getAllFiles()

    for (const file of allFiles) {
      const chunks = await this.chunkRepository.getChunksByFileId(file.id)

      if (chunks.length === 0) {
        issues.push({
          type: 'missing_chunks',
          filePath: file.path,
          fileId: file.id,
          description: `File exists but has no chunks in database`,
          severity: 'high',
        })
      }
    }
  }

  /**
   * 동기화 문제 자동 수정
   */
  async fixSyncIssues(
    issues: VectorDbSyncIssue[],
    options: VectorDbSyncOptions
  ): Promise<VectorDbSyncIssue[]> {
    const fixedIssues: VectorDbSyncIssue[] = []

    for (const issue of issues) {
      try {
        switch (issue.type) {
          case 'missing_file':
            await this.fixMissingFile(issue)
            fixedIssues.push(issue)
            break

          case 'orphaned_vector':
            await this.fixOrphanedVector(issue)
            fixedIssues.push(issue)
            break

          case 'hash_mismatch':
            await this.fixHashMismatch(issue)
            fixedIssues.push(issue)
            break

          case 'new_file':
            await this.fixNewFile(issue)
            fixedIssues.push(issue)
            break

          case 'missing_chunks':
            await this.fixMissingChunks(issue)
            fixedIssues.push(issue)
            break
        }
      } catch (error) {
        logger.error(
          'Failed to fix sync issue',
          error instanceof Error ? error : new Error(String(error))
        )
      }
    }

    return fixedIssues
  }

  /**
   * 누락된 파일 문제 해결 (DB와 벡터에서 제거)
   */
  private async fixMissingFile(issue: VectorDbSyncIssue): Promise<void> {
    if (!issue.fileId) return

    logger.info('Fixing missing file issue', { filePath: issue.filePath, fileId: issue.fileId })

    // 1. 벡터 스토어에서 제거
    await withTimeout(this.vectorStoreService.removeDocumentsByFileId(issue.fileId), {
      timeoutMs: 30000,
      operation: 'remove_orphaned_vectors',
    })

    // 2. 청크 제거
    await this.chunkRepository.deleteDocumentChunks(issue.fileId)

    // 3. 파일 메타데이터 제거
    await this.fileRepository.deleteFile(issue.fileId)
  }

  /**
   * 고아 벡터 문제 해결
   */
  private async fixOrphanedVector(issue: VectorDbSyncIssue): Promise<void> {
    if (!issue.fileId) return

    logger.info('Fixing orphaned vector issue', { fileId: issue.fileId })

    await withTimeout(this.vectorStoreService.removeDocumentsByFileId(issue.fileId), {
      timeoutMs: 30000,
      operation: 'remove_orphaned_vectors',
    })
  }

  /**
   * 해시 불일치 문제 해결 (파일 재인덱싱)
   */
  private async fixHashMismatch(issue: VectorDbSyncIssue): Promise<void> {
    logger.info('Fixing hash mismatch issue', { filePath: issue.filePath })

    if (this.fileProcessingService) {
      await withTimeout(this.fileProcessingService.processFile(issue.filePath), {
        timeoutMs: 300000,
        operation: 'fix_hash_mismatch',
      })
    } else {
      logger.warn('FileProcessingService not available for fixing hash mismatch')
    }
  }

  /**
   * 새 파일 문제 해결 (인덱싱 추가)
   */
  private async fixNewFile(issue: VectorDbSyncIssue): Promise<void> {
    logger.info('📄 Processing new file', { filePath: issue.filePath })

    try {
      if (!existsSync(issue.filePath)) {
        logger.warn('File does not exist, skipping', { filePath: issue.filePath })
        return
      }

      // 1️⃣ Create file metadata
      const fileMetadata = await this.createFileMetadata(issue.filePath)
      
      // 2️⃣ Insert file metadata into database
      const fileId = await this.fileRepository.insertFile(fileMetadata)
      logger.debug('File metadata inserted', { 
        filePath: issue.filePath, 
        fileId, 
        fileType: fileMetadata.fileType,
        size: fileMetadata.size
      })

      // 3️⃣ Process file for embeddings if FileProcessingService is available
      if (this.fileProcessingService) {
        logger.info('🧠 Starting document processing and embedding generation', { 
          filePath: issue.filePath,
          fileId 
        })
        
        await this.fileProcessingService.processFile(issue.filePath)
        
        // 4️⃣ Validate that processing was successful
        const chunks = await this.chunkRepository.getChunksByFileId(fileId)
        logger.info('✅ File processing completed', {
          filePath: issue.filePath,
          fileId,
          chunksCreated: chunks.length
        })
      } else {
        logger.warn('⚠️ FileProcessingService not available, file metadata only', { 
          filePath: issue.filePath 
        })
      }
    } catch (error) {
      logger.error(
        '❌ Failed to process new file',
        error instanceof Error ? error : new Error(String(error)),
        { filePath: issue.filePath }
      )
      
      // Attempt to clean up partial state
      try {
        const existingFile = await this.fileRepository.getFileByPath(issue.filePath)
        if (existingFile) {
          await this.fileRepository.deleteFile(existingFile.id)
          logger.debug('Cleaned up partial file metadata', { filePath: issue.filePath })
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup partial file state', { 
          filePath: issue.filePath,
          cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        })
      }
      
      throw error
    }
  }

  /**
   * Create file metadata from file system information
   */
  private async createFileMetadata(filePath: string): Promise<Omit<FileMetadata, 'id'>> {
    const stats = statSync(filePath)
    const hash = await this.calculateFileHash(filePath)
    const fileName = basename(filePath)
    const fileExtension = extname(fileName).toLowerCase().replace('.', '')

    return {
      path: filePath,
      name: fileName,
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime || stats.mtime, // fallback for systems without birthtime
      fileType: fileExtension || 'txt',
      hash
    }
  }

  /**
   * 누락된 청크 문제 해결
   */
  private async fixMissingChunks(issue: VectorDbSyncIssue): Promise<void> {
    logger.info('Fixing missing chunks issue', { filePath: issue.filePath })

    if (this.fileProcessingService) {
      await withTimeout(this.fileProcessingService.processFile(issue.filePath), {
        timeoutMs: 300000,
        operation: 'fix_missing_chunks',
      })
    } else {
      logger.warn('FileProcessingService not available for fixing missing chunks')
    }
  }

  /**
   * 파일 해시 계산
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const fs = await import('fs')
    const data = await fs.promises.readFile(filePath)
    return createHash('sha256').update(data).digest('hex')
  }

  /**
   * 문서 ID에서 파일 ID 추출 (구현에 따라 달라질 수 있음)
   */
  private extractFileIdFromDocId(docId: string): string | null {
    // 예: "chunk_fileId_index" 형태에서 fileId 추출
    const match = docId.match(/^(?:chunk_)?([^_]+)_\d+$/)
    return match && match[1] ? match[1] : null
  }

  /**
   * 전체 벡터 수 조회
   */
  private async getTotalVectorCount(): Promise<number> {
    if ('getDocumentCount' in this.vectorStoreService) {
      return await (this.vectorStoreService as any).getDocumentCount()
    }
    return 0
  }

  /**
   * 강제 동기화 (전체 재구성)
   */
  async forceSync(): Promise<VectorDbSyncReport> {
    logger.info('Starting force synchronization')

    // 1. 모든 벡터 및 청크 삭제
    await this.vectorStoreService.removeAllDocuments()
    await this.chunkRepository.deleteAllDocumentChunks()

    // 2. 파일 시스템 기준으로 데이터베이스 정리
    const allFiles = await this.fileRepository.getAllFiles()
    for (const file of allFiles) {
      if (!existsSync(file.path)) {
        await this.fileRepository.deleteFile(file.id)
      }
    }

    // 3. 전체 재인덱싱 필요 (FileProcessingService에 위임)
    logger.info('Force sync completed - full reindexing required')

    return this.generateSyncReport({
      autoFix: false,
      deepScan: true,
      includeNewFiles: true,
      maxConcurrency: 3,
    })
  }

  /**
   * Regenerate embeddings for existing documents if the vector store has documents but no embeddings
   */
  private async regenerateEmbeddingsIfNeeded(): Promise<void> {
    try {
      // Get document and vector counts
      const totalChunks = await this.chunkRepository.getTotalChunkCount()
      const vectorCount = this.vectorStoreService.getDocumentCount?.() || 0
      
      logger.info('Checking embedding regeneration need', {
        totalChunks,
        vectorCount,
      })

      // If we have chunks but no vectors, we need to regenerate embeddings
      if (totalChunks > 0 && vectorCount === 0) {
        logger.info('🔄 Embedding regeneration needed - chunks exist but no vectors found')
        
        // Check if the vector store has a regeneration method
        const vectorStoreService = this.vectorStoreService as any
        if (vectorStoreService.provider && typeof vectorStoreService.provider.regenerateEmbeddings === 'function') {
          
          // Load all chunks from database and create documents for the vector store
          const allFiles = await this.fileRepository.getAllFiles()
          
          for (const file of allFiles) {
            try {
              const chunks = await this.chunkRepository.getChunksByFileId(file.id)
              if (chunks.length === 0) continue

              // Create documents for embedding regeneration
              const documents = chunks.map((chunk) => ({
                id: chunk.id,
                content: chunk.content,
                metadata: {
                  fileId: file.id,
                  fileName: file.name,
                  fileType: file.fileType,
                  chunkIndex: chunk.chunkIndex,
                  source: { filename: file.name },
                },
              }))

              // Add documents to vector store (this will regenerate embeddings)
              await vectorStoreService.provider.addDocuments(documents)
              
              logger.info(`✅ Regenerated embeddings for ${chunks.length} chunks from ${file.name}`)
              
            } catch (error) {
              logger.error(`❌ Failed to regenerate embeddings for file ${file.name}:`, error instanceof Error ? error : new Error(String(error)))
            }
          }

          const finalVectorCount = vectorStoreService.provider.getVectorCount?.() || 0
          logger.info(`🎉 Embedding regeneration completed`, {
            totalChunks,
            finalVectorCount,
          })

        } else {
          logger.warn('⚠️ Vector store does not support embedding regeneration')
        }
      } else if (vectorCount > 0) {
        logger.info('✅ Embeddings already exist, regeneration not needed', {
          totalChunks,
          vectorCount,
        })
      } else {
        logger.info('📄 No documents found for embedding regeneration')
      }

    } catch (error) {
      logger.error('❌ Failed to check/regenerate embeddings:', error instanceof Error ? error : new Error(String(error)))
      // Don't throw - this is not critical for server startup
    }
  }
}
