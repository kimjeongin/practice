#!/usr/bin/env tsx

/**
 * Basic MCP Client Example
 * 
 * This example demonstrates how to connect to the RAG MCP Server
 * and perform basic operations like uploading files and searching documents.
 */

// import { spawn } from 'child_process'; // Not used in this example
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SearchResult {
  content: string;
  similarity: number;
  metadata: {
    filePath: string;
    fileName: string;
    chunkIndex: number;
  };
}

class BasicRAGClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    // Create transport to communicate with RAG server
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['../../dist/app/index.js'],
      cwd: __dirname
    });

    this.client = new Client({
      name: 'basic-rag-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
  }

  async connect(): Promise<void> {
    console.log('🔗 Connecting to RAG MCP Server...');
    
    try {
      await this.client.connect(this.transport);
      console.log('✅ Connected successfully!');
      
      // List available tools
      const tools = await this.client.listTools();
      console.log(`📋 Available tools: ${tools.tools.map(t => t.name).join(', ')}`);
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      throw error;
    }
  }

  async uploadFile(content: string, fileName: string): Promise<void> {
    console.log(`📄 Upload file feature not yet implemented in simplified server`);
    console.log(`📄 Would upload: ${fileName} (${content.length} characters)`);
    console.log('✅ Mock upload completed - will be implemented in next iteration');
  }

  async searchDocuments(query: string, useSemanticSearch = true): Promise<SearchResult[]> {
    console.log(`🔍 Searching for: "${query}"`);
    
    try {
      const result = await this.client.callTool({
        name: 'search_documents',
        arguments: {
          query,
          topK: 5
        }
      });
      
      const responseData = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : { results: [] };
      const results = responseData.results || [];
      console.log(`📊 Found ${results.length} results`);
      
      // Convert score to similarity for interface compatibility
      return results.map((result: any) => ({
        content: result.content,
        similarity: result.score || 0,
        metadata: result.metadata
      }));
    } catch (error) {
      console.error('❌ Search failed:', error);
      throw error;
    }
  }

  async listFiles(): Promise<any[]> {
    console.log('📁 List files feature not yet implemented in simplified server');
    console.log('✅ Mock file list - will be implemented in next iteration');
    return [];
  }

  async getServerStatus(): Promise<any> {
    console.log('🏥 Checking server status...');
    
    try {
      const result = await this.client.callTool({
        name: 'get_server_status',
        arguments: {}
      });
      
      const status = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
      console.log('📊 Server status:', status);
      
      return status;
    } catch (error) {
      console.error('❌ Failed to get server status:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting...');
    await this.client.close();
    console.log('✅ Disconnected successfully');
  }
}

// Example usage
async function runBasicExample() {
  const client = new BasicRAGClient();
  
  try {
    // Connect to server
    await client.connect();
    
    // Check server status
    await client.getServerStatus();
    
    // Upload a sample document
    const sampleContent = `
# Machine Learning Basics

Machine learning is a subset of artificial intelligence (AI) that focuses on the development of algorithms and statistical models that enable computer systems to improve their performance on a specific task through experience.

## Key Concepts

1. **Supervised Learning**: Learning with labeled training data
2. **Unsupervised Learning**: Finding patterns in data without labels
3. **Neural Networks**: Computing systems inspired by biological neural networks
4. **Deep Learning**: Neural networks with multiple hidden layers

## Applications

Machine learning is used in various fields including:
- Natural Language Processing
- Computer Vision  
- Recommendation Systems
- Autonomous Vehicles
- Medical Diagnosis
    `;
    
    await client.uploadFile(sampleContent, 'machine-learning-basics.md');
    
    // List all files
    await client.listFiles();
    
    // Search for documents
    console.log('\n🔍 Performing searches...\n');
    
    const searchQueries = [
      'neural networks',
      'supervised learning', 
      'artificial intelligence',
      'computer vision'
    ];
    
    for (const query of searchQueries) {
      const results = await client.searchDocuments(query);
      
      if (results.length > 0) {
        console.log(`\n📝 Top result for "${query}":`);
        console.log(`   Content: ${results[0].content.substring(0, 100)}...`);
        console.log(`   Score: ${results[0].similarity.toFixed(4)}`);
        console.log(`   File: ${results[0].metadata.fileName}`);
        console.log(`   ChunkIndex: ${results[0].metadata.chunkIndex}`);
      }
    }
    
    console.log('\n🎉 Basic example completed successfully!');
    
  } catch (error) {
    console.error('💥 Example failed:', error);
  } finally {
    await client.disconnect();
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBasicExample().catch(console.error);
}

export { BasicRAGClient };