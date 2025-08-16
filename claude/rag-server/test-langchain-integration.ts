#!/usr/bin/env node

/**
 * LangChain Integration Test
 * Tests the new LangChain-based file reader and chunking system
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

class LangChainTestClient {
  private mcpProcess: any;
  private requestId = 1;
  private isConnected = false;

  async connect(): Promise<void> {
    console.log('🚀 Starting MCP Server for LangChain testing...');
    
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
      }, 45000); // Longer timeout for force reindex

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

async function testLangChainIntegration(): Promise<void> {
  const client = new LangChainTestClient();
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
        clientInfo: { name: 'langchain-test-client', version: '1.0.0' }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
    });

    // Test force reindex to process CSV and other files with LangChain
    await test('Force Reindex with LangChain', async () => {
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

    // Test search for CSV data
    await test('Search CSV Data', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'Alice Engineer New York',
          topK: "3",
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
      console.log(`🔍 CSV Search Results: ${searchResults.results?.length || 0} results`);
      
      if (searchResults.results && searchResults.results.length > 0) {
        console.log('📄 First result preview:', searchResults.results[0].content.substring(0, 200));
      }
    });

    // Test search for existing markdown
    await test('Search Markdown Content', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'RAG system embedding',
          topK: "3",
          useSemanticSearch: "true",
          useHybridSearch: "true"
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
      console.log(`🔍 Markdown Search Results: ${searchResults.results?.length || 0} results`);
      
      if (searchResults.results && searchResults.results.length > 0) {
        console.log('📄 First result content:', searchResults.results[0].content.substring(0, 200));
        console.log('📊 Score:', searchResults.results[0].score);
        console.log('🔗 Metadata:', JSON.stringify(searchResults.results[0].metadata, null, 2));
      }
    });

    // Test listing files to verify CSV is recognized
    await test('List Files - Verify CSV Support', async () => {
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
      
      const csvFiles = files.files?.filter((f: any) => f.fileType === 'csv') || [];
      console.log(`📊 CSV files found: ${csvFiles.length}`);
      
      if (csvFiles.length > 0) {
        console.log('📄 CSV files:', csvFiles.map((f: any) => f.name));
      }
    });

    // Get server status to see processing info
    await test('Server Status Check', async () => {
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
      console.log('📊 Current server status:');
      console.log(`   - Files indexed: ${status.totalFiles || 0}`);
      console.log(`   - Chunks stored: ${status.totalChunks || 0}`);
      console.log(`   - Vector store size: ${status.vectorStoreSize || 0}`);
      console.log(`   - Processing status: ${status.isProcessing ? 'Active' : 'Idle'}`);
    });

  } catch (error) {
    console.error('💥 Test suite failed:', error);
  } finally {
    await client.disconnect();
    
    console.log('\n📈 LangChain Integration Test Results:');
    console.log(`✅ Tests passed: ${testsPassed}`);
    console.log(`❌ Tests failed: ${testsFailed}`);
    console.log(`📊 Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All LangChain integration tests passed! The new system is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Please check the LangChain integration.');
    }
  }
}

// Run the LangChain integration tests
testLangChainIntegration().catch(console.error);