#!/usr/bin/env node
import { MCPRAGServer } from './mcp/server.js';
import { ServerConfig } from './types/index.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration for MCP server
const defaultConfig: ServerConfig = {
  port: 3000, // Not used for stdio MCP server
  host: 'localhost', // Not used for stdio MCP server
  databasePath: join(__dirname, '../data/database.db'),
  dataDir: join(__dirname, '../data'),
  chunkSize: 1024,
  chunkOverlap: 200,
  similarityTopK: 5,
  embeddingModel: 'text-embedding-ada-002',
  embeddingDevice: 'cpu',
  logLevel: 'info',
};

async function main() {
  try {
    const server = new MCPRAGServer(defaultConfig);
    
    // Handle process termination gracefully
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down MCP server...');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down MCP server...');
      await server.shutdown();
      process.exit(0);
    });

    // Start the MCP server
    await server.start();
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}