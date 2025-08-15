#!/usr/bin/env node

/**
 * Updated MCP Test Client
 * Tests all available RAG MCP tools based on current implementation
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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

class MCPTestClient {
  private mcpProcess: any;
  private requestId = 1;
  private isConnected = false;

  async connect(): Promise<void> {
    console.log('🚀 Starting MCP Server...');
    
    // Start the MCP server process
    this.mcpProcess = spawn('node', ['dist/app/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 15000);

      this.mcpProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('📝 Server output:', output.trim());
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
        reject(new Error(`Server exited with code ${code}`));
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
      
      console.log(`📤 Sending request: ${method}`, params ? JSON.stringify(params, null, 2) : '');
      
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
                console.log(`❌ Error response for ${method}:`, response.error);
              } else {
                console.log(`✅ Success response for ${method}`);
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

  async setupTestData(): Promise<void> {
    console.log('\n📁 Setting up test data...');
    
    // Create test directory if it doesn't exist
    const testDir = join(process.cwd(), 'test-data');
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create test documents with different content
    const testDocs = [
      {
        filename: 'ai-basics.txt',
        content: 'Artificial intelligence (AI) is a branch of computer science focused on creating systems that can perform tasks requiring human intelligence. Machine learning is a subset of AI that uses algorithms to learn from data patterns.'
      },
      {
        filename: 'neural-networks.md',
        content: '# Neural Networks\n\nNeural networks are computing systems inspired by biological neural networks. They consist of interconnected nodes (neurons) that process information through weighted connections.\n\n## Deep Learning\nDeep learning uses neural networks with multiple layers to analyze data patterns and make predictions.'
      },
      {
        filename: 'ml-concepts.json',
        content: JSON.stringify({
          title: 'Machine Learning Concepts',
          categories: ['supervised learning', 'unsupervised learning', 'reinforcement learning'],
          algorithms: ['linear regression', 'decision trees', 'neural networks', 'support vector machines'],
          description: 'Core concepts in machine learning including different learning paradigms and popular algorithms'
        }, null, 2)
      },
      {
        filename: 'data-science.txt',
        content: 'Data science combines statistical analysis, machine learning, and domain expertise to extract insights from data. It involves data collection, cleaning, analysis, and interpretation to solve business problems.'
      }
    ];

    for (const doc of testDocs) {
      const filepath = join(testDir, doc.filename);
      writeFileSync(filepath, doc.content);
      console.log(`📄 Created test file: ${doc.filename}`);
    }

    // Wait a bit for file watcher to pick up the files
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function runTests(): Promise<void> {
  const client = new MCPTestClient();
  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name: string, testFn: () => Promise<void>) => {
    try {
      console.log(`\n🧪 Running test: ${name}`);
      await testFn();
      console.log(`✅ Test passed: ${name}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ Test failed: ${name}`, error);
      testsFailed++;
    }
  };

  try {
    // Setup
    await client.setupTestData();
    await client.connect();

    // Test 1: Initialize MCP connection
    await test('MCP Initialize', async () => {
      const response = await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: true
          }
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      });

      if (response.error) {
        throw new Error(`Initialize failed: ${response.error.message}`);
      }
    });

    // Test 2: List available tools
    await test('List Tools', async () => {
      const response = await client.sendRequest('tools/list');
      
      if (response.error) {
        throw new Error(`List tools failed: ${response.error.message}`);
      }

      const tools = response.result?.tools || [];
      const expectedTools = [
        'search_documents', 
        'list_files', 
        'get_server_status',
        'list_available_models',
        'get_current_model_info',
        'switch_embedding_model',
        'force_reindex'
      ];
      
      for (const tool of expectedTools) {
        if (!tools.find((t: any) => t.name === tool)) {
          throw new Error(`Missing expected tool: ${tool}`);
        }
      }

      console.log(`📋 Found ${tools.length} tools:`, tools.map((t: any) => t.name));
    });

    // Test 3: Get server status
    await test('Server Status', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'get_server_status',
        arguments: {}
      });

      if (response.error) {
        throw new Error(`Get server status failed: ${response.error.message}`);
      }

      const status = response.result?.content?.[0]?.text;
      if (!status) {
        throw new Error('No status content received');
      }

      const statusData = JSON.parse(status);
      console.log('📊 Server status:', statusData);
      
      if (!statusData.status?.ready) {
        throw new Error('Server not ready');
      }
    });

    // Test 4: List files
    await test('List Files', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_files',
        arguments: {
          limit: 10
        }
      });

      if (response.error) {
        throw new Error(`List files failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No files content received');
      }

      const files = JSON.parse(result);
      console.log(`📁 Found ${files.files?.length || 0} files`);
      
      if (files.files?.length === 0) {
        console.log('⚠️ No files found - file processing may still be in progress');
      }
    });

    // Test 5: Get current model info
    await test('Get Current Model Info', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'get_current_model_info',
        arguments: {}
      });

      if (response.error) {
        throw new Error(`Get current model info failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No model info received');
      }

      const modelInfo = JSON.parse(result);
      console.log('🤖 Current model info:', modelInfo);
      
      if (!modelInfo.currentModel?.model) {
        throw new Error('Invalid model info structure');
      }
    });

    // Test 6: List available models
    await test('List Available Models', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_available_models',
        arguments: {}
      });

      if (response.error) {
        throw new Error(`List available models failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No models list received');
      }

      const modelsData = JSON.parse(result);
      console.log('📋 Available models:', Object.keys(modelsData.models || {}));
    });

    // Test 7: Search documents (semantic search)
    await test('Search Documents - Semantic', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'machine learning algorithms',
          topK: 3,
          useSemanticSearch: true
        }
      });

      if (response.error) {
        throw new Error(`Search documents failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No search results received');
      }

      const searchResults = JSON.parse(result);
      console.log(`🔍 Found ${searchResults.results?.length || 0} semantic search results`);
      
      if (searchResults.results?.length > 0) {
        console.log('📄 Sample result:', searchResults.results[0]);
      }
    });

    // Test 8: Search documents (keyword search)
    await test('Search Documents - Keyword', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'neural networks',
          topK: 3,
          useSemanticSearch: false
        }
      });

      if (response.error) {
        throw new Error(`Keyword search failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No search results received');
      }

      const searchResults = JSON.parse(result);
      console.log(`🔍 Found ${searchResults.results?.length || 0} keyword search results`);
    });

    // Test 9: Search documents (hybrid search)
    await test('Search Documents - Hybrid', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'artificial intelligence deep learning',
          topK: 3,
          useSemanticSearch: true,
          useHybridSearch: true,
          semanticWeight: 0.7
        }
      });

      if (response.error) {
        throw new Error(`Hybrid search failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No search results received');
      }

      const searchResults = JSON.parse(result);
      console.log(`🔍 Found ${searchResults.results?.length || 0} hybrid search results`);
    });

    // Test 10: Force reindex
    await test('Force Reindex', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'force_reindex',
        arguments: {
          clearCache: false
        }
      });

      if (response.error) {
        throw new Error(`Force reindex failed: ${response.error.message}`);
      }

      const result = response.result?.content?.[0]?.text;
      if (!result) {
        throw new Error('No reindex result received');
      }

      const reindexResult = JSON.parse(result);
      console.log('🔄 Reindex result:', reindexResult);
      
      if (!reindexResult.success) {
        throw new Error('Force reindex did not complete successfully');
      }
    });

  } catch (error) {
    console.error('💥 Test suite failed:', error);
  } finally {
    await client.disconnect();
    
    console.log('\n📈 Test Results:');
    console.log(`✅ Tests passed: ${testsPassed}`);
    console.log(`❌ Tests failed: ${testsFailed}`);
    console.log(`📊 Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! The RAG MCP server is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the implementation or test data setup.');
    }
  }
}

// Run the tests
runTests().catch(console.error);