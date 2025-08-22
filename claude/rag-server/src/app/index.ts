/**
 * RAG MCP Server Entry Point
 * Simplified architecture - directly starts the MCP Server with minimal setup
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Shared imports
import { logger } from '@/shared/logger/index.js';

/**
 * Simplified MCP Server that provides basic functionality
 * This replaces the complex domain architecture with a minimal working server
 */
class SimpleMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'rag-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  private setupTools(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_documents',
            description: 'Search through documents using semantic search',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query'
                },
                topK: {
                  type: 'number',
                  description: 'Number of results to return',
                  default: 5
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_server_status',
            description: 'Get server status and health information',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'search_documents':
            return await this.handleSearchDocuments(args);
          case 'get_server_status':
            return await this.handleGetServerStatus();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool execution failed for ${name}:`, error instanceof Error ? error : new Error(String(error)));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              })
            }
          ],
          isError: true
        };
      }
    });
  }

  private async handleSearchDocuments(args: any) {
    const query = args?.query || '';
    const topK = args?.topK || 5;
    
    logger.info('Search documents called', { query, topK });
    
    // Simple mock implementation - replace with actual RAG search later
    const mockResults = Array.from({ length: Math.min(topK, 3) }, (_, i) => ({
      content: `Mock search result ${i + 1} for query: "${query}". This would be actual document content in a real implementation.`,
      score: 0.9 - (i * 0.1),
      metadata: {
        fileName: `document_${i + 1}.txt`,
        filePath: `/documents/document_${i + 1}.txt`,
        chunkIndex: 0
      }
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query,
            totalResults: mockResults.length,
            results: mockResults,
            message: 'Mock search results - RAG functionality will be integrated step by step'
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetServerStatus() {
    logger.info('Get server status called');
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'running',
            uptime: process.uptime(),
            version: '1.0.0',
            transport: process.env.MCP_TRANSPORT || 'stdio',
            pid: process.pid,
            message: 'MCP Server is running with simplified architecture'
          }, null, 2)
        }
      ]
    };
  }

  async start(): Promise<void> {
    logger.info('🔗 Starting MCP Server with stdio transport...');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('🎯 MCP Server started and ready for connections');
  }

  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down MCP Server...');
    // Add any cleanup logic here if needed
    logger.info('✅ MCP Server shutdown completed');
  }
}

async function main(): Promise<void> {
  let mcpServer: SimpleMCPServer | null = null;

  try {
    logger.info('🎯 Starting RAG MCP Server', {
      version: '1.0.0',
      transport: process.env.MCP_TRANSPORT || 'stdio',
      nodeVersion: process.version,
      pid: process.pid
    });

    // Create and start MCP server
    mcpServer = new SimpleMCPServer();

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      if (mcpServer) {
        try {
          await mcpServer.shutdown();
        } catch (error) {
          logger.error('Error during MCP server shutdown', error instanceof Error ? error : new Error(String(error)));
        }
      }

      process.exit(0);
    };

    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Start the MCP server
    await mcpServer.start();

    logger.info('🚀 RAG MCP Server started successfully', {
      transport: process.env.MCP_TRANSPORT || 'stdio',
      message: 'Server is ready for MCP client connections'
    });

  } catch (error) {
    logger.fatal('Failed to start RAG MCP Server', error instanceof Error ? error : new Error(String(error)));
    
    if (mcpServer) {
      try {
        await mcpServer.shutdown();
      } catch (shutdownError) {
        logger.error('Error during emergency shutdown', shutdownError instanceof Error ? shutdownError : new Error(String(shutdownError)));
      }
    }
    
    process.exit(1);
  }
}

// Export for testing purposes
export { main };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}