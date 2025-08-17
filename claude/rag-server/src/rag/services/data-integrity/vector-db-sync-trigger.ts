import { VectorDbSyncManager } from './vector-db-sync-manager.js';
import { errorMonitor } from '@/shared/monitoring/error-monitor.js';
import { logger } from '@/shared/logger/index.js';

/**
 * 특정 조건에서 자동으로 벡터 데이터베이스 동기화를 트리거하는 서비스
 */
export class VectorDbSyncTrigger {
  private errorThreshold: number;
  private errorWindow: number; // 에러 윈도우 시간 (밀리초)
  private lastAutoSync?: Date;
  private minAutoSyncInterval: number; // 최소 자동 동기화 간격

  constructor(
    private syncManager: VectorDbSyncManager,
    options: {
      errorThreshold?: number;
      errorWindow?: number;
      minAutoSyncInterval?: number;
    } = {}
  ) {
    this.errorThreshold = options.errorThreshold || 5; // 5개 에러
    this.errorWindow = options.errorWindow || 5 * 60 * 1000; // 5분
    this.minAutoSyncInterval = options.minAutoSyncInterval || 10 * 60 * 1000; // 10분

    this.setupErrorMonitoring();
  }

  /**
   * 에러 모니터링 설정
   */
  private setupErrorMonitoring(): void {
    // 에러 발생 시 동기화 필요성 검토
    const checkSyncNeeded = () => {
      this.checkAndTriggerSync();
    };

    // 주기적으로 에러 상태 확인
    setInterval(checkSyncNeeded, 60000); // 1분마다 확인
  }

  /**
   * 동기화 필요성 확인 및 자동 트리거
   */
  private async checkAndTriggerSync(): Promise<void> {
    try {
      // 최근 자동 동기화가 너무 빨리 실행되었는지 확인
      if (this.lastAutoSync) {
        const timeSinceLastSync = Date.now() - this.lastAutoSync.getTime();
        if (timeSinceLastSync < this.minAutoSyncInterval) {
          return;
        }
      }

      // 최근 에러 패턴 분석
      if (this.shouldTriggerSyncBasedOnErrors()) {
        logger.warn('High error rate detected, triggering automatic vector DB sync');
        await this.triggerAutoSync('error_threshold');
      }

    } catch (error) {
      logger.error('Error in vector DB sync trigger check', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 에러 기반 동기화 필요성 판단
   */
  private shouldTriggerSyncBasedOnErrors(): boolean {
    try {
      // Get recent error history
      const allErrors = errorMonitor.getErrorHistory(100);
      if (!allErrors || allErrors.length === 0) {
        return false;
      }

      const recentErrors = allErrors.filter(error => {
        if (!error || !error.timestamp) {
          logger.warn('Invalid error object found in error history', { error });
          return false;
        }
        
        try {
          return Date.now() - error.timestamp.getTime() < this.errorWindow;
        } catch (timestampError) {
          logger.warn('Error processing timestamp for error object', { 
            error: error, 
            timestampError: timestampError instanceof Error ? timestampError.message : String(timestampError) 
          });
          return false;
        }
      });

      if (recentErrors.length === 0) {
        return false;
      }

      // 벡터 스토어나 파일 처리 관련 에러가 임계치를 넘었는지 확인
      const syncRelatedErrors = recentErrors.filter(error => {
        if (!error || !error.code || typeof error.code !== 'string') {
          logger.warn('Invalid error code found in error object', { error });
          return false;
        }
        
        return error.code.includes('VECTOR_STORE') ||
               error.code.includes('FILE_PROCESSING') ||
               error.code.includes('FILE_PARSE_ERROR') ||
               error.code.includes('SEARCH_ERROR') ||
               error.code.includes('CHUNK') ||
               error.code.includes('OPERATIONAL_ERROR');
      });

      if (syncRelatedErrors.length >= this.errorThreshold) {
        logger.info('Vector DB sync trigger threshold reached', {
          syncRelatedErrors: syncRelatedErrors.length,
          threshold: this.errorThreshold,
          window: this.errorWindow
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error in shouldTriggerSyncBasedOnErrors', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * 수동 동기화 트리거 (특정 상황에서)
   */
  async triggerSyncOnCondition(condition: 'startup' | 'error_threshold' | 'manual' | 'scheduled'): Promise<void> {
    logger.info('Triggering vector DB sync due to condition', { condition });

    try {
      let options;
      switch (condition) {
        case 'startup':
          options = { autoFix: true, deepScan: true, includeNewFiles: true, maxConcurrency: 3 };
          break;
        case 'error_threshold':
          options = { autoFix: true, deepScan: false, includeNewFiles: false, maxConcurrency: 2 };
          break;
        case 'scheduled':
          options = { autoFix: true, deepScan: false, includeNewFiles: true, maxConcurrency: 2 };
          break;
        default:
          options = { autoFix: false, deepScan: true, includeNewFiles: true, maxConcurrency: 3 };
      }

      const report = await this.syncManager.performStartupSync(options);
      
      logger.info('Condition-based vector DB sync completed', {
        condition,
        issuesFound: report.summary.totalIssues,
        issuesFixed: report.fixedIssues.length
      });

    } catch (error) {
      logger.error('Condition-based vector DB sync failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 자동 동기화 실행
   */
  private async triggerAutoSync(reason: string): Promise<void> {
    try {
      this.lastAutoSync = new Date();
      
      if (!this.syncManager) {
        throw new Error('VectorDbSyncManager is not available for auto sync');
      }
      
      const report = await this.syncManager.generateSyncReport({
        autoFix: true,
        deepScan: false,
        includeNewFiles: false,
        maxConcurrency: 1
      });

      if (!report) {
        logger.warn('Auto vector DB sync returned no report', { reason });
        return;
      }

      if (!report.summary) {
        logger.warn('Auto vector DB sync report missing summary', { reason, report });
        return;
      }

      if (report.summary.totalIssues > 0) {
        logger.warn('Auto vector DB sync detected and fixed issues', {
          reason,
          summary: report.summary,
          fixedIssues: report.fixedIssues ? report.fixedIssues.length : 0
        });
      }
    } catch (error) {
      logger.error('Error in triggerAutoSync', error instanceof Error ? error : new Error(String(error)), { reason });
    }
  }

  /**
   * 파일 변경 시 동기화 검사 (선택적)
   */
  async onFileChange(filePath: string, changeType: 'added' | 'changed' | 'removed'): Promise<void> {
    try {
      if (!filePath || typeof filePath !== 'string') {
        logger.warn('Invalid filePath provided to onFileChange', { filePath, changeType });
        return;
      }

      if (!changeType || !['added', 'changed', 'removed'].includes(changeType)) {
        logger.warn('Invalid changeType provided to onFileChange', { filePath, changeType });
        return;
      }

      if (!this.syncManager) {
        logger.error('VectorDbSyncManager not available for file change sync check');
        logger.debug('File change sync check context', { filePath, changeType });
        return;
      }

      // 중요한 파일이 변경된 경우에만 동기화 체크
      if (changeType === 'removed') {
        logger.info('File removed, checking vector DB sync status', { filePath });
        
        // 빠른 동기화 체크 (해당 파일만)
        const report = await this.syncManager.generateSyncReport({
          autoFix: true,
          deepScan: false,
          includeNewFiles: false,
          maxConcurrency: 1
        });

        if (!report) {
          logger.warn('File change vector DB sync check returned no report', { filePath, changeType });
          return;
        }

        if (!report.issues || !Array.isArray(report.issues)) {
          logger.warn('File change vector DB sync check report has invalid issues', { filePath, changeType, report });
          return;
        }

        const relatedIssues = report.issues.filter(issue => {
          if (!issue || !issue.filePath) {
            return false;
          }
          return issue.filePath === filePath;
        });

        if (relatedIssues.length > 0) {
          await this.syncManager.fixSyncIssues(relatedIssues, {
            autoFix: true,
            deepScan: false,
            includeNewFiles: false,
            maxConcurrency: 1
          });
          logger.info('Fixed vector DB sync issues for removed file', { 
            filePath, 
            issuesFixed: relatedIssues.length 
          });
        }
      }
    } catch (error) {
      logger.error('Error in file change vector DB sync check', error instanceof Error ? error : new Error(String(error)));
      logger.debug('File change sync check context', {
        filePath,
        changeType
      });
    }
  }

  /**
   * 동기화 트리거 상태 조회
   */
  getStatus() {
    try {
      let recentErrors: any[] = [];
      try {
        const errorHistory = errorMonitor.getErrorHistory(10);
        recentErrors = errorHistory || [];
      } catch (error) {
        logger.warn('Failed to get recent errors for status', error instanceof Error ? error : new Error(String(error)));
      }

      return {
        errorThreshold: this.errorThreshold,
        errorWindow: this.errorWindow,
        minAutoSyncInterval: this.minAutoSyncInterval,
        lastAutoSync: this.lastAutoSync,
        recentErrors: recentErrors
      };
    } catch (error) {
      logger.error('Error getting vector DB sync trigger status', error instanceof Error ? error : new Error(String(error)));
      return {
        errorThreshold: this.errorThreshold,
        errorWindow: this.errorWindow,
        minAutoSyncInterval: this.minAutoSyncInterval,
        lastAutoSync: this.lastAutoSync,
        recentErrors: [] as any[],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}