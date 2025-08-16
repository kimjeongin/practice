#!/usr/bin/env node

/**
 * 모니터링 시스템 전체 테스트
 * 에러 발생 시뮬레이션 + 대시보드 확인
 */

import { logger } from './src/shared/logger/index.js';
import { errorMonitor } from './src/shared/monitoring/errorMonitor.js';
import { monitoringDashboard } from './src/infrastructure/dashboard/webDashboard.js';
import { 
  FileProcessingError,
  SearchError,
  TimeoutError,
  VectorStoreError,
  ErrorCode 
} from './src/shared/errors/index.js';
import { 
  withTimeout, 
  withRetry, 
  CircuitBreakerManager 
} from './src/shared/utils/resilience.js';

async function simulateErrors() {
  console.log('🎭 에러 시뮬레이션 시작...\n');

  // 1. 다양한 에러 타입 시뮬레이션
  const errors = [
    new FileProcessingError('PDF 파싱 실패', '/test/document1.pdf', 'pdf_parsing'),
    new FileProcessingError('이미지 처리 실패', '/test/image.jpg', 'image_processing'),
    new SearchError('벡터 검색 타임아웃', '사용자 쿼리', 'semantic'),
    new SearchError('키워드 검색 실패', '검색어', 'keyword'),
    new VectorStoreError('FAISS 인덱스 오류', 'index_creation', { operation: 'embedding' }),
    new TimeoutError('임베딩 생성', 30000),
  ];

  for (const error of errors) {
    errorMonitor.recordError(error);
    logger.error('시뮬레이션 에러', error, { 
      component: 'test_simulator',
      simulation: true 
    });
    
    // 간격을 두고 에러 발생
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 2. 서킷 브레이커 테스트
  console.log('\n⚡ 서킷 브레이커 테스트...');
  
  const testService = CircuitBreakerManager.getBreaker(
    'unstable_service',
    async () => {
      // 70% 확률로 실패
      if (Math.random() > 0.3) {
        throw new Error('Service temporarily down');
      }
      return 'OK';
    },
    {
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 10000,
      volumeThreshold: 5
    }
  );

  // 서킷 브레이커 테스트 실행
  for (let i = 0; i < 15; i++) {
    try {
      const result = await testService.fire();
      logger.info('서비스 호출 성공', { attempt: i + 1, result });
    } catch (error) {
      logger.warn('서비스 호출 실패', { 
        attempt: i + 1, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // 3. 대량 에러 시뮬레이션 (알림 테스트)
  console.log('\n🚨 대량 에러 시뮬레이션...');
  
  for (let i = 0; i < 25; i++) {
    const error = new FileProcessingError(
      `배치 처리 에러 #${i + 1}`,
      `/batch/file_${i + 1}.pdf`,
      'batch_processing'
    );
    
    errorMonitor.recordError(error);
    
    if (i % 5 === 0) {
      logger.info('배치 에러 진행률', { 
        processed: i + 1, 
        total: 25,
        progress: Math.round(((i + 1) / 25) * 100) + '%'
      });
    }
  }

  console.log('\n✅ 에러 시뮬레이션 완료!');
}

async function displayStats() {
  console.log('\n📊 최종 통계:');
  
  const health = errorMonitor.getSystemHealth();
  const stats = errorMonitor.getErrorStatistics();
  const circuitBreakers = CircuitBreakerManager.getStatus();

  console.log(`\n🏥 시스템 헬스:`);
  console.log(`   상태: ${health.status}`);
  console.log(`   에러율: ${health.errorRate.toFixed(2)}/분`);
  console.log(`   총 에러: ${health.totalErrors}`);
  console.log(`   가동시간: ${Math.round(health.uptime / 1000)}초`);

  console.log(`\n📈 에러 통계:`);
  for (const [code, count] of stats.byCode.entries()) {
    console.log(`   ${code}: ${count}회`);
  }

  console.log(`\n⚡ 서킷 브레이커 상태:`);
  for (const breaker of circuitBreakers) {
    console.log(`   ${breaker.name}: ${breaker.state} (성공: ${breaker.stats.successes}, 실패: ${breaker.stats.failures})`);
  }

  console.log(`\n🔥 최근 에러 (최대 5개):`);
  const recentErrors = errorMonitor.getErrorHistory(5);
  for (const error of recentErrors) {
    console.log(`   ${error.code}: ${error.message} (${new Date(error.timestamp).toLocaleTimeString()})`);
  }
}

async function runMonitoringTest() {
  console.log('🚀 RAG Server 모니터링 시스템 테스트\n');

  try {
    // 1. 모니터링 대시보드 시작
    console.log('📊 모니터링 대시보드 시작...');
    monitoringDashboard.start();
    
    console.log('✅ 대시보드가 시작되었습니다!');
    console.log('🌐 브라우저에서 확인: http://localhost:3001');
    console.log('   - 실시간 에러 모니터링');
    console.log('   - 시스템 헬스 상태');
    console.log('   - 서킷 브레이커 상태');
    console.log('   - 에러 통계 및 트렌드\n');

    // 2. 에러 시뮬레이션
    await simulateErrors();

    // 3. 통계 출력
    await displayStats();

    console.log('\n🎯 모니터링 확인 방법:');
    console.log('1. 웹 대시보드: http://localhost:3001');
    console.log('2. 로그 파일:');
    console.log('   - 전체 로그: ./logs/rag-server.log');
    console.log('   - 에러 로그: ./logs/rag-server-error.log');
    console.log('3. API 엔드포인트:');
    console.log('   - http://localhost:3001/api/health');
    console.log('   - http://localhost:3001/api/errors');
    console.log('   - http://localhost:3001/api/circuit-breakers');

    console.log('\n⏰ 30초 후 자동 종료됩니다. Ctrl+C로 즉시 종료 가능합니다.');
    
    // 30초 후 자동 종료
    setTimeout(() => {
      console.log('\n🔚 테스트 완료. 대시보드를 종료합니다.');
      monitoringDashboard.stop();
      process.exit(0);
    }, 30000);

  } catch (error) {
    console.error('❌ 테스트 실행 중 오류:', error);
    monitoringDashboard.stop();
    process.exit(1);
  }
}

// 우아한 종료 처리
process.on('SIGINT', () => {
  console.log('\n\n🛑 사용자에 의해 중단됨');
  monitoringDashboard.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 프로세스 종료 신호 수신');
  monitoringDashboard.stop();
  process.exit(0);
});

// 테스트 실행
runMonitoringTest().catch(console.error);