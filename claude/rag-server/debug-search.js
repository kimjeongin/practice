#!/usr/bin/env node

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

class DebugSearchClient {
  constructor() {
    this.serverProcess = null;
    this.requestId = 1;
    this.responses = new Map();
  }

  async startServer() {
    console.log('🚀 Starting RAG MCP Server for debugging...');
    
    // Set environment variables for debugging
    process.env.EMBEDDING_SERVICE = 'transformers';
    process.env.EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
    process.env.DATABASE_PATH = './debug-data/debug-rag.db';
    process.env.DATA_DIR = './debug-data';
    process.env.CHUNK_SIZE = '512';
    process.env.SIMILARITY_THRESHOLD = '0.0'; // Set very low threshold for debugging
    process.env.LOG_LEVEL = 'info';
    
    // Create debug data directory
    if (!existsSync('./debug-data')) {
      mkdirSync('./debug-data', { recursive: true });
    }
    
    // Create a simple test document
    const testDoc = `# Machine Learning

Machine learning is a powerful tool for making predictions and decisions from data. It involves training algorithms on historical data to recognize patterns and make accurate predictions on new data.

## Key Concepts
- Training data
- Model training
- Predictions
- Accuracy metrics`;

    writeFileSync('./debug-data/test.md', testDoc, 'utf-8');
    console.log('✅ Debug document created');
    
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

    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Server started');
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
      
      setTimeout(() => {
        if (this.responses.has(id)) {
          this.responses.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 30000);
    });
  }

  async debugSearch() {
    console.log('\n🔍 Debug Search Testing...');
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check files first
    console.log('\n📁 Checking indexed files...');
    const filesResponse = await this.sendRequest('tools/call', {
      name: 'list_files',
      arguments: {}
    });
    
    if (filesResponse.result) {
      const files = JSON.parse(filesResponse.result.content[0].text);
      console.log(`   📂 Total files: ${files.files?.length || 0}`);
      files.files?.forEach(file => {
        console.log(`   📄 ${file.name} (${file.fileType}, ${file.chunksCount || 0} chunks)`);
      });
    }

    // Test different search queries with different thresholds
    const testQueries = [
      'machine learning',
      'predictions',
      'data',
      'training'
    ];

    for (const query of testQueries) {
      console.log(`\n🔎 Testing query: "${query}"`);
      
      // Test with no threshold filtering (by setting useSemanticSearch false)
      const keywordResponse = await this.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query,
          topK: 10,
          useSemanticSearch: false,
          useHybridSearch: false
        }
      });
      
      if (keywordResponse.result) {
        const keywordResults = JSON.parse(keywordResponse.result.content[0].text);
        console.log(`   🔤 Keyword search: ${keywordResults.results?.length || 0} results`);
        if (keywordResults.results && keywordResults.results.length > 0) {
          keywordResults.results.slice(0, 2).forEach((result, idx) => {
            console.log(`      ${idx + 1}. Score: ${result.score?.toFixed(4)} - "${result.content.substring(0, 100)}..."`);
          });
        }
      }
      
      // Test semantic search
      const semanticResponse = await this.sendRequest('tools/call', {
        name: 'search_documents',
        arguments: {
          query,
          topK: 10,
          useSemanticSearch: true,
          useHybridSearch: false
        }
      });
      
      if (semanticResponse.result) {
        const semanticResults = JSON.parse(semanticResponse.result.content[0].text);
        console.log(`   🧠 Semantic search: ${semanticResults.results?.length || 0} results`);
        if (semanticResults.results && semanticResults.results.length > 0) {
          semanticResults.results.slice(0, 2).forEach((result, idx) => {
            console.log(`      ${idx + 1}. Score: ${result.score?.toFixed(4)} - "${result.content.substring(0, 100)}..."`);
          });
        }
      }
    }
  }

  async shutdown() {
    console.log('\n🔄 Shutting down debug client...');
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }
}

async function main() {
  const client = new DebugSearchClient();
  
  try {
    await client.startServer();
    await client.debugSearch();
  } catch (error) {
    console.error('❌ Debug test failed:', error);
  } finally {
    await client.shutdown();
  }
}

main().catch(console.error);