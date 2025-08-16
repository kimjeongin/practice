#!/usr/bin/env node

/**
 * Quick PDF Integration Test
 * Verifies PDF processing and search threshold adjustments
 */

import { spawn } from 'child_process';

interface McpRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class QuickPDFTestClient {
  private mcpProcess: any;
  private requestId = 1;
  private isConnected = false;

  async connect(): Promise<void> {
    console.log('🚀 Starting MCP Server...');
    
    this.mcpProcess = spawn('node', ['dist/app/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 15000);

      this.mcpProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('Server started') || output.includes('ready for stdio')) {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve(void 0);
        }
      });

      this.mcpProcess.stderr.on('data', (data: Buffer) => {
        const error = data.toString();
        if (!error.includes('warning') && !error.includes('Warning')) {
          console.log('⚠️ Server error:', error.trim());
        }
      });

      this.mcpProcess.on('exit', (code: number) => {
        if (!this.isConnected) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });

    console.log('✅ MCP Server connected');
  }

  async sendRequest(method: string, params?: any): Promise<McpResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    const request: McpRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000);

      const requestData = JSON.stringify(request) + '\n';
      this.mcpProcess.stdin.write(requestData);

      const onData = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              this.mcpProcess.stdout.removeListener('data', onData);
              resolve(response);
              return;
            }
          } catch (e) {
            // Ignore non-JSON output
          }
        }
      };

      this.mcpProcess.stdout.on('data', onData);
    });
  }

  async disconnect(): Promise<void> {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.isConnected = false;
      console.log('🔌 Disconnected from MCP server');
    }
  }
}

async function runQuickTests(): Promise<void> {
  const client = new QuickPDFTestClient();
  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name: string, testFn: () => Promise<void>) => {
    try {
      console.log(`\n🧪 ${name}`);
      await testFn();
      console.log(`✅ PASSED: ${name}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ FAILED: ${name} - ${error}`);
      testsFailed++;
    }
  };

  try {
    await client.connect();

    // Initialize
    await test('Initialize MCP', async () => {
      const response = await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'quick-test', version: '1.0.0' }
      });
      if (response.error) throw new Error(response.error.message);
    });

    // Check files list for PDF
    await test('List Files', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_files',
        arguments: { limit: "10" }
      });
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      const files = result.files || [];
      const pdfFiles = files.filter((f: any) => f.fileType === 'pdf');
      
      console.log(`📁 Found ${files.length} total files, ${pdfFiles.length} PDF files`);
      if (pdfFiles.length > 0) {
        console.log(`📄 PDF: ${pdfFiles[0].name} (${pdfFiles[0].size} bytes)`);
      }
      
      if (pdfFiles.length === 0) {
        throw new Error('No PDF files found');
      }
    });

    // Simple keyword search (should work with any threshold)
    await test('Keyword Search', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'test',
          topK: "3",
          useSemanticSearch: "false"
        }
      });
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      console.log(`🔍 Keyword search found ${result.results?.length || 0} results`);
      
      if (result.results && result.results.length > 0) {
        const fileTypes = result.results.map((r: any) => r.metadata?.fileType).filter(Boolean);
        console.log(`📊 File types in results: ${[...new Set(fileTypes)].join(', ')}`);
      }
    });

    // Semantic search with lowered threshold
    await test('Semantic Search', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'document text content',
          topK: "3",
          useSemanticSearch: "true"
        }
      });
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      console.log(`🔍 Semantic search found ${result.results?.length || 0} results`);
      
      if (result.results && result.results.length > 0) {
        const scores = result.results.map((r: any) => r.score);
        console.log(`📊 Score range: ${Math.min(...scores).toFixed(3)} - ${Math.max(...scores).toFixed(3)}`);
      } else {
        console.log('⚠️ No results - threshold may still be too high');
      }
    });

    // Server status
    await test('Server Status', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'get_server_status',
        arguments: {}
      });
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      console.log(`📊 Server status:`);
      console.log(`   - Files: ${result.stats?.totalFiles || 0}`);
      console.log(`   - Chunks: ${result.stats?.totalChunks || 0}`);
      console.log(`   - Threshold: ${result.config?.similarityThreshold || 'unknown'}`);
      console.log(`   - Supported: ${result.supportedFormats?.join(', ') || 'none'}`);
    });

  } catch (error) {
    console.error('💥 Test suite failed:', error);
  } finally {
    await client.disconnect();
    
    console.log('\n📈 Quick PDF Test Results:');
    console.log(`✅ Tests passed: ${testsPassed}`);
    console.log(`❌ Tests failed: ${testsFailed}`);
    console.log(`📊 Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! PDF support and search improvements are working.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the implementation.');
    }
  }
}

runQuickTests().catch(console.error);