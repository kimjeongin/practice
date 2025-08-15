#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPTestClient {
  constructor() {
    this.serverProcess = null;
    this.requestId = 1;
    this.responses = new Map();
  }

  async startServer() {
    console.log('🚀 Starting RAG MCP Server...');
    
    // Set environment variables for local testing
    process.env.EMBEDDING_SERVICE = 'transformers';
    process.env.EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
    process.env.DATABASE_PATH = './test-data/test-rag.db';
    process.env.DATA_DIR = './test-data';
    process.env.CHUNK_SIZE = '512';
    process.env.SIMILARITY_THRESHOLD = '0.1'; // Set very low threshold for testing
    process.env.LOG_LEVEL = 'info';
    
    // Create test data directory
    if (!existsSync('./test-data')) {
      mkdirSync('./test-data', { recursive: true });
    }
    
    // Create some test documents
    this.createTestDocuments();
    
    this.serverProcess = spawn('node', ['dist/app/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env
    });

    this.serverProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id && this.responses.has(response.id)) {
            this.responses.get(response.id).resolve(response);
            this.responses.delete(response.id);
          }
        } catch (e) {
          // Non-JSON output, ignore
        }
      }
    });

    this.serverProcess.on('error', (error) => {
      console.error('❌ Server process error:', error);
    });

    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Server started');
  }

  createTestDocuments() {
    console.log('📝 Creating test documents...');
    
    const testDocs = [
      {
        name: 'machine-learning.md',
        content: `# Machine Learning Basics

Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed. 

## Types of Machine Learning

1. **Supervised Learning**: Learning with labeled data
2. **Unsupervised Learning**: Finding patterns in unlabeled data  
3. **Reinforcement Learning**: Learning through trial and error

## Common Algorithms

- Linear Regression
- Decision Trees
- Random Forest
- Neural Networks
- Support Vector Machines

Machine learning has applications in many fields including computer vision, natural language processing, and recommendation systems.`
      },
      {
        name: 'neural-networks.txt',
        content: `Neural Networks Overview

Neural networks are computing systems inspired by biological neural networks. They consist of nodes (neurons) connected by edges (synapses).

Key Components:
- Input Layer: Receives data
- Hidden Layers: Process information
- Output Layer: Produces results
- Weights and Biases: Parameters that are learned

Training Process:
1. Forward propagation
2. Loss calculation  
3. Backpropagation
4. Weight updates

Deep learning uses neural networks with many hidden layers to learn complex patterns in data.

Applications include image recognition, speech processing, and language translation.`
      },
      {
        name: 'data-science.json',
        content: JSON.stringify({
          "title": "Data Science Process",
          "steps": [
            {
              "name": "Data Collection",
              "description": "Gathering relevant data from various sources"
            },
            {
              "name": "Data Cleaning", 
              "description": "Removing errors and inconsistencies"
            },
            {
              "name": "Exploratory Data Analysis",
              "description": "Understanding data patterns and relationships"
            },
            {
              "name": "Feature Engineering",
              "description": "Creating and selecting relevant features"
            },
            {
              "name": "Model Building",
              "description": "Developing predictive models"
            },
            {
              "name": "Model Evaluation",
              "description": "Assessing model performance"
            }
          ],
          "tools": ["Python", "R", "SQL", "Pandas", "Scikit-learn", "TensorFlow"],
          "domains": ["Business Intelligence", "Healthcare", "Finance", "Marketing"]
        }, null, 2)
      }
    ];

    for (const doc of testDocs) {
      const filePath = join('./test-data', doc.name);
      writeFileSync(filePath, doc.content, 'utf-8');
    }
    
    console.log('✅ Test documents created');
  }

  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.responses.set(id, { resolve, reject });
      
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.responses.has(id)) {
          this.responses.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 30000);
    });
  }

  async testServerStatus() {
    console.log('\n🔍 Testing server status...');
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'get_server_status',
        arguments: {}
      });
      
      if (response.result) {
        console.log('✅ Server status retrieved successfully');
        const status = JSON.parse(response.result.content[0].text);
        console.log(`   📊 Database: ${status.database ? 'Connected' : 'Disconnected'}`);
        console.log(`   📁 Files indexed: ${status.documentsCount || 0}`);
        console.log(`   🧩 Chunks: ${status.chunksCount || 0}`);
        return true;
      } else {
        console.log('❌ Failed to get server status:', response.error);
        return false;
      }
    } catch (error) {
      console.log('❌ Server status test failed:', error.message);
      return false;
    }
  }

  async testModelListing() {
    console.log('\n🤖 Testing model listing...');
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'list_available_models',
        arguments: {}
      });
      
      if (response.result) {
        console.log('✅ Models listed successfully');
        const models = JSON.parse(response.result.content[0].text);
        console.log(`   📋 Available models: ${models.models?.length || 0}`);
        if (models.currentModel) {
          console.log(`   🎯 Current model: ${models.currentModel.name} (${models.currentModel.service})`);
          console.log(`   📏 Dimensions: ${models.currentModel.dimensions}`);
        }
        return true;
      } else {
        console.log('❌ Failed to list models:', response.error);
        return false;
      }
    } catch (error) {
      console.log('❌ Model listing test failed:', error.message);
      return false;
    }
  }

  async testFileProcessing() {
    console.log('\n📁 Testing file processing...');
    try {
      // Wait for file processing to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const response = await this.sendRequest('tools/call', {
        name: 'list_files',
        arguments: {}
      });
      
      if (response.result) {
        console.log('✅ Files processed successfully');
        const files = JSON.parse(response.result.content[0].text);
        console.log(`   📂 Total files: ${files.files?.length || 0}`);
        
        if (files.files && files.files.length > 0) {
          files.files.forEach(file => {
            console.log(`   📄 ${file.name} (${file.fileType}, ${file.chunksCount || 0} chunks)`);
          });
        }
        return files.files?.length > 0;
      } else {
        console.log('❌ Failed to list files:', response.error);
        return false;
      }
    } catch (error) {
      console.log('❌ File processing test failed:', error.message);
      return false;
    }
  }

  async testSemanticSearch() {
    console.log('\n🔍 Testing semantic search...');
    try {
      const queries = [
        'What is machine learning?',
        'How do neural networks work?',
        'Data science process steps'
      ];

      let successCount = 0;
      
      for (const query of queries) {
        console.log(`   🔎 Testing query: "${query}"`);
        
        const response = await this.sendRequest('tools/call', {
          name: 'search_documents',
          arguments: {
            query,
            topK: 3,
            useSemanticSearch: true,
            useHybridSearch: false
          }
        });
        
        if (response.result) {
          const results = JSON.parse(response.result.content[0].text);
          console.log(`   ✅ Found ${results.results?.length || 0} results`);
          
          if (results.results && results.results.length > 0) {
            results.results.forEach((result, idx) => {
              console.log(`      ${idx + 1}. ${result.metadata.fileName} (score: ${result.score.toFixed(4)})`);
            });
            successCount++;
          }
        } else {
          console.log(`   ❌ Search failed:`, response.error);
        }
      }
      
      return successCount === queries.length;
    } catch (error) {
      console.log('❌ Semantic search test failed:', error.message);
      return false;
    }
  }

  async testHybridSearch() {
    console.log('\n🔍 Testing hybrid search...');
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query: 'neural networks and deep learning',
          topK: 5,
          useSemanticSearch: true,
          useHybridSearch: true,
          semanticWeight: 0.7
        }
      });
      
      if (response.result) {
        const results = JSON.parse(response.result.content[0].text);
        console.log(`✅ Hybrid search completed`);
        console.log(`   📊 Results: ${results.results?.length || 0}`);
        console.log(`   🔧 Search type: ${results.searchType}`);
        
        if (results.results && results.results.length > 0) {
          results.results.forEach((result, idx) => {
            console.log(`   ${idx + 1}. ${result.metadata.fileName}`);
            console.log(`      Hybrid: ${result.hybridScore?.toFixed(4) || 'N/A'}, Semantic: ${result.semanticScore?.toFixed(4) || 'N/A'}, Keyword: ${result.keywordScore?.toFixed(4) || 'N/A'}`);
          });
        }
        return true;
      } else {
        console.log('❌ Hybrid search failed:', response.error);
        return false;
      }
    } catch (error) {
      console.log('❌ Hybrid search test failed:', error.message);
      return false;
    }
  }

  async testRAGPrompt() {
    console.log('\n💬 Testing RAG prompt...');
    try {
      const response = await this.sendRequest('prompts/get', {
        name: 'rag_search',
        arguments: {
          query: 'Explain the difference between supervised and unsupervised learning',
          context_length: '2'
        }
      });
      
      if (response.result) {
        console.log('✅ RAG prompt generated successfully');
        const prompt = response.result;
        if (prompt.messages && prompt.messages.length > 0) {
          console.log(`   📝 Generated prompt with ${prompt.messages.length} message(s)`);
          console.log(`   📏 Context length: ${prompt.messages[0].content.text.length} characters`);
        }
        return true;
      } else {
        console.log('❌ RAG prompt failed:', response.error);
        return false;
      }
    } catch (error) {
      console.log('❌ RAG prompt test failed:', error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 Starting comprehensive RAG MCP server tests...\n');
    
    const tests = [
      { name: 'Server Status', fn: () => this.testServerStatus() },
      { name: 'Model Listing', fn: () => this.testModelListing() },
      { name: 'File Processing', fn: () => this.testFileProcessing() },
      { name: 'Semantic Search', fn: () => this.testSemanticSearch() },
      { name: 'Hybrid Search', fn: () => this.testHybridSearch() },
      { name: 'RAG Prompt', fn: () => this.testRAGPrompt() }
    ];

    const results = [];
    
    for (const test of tests) {
      try {
        const success = await test.fn();
        results.push({ name: test.name, success });
      } catch (error) {
        console.log(`❌ ${test.name} test crashed:`, error.message);
        results.push({ name: test.name, success: false, error: error.message });
      }
    }

    // Print summary
    console.log('\n📋 Test Results Summary:');
    console.log('================================');
    
    const passedTests = results.filter(r => r.success);
    const failedTests = results.filter(r => !r.success);
    
    passedTests.forEach(test => {
      console.log(`✅ ${test.name}: PASSED`);
    });
    
    failedTests.forEach(test => {
      console.log(`❌ ${test.name}: FAILED${test.error ? ` (${test.error})` : ''}`);
    });
    
    console.log(`\n📊 Overall: ${passedTests.length}/${results.length} tests passed`);
    
    if (failedTests.length === 0) {
      console.log('🎉 All tests passed! RAG functionality is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please check the implementation.');
    }
    
    return failedTests.length === 0;
  }

  async shutdown() {
    console.log('\n🔄 Shutting down test client...');
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    console.log('✅ Test client shutdown completed');
  }
}

// Run tests if this file is executed directly
async function main() {
  const client = new MCPTestClient();
  
  try {
    await client.startServer();
    const success = await client.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    await client.shutdown();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MCPTestClient };