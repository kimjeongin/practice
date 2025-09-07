/**
 * Structured error classes
 * Error handling system following 2025 open source standards
 */

export enum ErrorCode {
  // File Processing Errors
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_PARSE_ERROR = 'FILE_PARSE_ERROR',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DOCUMENT_PROCESSING_ERROR = 'DOCUMENT_PROCESSING_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  DELETE_ERROR = 'DELETE_ERROR',

  // Vector Store Errors
  VECTOR_STORE_ERROR = 'VECTOR_STORE_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  SEARCH_ERROR = 'SEARCH_ERROR',
  WRITE_ERROR = 'WRITE_ERROR',

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

  // Initialization Errors
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',

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
 * Base structured error class
 */
export class StructuredError extends Error {
  public readonly code: ErrorCode
  public readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  public readonly context: ErrorContext
  public readonly isOperational: boolean
  public readonly timestamp: Date
  public override readonly cause?: Error

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH',
    context: ErrorContext = {},
    cause?: Error
  ) {
    super(message)
    this.name = 'StructuredError'
    this.code = code
    this.severity = severity
    this.context = { ...context, timestamp: new Date() }
    this.isOperational = true
    this.timestamp = new Date()
    this.cause = cause

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
      severity: this.severity,
      context: this.context,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      cause: this.cause,
      stack: this.stack || undefined,
    }
  }
}

/**
 * File processing related errors
 */
export class FileProcessingError extends StructuredError {
  constructor(message: string, filePath: string, operation: string, originalError?: Error) {
    super(message, ErrorCode.FILE_PARSE_ERROR, 'HIGH', {
      filePath,
      operation,
      originalError: originalError?.message,
      stack: originalError?.stack,
    }, originalError)
    this.name = 'FileProcessingError'
  }
}

/**
 * Vector store related errors
 */
export class VectorStoreError extends StructuredError {
  constructor(
    message: string,
    operation: string,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    super(message, ErrorCode.VECTOR_STORE_ERROR, 'HIGH', {
      ...context,
      operation,
      originalError: originalError?.message,
      stack: originalError?.stack,
    }, originalError)
    this.name = 'VectorStoreError'
  }
}

/**
 * Search related errors
 */
export class SearchError extends StructuredError {
  constructor(
    message: string,
    query: string,
    searchType: 'semantic',
    originalError?: Error
  ) {
    super(message, ErrorCode.SEARCH_ERROR, 'HIGH', {
      query,
      searchType,
      originalError: originalError?.message,
      stack: originalError?.stack,
    }, originalError)
    this.name = 'SearchError'
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends StructuredError {
  constructor(operation: string, timeoutMs: number, context: ErrorContext = {}) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT_ERROR, 'MEDIUM', {
      ...context,
      operation,
      timeoutMs,
    })
    this.name = 'TimeoutError'
  }
}

/**
 * Database related errors
 */
export class DatabaseError extends StructuredError {
  constructor(message: string, operation: string, originalError?: Error) {
    super(message, ErrorCode.DATABASE_ERROR, 'HIGH', {
      operation,
      originalError: originalError?.message,
      stack: originalError?.stack,
    }, originalError)
    this.name = 'DatabaseError'
  }
}

/**
 * Embedding related errors
 */
export class EmbeddingError extends StructuredError {
  constructor(message: string, model: string, originalError?: Error) {
    super(message, ErrorCode.EMBEDDING_ERROR, 'HIGH', {
      model,
      originalError: originalError?.message,
      stack: originalError?.stack,
    }, originalError)
    this.name = 'EmbeddingError'
  }
}

/**
 * Configuration related errors
 */
export class ConfigurationError extends StructuredError {
  constructor(message: string, configKey: string, expectedType?: string) {
    super(
      message,
      ErrorCode.CONFIG_ERROR,
      'CRITICAL',
      {
        configKey,
        expectedType,
      }
    )
    this.name = 'ConfigurationError'
  }
}

/**
 * Error utility functions
 */
export class ErrorUtils {
  /**
   * Check if error is retryable
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

    // For general errors, judge based on message
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
   * Check if error is operational
   */
  static isOperational(error: Error): boolean {
    if (error instanceof StructuredError) {
      return error.isOperational
    }
    return true // Consider as operational error by default
  }

  /**
   * Remove sensitive information from error
   */
  static sanitize(error: StructuredError): Partial<StructuredError> {
    const sanitized = { ...error.toJSON() }

    // Remove sensitive information like API keys, passwords, etc.
    if (sanitized.context) {
      delete sanitized.context.apiKey
      delete sanitized.context.password
      delete sanitized.context.token
      delete sanitized.context.secret
    }

    return sanitized
  }
}
