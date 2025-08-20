#!/usr/bin/env tsx

/**
 * Interactive CLI Client Example
 * 
 * This example provides an interactive command-line interface for
 * manually testing and exploring all RAG server capabilities.
 */

import { createInterface } from 'readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface Command {
  name: string;
  description: string;
  handler: () => Promise<void>;
}

class InteractiveRAGCLI {
  private client: Client;
  private transport: StdioClientTransport;
  private rl: any;
  private isConnected = false;

  constructor() {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['../../dist/app/index.js'],
      cwd: __dirname
    });

    this.client = new Client({
      name: 'interactive-rag-cli',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🔍 RAG> '
    });
  }

  async start(): Promise<void> {
    console.log('🚀 Interactive RAG MCP Client');
    console.log('═'.repeat(50));
    
    try {
      await this.connect();
      this.showHelp();
      this.startCommandLoop();
    } catch (error) {
      console.error('❌ Failed to start:', error);
      process.exit(1);
    }
  }

  private async connect(): Promise<void> {
    console.log('🔗 Connecting to RAG server...');
    
    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log('✅ Connected successfully!\n');
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  private showHelp(): void {
    console.log('📋 Available Commands:');
    console.log('  help           - Show this help message');
    console.log('  status         - Get server status');
    console.log('  list           - List all files');
    console.log('  search         - Search documents');
    console.log('  hybrid         - Hybrid search (semantic + keyword)');
    console.log('  models         - List available models');
    console.log('  model-info     - Get current model info');
    console.log('  switch-model   - Switch embedding model');
    console.log('  reindex        - Force reindex all documents');
    console.log('  rag            - Perform RAG search with context');
    console.log('  clear          - Clear screen');
    console.log('  exit           - Exit the CLI');
    console.log('');
    console.log('⚠️  Note: File upload is done via filesystem - place files in documents/ folder');
    console.log('');
  }

  private startCommandLoop(): void {
    this.rl.prompt();

    this.rl.on('line', async (input: string) => {
      const command = input.trim().toLowerCase();
      
      if (!command) {
        this.rl.prompt();
        return;
      }

      try {
        await this.handleCommand(command);
      } catch (error) {
        console.error('❌ Command failed:', error.message);
      }
      
      console.log('');
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      this.disconnect();
      process.exit(0);
    });
  }

  private async handleCommand(command: string): Promise<void> {
    switch (command) {
      case 'help':
        this.showHelp();
        break;
      
      case 'status':
        await this.getStatus();
        break;
      
      case 'switch-model':
        await this.switchModel();
        break;
      
      case 'reindex':
        await this.forceReindex();
        break;
      
      case 'list':
        await this.listFiles();
        break;
      
      case 'search':
        await this.searchDocuments();
        break;
      
      case 'hybrid':
        await this.hybridSearch();
        break;
      
      case 'models':
        await this.listModels();
        break;
      
      case 'model-info':
        await this.getModelInfo();
        break;
      
      case 'rag':
        await this.performRAGSearch();
        break;
      
      case 'clear':
        console.clear();
        this.showHelp();
        break;
      
      case 'exit':
        this.rl.close();
        break;
      
      default:
        console.log(`❓ Unknown command: ${command}`);
        console.log('Type "help" for available commands');
    }
  }

  private async getStatus(): Promise<void> {
    console.log('🏥 Getting server status...');
    
    const result = await this.client.callTool({
      name: 'get_server_status',
      arguments: {}
    });
    
    const status = this.parseResult(result);
    console.log('📊 Server Status:');
    console.log(`   Health: Running`);
    console.log(`   Documents: ${status.totalDocuments || 0}`);
    console.log(`   Vector Dimensions: ${status.vectorDimensions || 'N/A'}`);
    console.log(`   Current Model: ${status.currentModel || 'N/A'}`);
    console.log(`   Memory Usage: ${status.memoryUsage || 'N/A'}`);
  }

  private async switchModel(): Promise<void> {
    // First show available models
    await this.listModels();
    
    const modelName = await this.question('\n🔄 Enter model name to switch to: ');
    
    if (!modelName.trim()) {
      console.log('⚠️  Model name required');
      return;
    }
    
    console.log(`🔄 Switching to model: ${modelName}`);
    
    try {
      const result = await this.client.callTool({
        name: 'switch_embedding_model',
        arguments: { modelName: modelName.trim() }
      });
      
      console.log('✅ Model switched successfully!');
      console.log('📊 Result:', this.parseResult(result));
    } catch (error) {
      console.error('❌ Model switch failed:', error.message);
    }
  }
  
  private async forceReindex(): Promise<void> {
    const clearCache = await this.question('🗑️ Clear cache too? (y/N): ');
    const shouldClearCache = clearCache.toLowerCase().startsWith('y');
    
    console.log(`🔄 Force reindexing all documents${shouldClearCache ? ' (clearing cache)' : ''}...`);
    
    try {
      const result = await this.client.callTool({
        name: 'force_reindex',
        arguments: { clearCache: shouldClearCache }
      });
      
      console.log('✅ Reindexing completed!');
      console.log('📊 Result:', this.parseResult(result));
    } catch (error) {
      console.error('❌ Reindexing failed:', error.message);
    }
  }

  private async listFiles(): Promise<void> {
    console.log('📋 Listing all files...');
    
    const result = await this.client.callTool({
      name: 'list_files',
      arguments: {}
    });
    
    const response = this.parseResult(result);
    const files = response.files || [];
    
    if (files.length === 0) {
      console.log('📭 No files found. Place documents in the documents/ folder!');
    } else {
      console.log(`📁 Found ${files.length} files:`);
      files.forEach((file: any, index: number) => {
        console.log(`   ${index + 1}. ${file.name} (${file.fileType})`);
        console.log(`      📅 Updated: ${new Date(file.updatedAt).toLocaleString()}`);
        console.log(`      📊 Size: ${file.size} bytes`);
      });
    }
  }

  private async searchDocuments(): Promise<void> {
    const query = await this.question('🔍 Enter search query: ');
    const topK = await this.question('📊 Number of results (default 5): ') || '5';
    
    console.log(`🔍 Searching for: "${query}"`);
    
    const result = await this.client.callTool({
      name: 'search_documents',
      arguments: {
        query,
        useSemanticSearch: true,
        topK: parseInt(topK)
      }
    });
    
    const response = this.parseResult(result);
    const results = response.results || [];
    
    if (results.length === 0) {
      console.log('❌ No results found');
    } else {
      console.log(`📊 Found ${results.length} results:`);
      results.forEach((result: any, index: number) => {
        console.log(`\n   ${index + 1}. ${result.metadata.fileName}`);
        console.log(`      📊 Score: ${result.score.toFixed(4)}`);
        console.log(`      📝 Content: "${result.content.substring(0, 100)}..."`);
      });
    }
  }

  private async hybridSearch(): Promise<void> {
    const query = await this.question('🔍 Enter search query: ');
    const semanticWeight = await this.question('⚖️ Semantic weight (0.0-1.0, default 0.7): ') || '0.7';
    const topK = await this.question('📊 Number of results (default 5): ') || '5';
    
    console.log(`🔍 Hybrid search for: "${query}" (semantic weight: ${semanticWeight})`);
    
    const result = await this.client.callTool({
      name: 'search_documents',
      arguments: {
        query,
        useHybridSearch: true,
        semanticWeight: parseFloat(semanticWeight),
        topK: parseInt(topK)
      }
    });
    
    const response = this.parseResult(result);
    const results = response.results || [];
    
    if (results.length === 0) {
      console.log('❌ No results found');
    } else {
      console.log(`📊 Found ${results.length} hybrid results:`);
      results.forEach((result: any, index: number) => {
        console.log(`\n   ${index + 1}. ${result.metadata.fileName}`);
        console.log(`      📊 Score: ${result.score.toFixed(4)}`);
        console.log(`      📝 Content: "${result.content.substring(0, 100)}..."`);
      });
    }
  }

  private async listModels(): Promise<void> {
    console.log('🤖 Listing available models...');
    
    const result = await this.client.callTool({
      name: 'list_available_models',
      arguments: {}
    });
    
    const models = this.parseResult(result);
    
    console.log('📋 Available Models:');
    if (models.currentModel) {
      console.log(`\n🎯 Current: ${models.currentModel.model}`);
      console.log(`   Service: ${models.currentModel.service}`);
      console.log(`   Dimensions: ${models.currentModel.dimensions}`);
      console.log(`   Description: ${models.currentModel.description || 'N/A'}`);
    }
    
    if (models.availableModels && Object.keys(models.availableModels).length > 0) {
      console.log('\n📦 Available models:');
      Object.entries(models.availableModels).forEach(([name, info]: [string, any]) => {
        console.log(`   • ${name} (${info.dimensions}D) - ${info.description}`);
      });
    } else {
      console.log('\n⚠️  No additional models available for switching');
    }
  }

  private async getModelInfo(): Promise<void> {
    console.log('🔍 Getting current model info...');
    
    const result = await this.client.callTool({
      name: 'get_current_model_info',
      arguments: {}
    });
    
    const modelInfo = this.parseResult(result);
    
    console.log('🤖 Current Model:');
    console.log(`   Model: ${modelInfo.model}`);
    console.log(`   Service: ${modelInfo.service}`);
    console.log(`   Dimensions: ${modelInfo.dimensions}`);
    console.log(`   Description: ${modelInfo.description || 'N/A'}`);
  }

  private async performRAGSearch(): Promise<void> {
    const query = await this.question('❓ Enter your question: ');
    const contextLength = await this.question('📚 Number of context documents (default 3): ') || '3';
    
    console.log(`🔍 Performing RAG search for: "${query}"`);
    
    try {
      // First get the search results
      const result = await this.client.callTool({
        name: 'search_documents',
        arguments: {
          query,
          topK: parseInt(contextLength),
          useSemanticSearch: true
        }
      });
      
      const response = this.parseResult(result);
      const results = response.results || [];
      
      if (results.length === 0) {
        console.log('❌ No relevant documents found');
        return;
      }
      
      console.log(`\n📚 Context Retrieved (${results.length} documents):`);
      console.log('═'.repeat(60));
      
      results.forEach((result: any, index: number) => {
        console.log(`\n📄 ${index + 1}. ${result.metadata.fileName} (Score: ${result.score.toFixed(4)})`);
        console.log(`📝 ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}`);
      });
      
      console.log('\n═'.repeat(60));
      console.log('💡 Use this context with your favorite LLM to generate a response!');
      
    } catch (error) {
      console.error('❌ RAG search failed:', error.message);
    }
  }


  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  private parseResult(result: any): any {
    try {
      return result.content[0]?.text ? JSON.parse(result.content[0].text) : result.content;
    } catch (error) {
      return result.content[0]?.text || result.content;
    }
  }

  private async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }
}

// Run the interactive CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new InteractiveRAGCLI();
  cli.start().catch(console.error);
}

export { InteractiveRAGCLI };