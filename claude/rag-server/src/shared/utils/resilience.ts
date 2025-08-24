/**
 * 복원력(Resilience) 유틸리티
 * 타임아웃, 재시도, 서킷 브레이커 등 안정성 패턴 구현
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
 * 타임아웃 래퍼
 */
export class TimeoutWrapper {
  /**
   * Promise에 타임아웃 적용
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

        // Fallback이 있으면 실행
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
   * 함수에 타임아웃 적용하는 데코레이터
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
 * 재시도 래퍼
 */
export class RetryWrapper {
  /**
   * 기본 재시도 옵션
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
   * Promise에 재시도 로직 적용
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
        // 재시도 가능한 에러인지 확인
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
   * 함수에 재시도 로직 적용하는 데코레이터
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
 * 서킷 브레이커 관리자
 */
export class CircuitBreakerManager {
  private static breakers = new Map<string, CircuitBreaker>()

  /**
   * 서킷 브레이커 생성 또는 조회
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

    // 이벤트 리스너 설정
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
   * 모든 서킷 브레이커 상태 조회
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
   * 서킷 브레이커 리셋
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
 * 통합 복원력 래퍼
 * 타임아웃 + 재시도 + 서킷 브레이커를 조합
 */
export class ResilienceWrapper {
  /**
   * 완전한 복원력 패턴 적용
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

    // 1. 타임아웃 적용
    if (timeout) {
      const originalFn = wrappedFn
      wrappedFn = () => TimeoutWrapper.withTimeout(originalFn(), timeout)
    }

    // 2. 재시도 적용
    if (retry) {
      const originalFn = wrappedFn
      wrappedFn = () => RetryWrapper.withRetry(originalFn, operation, retry)
    }

    // 3. 서킷 브레이커 적용
    if (useCircuitBreaker) {
      const breaker = CircuitBreakerManager.getBreaker(operation, wrappedFn, circuitBreaker)
      return breaker.fire() as Promise<T>
    }

    return wrappedFn()
  }
}

/**
 * 배치 처리 유틸리티
 */
export class BatchProcessor {
  /**
   * 배열을 청크 단위로 처리 (동시성 제한)
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

        // 동시성 제한하여 배치 처리
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

// 편의 함수들
export const withTimeout = TimeoutWrapper.withTimeout
export const withRetry = RetryWrapper.withRetry
export const withResilience = ResilienceWrapper.withResilience
