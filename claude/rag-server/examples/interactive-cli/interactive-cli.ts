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
    console.log('  upload         - Upload a document');
    console.log('  list           - List all files');
    console.log('  search         - Search documents');
    console.log('  hybrid         - Hybrid search (semantic + keyword)');
    console.log('  models         - List available models');
    console.log('  model-info     - Get current model info');
    console.log('  download       - Download a model');
    console.log('  generate       - Generate RAG response');
    console.log('  clear          - Clear screen');
    console.log('  exit           - Exit the CLI');
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
      
      case 'upload':
        await this.uploadDocument();
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
      
      case 'download':
        await this.downloadModel();
        break;
      
      case 'generate':
        await this.generateResponse();
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
    console.log(`   Health: ${status.status}`);
    console.log(`   Documents: ${status.totalDocuments}`);
    console.log(`   Memory: ${status.memoryUsage?.used || 'N/A'}`);
    console.log(`   Uptime: ${status.uptime || 'N/A'}`);
    console.log(`   Error Rate: ${status.errorRate || 0}/min`);
  }

  private async uploadDocument(): Promise<void> {
    const fileName = await this.question('📝 Enter filename: ');
    const content = await this.question('📄 Enter content (or type "sample" for example): ');
    
    let documentContent = content;
    if (content.toLowerCase() === 'sample') {
      documentContent = `# Sample Document

This is a sample document about artificial intelligence and machine learning.

## Key Topics
- Neural Networks
- Deep Learning
- Natural Language Processing
- Computer Vision

## Applications
AI is used in various fields including healthcare, finance, and autonomous systems.`;
    }
    
    console.log('📤 Uploading document...');
    
    const result = await this.client.callTool({
      name: 'upload_file',
      arguments: {
        content: documentContent,
        fileName
      }
    });
    
    console.log('✅ Document uploaded successfully!');
    console.log('📊 Result:', this.parseResult(result));
  }

  private async listFiles(): Promise<void> {
    console.log('📋 Listing all files...');
    
    const result = await this.client.callTool({
      name: 'list_files',
      arguments: {}
    });
    
    const files = this.parseResult(result);
    
    if (files.length === 0) {
      console.log('📭 No files found. Upload some documents first!');
    } else {
      console.log(`📁 Found ${files.length} files:`);
      files.forEach((file: any, index: number) => {
        console.log(`   ${index + 1}. ${file.fileName} (${file.fileType})`);
        console.log(`      📅 Created: ${file.createdAt}`);
        console.log(`      📊 Chunks: ${file.chunkCount || 'N/A'}`);
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
    
    const results = this.parseResult(result);
    
    if (results.length === 0) {
      console.log('❌ No results found');
    } else {
      console.log(`📊 Found ${results.length} results:`);
      results.forEach((result: any, index: number) => {
        console.log(`\n   ${index + 1}. ${result.metadata.fileName}`);
        console.log(`      📊 Similarity: ${(result.similarity * 100).toFixed(1)}%`);
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
    
    const results = this.parseResult(result);
    
    if (results.length === 0) {
      console.log('❌ No results found');
    } else {
      console.log(`📊 Found ${results.length} hybrid results:`);
      results.forEach((result: any, index: number) => {
        console.log(`\n   ${index + 1}. ${result.metadata.fileName}`);
        console.log(`      📊 Similarity: ${(result.similarity * 100).toFixed(1)}%`);
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
    
    if (models.availableModels) {
      console.log('\n📦 Available for download:');
      Object.entries(models.availableModels).forEach(([name, info]: [string, any]) => {
        console.log(`   • ${name} (${info.dimensions}D) - ${info.description}`);
      });
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

  private async downloadModel(): Promise<void> {
    const modelName = await this.question('📥 Enter model name (or press Enter for default): ');
    
    console.log(`⬇️ Downloading model${modelName ? `: ${modelName}` : ' (default)'}...`);
    
    const result = await this.client.callTool({
      name: 'download_model',
      arguments: modelName ? { modelName } : {}
    });
    
    const downloadResult = this.parseResult(result);
    console.log('✅ Download result:', downloadResult);
  }

  private async generateResponse(): Promise<void> {
    const query = await this.question('❓ Enter your question: ');
    const context = await this.question('📄 Additional context (optional): ');
    
    console.log('🤖 Generating RAG response...');
    
    try {
      const result = await this.client.callTool({
        name: 'generate_response',
        arguments: {
          query,
          context: context || undefined
        }
      });
      
      const response = this.parseResult(result);
      console.log('🤖 Response:');
      console.log('─'.repeat(50));
      console.log(response);
      console.log('─'.repeat(50));
    } catch (error) {
      console.log('⚠️  RAG response generation not available');
      console.log('💡 Try uploading some documents first and ensure the server supports this feature');
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