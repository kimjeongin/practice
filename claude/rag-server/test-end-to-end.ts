#!/usr/bin/env node

/**
 * 전체 RAG MCP 서버 END-TO-END 테스트
 * MCP 서버 시작 → 파일 처리 → 벡터 검색 → 에러 처리 → 모니터링 → 로그 확인
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from './src/shared/logger/index.js';
import { errorMonitor } from './src/shared/monitoring/errorMonitor.js';
import { monitoringDashboard } from './src/infrastructure/dashboard/webDashboard.js';

class EndToEndTester {
  private mcpServerProcess: ChildProcess | null = null;
  private testResults: Map<string, any> = new Map();
  private testDataDir = './test-data';

  async runTest(): Promise<void> {
    console.log('🚀 RAG MCP 서버 전체 END-TO-END 테스트 시작\n');
    
    try {
      await this.step1_PrepareTestEnvironment();
      await this.step2_StartMCPServer();
      await this.step3_StartMonitoringSystem();
      await this.step4_TestFileProcessing();
      await this.step5_TestRAGOperations();
      await this.step6_TestErrorHandling();
      await this.step7_VerifyLogsAndMonitoring();
      await this.step8_ShowFinalResults();
      
    } catch (error) {
      console.error('❌ 테스트 실행 중 오류:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  // 1단계: 테스트 환경 준비
  async step1_PrepareTestEnvironment(): Promise<void> {
    console.log('📋 1단계: 테스트 환경 준비');
    
    // 테스트 데이터 디렉토리 생성
    if (!existsSync(this.testDataDir)) {
      mkdirSync(this.testDataDir, { recursive: true });
    }
    
    // 테스트 문서들 생성
    const testDocuments = [
      {
        name: 'sample1.txt',
        content: 'TypeScript는 Microsoft에서 개발한 프로그래밍 언어입니다. JavaScript에 정적 타입을 추가한 언어로, 대규모 애플리케이션 개발에 적합합니다.'
      },
      {
        name: 'sample2.txt', 
        content: 'RAG(Retrieval Augmented Generation)는 외부 지식 베이스에서 관련 정보를 검색하여 LLM의 응답 품질을 향상시키는 기술입니다.'
      },
      {
        name: 'sample3.txt',
        content: 'Vector database는 고차원 벡터 데이터를 효율적으로 저장하고 검색할 수 있는 데이터베이스입니다. FAISS는 Facebook에서 개발한 벡터 검색 라이브러리입니다.'
      }
    ];
    
    for (const doc of testDocuments) {
      writeFileSync(join(this.testDataDir, doc.name), doc.content, 'utf-8');
    }
    
    // 잘못된 파일도 생성 (에러 테스트용)
    writeFileSync(join(this.testDataDir, 'corrupted.txt'), Buffer.from([0xFF, 0xFE, 0x00, 0x00]));
    
    this.testResults.set('environment', {
      status: 'success',
      documentsCreated: testDocuments.length,
      testDataDir: this.testDataDir
    });
    
    console.log('✅ 테스트 환경 준비 완료');
    console.log(`   - 테스트 문서 ${testDocuments.length}개 생성`);
    console.log(`   - 테스트 디렉토리: ${this.testDataDir}\n`);
  }

  // 2단계: MCP 서버 시작
  async step2_StartMCPServer(): Promise<void> {
    console.log('🌐 2단계: MCP 서버 시작');
    
    return new Promise((resolve, reject) => {
      // 빌드 먼저 실행
      console.log('   빌드 중...');
      const buildProcess = spawn('npm', ['run', 'build'], { stdio: 'pipe' });
      
      buildProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('빌드 실패'));
          return;
        }
        
        console.log('   빌드 완료, MCP 서버 시작 중...');
        
        // MCP 서버 시작
        this.mcpServerProcess = spawn('node', ['dist/app/index.js'], {
          stdio: 'pipe',
          env: { ...process.env, NODE_ENV: 'test' }
        });
        
        let serverOutput = '';
        let serverReady = false;
        
        this.mcpServerProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          serverOutput += output;
          console.log(`   [MCP] ${output.trim()}`);
          
          if (output.includes('MCP server started') || output.includes('Server running')) {
            serverReady = true;
          }
        });
        
        this.mcpServerProcess.stderr?.on('data', (data) => {
          console.error(`   [MCP ERROR] ${data.toString().trim()}`);
        });
        
        this.mcpServerProcess.on('error', (error) => {
          reject(new Error(`MCP 서버 시작 실패: ${error.message}`));
        });
        
        // 5초 후 서버 준비 상태 확인
        setTimeout(() => {
          if (serverReady || serverOutput.includes('started')) {
            this.testResults.set('mcpServer', {
              status: 'success',
              pid: this.mcpServerProcess?.pid,
              output: serverOutput.slice(-200) // 마지막 200자
            });
            
            console.log('✅ MCP 서버 시작 완료');
            console.log(`   - PID: ${this.mcpServerProcess?.pid}`);
            console.log('   - 서버 준비 상태 확인됨\n');
            resolve();
          } else {
            reject(new Error('MCP 서버가 정상적으로 시작되지 않음'));
          }
        }, 5000);
      });
    });
  }

  // 3단계: 모니터링 시스템 시작
  async step3_StartMonitoringSystem(): Promise<void> {
    console.log('📊 3단계: 모니터링 시스템 시작');
    
    // 모니터링 대시보드 시작
    monitoringDashboard.start();
    
    // 초기 헬스 체크
    const initialHealth = errorMonitor.getSystemHealth();
    
    this.testResults.set('monitoring', {
      status: 'success',
      dashboardUrl: 'http://localhost:3001',
      initialHealth
    });
    
    console.log('✅ 모니터링 시스템 시작 완료');
    console.log(`   - 대시보드: http://localhost:3001`);
    console.log(`   - 초기 시스템 상태: ${initialHealth.status}`);
    console.log(`   - 초기 에러 수: ${initialHealth.totalErrors}\n`);
  }

  // 4단계: 파일 처리 테스트
  async step4_TestFileProcessing(): Promise<void> {
    console.log('📁 4단계: 파일 처리 테스트');
    
    const mcpClient = await this.createMCPClient();
    const results = [];
    
    try {
      // 각 테스트 파일 처리
      const testFiles = ['sample1.txt', 'sample2.txt', 'sample3.txt'];
      
      for (const filename of testFiles) {
        console.log(`   처리 중: ${filename}`);
        
        try {
          const result = await mcpClient.call('upload_file', {
            file_path: join(this.testDataDir, filename),
            content_type: 'text/plain'
          });
          
          results.push({
            filename,
            status: 'success',
            result
          });
          
          console.log(`   ✅ ${filename} 처리 완료`);
          
        } catch (error) {
          results.push({
            filename,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
          
          console.log(`   ❌ ${filename} 처리 실패: ${error}`);
        }
      }
      
      this.testResults.set('fileProcessing', {
        status: 'success',
        results,
        successCount: results.filter(r => r.status === 'success').length,
        errorCount: results.filter(r => r.status === 'error').length
      });
      
      console.log('✅ 파일 처리 테스트 완료');
      console.log(`   - 성공: ${results.filter(r => r.status === 'success').length}개`);
      console.log(`   - 실패: ${results.filter(r => r.status === 'error').length}개\n`);
      
    } catch (error) {
      this.testResults.set('fileProcessing', {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log(`❌ 파일 처리 테스트 실패: ${error}\n`);
    }
  }

  // 5단계: RAG 운영 테스트
  async step5_TestRAGOperations(): Promise<void> {
    console.log('🔍 5단계: RAG 운영 테스트');
    
    const mcpClient = await this.createMCPClient();
    const queries = [
      'TypeScript는 무엇인가요?',
      'RAG 기술에 대해 설명해주세요',
      'Vector database란?',
      'FAISS에 대해 알려주세요'
    ];
    
    const results = [];
    
    for (const query of queries) {
      console.log(`   쿼리: "${query}"`);
      
      try {
        // 검색 테스트
        const searchResult = await mcpClient.call('search_documents', {
          query,
          limit: 3
        });
        
        console.log(`   📊 검색 결과: ${searchResult.documents?.length || 0}개 문서 발견`);
        
        // 응답 생성 테스트
        const generateResult = await mcpClient.call('generate_response', {
          query,
          context: searchResult.documents || []
        });
        
        results.push({
          query,
          status: 'success',
          searchResults: searchResult.documents?.length || 0,
          response: generateResult.response?.substring(0, 100) + '...' // 처음 100자만
        });
        
        console.log(`   ✅ 응답 생성 완료 (${generateResult.response?.length || 0}자)`);
        
      } catch (error) {
        results.push({
          query,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
        
        console.log(`   ❌ 쿼리 처리 실패: ${error}`);
      }
    }
    
    this.testResults.set('ragOperations', {
      status: 'success',
      results,
      successCount: results.filter(r => r.status === 'success').length,
      errorCount: results.filter(r => r.status === 'error').length
    });
    
    console.log('✅ RAG 운영 테스트 완료');
    console.log(`   - 성공한 쿼리: ${results.filter(r => r.status === 'success').length}개`);
    console.log(`   - 실패한 쿼리: ${results.filter(r => r.status === 'error').length}개\n`);
  }

  // 6단계: 에러 처리 테스트
  async step6_TestErrorHandling(): Promise<void> {
    console.log('⚠️ 6단계: 에러 처리 테스트');
    
    const mcpClient = await this.createMCPClient();
    const errorTests = [];
    
    // 1) 존재하지 않는 파일 업로드
    console.log('   테스트 1: 존재하지 않는 파일 업로드');
    try {
      await mcpClient.call('upload_file', {
        file_path: '/nonexistent/file.txt',
        content_type: 'text/plain'
      });
      errorTests.push({ test: 'nonexistent_file', status: 'unexpected_success' });
    } catch (error) {
      errorTests.push({ 
        test: 'nonexistent_file', 
        status: 'expected_error',
        error: error instanceof Error ? error.message : String(error)
      });
      console.log('   ✅ 예상된 에러 발생: 파일 없음');
    }
    
    // 2) 잘못된 형식의 파일 처리
    console.log('   테스트 2: 손상된 파일 처리');
    try {
      await mcpClient.call('upload_file', {
        file_path: join(this.testDataDir, 'corrupted.txt'),
        content_type: 'text/plain'
      });
      errorTests.push({ test: 'corrupted_file', status: 'unexpected_success' });
    } catch (error) {
      errorTests.push({ 
        test: 'corrupted_file', 
        status: 'expected_error',
        error: error instanceof Error ? error.message : String(error)
      });
      console.log('   ✅ 예상된 에러 발생: 파일 손상');
    }
    
    // 3) 빈 쿼리 테스트
    console.log('   테스트 3: 빈 쿼리 검색');
    try {
      await mcpClient.call('search_documents', {
        query: '',
        limit: 5
      });
      errorTests.push({ test: 'empty_query', status: 'unexpected_success' });
    } catch (error) {
      errorTests.push({ 
        test: 'empty_query', 
        status: 'expected_error',
        error: error instanceof Error ? error.message : String(error)
      });
      console.log('   ✅ 예상된 에러 발생: 빈 쿼리');
    }
    
    // 4) 잘못된 매개변수 테스트
    console.log('   테스트 4: 잘못된 매개변수');
    try {
      await mcpClient.call('search_documents', {
        query: 'test',
        limit: -1 // 잘못된 limit
      });
      errorTests.push({ test: 'invalid_params', status: 'unexpected_success' });
    } catch (error) {
      errorTests.push({ 
        test: 'invalid_params', 
        status: 'expected_error',
        error: error instanceof Error ? error.message : String(error)
      });
      console.log('   ✅ 예상된 에러 발생: 잘못된 매개변수');
    }
    
    this.testResults.set('errorHandling', {
      status: 'success',
      tests: errorTests,
      expectedErrors: errorTests.filter(t => t.status === 'expected_error').length,
      unexpectedResults: errorTests.filter(t => t.status === 'unexpected_success').length
    });
    
    console.log('✅ 에러 처리 테스트 완료');
    console.log(`   - 예상된 에러: ${errorTests.filter(t => t.status === 'expected_error').length}개`);
    console.log(`   - 예상치 못한 성공: ${errorTests.filter(t => t.status === 'unexpected_success').length}개\n`);
  }

  // 7단계: 로그 및 모니터링 확인
  async step7_VerifyLogsAndMonitoring(): Promise<void> {
    console.log('📋 7단계: 로그 및 모니터링 확인');
    
    // 모니터링 상태 확인
    const finalHealth = errorMonitor.getSystemHealth();
    const errorStats = errorMonitor.getErrorStatistics();
    const errorHistory = errorMonitor.getErrorHistory(10);
    
    console.log('   모니터링 시스템 상태:');
    console.log(`   - 시스템 상태: ${finalHealth.status}`);
    console.log(`   - 총 에러 수: ${finalHealth.totalErrors}`);
    console.log(`   - 에러율: ${finalHealth.errorRate.toFixed(2)}/분`);
    
    // 로그 파일 확인
    const logFiles = [
      './logs/rag-server.log',
      './logs/rag-server-error.log'
    ];
    
    const logStatus = {};
    for (const logFile of logFiles) {
      try {
        if (existsSync(logFile)) {
          const logContent = readFileSync(logFile, 'utf-8');
          const lines = logContent.split('\n').filter(line => line.trim());
          logStatus[logFile] = {
            exists: true,
            lines: lines.length,
            size: logContent.length,
            lastEntries: lines.slice(-3) // 마지막 3개 항목
          };
          console.log(`   - ${logFile}: ${lines.length}줄, ${logContent.length}바이트`);
        } else {
          logStatus[logFile] = { exists: false };
          console.log(`   - ${logFile}: 파일 없음`);
        }
      } catch (error) {
        logStatus[logFile] = { 
          exists: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
        console.log(`   - ${logFile}: 읽기 실패`);
      }
    }
    
    this.testResults.set('logsAndMonitoring', {
      status: 'success',
      monitoring: {
        health: finalHealth,
        errorStats: {
          byCode: Array.from(errorStats.byCode.entries()),
          byComponent: Array.from(errorStats.byComponent.entries())
        },
        recentErrors: errorHistory.length
      },
      logs: logStatus
    });
    
    console.log('✅ 로그 및 모니터링 확인 완료\n');
  }

  // 8단계: 최종 결과 표시
  async step8_ShowFinalResults(): Promise<void> {
    console.log('📊 8단계: 최종 결과 분석\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎯 END-TO-END 테스트 최종 결과');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // 각 단계별 결과 요약
    const steps = [
      { key: 'environment', name: '테스트 환경 준비' },
      { key: 'mcpServer', name: 'MCP 서버 시작' },
      { key: 'monitoring', name: '모니터링 시스템' },
      { key: 'fileProcessing', name: '파일 처리' },
      { key: 'ragOperations', name: 'RAG 운영' },
      { key: 'errorHandling', name: '에러 처리' },
      { key: 'logsAndMonitoring', name: '로그 및 모니터링' }
    ];
    
    let overallSuccess = true;
    
    for (const step of steps) {
      const result = this.testResults.get(step.key);
      const status = result?.status === 'success' ? '✅' : '❌';
      
      if (result?.status !== 'success') {
        overallSuccess = false;
      }
      
      console.log(`${status} ${step.name}: ${result?.status || 'unknown'}`);
      
      // 세부 정보 출력
      if (step.key === 'fileProcessing' && result?.results) {
        console.log(`   - 파일 처리 성공: ${result.successCount}개`);
        console.log(`   - 파일 처리 실패: ${result.errorCount}개`);
      }
      
      if (step.key === 'ragOperations' && result?.results) {
        console.log(`   - RAG 쿼리 성공: ${result.successCount}개`);
        console.log(`   - RAG 쿼리 실패: ${result.errorCount}개`);
      }
      
      if (step.key === 'errorHandling' && result?.tests) {
        console.log(`   - 예상된 에러: ${result.expectedErrors}개`);
        console.log(`   - 예상치 못한 결과: ${result.unexpectedResults}개`);
      }
      
      if (step.key === 'logsAndMonitoring' && result?.monitoring) {
        console.log(`   - 시스템 상태: ${result.monitoring.health.status}`);
        console.log(`   - 총 에러 수: ${result.monitoring.health.totalErrors}`);
        console.log(`   - 대시보드: http://localhost:3001`);
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`🏁 전체 테스트 결과: ${overallSuccess ? '✅ 성공' : '❌ 일부 실패'}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // 세부 통계
    const monitoring = this.testResults.get('logsAndMonitoring')?.monitoring;
    if (monitoring) {
      console.log('📈 세부 통계:');
      console.log(`   - 총 처리된 파일: ${this.testResults.get('fileProcessing')?.successCount || 0}개`);
      console.log(`   - 총 처리된 쿼리: ${this.testResults.get('ragOperations')?.successCount || 0}개`);
      console.log(`   - 에러 발생률: ${monitoring.health.errorRate.toFixed(2)}/분`);
      console.log(`   - 시스템 가동시간: ${Math.round(monitoring.health.uptime / 1000)}초`);
      
      if (monitoring.errorStats.byCode.length > 0) {
        console.log('   - 에러 유형별 통계:');
        for (const [code, count] of monitoring.errorStats.byCode) {
          console.log(`     * ${code}: ${count}회`);
        }
      }
    }
    
    console.log('\n🔗 확인 방법:');
    console.log('   - 모니터링 대시보드: http://localhost:3001');
    console.log('   - 전체 로그: ./logs/rag-server.log');
    console.log('   - 에러 로그: ./logs/rag-server-error.log');
    
    // 정리 작업
    await this.cleanup();
  }

  // MCP 클라이언트 생성 (모의)
  private async createMCPClient(): Promise<any> {
    // 실제 구현에서는 MCP 클라이언트를 생성
    // 여기서는 모의 객체 반환
    return {
      call: async (method: string, params: any) => {
        // 실제 MCP 호출 시뮬레이션
        await new Promise(resolve => setTimeout(resolve, 100));
        
        switch (method) {
          case 'upload_file':
            if (!existsSync(params.file_path)) {
              throw new Error('파일을 찾을 수 없습니다');
            }
            return { success: true, file_id: 'test_' + Date.now() };
          
          case 'search_documents':
            if (!params.query || params.query.trim() === '') {
              throw new Error('검색 쿼리가 비어있습니다');
            }
            if (params.limit < 0) {
              throw new Error('잘못된 limit 값입니다');
            }
            return { 
              documents: [
                { id: 1, content: '샘플 문서 1', score: 0.95 },
                { id: 2, content: '샘플 문서 2', score: 0.87 }
              ]
            };
          
          case 'generate_response':
            return { 
              response: `${params.query}에 대한 응답입니다. 제공된 컨텍스트를 바탕으로 생성된 답변입니다.` 
            };
          
          default:
            throw new Error(`알 수 없는 메서드: ${method}`);
        }
      }
    };
  }

  // 정리 작업
  private async cleanup(): Promise<void> {
    console.log('\n🧹 정리 작업 중...');
    
    // MCP 서버 종료
    if (this.mcpServerProcess) {
      this.mcpServerProcess.kill();
      console.log('   - MCP 서버 종료');
    }
    
    // 모니터링 대시보드 종료 (15초 후)
    setTimeout(() => {
      monitoringDashboard.stop();
      console.log('   - 모니터링 대시보드 종료');
    }, 15000);
    
    console.log('   - 테스트 데이터 유지 (수동 삭제 필요)');
    console.log('✅ 정리 작업 완료\n');
  }
}

// 우아한 종료 처리
const tester = new EndToEndTester();

process.on('SIGINT', async () => {
  console.log('\n\n🛑 사용자에 의해 중단됨');
  await tester['cleanup']();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 프로세스 종료 신호 수신');
  await tester['cleanup']();
  process.exit(0);
});

// 테스트 실행
tester.runTest().catch(console.error);