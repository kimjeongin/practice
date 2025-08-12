#!/usr/bin/env node

import { RAGServer } from './server.js';
import { loadConfig, validateConfig } from './utils/config.js';

async function main() {
  try {
    console.log('🔧 Loading configuration...');
    const config = loadConfig();
    
    console.log('✅ Validating configuration...');
    validateConfig(config);
    
    console.log('🚀 Starting RAG MCP Server...');
    const server = new RAGServer(config);
    
    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n📴 Received shutdown signal...');
      await server.shutdown();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      shutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown();
    });
    
    // Start the server
    await server.start();
  } catch (error) {
    console.error('❌ Failed to start RAG MCP Server:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}