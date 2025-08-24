/**
 * 구조화된 에러 클래스들
 * 2025 오픈소스 표준을 따른 에러 처리 시스템
 */

export enum ErrorCode {
  // File Processing Errors
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_PARSE_ERROR = 'FILE_PARSE_ERROR',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',

  // Vector Store Errors
  VECTOR_STORE_ERROR = 'VECTOR_STORE_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  SEARCH_ERROR = 'SEARCH_ERROR',

  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',

  // Network/Service Errors
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Configuration Errors
  CONFIG_ERROR = 'CONFIG_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Generic Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  OPERATIONAL_ERROR = 'OPERATIONAL_ERROR',
}

export interface ErrorContext {
  operation?: string
  fileId?: string
  filePath?: string
  query?: string
  component?: string
  timestamp?: Date
  stack?: string
  [key: string]: any
}

/**
 * 기본 구조화된 에러 클래스
 */
export class StructuredError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly context: ErrorContext
  public readonly isOperational: boolean
  public readonly timestamp: Date

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    statusCode: number = 500,
    context: ErrorContext = {},
    isOperational: boolean = true
  ) {
    super(message)
    this.name = 'StructuredError'
    this.code = code
    this.statusCode = statusCode
    this.context = { ...context, timestamp: new Date() }
    this.isOperational = isOperational
    this.timestamp = new Date()

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StructuredError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      stack: this.stack || undefined,
    }
  }
}

/**
 * 파일 처리 관련 에러
 */
export class FileProcessingError extends StructuredError {
  constructor(message: string, filePath: string, operation: string, originalError?: Error) {
    super(message, ErrorCode.FILE_PARSE_ERROR, 500, {
      filePath,
      operation,
      originalError: originalError?.message,
      stack: originalError?.stack,
    })
    this.name = 'FileProcessingError'
  }
}

/**
 * 벡터 스토어 관련 에러
 */
export class VectorStoreError extends StructuredError {
  constructor(
    message: string,
    operation: string,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    super(message, ErrorCode.VECTOR_STORE_ERROR, 500, {
      ...context,
      operation,
      originalError: originalError?.message,
      stack: originalError?.stack,
    })
    this.name = 'VectorStoreError'
  }
}

/**
 * 검색 관련 에러
 */
export class SearchError extends StructuredError {
  constructor(
    message: string,
    query: string,
    searchType: 'semantic' | 'keyword' | 'hybrid',
    originalError?: Error
  ) {
    super(message, ErrorCode.SEARCH_ERROR, 500, {
      query,
      searchType,
      originalError: originalError?.message,
      stack: originalError?.stack,
    })
    this.name = 'SearchError'
  }
}

/**
 * 타임아웃 에러
 */
export class TimeoutError extends StructuredError {
  constructor(operation: string, timeoutMs: number, context: ErrorContext = {}) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT_ERROR, 408, {
      ...context,
      operation,
      timeoutMs,
    })
    this.name = 'TimeoutError'
  }
}

/**
 * 데이터베이스 관련 에러
 */
export class DatabaseError extends StructuredError {
  constructor(message: string, operation: string, originalError?: Error) {
    super(message, ErrorCode.DATABASE_ERROR, 500, {
      operation,
      originalError: originalError?.message,
      stack: originalError?.stack,
    })
    this.name = 'DatabaseError'
  }
}

/**
 * 임베딩 관련 에러
 */
export class EmbeddingError extends StructuredError {
  constructor(message: string, model: string, originalError?: Error) {
    super(message, ErrorCode.EMBEDDING_ERROR, 500, {
      model,
      originalError: originalError?.message,
      stack: originalError?.stack,
    })
    this.name = 'EmbeddingError'
  }
}

/**
 * 구성 관련 에러
 */
export class ConfigurationError extends StructuredError {
  constructor(message: string, configKey: string, expectedType?: string) {
    super(
      message,
      ErrorCode.CONFIG_ERROR,
      400,
      {
        configKey,
        expectedType,
      },
      false // Configuration errors are not operational
    )
    this.name = 'ConfigurationError'
  }
}

/**
 * 에러 유틸리티 함수들
 */
export class ErrorUtils {
  /**
   * 에러가 재시도 가능한지 확인
   */
  static isRetryable(error: Error): boolean {
    if (error instanceof StructuredError) {
      return [
        ErrorCode.TIMEOUT_ERROR,
        ErrorCode.RATE_LIMIT_ERROR,
        ErrorCode.SERVICE_UNAVAILABLE,
        ErrorCode.CONNECTION_ERROR,
      ].includes(error.code)
    }

    // 일반 에러의 경우 메시지 기반 판단
    const retryableMessages = [
      'timeout',
      'rate limit',
      'service unavailable',
      'connection',
      'network',
    ]

    return retryableMessages.some((msg) => error.message.toLowerCase().includes(msg))
  }

  /**
   * 에러가 운영상 에러인지 확인
   */
  static isOperational(error: Error): boolean {
    if (error instanceof StructuredError) {
      return error.isOperational
    }
    return true // 기본적으로 운영상 에러로 간주
  }

  /**
   * 에러에서 민감한 정보 제거
   */
  static sanitize(error: StructuredError): Partial<StructuredError> {
    const sanitized = { ...error.toJSON() }

    // API 키, 비밀번호 등 민감한 정보 제거
    if (sanitized.context) {
      delete sanitized.context.apiKey
      delete sanitized.context.password
      delete sanitized.context.token
      delete sanitized.context.secret
    }

    return sanitized
  }
}
