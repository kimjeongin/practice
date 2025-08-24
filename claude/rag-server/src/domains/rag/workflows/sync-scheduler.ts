import { SyncManager, VectorDbSyncReport } from './sync-manager.js'
import { logger } from '@/shared/logger/index.js'

export interface VectorDbSyncSchedulerConfig {
  interval: number // 동기화 간격 (밀리초)
  enabled: boolean
  deepScanInterval?: number // 깊은 스캔 간격 (밀리초)
  autoFix: boolean
}

/**
 * 주기적 벡터 데이터베이스 동기화 스케줄러
 * 백그라운드에서 정기적으로 동기화 상태를 확인하고 문제를 해결
 */
export class VectorDbSyncScheduler {
  private intervalId?: NodeJS.Timeout
  private deepScanIntervalId?: NodeJS.Timeout
  private isRunning = false
  private lastSyncTime?: Date
  private syncCount = 0
  private consecutiveFailures = 0
  private readonly MAX_CONSECUTIVE_FAILURES = 5
  private readonly FAILURE_BACKOFF_MS = 60000 // 1 minute backoff after failures
  private isInBackoff = false

  constructor(private syncManager: SyncManager, private config: VectorDbSyncSchedulerConfig) {}

  /**
   * 스케줄러 시작
   */
  start(): void {
    if (this.isRunning || !this.config.enabled) {
      return
    }

    this.isRunning = true
    logger.info('Starting vector DB sync scheduler', {
      interval: this.config.interval,
      deepScanInterval: this.config.deepScanInterval,
      autoFix: this.config.autoFix,
    })

    // 기본 동기화 스케줄
    this.intervalId = setInterval(async () => {
      await this.performScheduledSync()
    }, this.config.interval)

    // 깊은 스캔 스케줄 (선택적)
    if (this.config.deepScanInterval) {
      this.deepScanIntervalId = setInterval(async () => {
        await this.performDeepSync()
      }, this.config.deepScanInterval)
    }
  }

  /**
   * 스케줄러 중지
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    if (this.deepScanIntervalId) {
      clearInterval(this.deepScanIntervalId)
      this.deepScanIntervalId = undefined
    }

    logger.info('Vector DB sync scheduler stopped')
  }

  /**
   * 예약된 기본 동기화 수행
   */
  private async performScheduledSync(): Promise<void> {
    // Skip if in backoff period due to consecutive failures
    if (this.isInBackoff) {
      logger.debug('Skipping scheduled sync due to backoff period')
      return
    }

    try {
      logger.debug('Performing scheduled vector DB sync check')

      if (!this.syncManager) {
        logger.error('VectorDbSyncManager not available for scheduled sync')
        this.handleSyncFailure('SyncManager not available')
        return
      }

      if (!this.config) {
        logger.error('Config not available for scheduled sync')
        this.handleSyncFailure('Config not available')
        return
      }

      const report = await this.syncManager.generateSyncReport({
        autoFix: this.config.autoFix,
        deepScan: false,
        includeNewFiles: true,
        maxConcurrency: 2,
      })

      if (!report) {
        logger.warn('Scheduled sync returned no report')
        return
      }

      this.lastSyncTime = new Date()
      this.syncCount++
      this.consecutiveFailures = 0 // Reset failure count on success
      this.isInBackoff = false

      // Background integrity monitoring
      const hasIntegrityIssues = this.checkBackgroundIntegrity(report)

      if (report.summary && report.summary.totalIssues > 0) {
        logger.warn('Scheduled vector DB sync detected issues', {
          totalIssues: report.summary.totalIssues,
          autoFixed: this.config.autoFix ? (report.fixedIssues ? report.fixedIssues.length : 0) : 0,
          integrityIssues: hasIntegrityIssues,
        })
      } else {
        logger.debug('Scheduled vector DB sync: all data synchronized')
      }

      // Log background integrity status
      if (hasIntegrityIssues) {
        logger.warn('Background integrity check detected potential issues')
      }
    } catch (error) {
      logger.error(
        'Scheduled vector DB sync failed',
        error instanceof Error ? error : new Error(String(error))
      )
      this.handleSyncFailure(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * 예약된 깊은 동기화 수행
   */
  private async performDeepSync(): Promise<void> {
    // Skip deep sync if in backoff period
    if (this.isInBackoff) {
      logger.debug('Skipping deep sync due to backoff period')
      return
    }

    try {
      logger.info('Performing scheduled deep vector DB sync')

      if (!this.syncManager) {
        logger.error('VectorDbSyncManager not available for deep sync')
        this.handleSyncFailure('SyncManager not available for deep sync')
        return
      }

      if (!this.config) {
        logger.error('Config not available for deep sync')
        this.handleSyncFailure('Config not available for deep sync')
        return
      }

      const report = await this.syncManager.generateSyncReport({
        autoFix: this.config.autoFix,
        deepScan: true,
        includeNewFiles: true,
        maxConcurrency: 1, // 깊은 스캔은 리소스를 적게 사용
      })

      if (!report) {
        logger.warn('Deep sync returned no report')
        return
      }

      if (report.summary && report.summary.totalIssues > 0) {
        logger.warn('Deep vector DB sync detected issues', {
          summary: report.summary,
          autoFixed: this.config.autoFix ? (report.fixedIssues ? report.fixedIssues.length : 0) : 0,
        })
      } else {
        logger.info('Deep vector DB sync: all data fully synchronized')
      }
    } catch (error) {
      logger.error(
        'Deep vector DB sync failed',
        error instanceof Error ? error : new Error(String(error))
      )
      this.handleSyncFailure(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerSync(deepScan: boolean = false): Promise<void> {
    try {
      if (!this.syncManager) {
        throw new Error('VectorDbSyncManager not available for manual sync trigger')
      }

      if (deepScan) {
        await this.performDeepSync()
      } else {
        await this.performScheduledSync()
      }
    } catch (error) {
      logger.error(
        'Manual vector DB sync trigger failed',
        error instanceof Error ? error : new Error(String(error)),
        { deepScan }
      )
      throw error
    }
  }

  /**
   * 스케줄러 상태 조회
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      consecutiveFailures: this.consecutiveFailures,
      isInBackoff: this.isInBackoff,
      config: this.config,
      nextSyncIn: this.intervalId ? this.config.interval : null,
    }
  }

  /**
   * 백그라운드 무결성 검사
   */
  private checkBackgroundIntegrity(report: VectorDbSyncReport): boolean {
    try {
      if (!report) {
        logger.warn('No report provided for background integrity check')
        return false
      }

      if (!report.issues || !Array.isArray(report.issues)) {
        logger.warn('Report has invalid issues array for background integrity check', { report })
        return false
      }

      // 심각한 무결성 문제들을 확인
      const criticalIssues = report.issues.filter((issue) => {
        if (!issue || !issue.type) {
          return false
        }
        return (
          issue.type === 'missing_file' ||
          issue.type === 'orphaned_vector' ||
          issue.type === 'hash_mismatch'
        )
      })

      const hasHighErrorRate = criticalIssues.length > 10 // 10개 이상의 심각한 문제
      const hasOrphanedData = report.issues.some(
        (issue) => issue && issue.type === 'orphaned_vector'
      )
      const hasMissingFiles = report.issues.some((issue) => issue && issue.type === 'missing_file')

      if (hasHighErrorRate || hasOrphanedData || hasMissingFiles) {
        logger.warn('Background integrity check detected issues', {
          criticalIssues: criticalIssues.length,
          hasOrphanedData,
          hasMissingFiles,
          totalIssues: report.summary ? report.summary.totalIssues : 'unknown',
        })
        return true
      }

      return false
    } catch (error) {
      logger.error(
        'Error in background integrity check',
        error instanceof Error ? error : new Error(String(error))
      )
      return false
    }
  }

  /**
   * 설정 업데이트 (재시작 필요)
   */
  updateConfig(newConfig: Partial<VectorDbSyncSchedulerConfig>): void {
    const wasRunning = this.isRunning

    if (wasRunning) {
      this.stop()
    }

    this.config = { ...this.config, ...newConfig }

    if (wasRunning && this.config.enabled) {
      this.start()
    }

    logger.info('Vector DB sync scheduler config updated', this.config)
  }

  /**
   * 동기화 실패 처리 및 백오프 관리
   */
  private handleSyncFailure(errorMessage: string): void {
    this.consecutiveFailures++
    logger.warn('Sync failure recorded', {
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.MAX_CONSECUTIVE_FAILURES,
      errorMessage,
    })

    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      logger.error('Too many consecutive sync failures, entering backoff period', undefined, {
        consecutiveFailures: this.consecutiveFailures,
        backoffMs: this.FAILURE_BACKOFF_MS,
      })

      this.isInBackoff = true

      // Schedule automatic recovery attempt
      setTimeout(() => {
        logger.info('Exiting backoff period, will retry sync on next scheduled interval')
        this.isInBackoff = false
        this.consecutiveFailures = 0
      }, this.FAILURE_BACKOFF_MS)
    }
  }

  /**
   * 백그라운드 무결성 상태 조회
   */
  async getIntegrityStatus() {
    try {
      if (!this.syncManager) {
        throw new Error('VectorDbSyncManager not available for integrity status check')
      }

      const report = await this.syncManager.generateSyncReport({
        autoFix: false,
        deepScan: false,
        includeNewFiles: false,
        maxConcurrency: 1,
      })

      if (!report) {
        logger.warn('Integrity status check returned no report')
        return {
          isHealthy: false,
          lastCheck: new Date(),
          error: 'No report generated',
        }
      }

      const hasIntegrityIssues = this.checkBackgroundIntegrity(report)

      let criticalIssuesCount = 0
      if (report.issues && Array.isArray(report.issues)) {
        criticalIssuesCount = report.issues.filter((issue) => {
          if (!issue || !issue.type) {
            return false
          }
          return (
            issue.type === 'missing_file' ||
            issue.type === 'orphaned_vector' ||
            issue.type === 'hash_mismatch'
          )
        }).length
      }

      return {
        isHealthy: !hasIntegrityIssues,
        lastCheck: new Date(),
        issueCount: report.summary ? report.summary.totalIssues : 0,
        criticalIssues: criticalIssuesCount,
      }
    } catch (error) {
      logger.error(
        'Failed to get integrity status',
        error instanceof Error ? error : new Error(String(error))
      )
      return {
        isHealthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
