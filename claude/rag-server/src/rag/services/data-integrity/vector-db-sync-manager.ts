import { existsSync, statSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { createHash } from 'crypto';
import { IFileRepository } from '@/rag/repositories/document-repository.js';
import { IChunkRepository } from '@/rag/repositories/chunk-repository.js';
import { IVectorStoreService, IFileProcessingService } from '@/shared/types/interfaces.js';
import { FileMetadata } from '@/rag/models/models.js';
import { ServerConfig } from '@/shared/types/index.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { withTimeout, withRetry } from '@/shared/utils/resilience.js';

export interface VectorDbSyncIssue {
  type: 'missing_file' | 'orphaned_vector' | 'hash_mismatch' | 'missing_chunks' | 'new_file';
  filePath: string;
  fileId?: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface VectorDbSyncReport {
  timestamp: Date;
  totalFiles: number;
  totalVectors: number;
  totalChunks: number;
  issues: VectorDbSyncIssue[];
  fixedIssues: VectorDbSyncIssue[];
  summary: {
    missingFiles: number;
    orphanedVectors: number;
    hashMismatches: number;
    newFiles: number;
    totalIssues: number;
  };
}

export interface VectorDbSyncOptions {
  autoFix: boolean;
  deepScan: boolean;
  includeNewFiles: boolean;
  maxConcurrency: number;
}

/**
 * 벡터 데이터베이스와 SQLite 간 동기화 관리자
 * 프로그램 시작 시 일관성 검사 및 자동 복구 기능 제공
 */
export class VectorDbSyncManager {
  private dataDirectory: string;

  constructor(
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private vectorStoreService: IVectorStoreService,
    private config: ServerConfig,
    private fileProcessingService?: IFileProcessingService
  ) {
    this.dataDirectory = dirname(config.databasePath);
  }

  /**
   * 프로그램 시작 시 전체 동기화 검사 및 복구
   */
  async performStartupSync(options: Partial<VectorDbSyncOptions> = {}): Promise<VectorDbSyncReport> {
    const endTiming = startTiming('startup_sync', { component: 'VectorDbSyncManager' });
    
    const opts: VectorDbSyncOptions = {
      autoFix: true,
      deepScan: true,
      includeNewFiles: true,
      maxConcurrency: 3,
      ...options
    };

    try {
      logger.info('Starting comprehensive sync check on startup', opts);

      const report = await this.generateSyncReport(opts);
      
      if (opts.autoFix && report.issues.length > 0) {
        logger.info('Auto-fixing sync issues', { issueCount: report.issues.length });
        await this.fixSyncIssues(report.issues, opts);
      }

      // Auto-compact sparse index after sync if needed
      if (opts.autoFix && 'autoCompactIfNeeded' in this.vectorStoreService) {
        try {
          const compacted = await (this.vectorStoreService as any).autoCompactIfNeeded();
          if (compacted) {
            logger.info('Auto-compacted sparse vector index after sync');
          }
        } catch (error) {
          logger.warn('Failed to auto-compact index after sync', error instanceof Error ? error : new Error(String(error)));
        }
      }

      logger.info('Startup sync completed', {
        totalIssues: report.issues.length,
        fixedIssues: report.fixedIssues.length,
        summary: report.summary
      });

      return report;
    } catch (error) {
      logger.error('Startup sync failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      endTiming();
    }
  }

  /**
   * 동기화 상태 보고서 생성
   */
  async generateSyncReport(options: VectorDbSyncOptions): Promise<VectorDbSyncReport> {
    const issues: VectorDbSyncIssue[] = [];
    const fixedIssues: VectorDbSyncIssue[] = [];

    // 1. 데이터베이스의 파일들이 실제로 존재하는지 확인
    await this.checkMissingFiles(issues);

    // 2. 파일 해시 변경사항 확인
    if (options.deepScan) {
      await this.checkHashMismatches(issues);
    }

    // 3. 새로운 파일 발견
    if (options.includeNewFiles) {
      await this.checkNewFiles(issues);
    }

    // 4. 고아 벡터 및 청크 확인
    await this.checkOrphanedData(issues);

    // 5. 벡터 스토어와 데이터베이스 간 일관성 확인
    await this.checkVectorConsistency(issues);

    const allFiles = this.fileRepository.getAllFiles();
    const totalVectors = await this.getTotalVectorCount();
    const totalChunks = this.chunkRepository.getTotalChunkCount();

    return {
      timestamp: new Date(),
      totalFiles: allFiles.length,
      totalVectors,
      totalChunks,
      issues,
      fixedIssues,
      summary: {
        missingFiles: issues.filter(i => i.type === 'missing_file').length,
        orphanedVectors: issues.filter(i => i.type === 'orphaned_vector').length,
        hashMismatches: issues.filter(i => i.type === 'hash_mismatch').length,
        newFiles: issues.filter(i => i.type === 'new_file').length,
        totalIssues: issues.length
      }
    };
  }

  /**
   * 누락된 파일 확인 (DB에는 있지만 실제 파일이 없음)
   */
  private async checkMissingFiles(issues: VectorDbSyncIssue[]): Promise<void> {
    const allFiles = this.fileRepository.getAllFiles();
    
    for (const file of allFiles) {
      if (!existsSync(file.path)) {
        issues.push({
          type: 'missing_file',
          filePath: file.path,
          fileId: file.id,
          description: `File exists in database but not on filesystem`,
          severity: 'high'
        });
      }
    }
  }

  /**
   * 파일 해시 변경사항 확인
   */
  private async checkHashMismatches(issues: VectorDbSyncIssue[]): Promise<void> {
    const allFiles = this.fileRepository.getAllFiles();
    
    for (const file of allFiles) {
      if (existsSync(file.path)) {
        try {
          const currentHash = await this.calculateFileHash(file.path);
          if (currentHash !== file.hash) {
            issues.push({
              type: 'hash_mismatch',
              filePath: file.path,
              fileId: file.id,
              description: `File content has changed (hash mismatch)`,
              severity: 'medium'
            });
          }
        } catch (error) {
          logger.warn('Failed to calculate hash for file', { filePath: file.path, error });
        }
      }
    }
  }

  /**
   * 새로운 파일 발견 (파일 시스템에는 있지만 DB에 없음)
   */
  private async checkNewFiles(issues: VectorDbSyncIssue[]): Promise<void> {
    const supportedExtensions = ['.txt', '.md', '.pdf', '.csv', '.json'];
    
    try {
      await this.scanDirectoryForNewFiles(this.dataDirectory, supportedExtensions, issues);
    } catch (error) {
      logger.warn('Failed to scan directory for new files', { error, directory: this.dataDirectory });
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
      return;
    }

    try {
      const entries = readdirSync(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // 일부 디렉토리는 스킵 (예: node_modules, .git 등)
          if (!['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) {
            await this.scanDirectoryForNewFiles(fullPath, supportedExtensions, issues);
          }
        } else if (entry.isFile()) {
          const fileExt = extname(entry.name).toLowerCase();
          
          if (supportedExtensions.includes(fileExt)) {
            // 데이터베이스에 존재하지 않는 파일인지 확인
            if (!this.fileRepository.getFileByPath(fullPath)) {
              issues.push({
                type: 'new_file',
                filePath: fullPath,
                description: `New file found on filesystem but not in database`,
                severity: 'low'
              });
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to read directory', { error, directory });
    }
  }

  /**
   * 고아 데이터 확인
   */
  private async checkOrphanedData(issues: VectorDbSyncIssue[]): Promise<void> {
    // 벡터 스토어에는 있지만 데이터베이스에 없는 문서들 확인
    if ('getAllDocumentIds' in this.vectorStoreService) {
      const vectorDocIds = await (this.vectorStoreService as any).getAllDocumentIds();
      const dbFileIds = new Set(this.fileRepository.getAllFiles().map(f => f.id));
      
      for (const docId of vectorDocIds) {
        // 문서 ID에서 파일 ID 추출 (구현에 따라 다를 수 있음)
        const fileId = this.extractFileIdFromDocId(docId);
        if (fileId && !dbFileIds.has(fileId)) {
          issues.push({
            type: 'orphaned_vector',
            filePath: 'unknown',
            fileId,
            description: `Vector exists for deleted file: ${fileId}`,
            severity: 'medium'
          });
        }
      }
    }
  }

  /**
   * 벡터 스토어와 데이터베이스 간 일관성 확인
   */
  private async checkVectorConsistency(issues: VectorDbSyncIssue[]): Promise<void> {
    const allFiles = this.fileRepository.getAllFiles();
    
    for (const file of allFiles) {
      const chunks = this.chunkRepository.getChunksByFileId(file.id);
      
      if (chunks.length === 0) {
        issues.push({
          type: 'missing_chunks',
          filePath: file.path,
          fileId: file.id,
          description: `File exists but has no chunks in database`,
          severity: 'high'
        });
      }
    }
  }

  /**
   * 동기화 문제 자동 수정
   */
  async fixSyncIssues(issues: VectorDbSyncIssue[], options: VectorDbSyncOptions): Promise<VectorDbSyncIssue[]> {
    const fixedIssues: VectorDbSyncIssue[] = [];

    for (const issue of issues) {
      try {
        switch (issue.type) {
          case 'missing_file':
            await this.fixMissingFile(issue);
            fixedIssues.push(issue);
            break;
            
          case 'orphaned_vector':
            await this.fixOrphanedVector(issue);
            fixedIssues.push(issue);
            break;
            
          case 'hash_mismatch':
            await this.fixHashMismatch(issue);
            fixedIssues.push(issue);
            break;
            
          case 'new_file':
            await this.fixNewFile(issue);
            fixedIssues.push(issue);
            break;
            
          case 'missing_chunks':
            await this.fixMissingChunks(issue);
            fixedIssues.push(issue);
            break;
        }
      } catch (error) {
        logger.error('Failed to fix sync issue', error instanceof Error ? error : new Error(String(error)));
      }
    }

    return fixedIssues;
  }

  /**
   * 누락된 파일 문제 해결 (DB와 벡터에서 제거)
   */
  private async fixMissingFile(issue: VectorDbSyncIssue): Promise<void> {
    if (!issue.fileId) return;

    logger.info('Fixing missing file issue', { filePath: issue.filePath, fileId: issue.fileId });

    // 1. 벡터 스토어에서 제거
    await withTimeout(
      this.vectorStoreService.removeDocumentsByFileId(issue.fileId),
      { timeoutMs: 30000, operation: 'remove_orphaned_vectors' }
    );

    // 2. 청크 제거
    this.chunkRepository.deleteDocumentChunks(issue.fileId);

    // 3. 파일 메타데이터 제거
    this.fileRepository.deleteFile(issue.fileId);
  }

  /**
   * 고아 벡터 문제 해결
   */
  private async fixOrphanedVector(issue: VectorDbSyncIssue): Promise<void> {
    if (!issue.fileId) return;

    logger.info('Fixing orphaned vector issue', { fileId: issue.fileId });

    await withTimeout(
      this.vectorStoreService.removeDocumentsByFileId(issue.fileId),
      { timeoutMs: 30000, operation: 'remove_orphaned_vectors' }
    );
  }

  /**
   * 해시 불일치 문제 해결 (파일 재인덱싱)
   */
  private async fixHashMismatch(issue: VectorDbSyncIssue): Promise<void> {
    logger.info('Fixing hash mismatch issue', { filePath: issue.filePath });
    
    if (this.fileProcessingService) {
      await withTimeout(
        this.fileProcessingService.processFile(issue.filePath),
        { timeoutMs: 300000, operation: 'fix_hash_mismatch' }
      );
    } else {
      logger.warn('FileProcessingService not available for fixing hash mismatch');
    }
  }

  /**
   * 새 파일 문제 해결 (인덱싱 추가)
   */
  private async fixNewFile(issue: VectorDbSyncIssue): Promise<void> {
    logger.info('Fixing new file issue', { filePath: issue.filePath });
    
    // 먼저 파일을 데이터베이스에 등록해야 함
    // 이는 FileWatcher의 로직을 모방
    try {
      if (existsSync(issue.filePath)) {
        const stats = statSync(issue.filePath);
        const hash = await this.calculateFileHash(issue.filePath);
        
        // 간단한 파일 등록 (실제로는 FileWatcher의 더 복잡한 로직 필요)
        // 여기서는 FileProcessingService가 있다면 처리하도록 함
        if (this.fileProcessingService) {
          // 파일 메타데이터가 먼저 등록되어야 하므로
          // 이 부분은 실제로는 FileWatcher와 협력해야 함
          logger.info('New file detected, requires FileWatcher integration for proper registration');
        }
      }
    } catch (error) {
      logger.error('Failed to fix new file issue', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 누락된 청크 문제 해결
   */
  private async fixMissingChunks(issue: VectorDbSyncIssue): Promise<void> {
    logger.info('Fixing missing chunks issue', { filePath: issue.filePath });
    
    if (this.fileProcessingService) {
      await withTimeout(
        this.fileProcessingService.processFile(issue.filePath),
        { timeoutMs: 300000, operation: 'fix_missing_chunks' }
      );
    } else {
      logger.warn('FileProcessingService not available for fixing missing chunks');
    }
  }

  /**
   * 파일 해시 계산
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const fs = await import('fs');
    const data = await fs.promises.readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * 문서 ID에서 파일 ID 추출 (구현에 따라 달라질 수 있음)
   */
  private extractFileIdFromDocId(docId: string): string | null {
    // 예: "chunk_fileId_index" 형태에서 fileId 추출
    const match = docId.match(/^(?:chunk_)?([^_]+)_\d+$/);
    return match && match[1] ? match[1] : null;
  }

  /**
   * 전체 벡터 수 조회
   */
  private async getTotalVectorCount(): Promise<number> {
    if ('getDocumentCount' in this.vectorStoreService) {
      return await (this.vectorStoreService as any).getDocumentCount();
    }
    return 0;
  }

  /**
   * 강제 동기화 (전체 재구성)
   */
  async forceSync(): Promise<VectorDbSyncReport> {
    logger.info('Starting force synchronization');

    // 1. 모든 벡터 및 청크 삭제
    await this.vectorStoreService.removeAllDocuments();
    this.chunkRepository.deleteAllDocumentChunks();

    // 2. 파일 시스템 기준으로 데이터베이스 정리
    const allFiles = this.fileRepository.getAllFiles();
    for (const file of allFiles) {
      if (!existsSync(file.path)) {
        this.fileRepository.deleteFile(file.id);
      }
    }

    // 3. 전체 재인덱싱 필요 (FileProcessingService에 위임)
    logger.info('Force sync completed - full reindexing required');

    return this.generateSyncReport({ 
      autoFix: false, 
      deepScan: true, 
      includeNewFiles: true,
      maxConcurrency: 3
    });
  }
}