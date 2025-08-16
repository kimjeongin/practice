#!/usr/bin/env node

/**
 * PDF Integration Test
 * Tests the new pdfjs-dist-based PDF reader and adjusted search threshold
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

class PDFTestClient {
  private mcpProcess: any;
  private requestId = 1;
  private isConnected = false;

  async connect(): Promise<void> {
    console.log('🚀 Starting MCP Server for PDF testing...');
    
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
        console.log('📝 Server:', output.trim());
        if (output.includes('MCP Server started') || output.includes('listening')) {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve(void 0);
        }
      });

      this.mcpProcess.stderr.on('data', (data: Buffer) => {
        console.log('⚠️ Server error:', data.toString().trim());
      });

      this.mcpProcess.on('exit', (code: number) => {
        console.log(`❌ Server exited with code ${code}`);
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
      }, 60000); // Longer timeout for PDF processing

      const requestData = JSON.stringify(request) + '\n';
      console.log(`📤 Sending: ${method}`, params ? JSON.stringify(params, null, 2) : '');
      
      this.mcpProcess.stdin.write(requestData);

      const onData = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              this.mcpProcess.stdout.removeListener('data', onData);
              
              if (response.error) {
                console.log(`❌ Error for ${method}:`, response.error.message);
              } else {
                console.log(`✅ Success for ${method}`);
              }
              
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

async function testPDFIntegration(): Promise<void> {
  const client = new PDFTestClient();
  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name: string, testFn: () => Promise<void>) => {
    try {
      console.log(`\n🧪 Testing: ${name}`);
      await testFn();
      console.log(`✅ PASSED: ${name}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ FAILED: ${name}`, error);
      testsFailed++;
    }
  };

  try {
    await client.connect();

    // Initialize MCP
    await test('MCP Initialize', async () => {
      const response = await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: 'pdf-test-client', version: '1.0.0' }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
    });

    // Force reindex to process PDF file
    await test('Force Reindex with PDF Support', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'force_reindex',
        arguments: { clearCache: "true" }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No reindex result received');
      }

      const reindexResult = JSON.parse(result);
      console.log('🔄 Reindex result:', reindexResult);
    });

    // List files to verify PDF is recognized
    await test('List Files - Verify PDF Support', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_files',
        arguments: { limit: "20" }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No files list received');
      }

      const files = JSON.parse(result);
      console.log(`📁 Total files: ${files.files?.length || 0}`);
      
      const pdfFiles = files.files?.filter((f: any) => f.fileType === 'pdf') || [];
      console.log(`📄 PDF files found: ${pdfFiles.length}`);
      
      if (pdfFiles.length > 0) {
        console.log('📄 PDF files:', pdfFiles.map((f: any) => ({
          name: f.name,
          size: f.size,
          chunks: f.chunksCount || 0
        })));
      }

      if (pdfFiles.length === 0) {
        throw new Error('PDF file was not processed');
      }
    });

    // Test search with lowered threshold - try searching for content that might be in PDF
    await test('Search PDF Content - Semantic', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'document content text',
          topK: "5",
          useSemanticSearch: "true"
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No search results received');
      }

      const searchResults = JSON.parse(result);
      console.log(`🔍 Semantic Search Results: ${searchResults.results?.length || 0} results`);
      
      if (searchResults.results && searchResults.results.length > 0) {
        console.log('📄 First result preview:', searchResults.results[0].content.substring(0, 200));
        console.log('📊 Score:', searchResults.results[0].score);
        console.log('📋 File type:', searchResults.results[0].metadata?.fileType);
      }
    });

    // Test hybrid search with adjusted threshold
    await test('Search All Content - Hybrid with Lower Threshold', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'test sample',
          topK: "10",
          useSemanticSearch: "true",
          useHybridSearch: "true",
          semanticWeight: "0.6"
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No search results received');
      }

      const searchResults = JSON.parse(result);
      console.log(`🔍 Hybrid Search Results: ${searchResults.results?.length || 0} results`);
      
      if (searchResults.results && searchResults.results.length > 0) {
        console.log('📊 Results by file type:');
        const fileTypes = searchResults.results.reduce((acc: any, result: any) => {
          const type = result.metadata?.fileType || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        Object.entries(fileTypes).forEach(([type, count]) => {
          console.log(`   - ${type}: ${count} results`);
        });

        // Show score range
        const scores = searchResults.results.map((r: any) => r.score);
        console.log(`📊 Score range: ${Math.min(...scores).toFixed(3)} - ${Math.max(...scores).toFixed(3)}`);
      }
    });

    // Test keyword search (should work regardless of threshold)
    await test('Search - Keyword Only', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'test',
          topK: "5",
          useSemanticSearch: "false"
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No search results received');
      }

      const searchResults = JSON.parse(result);
      console.log(`🔍 Keyword Search Results: ${searchResults.results?.length || 0} results`);
      
      if (searchResults.results && searchResults.results.length > 0) {
        const pdfResults = searchResults.results.filter((r: any) => r.metadata?.fileType === 'pdf');
        console.log(`📄 PDF results in keyword search: ${pdfResults.length}`);
      }
    });

    // Get server status to check processing results
    await test('Server Status After PDF Processing', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'get_server_status',
        arguments: {}
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No status received');
      }

      const status = JSON.parse(result);
      console.log('📊 Server status after PDF processing:');
      console.log(`   - Total files: ${status.stats?.totalFiles || 0}`);
      console.log(`   - Total chunks: ${status.stats?.totalChunks || 0}`);
      console.log(`   - Vector documents: ${status.stats?.vectorDocuments || 0}`);
      console.log(`   - Supported formats: ${status.supportedFormats?.join(', ') || 'none'}`);
      console.log(`   - Similarity threshold: ${status.config?.similarityThreshold || 'not set'}`);
    });

  } catch (error) {
    console.error('💥 Test suite failed:', error);
  } finally {
    await client.disconnect();
    
    console.log('\n📈 PDF Integration Test Results:');
    console.log(`✅ Tests passed: ${testsPassed}`);
    console.log(`❌ Tests failed: ${testsFailed}`);
    console.log(`📊 Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All PDF integration tests passed! PDF support is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Please check the PDF integration.');
    }
  }
}

// Run the PDF integration tests
testPDFIntegration().catch(console.error);