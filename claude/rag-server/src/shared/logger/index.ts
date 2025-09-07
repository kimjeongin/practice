/**
 * Structured logging system
 * High-performance Pino-based logger (2025 standard)
 */

import pino, { Logger as PinoLogger } from 'pino'
import { ErrorCode, StructuredError, ErrorUtils } from '@/shared/errors/index.js'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface LogContext {
  component?: string
  operation?: string
  fileId?: string
  filePath?: string
  query?: string
  duration?: number
  [key: string]: any
}

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Centralized logger class
 */
export class Logger {
  private static instance: Logger
  private pino: PinoLogger
  private errorMetrics: Map<ErrorCode, number> = new Map()
  private lastErrorTime: Map<ErrorCode, Date> = new Map()

  private constructor() {
    // Configure logger based on environment
    const isDevelopment = process.env.NODE_ENV !== 'production'

    // Create log directory
    const logDir = join(process.cwd(), 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    // Log file paths
    const logFile = join(logDir, 'rag-server.log')
    const errorLogFile = join(logDir, 'rag-server-error.log')

    // Simplified logger configuration
    if (isDevelopment) {
      // Development environment: pretty printing
      this.pino = pino({
        level: process.env.LOG_LEVEL || 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
        base: {
          pid: process.pid,
          hostname: process.env.HOSTNAME || 'unknown',
          service: 'rag-mcp-server',
          version: process.env.npm_package_version || '1.0.0',
        },
      })
    } else {
      // Production environment: JSON logging
      this.pino = pino({
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        base: {
          pid: process.pid,
          hostname: process.env.HOSTNAME || 'unknown',
          service: 'rag-mcp-server',
          version: process.env.npm_package_version || '1.0.0',
        },
      })
    }

    // Create separate stream for file logging
    this.setupFileLogging(logFile, errorLogFile)

    // Guide to log file location
    this.pino.info('📝 Log file save location:')
    this.pino.info(`   - All logs: ${logFile}`)
    this.pino.info(`   - Error logs: ${errorLogFile}`)
  }

  /**
   * Set up file logging
   */
  private setupFileLogging(logFile: string, errorLogFile: string): void {
    // Simple file logging (save to file in same format)
    const logStream = pino.destination({
      dest: logFile,
      sync: false,
    })

    const errorLogStream = pino.destination({
      dest: errorLogFile,
      sync: false,
    })

    // Logger instance for file logging
    const fileLogger = pino(
      {
        timestamp: pino.stdTimeFunctions.isoTime,
        base: {
          service: 'rag-mcp-server',
        },
      },
      logStream
    )

    const errorFileLogger = pino(
      {
        timestamp: pino.stdTimeFunctions.isoTime,
        base: {
          service: 'rag-mcp-server',
        },
      },
      errorLogStream
    )

    // Wrap original methods
    const originalMethods = {
      info: this.pino.info.bind(this.pino),
      debug: this.pino.debug.bind(this.pino),
      warn: this.pino.warn.bind(this.pino),
      error: this.pino.error.bind(this.pino),
      fatal: this.pino.fatal.bind(this.pino),
    }

    // Add file logging functionality
    this.pino.info = (obj: any, msg?: string) => {
      originalMethods.info(obj, msg)
      fileLogger.info(obj, msg)
    }

    this.pino.debug = (obj: any, msg?: string) => {
      originalMethods.debug(obj, msg)
      fileLogger.debug(obj, msg)
    }

    this.pino.warn = (obj: any, msg?: string) => {
      originalMethods.warn(obj, msg)
      fileLogger.warn(obj, msg)
    }

    this.pino.error = (obj: any, msg?: string) => {
      originalMethods.error(obj, msg)
      fileLogger.error(obj, msg)
      errorFileLogger.error(obj, msg)
    }

    this.pino.fatal = (obj: any, msg?: string) => {
      originalMethods.fatal(obj, msg)
      fileLogger.fatal(obj, msg)
      errorFileLogger.fatal(obj, msg)
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * Info log
   */
  info(message: string, context: LogContext = {}) {
    this.pino.info({ ...context }, message)
  }

  /**
   * Debug log
   */
  debug(message: string, context: LogContext = {}) {
    this.pino.debug({ ...context }, message)
  }

  /**
   * Warning log
   */
  warn(message: string, context: LogContext = {}) {
    this.pino.warn({ ...context }, message)
  }

  /**
   * Error log (supports structured errors)
   */
  error(message: string, error?: Error | StructuredError, context: LogContext = {}) {
    const errorData: any = { ...context }

    if (error) {
      if (error instanceof StructuredError) {
        // Process structured error
        errorData.error = ErrorUtils.sanitize(error)
        errorData.errorCode = error.code
        errorData.isOperational = error.isOperational

        // Update error metrics
        this.updateErrorMetrics(error.code)
      } else {
        // Process general error
        errorData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack || undefined,
        }
        errorData.errorCode = ErrorCode.UNKNOWN_ERROR

        this.updateErrorMetrics(ErrorCode.UNKNOWN_ERROR)
      }
    }

    this.pino.error(errorData, message)
  }

  /**
   * Fatal error log
   */
  fatal(message: string, error?: Error | StructuredError, context: LogContext = {}) {
    const errorData: any = { ...context }

    if (error) {
      if (error instanceof StructuredError) {
        errorData.error = ErrorUtils.sanitize(error)
        errorData.errorCode = error.code
      } else {
        errorData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack || undefined,
        }
        errorData.errorCode = ErrorCode.UNKNOWN_ERROR
      }
    }

    this.pino.fatal(errorData, message)
  }

  /**
   * Start performance measurement
   */
  startTiming(operation: string, context: LogContext = {}): () => void {
    const startTime = Date.now()
    this.debug(`Starting operation: ${operation}`, { ...context, operation })

    return () => {
      const duration = Date.now() - startTime
      this.info(`Completed operation: ${operation}`, {
        ...context,
        operation,
        duration,
      })
    }
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(errorCode: ErrorCode) {
    const currentCount = this.errorMetrics.get(errorCode) || 0
    this.errorMetrics.set(errorCode, currentCount + 1)
    this.lastErrorTime.set(errorCode, new Date())
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(): { code: ErrorCode; count: number; lastOccurred: Date }[] {
    const metrics: { code: ErrorCode; count: number; lastOccurred: Date }[] = []

    for (const [code, count] of this.errorMetrics.entries()) {
      const lastOccurred = this.lastErrorTime.get(code)
      if (!lastOccurred) {
        this.pino.warn(`No last occurrence time found for error code: ${code}`)
        continue
      }
      metrics.push({ code, count, lastOccurred })
    }

    return metrics.sort((a, b) => b.count - a.count)
  }

  /**
   * Health check log
   */
  health(component: string, status: 'healthy' | 'unhealthy', context: LogContext = {}) {
    const level = status === 'healthy' ? 'info' : 'warn'
    this.pino[level](
      {
        ...context,
        component,
        status,
        type: 'health_check',
      },
      `${component} health check: ${status}`
    )
  }

  /**
   * Business event log
   */
  event(event: string, context: LogContext = {}) {
    this.pino.info(
      {
        ...context,
        type: 'business_event',
        event,
      },
      `Business event: ${event}`
    )
  }

  /**
   * Change log level
   */
  setLevel(level: LogLevel) {
    this.pino.level = level
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.errorMetrics.clear()
    this.lastErrorTime.clear()
  }

  /**
   * Direct access to logger instance (if needed)
   */
  getPinoInstance(): PinoLogger {
    return this.pino
  }
}

// Global logger instance
export const logger = Logger.getInstance()

export const startTiming = (operation: string, context?: LogContext) =>
  logger.startTiming(operation, context)
