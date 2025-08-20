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

  // Note: File upload happens through file system watcher
  // Files should be placed in the documents/ directory for automatic indexing
  async waitForFileIndexing(fileName: string, timeout = 10000): Promise<void> {
    console.log(`⏳ Waiting for file indexing: ${fileName}`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const files = await this.listFiles();
      if (files.files?.some(f => f.name === fileName)) {
        console.log(`✅ File ${fileName} has been indexed`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`File ${fileName} not indexed within ${timeout}ms`);
  }

  async listFiles(options: {
    fileType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any> {
    console.log('📋 Listing all files...');
    
    const result = await this.client.callTool({
      name: 'list_files',
      arguments: {
        limit: 100,
        offset: 0,
        ...options
      }
    });
    
    return this.parseResult(result);
  }

  // === Advanced Search ===

  async searchDocuments(options: SearchOptions): Promise<any> {
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
        fileTypes,
        metadataFilters: {}
      }
    });
    
    const response = this.parseResult(result);
    return response.results || [];
  }

  // Note: Response generation would typically be handled by integrating with an LLM
  // This server focuses on retrieval - generation would be done client-side
  async performRAGSearch(query: string, contextLength = 3): Promise<string> {
    console.log(`🤖 Performing RAG search for: "${query}"`);
    
    const results = await this.searchDocuments({ 
      query, 
      topK: contextLength,
      useSemanticSearch: true 
    });
    
    const contextText = results.map(result => 
      `**${result.metadata.fileName}** (Score: ${result.score.toFixed(4)}):\n${result.content}`
    ).join('\n\n---\n\n');
    
    return `Based on the search results for "${query}":\n\n${contextText}`;
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

  async switchEmbeddingModel(modelName: string): Promise<any> {
    console.log(`🔄 Switching to embedding model: ${modelName}...`);
    
    const result = await this.client.callTool({
      name: 'switch_embedding_model',
      arguments: { modelName }
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

  async forceReindex(clearCache = false): Promise<any> {
    console.log(`🔄 Force reindexing all documents${clearCache ? ' (clearing cache)' : ''}...`);
    
    const result = await this.client.callTool({
      name: 'force_reindex',
      arguments: { clearCache }
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
    console.log(`📊 Server Status: Running (${status.totalDocuments || 0} documents)\n`);
    
    // === Model Management Demo ===
    console.log('🤖 === MODEL MANAGEMENT ===');
    
    const currentModel = await client.getCurrentModelInfo();
    console.log(`📍 Current model: ${currentModel.model} (${currentModel.dimensions}D)`);
    
    const availableModels = await client.listAvailableModels();
    console.log(`📋 Available models: ${Object.keys(availableModels.availableModels || {}).length}`);
    if (Object.keys(availableModels.availableModels || {}).length > 0) {
      console.log(`   Models: ${Object.keys(availableModels.availableModels || {}).join(', ')}`);
    }
    
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
    
    // Note: For this demo, we assume documents are already in the documents/ folder
    // In practice, you would place files in the documents directory for auto-indexing
    console.log('📂 Note: This example assumes documents are already indexed from the documents/ folder');
    console.log('   To add new files, place them in the rag-server/documents/ directory');
    
    // List all files
    const filesResponse = await client.listFiles();
    console.log(`📁 Total files in system: ${filesResponse.files?.length || 0}`);
    
    // === Advanced Search Demo ===
    console.log('\n🔍 === ADVANCED SEARCH DEMO ===');
    
    const searchQueries = [
      {
        query: 'artificial intelligence machine learning',
        type: 'Semantic Search',
        options: { useSemanticSearch: true, topK: 3 }
      },
      {
        query: 'neural networks deep learning',
        type: 'Hybrid Search',
        options: { useHybridSearch: true, semanticWeight: 0.7, topK: 3 }
      },
      {
        query: 'data processing workflow',
        type: 'Filtered Search (MD only)',
        options: { useSemanticSearch: true, fileTypes: ['md'], topK: 2 }
      }
    ];
    
    for (const { query, type, options } of searchQueries) {
      console.log(`\n🎯 ${type}: "${query}"`);
      const results = await client.searchDocuments({ query, ...options });
      
      if (results.length > 0) {
        results.slice(0, 2).forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.metadata.fileName}`);
          console.log(`     📊 Score: ${result.score.toFixed(4)}`);
          console.log(`     📝 "${result.content.substring(0, 80)}..."`);
        });
      } else {
        console.log('  No results found');
      }
    }
    
    // === RAG Search Demo ===
    console.log('\n🤖 === RAG SEARCH DEMO ===');
    
    const ragQueries = [
      'What are neural networks?',
      'How does machine learning work?',
      'What is data science?'
    ];
    
    for (const query of ragQueries) {
      try {
        console.log(`\n❓ Question: "${query}"`);
        const context = await client.performRAGSearch(query, 2);
        console.log(`📚 Context Retrieved:`);
        console.log(context.substring(0, 300) + '...');
      } catch (error) {
        console.log(`⚠️  RAG search failed: ${error.message}`);
      }
    }
    
    // === Model Management Demo ===
    console.log('\n🤖 === MODEL MANAGEMENT DEMO ===');
    
    try {
      const availableModels = await client.listAvailableModels();
      console.log('Available embedding models:', Object.keys(availableModels.availableModels || {}));
      
      // Try switching to a different model (if available)
      const models = Object.keys(availableModels.availableModels || {});
      if (models.length > 1) {
        const newModel = models.find(m => m !== currentModel.model);
        if (newModel) {
          console.log(`🔄 Trying to switch to: ${newModel}`);
          await client.switchEmbeddingModel(newModel);
          console.log('✅ Model switched successfully');
        }
      }
    } catch (error) {
      console.log(`⚠️  Model management demo failed: ${error.message}`);
    }
    
    // === Performance Analysis ===
    console.log('\n📊 === PERFORMANCE ANALYSIS ===');
    
    const finalStatus = await client.getServerStatus();
    console.log(`📈 Final server status:`);
    console.log(`   Documents: ${finalStatus.totalDocuments || 0}`);
    console.log(`   Vector dimensions: ${finalStatus.vectorDimensions || 'N/A'}`);
    console.log(`   Current model: ${finalStatus.currentModel || 'N/A'}`);
    console.log(`   Memory usage: ${finalStatus.memoryUsage || 'N/A'}`);
    
    console.log('\n🎉 Advanced example completed successfully!');
    console.log('💡 This demo showcased:');
    console.log('   ✅ Document management via file system');
    console.log('   ✅ Multiple search strategies (semantic, hybrid)');
    console.log('   ✅ Model management and switching');
    console.log('   ✅ Performance monitoring');
    console.log('   ✅ Error handling and resilience');
    console.log('   ✅ RAG search with context retrieval');
    
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