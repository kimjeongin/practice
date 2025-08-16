#!/usr/bin/env node

/**
 * UNPDF Performance Test
 * Tests the new unpdf-based PDF parser performance and accuracy
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

class UnpdfTestClient {
  private mcpProcess: any;
  private requestId = 1;
  private isConnected = false;

  async connect(): Promise<void> {
    console.log('🚀 Starting MCP Server for UNPDF performance testing...');
    
    this.mcpProcess = spawn('node', ['dist/app/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 20000);

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
        if (!error.includes('warning') && !error.includes('Warning') && !error.includes('dtype')) {
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
      }, 40000); // Longer timeout for PDF processing

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

async function runUnpdfPerformanceTests(): Promise<void> {
  const client = new UnpdfTestClient();
  let testsPassed = 0;
  let testsFailed = 0;
  const startTime = Date.now();

  const test = async (name: string, testFn: () => Promise<void>) => {
    try {
      console.log(`\n🧪 ${name}`);
      const testStartTime = Date.now();
      await testFn();
      const testEndTime = Date.now();
      console.log(`✅ PASSED: ${name} (${testEndTime - testStartTime}ms)`);
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
        clientInfo: { name: 'unpdf-performance-test', version: '1.0.0' }
      });
      if (response.error) throw new Error(response.error.message);
    });

    // Force reindex to test UNPDF processing
    await test('Force Reindex with UNPDF', async () => {
      console.log('⏳ Processing PDF with UNPDF - this may take a moment...');
      const startReindex = Date.now();
      
      const response = await client.sendRequest('tools/call', {
        name: 'force_reindex',
        arguments: { clearCache: "true" }
      });
      
      const endReindex = Date.now();
      console.log(`📊 PDF processing time: ${endReindex - startReindex}ms`);
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      console.log('🔄 Reindex result:', result);
    });

    // Check files and chunks after processing
    await test('Verify PDF Processing Results', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_files',
        arguments: { limit: "10" }
      });
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      const files = result.files || [];
      const pdfFiles = files.filter((f: any) => f.fileType === 'pdf');
      
      console.log(`📁 Total files: ${files.length}`);
      console.log(`📄 PDF files: ${pdfFiles.length}`);
      
      if (pdfFiles.length > 0) {
        const pdfFile = pdfFiles[0];
        console.log(`📄 PDF: ${pdfFile.name} (${pdfFile.size} bytes, ${pdfFile.chunksCount || 0} chunks)`);
      }
      
      if (pdfFiles.length === 0) {
        throw new Error('No PDF files found after processing');
      }
    });

    // Test search performance with UNPDF-processed content
    await test('Search Performance Test', async () => {
      const queries = [
        'document text content',
        'sample test',
        'processing information'
      ];
      
      for (const query of queries) {
        const searchStart = Date.now();
        
        const response = await client.sendRequest('tools/call', {
          name: 'search_documents',
          arguments: {
            query,
            topK: "5",
            useSemanticSearch: "true"
          }
        });
        
        const searchEnd = Date.now();
        console.log(`🔍 Search "${query}": ${searchEnd - searchStart}ms`);
        
        if (response.error) throw new Error(response.error.message);
        
        const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
        console.log(`   - Found ${result.results?.length || 0} results`);
        
        if (result.results && result.results.length > 0) {
          const scores = result.results.map((r: any) => r.score);
          console.log(`   - Score range: ${Math.min(...scores).toFixed(3)} - ${Math.max(...scores).toFixed(3)}`);
          
          // Check if PDF content is in results
          const pdfResults = result.results.filter((r: any) => r.metadata?.fileType === 'pdf');
          console.log(`   - PDF results: ${pdfResults.length}`);
        }
      }
    });

    // Test hybrid search
    await test('Hybrid Search Performance', async () => {
      const hybridStart = Date.now();
      
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'test document sample',
          topK: "5",
          useSemanticSearch: "true",
          useHybridSearch: "true",
          semanticWeight: "0.7"
        }
      });
      
      const hybridEnd = Date.now();
      console.log(`🔍 Hybrid search time: ${hybridEnd - hybridStart}ms`);
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      console.log(`📊 Hybrid search results: ${result.results?.length || 0}`);
      
      if (result.results && result.results.length > 0) {
        const fileTypes = result.results.reduce((acc: any, r: any) => {
          const type = r.metadata?.fileType || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        console.log('📊 Results by file type:', fileTypes);
      }
    });

    // Get final server status
    await test('Final Server Status', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'get_server_status',
        arguments: {}
      });
      
      if (response.error) throw new Error(response.error.message);
      
      const result = JSON.parse(response.result?.content?.[0]?.text || '{}');
      console.log('📊 Final server status:');
      console.log(`   - Files: ${result.stats?.totalFiles || 0}`);
      console.log(`   - Chunks: ${result.stats?.totalChunks || 0}`);
      console.log(`   - Vector documents: ${result.stats?.vectorDocuments || 0}`);
      console.log(`   - Supported formats: ${result.supportedFormats?.join(', ') || 'none'}`);
    });

  } catch (error) {
    console.error('💥 Test suite failed:', error);
  } finally {
    await client.disconnect();
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log('\n📈 UNPDF Performance Test Results:');
    console.log(`✅ Tests passed: ${testsPassed}`);
    console.log(`❌ Tests failed: ${testsFailed}`);
    console.log(`📊 Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
    console.log(`⏱️  Total test time: ${totalTime}ms`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All UNPDF performance tests passed! The new PDF parser is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the UNPDF implementation.');
    }
  }
}

runUnpdfPerformanceTests().catch(console.error);