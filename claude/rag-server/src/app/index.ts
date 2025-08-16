#!/usr/bin/env node
import { RAGApplication } from '@/app/application'
import { loadConfig, validateConfig } from '@/infrastructure/config/config'

async function main() {
  try {
    console.log('🔧 Loading configuration...');
    const config = loadConfig();
    
    console.log('✅ Validating configuration...');
    validateConfig(config);
    
    console.log('🚀 Starting RAG MCP Server (stdio mode)...');
    const app = new RAGApplication(config);
    
    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n📴 Received shutdown signal...');
      await app.shutdown();
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

    // Start the application
    await app.start();
  } catch (error) {
    console.error('❌ Failed to start RAG MCP Server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}