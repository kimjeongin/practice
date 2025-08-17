#!/usr/bin/env tsx

/**
 * Advanced MCP Client Example
 * 
 * This example demonstrates all available MCP tools and advanced features
 * of the RAG server including model management, hybrid search, and monitoring.
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface SearchOptions {
  query: string;
  useSemanticSearch?: boolean;
  useHybridSearch?: boolean;
  semanticWeight?: number;
  topK?: number;
  fileTypes?: string[];
}

interface ModelInfo {
  model: string;
  service: string;
  dimensions: number;
  description?: string;
}

class AdvancedRAGClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['../../dist/app/index.js'],
      cwd: __dirname
    });

    this.client = new Client({
      name: 'advanced-rag-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
  }

  async connect(): Promise<void> {
    console.log('🚀 Advanced RAG Client - Connecting to server...');
    
    try {
      await this.client.connect(this.transport);
      console.log('✅ Connected successfully!');
      
      const tools = await this.client.listTools();
      console.log(`🛠️  Available tools (${tools.tools.length}):`, 
        tools.tools.map(t => t.name).join(', '));
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  // === Document Management ===

  async uploadFile(content: string, fileName: string): Promise<any> {
    console.log(`📤 Uploading: ${fileName}`);
    
    const result = await this.client.callTool({
      name: 'upload_file',
      arguments: { content, fileName }
    });
    
    return this.parseResult(result);
  }

  async listFiles(): Promise<any[]> {
    console.log('📋 Listing all files...');
    
    const result = await this.client.callTool({
      name: 'list_files',
      arguments: {}
    });
    
    return this.parseResult(result);
  }

  // === Advanced Search ===

  async searchDocuments(options: SearchOptions): Promise<any[]> {
    const { query, useSemanticSearch, useHybridSearch, semanticWeight, topK, fileTypes } = options;
    
    console.log(`🔍 Searching: "${query}"${useHybridSearch ? ' (hybrid)' : useSemanticSearch ? ' (semantic)' : ' (keyword)'}`);
    
    const result = await this.client.callTool({
      name: 'search_documents',
      arguments: {
        query,
        useSemanticSearch: useSemanticSearch ?? true,
        useHybridSearch: useHybridSearch ?? false,
        semanticWeight: semanticWeight ?? 0.7,
        topK: topK ?? 5,
        fileTypes
      }
    });
    
    return this.parseResult(result);
  }

  async generateResponse(query: string, context?: string): Promise<string> {
    console.log(`🤖 Generating response for: "${query}"`);
    
    const result = await this.client.callTool({
      name: 'generate_response',
      arguments: { query, context }
    });
    
    return this.parseResult(result);
  }

  // === Model Management ===

  async getCurrentModelInfo(): Promise<ModelInfo> {
    console.log('🔍 Getting current model info...');
    
    const result = await this.client.callTool({
      name: 'get_current_model_info',
      arguments: {}
    });
    
    return this.parseResult(result);
  }

  async listAvailableModels(): Promise<any> {
    console.log('📋 Listing available models...');
    
    const result = await this.client.callTool({
      name: 'list_available_models',
      arguments: {}
    });
    
    return this.parseResult(result);
  }

  async downloadModel(modelName?: string): Promise<any> {
    console.log(`⬇️ Downloading model${modelName ? `: ${modelName}` : ' (default)'}...`);
    
    const result = await this.client.callTool({
      name: 'download_model',
      arguments: modelName ? { modelName } : {}
    });
    
    return this.parseResult(result);
  }

  // === System Management ===

  async getServerStatus(): Promise<any> {
    const result = await this.client.callTool({
      name: 'get_server_status',
      arguments: {}
    });
    
    return this.parseResult(result);
  }

  // === Utility Methods ===

  private parseResult(result: any): any {
    try {
      return result.content[0]?.text ? JSON.parse(result.content[0].text) : result.content;
    } catch (error) {
      return result.content[0]?.text || result.content;
    }
  }

  async disconnect(): Promise<void> {
    console.log('👋 Disconnecting...');
    await this.client.close();
    console.log('✅ Disconnected successfully');
  }
}

// Comprehensive example demonstrating all features
async function runAdvancedExample() {
  const client = new AdvancedRAGClient();
  
  try {
    // === Connection & Setup ===
    await client.connect();
    
    // Check initial server status
    const status = await client.getServerStatus();
    console.log(`📊 Server Status: ${status.status} (${status.totalDocuments} documents)\n`);
    
    // === Model Management Demo ===
    console.log('🤖 === MODEL MANAGEMENT ===');
    
    const currentModel = await client.getCurrentModelInfo();
    console.log(`📍 Current model: ${currentModel.model} (${currentModel.dimensions}D)`);
    
    const availableModels = await client.listAvailableModels();
    console.log(`📋 Available models: ${Object.keys(availableModels.availableModels || {}).length}`);
    
    // === Document Upload Demo ===
    console.log('\n📚 === DOCUMENT MANAGEMENT ===');
    
    const documents = [
      {
        fileName: 'ai-fundamentals.md',
        content: `# Artificial Intelligence Fundamentals

AI is a broad field encompassing machine learning, deep learning, natural language processing, and computer vision.

## Key Technologies
- Neural Networks: The backbone of modern AI
- Transformers: Revolutionary architecture for NLP
- CNNs: Specialized for computer vision tasks
- RNNs: For sequential data processing

## Applications
- Autonomous vehicles use computer vision and decision making
- Virtual assistants leverage NLP and speech recognition
- Recommendation systems use collaborative filtering
- Medical diagnosis benefits from pattern recognition`
      },
      {
        fileName: 'machine-learning-algorithms.md',
        content: `# Machine Learning Algorithms Guide

## Supervised Learning
- Linear Regression: For continuous predictions
- Decision Trees: Interpretable classification
- Random Forest: Ensemble method combining trees
- Support Vector Machines: For classification and regression

## Unsupervised Learning  
- K-Means Clustering: Grouping similar data points
- Principal Component Analysis: Dimensionality reduction
- DBSCAN: Density-based clustering

## Deep Learning
- Feedforward Networks: Basic neural network architecture
- Convolutional Neural Networks: For image processing
- Recurrent Neural Networks: For sequential data
- Transformer Networks: For attention-based processing`
      },
      {
        fileName: 'data-science-workflow.md',
        content: `# Data Science Workflow

## Data Collection
- Web scraping for online data
- APIs for structured data access
- Databases for historical data
- Sensors for real-time data

## Data Processing
- Data cleaning and validation
- Feature engineering and selection
- Data transformation and normalization
- Handling missing values and outliers

## Analysis & Modeling
- Exploratory data analysis
- Statistical testing and validation
- Model selection and training
- Performance evaluation and optimization

## Deployment
- Model serving and monitoring
- A/B testing for validation
- Continuous integration and deployment
- Performance monitoring and maintenance`
      }
    ];
    
    // Upload all documents
    for (const doc of documents) {
      await client.uploadFile(doc.content, doc.fileName);
    }
    
    // List all files
    const files = await client.listFiles();
    console.log(`📁 Total files in system: ${files.length}`);
    
    // === Advanced Search Demo ===
    console.log('\n🔍 === ADVANCED SEARCH DEMO ===');
    
    const searchQueries = [
      {
        query: 'neural networks deep learning',
        type: 'Semantic Search',
        options: { useSemanticSearch: true, topK: 3 }
      },
      {
        query: 'data processing cleaning',
        type: 'Hybrid Search',
        options: { useHybridSearch: true, semanticWeight: 0.7, topK: 3 }
      },
      {
        query: 'machine learning algorithms',
        type: 'Filtered Search',
        options: { useSemanticSearch: true, fileTypes: ['text/markdown'], topK: 2 }
      }
    ];
    
    for (const { query, type, options } of searchQueries) {
      console.log(`\n🎯 ${type}: "${query}"`);
      const results = await client.searchDocuments({ query, ...options });
      
      if (results.length > 0) {
        results.slice(0, 2).forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.metadata.fileName}`);
          console.log(`     📊 Similarity: ${(result.similarity * 100).toFixed(1)}%`);
          console.log(`     📝 "${result.content.substring(0, 80)}..."`);
        });
      } else {
        console.log('  No results found');
      }
    }
    
    // === RAG Demo ===
    console.log('\n🤖 === RAG RESPONSE GENERATION ===');
    
    const ragQueries = [
      'What are the main types of machine learning?',
      'How do neural networks work in AI?',
      'What is the data science workflow?'
    ];
    
    for (const query of ragQueries) {
      try {
        console.log(`\n❓ Question: "${query}"`);
        const response = await client.generateResponse(query);
        console.log(`🤖 Response: ${response.substring(0, 200)}...`);
      } catch (error) {
        console.log(`⚠️  RAG response generation not available (${error.message})`);
      }
    }
    
    // === Performance Analysis ===
    console.log('\n📊 === PERFORMANCE ANALYSIS ===');
    
    const finalStatus = await client.getServerStatus();
    console.log(`📈 Final server status:`);
    console.log(`   Documents: ${finalStatus.totalDocuments}`);
    console.log(`   Memory usage: ${finalStatus.memoryUsage?.used || 'N/A'}`);
    console.log(`   Uptime: ${finalStatus.uptime || 'N/A'}`);
    console.log(`   Error rate: ${finalStatus.errorRate || 0}/min`);
    
    console.log('\n🎉 Advanced example completed successfully!');
    console.log('💡 This demo showcased:');
    console.log('   ✅ All 7 MCP tools');
    console.log('   ✅ Multiple search strategies');
    console.log('   ✅ Model management');
    console.log('   ✅ Performance monitoring');
    console.log('   ✅ Error handling');
    
  } catch (error) {
    console.error('💥 Advanced example failed:', error);
    console.error('Stack:', error.stack);
  } finally {
    await client.disconnect();
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAdvancedExample().catch(console.error);
}

export { AdvancedRAGClient };