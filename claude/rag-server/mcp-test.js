#!/usr/bin/env node

// MCP 클라이언트 테스트 도구
import { spawn } from 'child_process';
import readline from 'readline';

class MCPTester {
  constructor() {
    this.server = null;
    this.requestId = 1;
  }

  async startServer() {
    console.log('🚀 MCP 서버 시작 중...');
    this.server = spawn('node', ['dist/mcp-index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.server.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('{')) {
        // JSON 응답인 경우 파싱해서 예쁘게 출력
        try {
          const jsonResponse = JSON.parse(output);
          console.log('📨 서버 응답:');
          console.log(JSON.stringify(jsonResponse, null, 2));
        } catch {
          console.log('📤 서버:', output);
        }
      } else {
        console.log('📤 서버:', output);
      }
    });

    this.server.stderr.on('data', (data) => {
      console.log('🔥 에러:', data.toString().trim());
    });

    // 서버가 준비될 때까지 대기
    await new Promise(resolve => {
      const checkReady = (data) => {
        if (data.toString().includes('MCP RAG Server started and ready')) {
          this.server.stdout.off('data', checkReady);
          resolve();
        }
      };
      this.server.stdout.on('data', checkReady);
    });

    console.log('✅ MCP 서버 준비 완료!');
  }

  sendRequest(request) {
    console.log('📤 요청 전송:', JSON.stringify(request, null, 2));
    this.server.stdin.write(JSON.stringify(request) + '\n');
  }

  async runTests() {
    await this.startServer();

    console.log('\n=== 🧪 테스트 시작 ===\n');

    // 1. 도구 목록 조회
    setTimeout(() => {
      console.log('1️⃣ 도구 목록 조회');
      this.sendRequest({
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/list"
      });
    }, 1000);

    // 2. 파일 목록 조회
    setTimeout(() => {
      console.log('\n2️⃣ 파일 목록 조회');
      this.sendRequest({
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/call",
        params: {
          name: "list_files",
          arguments: {}
        }
      });
    }, 2000);

    // 3. 문서 검색
    setTimeout(() => {
      console.log('\n3️⃣ 문서 검색: "test"');
      this.sendRequest({
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/call",
        params: {
          name: "search_documents",
          arguments: {
            query: "test document features",
            topK: 2
          }
        }
      });
    }, 3000);

    // 4. 서버 상태 확인
    setTimeout(() => {
      console.log('\n4️⃣ 서버 상태 확인');
      this.sendRequest({
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/call",
        params: {
          name: "get_server_status",
          arguments: {}
        }
      });
    }, 4000);

    // 5. 리소스 목록 조회
    setTimeout(() => {
      console.log('\n5️⃣ 리소스 목록 조회');
      this.sendRequest({
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "resources/list"
      });
    }, 5000);

    // 6. 프롬프트 목록 조회
    setTimeout(() => {
      console.log('\n6️⃣ 프롬프트 목록 조회');
      this.sendRequest({
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "prompts/list"
      });
    }, 6000);

    // 테스트 완료 후 종료
    setTimeout(() => {
      console.log('\n✅ 모든 테스트 완료! 서버를 종료합니다.');
      this.server.kill('SIGTERM');
      process.exit(0);
    }, 8000);
  }

  async interactiveMode() {
    await this.startServer();
    
    console.log('\n=== 🎮 인터랙티브 모드 ===');
    console.log('명령어:');
    console.log('  list-tools    - 도구 목록');
    console.log('  list-files    - 파일 목록');
    console.log('  search <query> - 문서 검색');
    console.log('  status        - 서버 상태');
    console.log('  help          - 도움말');
    console.log('  quit          - 종료');
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'MCP> '
    });

    rl.prompt();

    rl.on('line', (input) => {
      const [command, ...args] = input.trim().split(' ');
      
      switch (command) {
        case 'list-tools':
          this.sendRequest({
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/list"
          });
          break;
          
        case 'list-files':
          this.sendRequest({
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/call",
            params: { name: "list_files", arguments: {} }
          });
          break;
          
        case 'search':
          if (args.length === 0) {
            console.log('사용법: search <검색어>');
          } else {
            this.sendRequest({
              jsonrpc: "2.0",
              id: this.requestId++,
              method: "tools/call",
              params: {
                name: "search_documents",
                arguments: { query: args.join(' '), topK: 3 }
              }
            });
          }
          break;
          
        case 'status':
          this.sendRequest({
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/call",
            params: { name: "get_server_status", arguments: {} }
          });
          break;
          
        case 'help':
          console.log('사용 가능한 명령어:');
          console.log('  list-tools, list-files, search <query>, status, quit');
          break;
          
        case 'quit':
          console.log('서버를 종료합니다...');
          this.server.kill('SIGTERM');
          process.exit(0);
          break;
          
        default:
          console.log('알 수 없는 명령어입니다. "help"를 입력하세요.');
      }
      
      rl.prompt();
    });
  }
}

// 사용법
const mode = process.argv[2] || 'test';
const tester = new MCPTester();

if (mode === 'interactive' || mode === 'i') {
  tester.interactiveMode();
} else {
  tester.runTests();
}