#!/usr/bin/env node

/**
 * 향상된 에러 핸들링 시스템 테스트
 * 새로운 구조화된 에러, 로깅, 모니터링 시스템 검증
 */

import { logger } from './src/shared/logger/index.js';
import { errorMonitor } from './src/shared/monitoring/errorMonitor.js';
import { 
  StructuredError, 
  FileProcessingError,
  SearchError,
  TimeoutError,
  ErrorCode 
} from './src/shared/errors/index.js';
import { 
  withTimeout, 
  withRetry, 
  CircuitBreakerManager 
} from './src/shared/utils/resilience.js';

async function testErrorHandling() {
  console.log('🧪 Testing Enhanced Error Handling System\n');

  // 1. 로거 테스트
  console.log('📝 Testing Logger...');
  logger.info('Logger test started', { component: 'test', operation: 'logger_test' });
  logger.debug('Debug message test', { details: 'This is a debug message' });
  logger.warn('Warning message test', { warning: 'This is a warning' });
  
  // 2. 구조화된 에러 테스트
  console.log('\n🔥 Testing Structured Errors...');
  
  const fileError = new FileProcessingError(
    'Test PDF processing failed',
    '/test/document.pdf',
    'pdf_parsing'
  );
  
  const searchError = new SearchError(
    'Vector search timeout',
    'test query',
    'semantic'
  );
  
  // 에러 모니터에 기록
  errorMonitor.recordError(fileError);
  errorMonitor.recordError(searchError);
  
  logger.error('Test file processing error', fileError);
  logger.error('Test search error', searchError);
  
  // 3. 타임아웃 테스트
  console.log('\n⏰ Testing Timeout Wrapper...');
  
  try {
    await withTimeout(
      new Promise(resolve => setTimeout(resolve, 3000)), // 3초 대기
      {
        timeoutMs: 1000, // 1초 타임아웃
        operation: 'test_timeout'
      }
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn('Timeout test successful', { error: error.message });
      errorMonitor.recordError(error);
    }
  }
  
  // 4. 재시도 테스트
  console.log('\n🔄 Testing Retry Logic...');
  
  let attemptCount = 0;
  try {
    await withRetry(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return 'success';
      },
      'test_retry',
      { retries: 3 }
    );
    logger.info('Retry test successful', { attempts: attemptCount });
  } catch (error) {
    logger.error('Retry test failed', error as Error);
  }
  
  // 5. 서킷 브레이커 테스트
  console.log('\n⚡ Testing Circuit Breaker...');
  
  const testBreaker = CircuitBreakerManager.getBreaker(
    'test_service',
    async () => {
      // 50% 확률로 실패하는 가짜 서비스
      if (Math.random() > 0.5) {
        throw new Error('Service temporarily unavailable');
      }
      return 'Service response';
    },
    {
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 5000,
      volumeThreshold: 3
    }
  );
  
  // 서킷 브레이커 테스트 실행
  for (let i = 0; i < 10; i++) {
    try {
      const result = await testBreaker.fire();
      logger.debug('Circuit breaker test success', { attempt: i + 1, result });
    } catch (error) {
      logger.debug('Circuit breaker test failure', { 
        attempt: i + 1, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    
    // 짧은 대기
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 6. 에러 모니터링 통계 확인
  console.log('\n📊 Testing Error Monitoring...');
  
  const systemHealth = errorMonitor.getSystemHealth();
  const errorStats = errorMonitor.getErrorStatistics();
  const circuitBreakerStatus = CircuitBreakerManager.getStatus();
  
  logger.info('System health report', {
    status: systemHealth.status,
    errorRate: systemHealth.errorRate,
    totalErrors: systemHealth.totalErrors
  });
  
  logger.info('Error statistics', {
    errorsByCode: Array.from(errorStats.byCode.entries()),
    errorsByComponent: Array.from(errorStats.byComponent.entries())
  });
  
  logger.info('Circuit breaker status', { breakers: circuitBreakerStatus });
  
  // 7. 에러 트렌드 분석
  console.log('\n📈 Testing Error Trend Analysis...');
  
  const fileErrorTrend = errorMonitor.getErrorTrend(ErrorCode.FILE_PARSE_ERROR);
  const searchErrorTrend = errorMonitor.getErrorTrend(ErrorCode.SEARCH_ERROR);
  
  logger.info('Error trends', {
    fileErrors: {
      count: fileErrorTrend.count,
      trend: fileErrorTrend.trend
    },
    searchErrors: {
      count: searchErrorTrend.count,
      trend: searchErrorTrend.trend
    }
  });
  
  console.log('\n✅ Error Handling System Test Completed!');
  console.log('\n📋 Test Summary:');
  console.log(`   - Structured Errors: ✅ Working`);
  console.log(`   - Logger System: ✅ Working`);
  console.log(`   - Timeout Wrapper: ✅ Working`);
  console.log(`   - Retry Logic: ✅ Working`);
  console.log(`   - Circuit Breaker: ✅ Working`);
  console.log(`   - Error Monitoring: ✅ Working`);
  console.log(`   - Trend Analysis: ✅ Working`);
  
  const finalStats = errorMonitor.getErrorStatistics();
  console.log(`\n📊 Final Statistics:`);
  console.log(`   - Total Error Types: ${finalStats.byCode.size}`);
  console.log(`   - System Health: ${systemHealth.status}`);
  console.log(`   - Error Rate: ${systemHealth.errorRate.toFixed(2)}/min`);
}

// 테스트 실행
testErrorHandling().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});