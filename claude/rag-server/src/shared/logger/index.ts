/**
 * 구조화된 로깅 시스템
 * Pino 기반 고성능 로거 (2025 표준)
 */

import pino, { Logger as PinoLogger } from 'pino';
import { ErrorCode, StructuredError, ErrorUtils } from '@/shared/errors/index';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface LogContext {
  component?: string;
  operation?: string;
  fileId?: string;
  filePath?: string;
  query?: string;
  duration?: number;
  [key: string]: any;
}

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug', 
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * 중앙집중식 로거 클래스
 */
export class Logger {
  private static instance: Logger;
  private pino: PinoLogger;
  private errorMetrics: Map<ErrorCode, number> = new Map();
  private lastErrorTime: Map<ErrorCode, Date> = new Map();

  private constructor() {
    // 환경에 따른 로거 구성
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // 로그 디렉토리 생성
    const logDir = join(process.cwd(), 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    
    // 로그 파일 경로
    const logFile = join(logDir, 'rag-server.log');
    const errorLogFile = join(logDir, 'rag-server-error.log');
    
    // 간소화된 로거 설정
    if (isDevelopment) {
      // 개발 환경: pretty printing
      this.pino = pino({
        level: process.env.LOG_LEVEL || 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
          }
        },
        base: {
          pid: process.pid,
          hostname: process.env.HOSTNAME || 'unknown',
          service: 'rag-mcp-server',
          version: process.env.npm_package_version || '1.0.0'
        }
      });
    } else {
      // 프로덕션 환경: JSON 로깅
      this.pino = pino({
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        base: {
          pid: process.pid,
          hostname: process.env.HOSTNAME || 'unknown',
          service: 'rag-mcp-server',
          version: process.env.npm_package_version || '1.0.0'
        }
      });
    }
    
    // 파일 로깅을 위한 별도 스트림 생성
    this.setupFileLogging(logFile, errorLogFile);
    
    // 로그 파일 위치 안내
    console.log(`📝 로그 파일 저장 위치:`);
    console.log(`   - 전체 로그: ${logFile}`);
    console.log(`   - 에러 로그: ${errorLogFile}`);
  }

  /**
   * 파일 로깅 설정
   */
  private setupFileLogging(logFile: string, errorLogFile: string): void {
    // 단순한 파일 로깅 (똑같은 형식으로 파일에 저장)
    const logStream = pino.destination({
      dest: logFile,
      sync: false
    });
    
    const errorLogStream = pino.destination({
      dest: errorLogFile,
      sync: false
    });
    
    // 파일 로깅을 위한 logger 인스턴스
    const fileLogger = pino({
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: 'rag-mcp-server'
      }
    }, logStream);
    
    const errorFileLogger = pino({
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: 'rag-mcp-server'
      }
    }, errorLogStream);
    
    // 원본 메서드 랙핑
    const originalMethods = {
      info: this.pino.info.bind(this.pino),
      debug: this.pino.debug.bind(this.pino),
      warn: this.pino.warn.bind(this.pino),
      error: this.pino.error.bind(this.pino),
      fatal: this.pino.fatal.bind(this.pino)
    };
    
    // 파일 로깅 기능 추가
    this.pino.info = (obj: any, msg?: string) => {
      originalMethods.info(obj, msg);
      fileLogger.info(obj, msg);
    };
    
    this.pino.debug = (obj: any, msg?: string) => {
      originalMethods.debug(obj, msg);
      fileLogger.debug(obj, msg);
    };
    
    this.pino.warn = (obj: any, msg?: string) => {
      originalMethods.warn(obj, msg);
      fileLogger.warn(obj, msg);
    };
    
    this.pino.error = (obj: any, msg?: string) => {
      originalMethods.error(obj, msg);
      fileLogger.error(obj, msg);
      errorFileLogger.error(obj, msg);
    };
    
    this.pino.fatal = (obj: any, msg?: string) => {
      originalMethods.fatal(obj, msg);
      fileLogger.fatal(obj, msg);
      errorFileLogger.fatal(obj, msg);
    };
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 정보 로그
   */
  info(message: string, context: LogContext = {}) {
    this.pino.info({ ...context }, message);
  }

  /**
   * 디버그 로그
   */
  debug(message: string, context: LogContext = {}) {
    this.pino.debug({ ...context }, message);
  }

  /**
   * 경고 로그
   */
  warn(message: string, context: LogContext = {}) {
    this.pino.warn({ ...context }, message);
  }

  /**
   * 에러 로그 (구조화된 에러 지원)
   */
  error(message: string, error?: Error | StructuredError, context: LogContext = {}) {
    const errorData: any = { ...context };

    if (error) {
      if (error instanceof StructuredError) {
        // 구조화된 에러 처리
        errorData.error = ErrorUtils.sanitize(error);
        errorData.errorCode = error.code;
        errorData.isOperational = error.isOperational;
        
        // 에러 메트릭 업데이트
        this.updateErrorMetrics(error.code);
      } else {
        // 일반 에러 처리
        errorData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack || undefined
        };
        errorData.errorCode = ErrorCode.UNKNOWN_ERROR;
        
        this.updateErrorMetrics(ErrorCode.UNKNOWN_ERROR);
      }
    }

    this.pino.error(errorData, message);
  }

  /**
   * 치명적 오류 로그
   */
  fatal(message: string, error?: Error | StructuredError, context: LogContext = {}) {
    const errorData: any = { ...context };

    if (error) {
      if (error instanceof StructuredError) {
        errorData.error = ErrorUtils.sanitize(error);
        errorData.errorCode = error.code;
      } else {
        errorData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack || undefined
        };
        errorData.errorCode = ErrorCode.UNKNOWN_ERROR;
      }
    }

    this.pino.fatal(errorData, message);
  }

  /**
   * 성능 측정 시작
   */
  startTiming(operation: string, context: LogContext = {}): () => void {
    const startTime = Date.now();
    this.debug(`Starting operation: ${operation}`, { ...context, operation });

    return () => {
      const duration = Date.now() - startTime;
      this.info(`Completed operation: ${operation}`, {
        ...context,
        operation,
        duration
      });
    };
  }

  /**
   * 에러 메트릭 업데이트
   */
  private updateErrorMetrics(errorCode: ErrorCode) {
    const currentCount = this.errorMetrics.get(errorCode) || 0;
    this.errorMetrics.set(errorCode, currentCount + 1);
    this.lastErrorTime.set(errorCode, new Date());
  }

  /**
   * 에러 메트릭 조회
   */
  getErrorMetrics(): { code: ErrorCode; count: number; lastOccurred: Date }[] {
    const metrics: { code: ErrorCode; count: number; lastOccurred: Date }[] = [];
    
    for (const [code, count] of this.errorMetrics.entries()) {
      const lastOccurred = this.lastErrorTime.get(code);
      if (!lastOccurred) {
        console.warn(`No last occurrence time found for error code: ${code}`);
        continue;
      }
      metrics.push({ code, count, lastOccurred });
    }
    
    return metrics.sort((a, b) => b.count - a.count);
  }

  /**
   * 헬스체크 로그
   */
  health(component: string, status: 'healthy' | 'unhealthy', context: LogContext = {}) {
    const level = status === 'healthy' ? 'info' : 'warn';
    this.pino[level]({
      ...context,
      component,
      status,
      type: 'health_check'
    }, `${component} health check: ${status}`);
  }

  /**
   * 비즈니스 이벤트 로그
   */
  event(event: string, context: LogContext = {}) {
    this.pino.info({
      ...context,
      type: 'business_event',
      event
    }, `Business event: ${event}`);
  }

  /**
   * 로그 레벨 변경
   */
  setLevel(level: LogLevel) {
    this.pino.level = level;
  }

  /**
   * 메트릭 리셋
   */
  resetMetrics() {
    this.errorMetrics.clear();
    this.lastErrorTime.clear();
  }

  /**
   * 로거 인스턴스 직접 접근 (필요시)
   */
  getPinoInstance(): PinoLogger {
    return this.pino;
  }
}

// 전역 로거 인스턴스
export const logger = Logger.getInstance();

// 편의 함수들
export const logInfo = (message: string, context?: LogContext) => logger.info(message, context);
export const logDebug = (message: string, context?: LogContext) => logger.debug(message, context);
export const logWarn = (message: string, context?: LogContext) => logger.warn(message, context);
export const logError = (message: string, error?: Error | StructuredError, context?: LogContext) => 
  logger.error(message, error, context);
export const logFatal = (message: string, error?: Error | StructuredError, context?: LogContext) => 
  logger.fatal(message, error, context);
export const startTiming = (operation: string, context?: LogContext) => 
  logger.startTiming(operation, context);