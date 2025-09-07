/**
 * Resilience utilities
 * Implementation of stability patterns such as timeout, retry, circuit breaker
 */

import pTimeout from 'p-timeout'
import pRetry, { AbortError, FailedAttemptError } from 'p-retry'
import CircuitBreaker from 'opossum'
import { TimeoutError, StructuredError, ErrorCode, ErrorUtils } from '@/shared/errors/index.js'
import { logger } from '@/shared/logger/index.js'

export interface RetryOptions {
  retries?: number
  factor?: number
  minTimeout?: number
  maxTimeout?: number
  randomize?: boolean
  onRetry?: (error: Error, attempt: number) => void
}

export interface TimeoutOptions {
  timeoutMs: number
  operation: string
  fallback?: () => Promise<any>
}

export interface CircuitBreakerOptions {
  timeout?: number
  errorThresholdPercentage?: number
  resetTimeout?: number
  monitoringPeriod?: number
  volumeThreshold?: number
}

/**
 * Timeout wrapper
 */
export class TimeoutWrapper {
  /**
   * Apply timeout to Promise
   */
  static async withTimeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
    const { timeoutMs, operation, fallback } = options

    try {
      return await pTimeout(promise, {
        milliseconds: timeoutMs,
        message: `Operation '${operation}' timed out after ${timeoutMs}ms`,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        const timeoutError = new TimeoutError(operation, timeoutMs)
        logger.error(`Timeout in ${operation}`, timeoutError)

        // Execute fallback if available
        if (fallback) {
          logger.warn(`Executing fallback for ${operation}`)
          return await fallback()
        }

        throw timeoutError
      }
      throw error
    }
  }

  /**
   * Decorator that applies timeout to function
   */
  static withTimeoutDecorator<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    timeoutMs: number,
    operation: string
  ) {
    return async (...args: T): Promise<R> => {
      return TimeoutWrapper.withTimeout(fn(...args), { timeoutMs, operation })
    }
  }
}

/**
 * Retry wrapper
 */
export class RetryWrapper {
  /**
   * Default retry options
   */
  private static defaultOptions: Required<RetryOptions> = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 30000,
    randomize: true,
    onRetry: () => {},
  }

  /**
   * Apply retry logic to Promise
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    operation: string,
    options: RetryOptions = {}
  ): Promise<T> {
    const opts = { ...RetryWrapper.defaultOptions, ...options }

    const wrappedFn = async () => {
      try {
        return await fn()
      } catch (error) {
        // Check if error is retryable
        if (!ErrorUtils.isRetryable(error as Error)) {
          logger.debug(`Error not retryable for ${operation}`, { error })
          throw new AbortError(error as Error)
        }
        throw error
      }
    }

    return pRetry(wrappedFn, {
      retries: opts.retries,
      factor: opts.factor,
      minTimeout: opts.minTimeout,
      maxTimeout: opts.maxTimeout,
      randomize: opts.randomize,
      onFailedAttempt: (error: FailedAttemptError) => {
        logger.warn(
          `Retry attempt ${error.attemptNumber}/${opts.retries + 1} failed for ${operation}`,
          {
            operation,
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.message,
          }
        )
        opts.onRetry(error, error.attemptNumber)
      },
    })
  }

  /**
   * Decorator that applies retry logic to function
   */
  static withRetryDecorator<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    operation: string,
    options: RetryOptions = {}
  ) {
    return async (...args: T): Promise<R> => {
      return RetryWrapper.withRetry(() => fn(...args), operation, options)
    }
  }
}

/**
 * Circuit breaker manager
 */
export class CircuitBreakerManager {
  private static breakers = new Map<string, CircuitBreaker>()

  /**
   * Create or retrieve circuit breaker
   */
  static getBreaker(
    name: string,
    fn: (...args: unknown[]) => Promise<unknown>,
    options: CircuitBreakerOptions = {}
  ): CircuitBreaker {
    if (CircuitBreakerManager.breakers.has(name)) {
      const existingBreaker = CircuitBreakerManager.breakers.get(name)
      if (!existingBreaker) {
        throw new Error(`Circuit breaker ${name} exists in map but is undefined`)
      }
      return existingBreaker
    }

    const defaultOptions = {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      monitoringPeriod: 10000,
      volumeThreshold: 10,
    }

    const breakerOptions = { ...defaultOptions, ...options }
    const breaker = new CircuitBreaker(fn, breakerOptions)

    // Set up event listeners
    breaker.on('open', () => {
      logger.warn(`Circuit breaker opened for ${name}`, { component: name })
    })

    breaker.on('halfOpen', () => {
      logger.info(`Circuit breaker half-opened for ${name}`, { component: name })
    })

    breaker.on('close', () => {
      logger.info(`Circuit breaker closed for ${name}`, { component: name })
    })

    breaker.on('failure', (error) => {
      logger.error(`Circuit breaker failure in ${name}`, error, { component: name })
    })

    CircuitBreakerManager.breakers.set(name, breaker)
    return breaker
  }

  /**
   * Retrieve status of all circuit breakers
   */
  static getStatus(): { name: string; state: string; stats: any }[] {
    const status: { name: string; state: string; stats: any }[] = []

    for (const [name, breaker] of CircuitBreakerManager.breakers.entries()) {
      status.push({
        name,
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        stats: breaker.stats,
      })
    }

    return status
  }

  /**
   * Reset circuit breaker
   */
  static reset(name?: string) {
    if (name) {
      const breaker = CircuitBreakerManager.breakers.get(name)
      if (breaker) {
        breaker.close()
        logger.info(`Circuit breaker ${name} manually reset`)
      }
    } else {
      for (const [name, breaker] of CircuitBreakerManager.breakers.entries()) {
        breaker.close()
      }
      logger.info('All circuit breakers manually reset')
    }
  }
}

/**
 * Integrated resilience wrapper
 * Combination of timeout + retry + circuit breaker
 */
export class ResilienceWrapper {
  /**
   * Apply complete resilience pattern
   */
  static async withResilience<T>(
    fn: () => Promise<T>,
    operation: string,
    options: {
      timeout?: TimeoutOptions
      retry?: RetryOptions
      circuitBreaker?: CircuitBreakerOptions
      useCircuitBreaker?: boolean
    } = {}
  ): Promise<T> {
    const { timeout, retry, circuitBreaker, useCircuitBreaker = false } = options

    let wrappedFn = fn

    // 1. Apply timeout
    if (timeout) {
      const originalFn = wrappedFn
      wrappedFn = () => TimeoutWrapper.withTimeout(originalFn(), timeout)
    }

    // 2. Apply retry
    if (retry) {
      const originalFn = wrappedFn
      wrappedFn = () => RetryWrapper.withRetry(originalFn, operation, retry)
    }

    // 3. Apply circuit breaker
    if (useCircuitBreaker) {
      const breaker = CircuitBreakerManager.getBreaker(operation, wrappedFn, circuitBreaker)
      return breaker.fire() as Promise<T>
    }

    return wrappedFn()
  }
}

/**
 * Batch processing utility
 */
export class BatchProcessor {
  /**
   * Process array in chunks (with concurrency limit)
   */
  static async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: {
      batchSize?: number
      concurrency?: number
      operation?: string
    } = {}
  ): Promise<R[]> {
    const { batchSize = 10, concurrency = 3, operation = 'batch_processing' } = options

    const results: R[] = []
    const endTiming = logger.startTiming(operation, {
      totalItems: items.length,
      batchSize,
      concurrency,
    })

    try {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)

        const batchPromises = batch.map(async (item, index) => {
          try {
            return await processor(item)
          } catch (error) {
            logger.error(`Batch item ${i + index} failed`, error as Error, {
              operation,
              itemIndex: i + index,
              batchStart: i,
            })
            throw error
          }
        })

        // Process batch with concurrency limit
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)

        logger.debug(`Processed batch ${Math.floor(i / batchSize) + 1}`, {
          operation,
          processedItems: Math.min(i + batchSize, items.length),
          totalItems: items.length,
        })
      }

      return results
    } finally {
      endTiming()
    }
  }
}

// Convenience functions
export const withTimeout = TimeoutWrapper.withTimeout
export const withRetry = RetryWrapper.withRetry
export const withResilience = ResilienceWrapper.withResilience
