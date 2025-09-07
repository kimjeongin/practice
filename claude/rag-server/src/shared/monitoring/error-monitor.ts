/**
 * Error monitoring and aggregation system
 * Real-time error tracking, alerts, and statistics
 */

import { EventEmitter } from 'events'
import { StructuredError, ErrorCode, ErrorUtils } from '@/shared/errors/index.js'
import { logger } from '@/shared/logger/index.js'
import { ConfigFactory } from '@/shared/config/config-factory.js'

export interface ErrorMetric {
  code: ErrorCode
  count: number
  lastOccurred: Date
  component: string
  operation: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface AlertThreshold {
  errorCode: ErrorCode
  maxCount: number
  timeWindowMs: number
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  errorRate: number
  totalErrors: number
  uptime: number
  lastError?: {
    code: ErrorCode
    message: string
    timestamp: Date
  }
  componentHealth: Map<
    string,
    {
      status: 'healthy' | 'unhealthy'
      errorCount: number
      lastError?: Date
    }
  >
}

/**
 * Error monitoring system
 */
export class ErrorMonitor extends EventEmitter {
  private static instance: ErrorMonitor
  private errors: StructuredError[] = []
  private errorCounts: Map<ErrorCode, number> = new Map()
  private componentErrors: Map<string, number> = new Map()
  private alertThresholds: AlertThreshold[] = []
  private startTime: Date = new Date()
  private maxErrorHistory = ConfigFactory.getCurrentConfig().maxErrorHistory
  private cleanupInterval: NodeJS.Timeout | null = null

  private constructor() {
    super()
    this.setupDefaultThresholds()
    this.startCleanup()
  }

  static getInstance(): ErrorMonitor {
    if (!ErrorMonitor.instance) {
      ErrorMonitor.instance = new ErrorMonitor()
    }
    return ErrorMonitor.instance
  }

  /**
   * Set up default alert thresholds
   */
  private setupDefaultThresholds() {
    this.alertThresholds = [
      // Critical errors - immediate alert
      {
        errorCode: ErrorCode.DATABASE_ERROR,
        maxCount: 3,
        timeWindowMs: 5 * 60 * 1000, // 5 minutes
        severity: 'critical',
      },
      {
        errorCode: ErrorCode.SERVICE_UNAVAILABLE,
        maxCount: 5,
        timeWindowMs: 10 * 60 * 1000, // 10 minutes
        severity: 'high',
      },
      // High volume errors
      {
        errorCode: ErrorCode.TIMEOUT_ERROR,
        maxCount: 10,
        timeWindowMs: 15 * 60 * 1000, // 15 minutes
        severity: 'medium',
      },
      {
        errorCode: ErrorCode.FILE_PARSE_ERROR,
        maxCount: 20,
        timeWindowMs: 30 * 60 * 1000, // 30 minutes
        severity: 'low',
      },
    ]
  }

  /**
   * Record error
   */
  recordError(error: StructuredError) {
    // Add to error history
    this.errors.push(error)
    if (this.errors.length > this.maxErrorHistory) {
      this.errors.shift() // Remove old errors
    }

    // Update error count
    const currentCount = this.errorCounts.get(error.code) || 0
    this.errorCounts.set(error.code, currentCount + 1)

    // Update component-specific error count
    if (error.context.component) {
      const componentCount = this.componentErrors.get(error.context.component) || 0
      this.componentErrors.set(error.context.component, componentCount + 1)
    }

    // Check alert thresholds
    this.checkAlertThresholds(error)

    // Emit event
    this.emit('error_recorded', error)

    logger.debug('Error recorded in monitor', {
      errorCode: error.code,
      component: error.context.component,
      operation: error.context.operation,
    })
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(error: StructuredError) {
    const threshold = this.alertThresholds.find((t) => t.errorCode === error.code)
    if (!threshold) return

    const timeWindow = Date.now() - threshold.timeWindowMs
    const recentErrors = this.errors.filter(
      (e) => e.code === error.code && e.timestamp.getTime() > timeWindow
    )

    if (recentErrors.length >= threshold.maxCount) {
      const alert = {
        severity: threshold.severity,
        errorCode: error.code,
        count: recentErrors.length,
        timeWindowMs: threshold.timeWindowMs,
        threshold: threshold.maxCount,
        errors: recentErrors,
      }

      this.emit('alert_triggered', alert)

      logger.warn('Alert threshold exceeded', {
        severity: threshold.severity,
        errorCode: error.code,
        count: recentErrors.length,
        threshold: threshold.maxCount,
        timeWindowMinutes: threshold.timeWindowMs / (60 * 1000),
      })
    }
  }

  /**
   * Get system health status
   */
  getSystemHealth(): SystemHealth {
    const now = Date.now()
    const uptime = now - this.startTime.getTime()
    const recentErrors = this.errors.filter(
      (e) => now - e.timestamp.getTime() < 60 * 60 * 1000 // 1 hour
    )

    const errorRate = recentErrors.length / (uptime / (60 * 1000)) // errors per minute
    const totalErrors = this.errors.length

    // Calculate component health status
    const componentHealth = new Map<
      string,
      {
        status: 'healthy' | 'unhealthy'
        errorCount: number
        lastError?: Date
      }
    >()

    for (const [component, errorCount] of this.componentErrors.entries()) {
      const componentRecentErrors = recentErrors.filter((e) => e.context.component === component)
      const lastError =
        componentRecentErrors.length > 0
          ? componentRecentErrors[componentRecentErrors.length - 1]?.timestamp
          : undefined

      const healthStatus: {
        status: 'healthy' | 'unhealthy'
        errorCount: number
        lastError?: Date
      } = {
        status: componentRecentErrors.length > 10 ? 'unhealthy' : 'healthy',
        errorCount: componentRecentErrors.length,
        ...(lastError && { lastError }),
      }

      componentHealth.set(component, healthStatus)
    }

    // Determine overall system status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (errorRate > 10) {
      status = 'unhealthy'
    } else if (
      errorRate > 5 ||
      Array.from(componentHealth.values()).some((c) => c.status === 'unhealthy')
    ) {
      status = 'degraded'
    }

    const lastError = this.errors.length > 0 ? this.errors[this.errors.length - 1] : undefined

    return {
      status,
      errorRate: Math.round(errorRate * 100) / 100,
      totalErrors,
      uptime,
      ...(lastError && {
        lastError: {
          code: lastError.code,
          message: lastError.message,
          timestamp: lastError.timestamp,
        },
      }),
      componentHealth,
    }
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(timeWindowMs = 24 * 60 * 60 * 1000): {
    byCode: Map<ErrorCode, number>
    byComponent: Map<string, number>
    byOperation: Map<string, number>
    timeline: { hour: number; count: number }[]
  } {
    const cutoff = Date.now() - timeWindowMs
    const recentErrors = this.errors.filter((e) => e.timestamp.getTime() > cutoff)

    // Statistics by error code
    const byCode = new Map<ErrorCode, number>()
    const byComponent = new Map<string, number>()
    const byOperation = new Map<string, number>()

    recentErrors.forEach((error) => {
      // By error code
      const codeCount = byCode.get(error.code) || 0
      byCode.set(error.code, codeCount + 1)

      // By component
      if (error.context.component) {
        const componentCount = byComponent.get(error.context.component) || 0
        byComponent.set(error.context.component, componentCount + 1)
      }

      // By operation
      if (error.context.operation) {
        const operationCount = byOperation.get(error.context.operation) || 0
        byOperation.set(error.context.operation, operationCount + 1)
      }
    })

    // Timeline by time period (24 hours in 1-hour units)
    const timeline: { hour: number; count: number }[] = []
    const hoursAgo = Math.min(24, timeWindowMs / (60 * 60 * 1000))

    for (let i = 0; i < hoursAgo; i++) {
      const hourStart = Date.now() - (i + 1) * 60 * 60 * 1000
      const hourEnd = Date.now() - i * 60 * 60 * 1000

      const hourErrors = recentErrors.filter(
        (e) => e.timestamp.getTime() >= hourStart && e.timestamp.getTime() < hourEnd
      )

      timeline.unshift({ hour: hoursAgo - i - 1, count: hourErrors.length })
    }

    return { byCode, byComponent, byOperation, timeline }
  }

  /**
   * Set alert threshold
   */
  setAlertThreshold(threshold: AlertThreshold) {
    const existingIndex = this.alertThresholds.findIndex((t) => t.errorCode === threshold.errorCode)
    if (existingIndex >= 0) {
      this.alertThresholds[existingIndex] = threshold
    } else {
      this.alertThresholds.push(threshold)
    }

    logger.info('Alert threshold updated', {
      errorCode: threshold.errorCode,
      maxCount: threshold.maxCount,
      timeWindowMs: threshold.timeWindowMs,
      severity: threshold.severity,
    })
  }

  /**
   * Get error history
   */
  getErrorHistory(limit = 100): StructuredError[] {
    return this.errors.slice(-limit).reverse() // Return in newest first order
  }

  /**
   * Recent occurrence status of specific error code
   */
  getErrorTrend(
    errorCode: ErrorCode,
    hoursBack = 24
  ): {
    count: number
    trend: 'increasing' | 'decreasing' | 'stable'
    hourlyData: { hour: string; count: number }[]
  } {
    const now = Date.now()
    const cutoff = now - hoursBack * 60 * 60 * 1000
    const relevantErrors = this.errors.filter(
      (e) => e.code === errorCode && e.timestamp.getTime() > cutoff
    )

    // Generate hourly data
    const hourlyData: { hour: string; count: number }[] = []
    for (let i = 0; i < hoursBack; i++) {
      const hourStart = now - (i + 1) * 60 * 60 * 1000
      const hourEnd = now - i * 60 * 60 * 1000

      const hourErrors = relevantErrors.filter(
        (e) => e.timestamp.getTime() >= hourStart && e.timestamp.getTime() < hourEnd
      )

      hourlyData.unshift({
        hour: new Date(hourStart).toISOString().slice(11, 16), // HH:MM format
        count: hourErrors.length,
      })
    }

    // Calculate trend (recent 6 hours vs previous 6 hours)
    const recentHalf = hourlyData.slice(-6).reduce((sum, h) => sum + h.count, 0)
    const previousHalf = hourlyData.slice(-12, -6).reduce((sum, h) => sum + h.count, 0)

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
    if (recentHalf > previousHalf * 1.2) {
      trend = 'increasing'
    } else if (recentHalf < previousHalf * 0.8) {
      trend = 'decreasing'
    }

    return {
      count: relevantErrors.length,
      trend,
      hourlyData,
    }
  }

  /**
   * Reset metrics
   */
  reset() {
    this.errors = []
    this.errorCounts.clear()
    this.componentErrors.clear()
    this.startTime = new Date()

    logger.info('Error monitor metrics reset')
  }

  /**
   * Start periodic cleanup task
   */
  private startCleanup() {
    // Don't start cleanup task in test environment
    if (process.env.NODE_ENV === 'test') {
      return
    }

    // Clear existing interval if present
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.cleanupInterval = setInterval(() => {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const originalLength = this.errors.length

      this.errors = this.errors.filter((e) => e.timestamp.getTime() > oneWeekAgo)

      if (originalLength !== this.errors.length) {
        logger.debug('Cleaned up old error records', {
          removed: originalLength - this.errors.length,
          remaining: this.errors.length,
        })
      }
    }, 24 * 60 * 60 * 1000) // Daily cleanup

    if (!this.cleanupInterval) {
      logger.warn('Failed to start error monitor cleanup interval')
    }
  }

  /**
   * Stop cleanup task
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.removeAllListeners()
  }

  /**
   * Reset instance for testing
   */
  static resetForTesting() {
    if (ErrorMonitor.instance) {
      ErrorMonitor.instance.destroy()
      ErrorMonitor.instance = null as any
    }
  }
}

// Global error monitor instance
export const errorMonitor = ErrorMonitor.getInstance()

// Set up global error handler
export function setupGlobalErrorHandling() {
  // Unhandled Promise Rejection
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = new StructuredError(
      `Unhandled Promise Rejection: ${reason?.message || reason}`,
      ErrorCode.UNKNOWN_ERROR,
      'CRITICAL',
      {
        component: 'global',
        operation: 'unhandled_rejection',
        promise: promise.toString(),
        reason: reason?.toString(),
      }
    )

    errorMonitor.recordError(error)
    logger.fatal('Unhandled Promise Rejection', error)
  })

  // Uncaught Exception
  process.on('uncaughtException', (error: Error) => {
    const structuredError = new StructuredError(
      `Uncaught Exception: ${error.message}`,
      ErrorCode.UNKNOWN_ERROR,
      'CRITICAL',
      {
        component: 'global',
        operation: 'uncaught_exception',
        originalError: error.message,
        stack: error.stack,
      },
      error
    )

    errorMonitor.recordError(structuredError)
    logger.fatal('Uncaught Exception', structuredError)

    // Graceful shutdown with logger flush
    setTimeout(() => {
      process.exit(1)
    }, 100) // Give logger time to flush
  })

  logger.info('Global error handling setup completed')
}
