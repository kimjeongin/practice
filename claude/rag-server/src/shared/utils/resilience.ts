/**
 * Resilience utilities for timeout handling
 * Simplified to only include used functionality
 */

import pTimeout from 'p-timeout'
import { TimeoutError, ErrorUtils } from '@/shared/errors/index.js'
import { logger } from '@/shared/logger/index.js'

export interface TimeoutOptions {
  timeoutMs?: number
  operation?: string
  abortSignal?: AbortSignal
}

/**
 * Timeout wrapper for promises
 */
export class TimeoutWrapper {
  /**
   * Apply timeout to promise
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions = {}
  ): Promise<T> {
    const { timeoutMs = 30000, operation = 'operation', abortSignal } = options

    try {
      return await pTimeout(promise, {
        milliseconds: timeoutMs,
        message: `Operation '${operation}' timed out after ${timeoutMs}ms`,
        signal: abortSignal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        logger.warn(`⏰ Timeout: ${operation} exceeded ${timeoutMs}ms`)
        throw new TimeoutError(operation, timeoutMs, { originalError: error.message })
      }
      throw error
    }
  }
}