import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { SearchHandler } from '../handlers/search.js';
import { DocumentHandler } from '../handlers/document.js';
import { SystemHandler } from '../handlers/system.js';
import { ModelHandler } from '../handlers/model.js';
import { IFileRepository } from '@/domains/rag/repositories/document.js';
import { ServerConfig } from '@/shared/config/config-factory.js';
import { SyncHandler } from '../handlers/sync.js';
import { logger } from '@/shared/logger/index.js';

export class MCPServer {
  private server: Server;

  constructor(
    private searchHandler: SearchHandler,
    private documentHandler: DocumentHandler,
    private systemHandler: SystemHandler,
    private modelHandler: ModelHandler,
    private syncHandler: SyncHandler,
    private fileRepository: IFileRepository,
    private config: ServerConfig
  ) {
    this.server = new Server(
      {
        name: 'rag-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupTools();
    this.setupResources();
    this.setupPrompts();
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...this.searchHandler.getTools(),
          ...this.documentHandler.getTools(),
          ...this.modelHandler.getTools(),
          ...this.syncHandler.getTools(),
          ...this.systemHandler.getTools(),
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'search_documents':
            result = await this.searchHandler.handleSearchDocuments(this.validateAndCastArgs(args, 'search_documents'));
            break;
          case 'list_files':
            result = await this.documentHandler.handleListFiles(this.validateAndCastArgs(args, 'list_files'));
            break;
          case 'get_file_metadata':
            result = await this.documentHandler.handleGetFileMetadata(this.validateAndCastArgs(args, 'get_file_metadata'));
            break;
          case 'update_file_metadata':
            result = await this.documentHandler.handleUpdateFileMetadata(this.validateAndCastArgs(args, 'update_file_metadata'));
            break;
          case 'search_files_by_metadata':
            result = await this.documentHandler.handleSearchFilesByMetadata(this.validateAndCastArgs(args, 'search_files_by_metadata'));
            break;
          case 'force_reindex':
            result = await this.documentHandler.handleForceReindex(this.validateAndCastArgs(args, 'force_reindex'));
            break;
          case 'get_server_status':
            result = await this.systemHandler.handleGetServerStatus();
            break;
          case 'list_available_models':
            result = await this.modelHandler.handleListAvailableModels();
            break;
          case 'get_current_model_info':
            result = await this.modelHandler.handleGetCurrentModelInfo();
            break;
          case 'switch_embedding_model':
            result = await this.modelHandler.handleSwitchEmbeddingModel(this.validateAndCastArgs(args, 'switch_embedding_model'));
            break;
          case 'download_model':
            result = await this.modelHandler.handleDownloadModel(this.validateAndCastArgs(args, 'download_model'));
            break;
          case 'get_model_cache_info':
            result = await this.modelHandler.handleGetModelCacheInfo();
            break;
          case 'get_download_progress':
            result = await this.modelHandler.handleGetDownloadProgress();
            break;
          // Vector DB sync tools
          case 'vector_db_sync_check':
            result = await this.syncHandler.handleSyncCheck(args);
            break;
          case 'vector_db_cleanup_orphaned':
            result = await this.syncHandler.handleCleanupOrphaned(args);
            break;
          case 'vector_db_force_sync':
            result = await this.syncHandler.handleForceSync(args);
            break;
          case 'vector_db_integrity_report':
            result = await this.syncHandler.handleIntegrityReport(args);
            break;
          default:
            // Graceful handling of unknown tools instead of crashing the service
            logger.warn('Unknown tool requested', { toolName: name, availableTools: this.getAvailableToolNames() });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'UnknownTool',
                    message: `Tool '${name}' is not available`,
                    availableTools: this.getAvailableToolNames(),
                    suggestion: 'Use the list_tools endpoint to see all available tools'
                  }, null, 2)
                }
              ],
              isError: true
            };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupResources(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const files = await this.fileRepository.getAllFiles();
      
      return {
        resources: files.map(file => ({
          uri: `file://${file.path}`,
          name: file.name,
          description: `${file.fileType.toUpperCase()} file (${file.size} bytes)`,
          mimeType: this.getMimeType(file.fileType),
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (!uri.startsWith('file://')) {
        throw new Error('Only file:// URIs are supported');
      }
      
      const filePath = uri.replace('file://', '');
      const file = await this.fileRepository.getFileByPath(filePath);
      
      if (!file) {
        throw new Error('File not found');
      }
      
      // Get file content from chunks (simplified)
      const content = `File: ${file.name}\nPath: ${file.path}\nType: ${file.fileType}`;
      
      return {
        contents: [
          {
            uri,
            mimeType: this.getMimeType(file.fileType),
            text: content,
          },
        ],
      };
    });
  }

  private setupPrompts(): void {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'rag_search',
            description: 'Perform a RAG search and provide contextual information',
            arguments: [
              { name: 'query', description: 'Search query', required: true },
              { name: 'context_length', description: 'Number of context results', required: false },
            ],
          },
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'rag_search': {
          const query = typeof args?.['query'] === 'string' ? args['query'] : undefined;
          const contextLength = Number(args?.['context_length']) || 3;

          if (!query) {
            throw new Error('Query is required for rag_search prompt');
          }

          const results = await this.searchHandler.handleSearchDocuments({
            query,
            topK: contextLength,
          });
          
          const contextText = results.results.map(result => 
            `**${result.metadata.fileName}** (Score: ${result.score.toFixed(4)}):\n${result.content}`
          ).join('\n\n---\n\n');

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Based on the following context, please answer: "${query}"\n\n**Context:**\n${contextText}`,
                },
              },
            ],
          };
        }
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  private getMimeType(fileType: string): string {
    const mimeTypes: Record<string, string> = {
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      xml: 'application/xml',
      html: 'text/html',
      csv: 'text/csv',
      pdf: 'application/pdf',
    };
    return mimeTypes[fileType.toLowerCase()] || 'text/plain';
  }

  async start(): Promise<void> {
    const { TransportFactory } = await import('../transport/transport-factory.js');
    
    // Validate transport configuration
    TransportFactory.validateConfig(this.config.mcp);
    
    console.log(`🔗 Starting MCP server with ${this.config.mcp.type} transport...`);
    
    const { transport, context } = await TransportFactory.createTransport(this.config.mcp);
    
    // Connect MCP server to transport
    await this.server.connect(transport);
    
    // Start HTTP server if needed
    if (context && this.config.mcp.type !== 'stdio') {
      await TransportFactory.startHTTPServer(context, this.config.mcp);
    }
    
    console.log(`🎯 MCP Server started and ready for ${this.config.mcp.type} connections`, {
      transport: this.config.mcp.type,
      port: this.config.mcp.port,
      host: this.config.mcp.host,
    });
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down MCP Server...');
    // Add any cleanup logic here if needed
    console.log('✅ MCP Server shutdown completed');
  }

  private isValidArgs(args: Record<string, unknown> | undefined): args is Record<string, unknown> {
    return args !== undefined && typeof args === 'object' && args !== null;
  }

  private validateAndCastArgs(args: Record<string, unknown> | undefined, operation: string): any {
    if (!this.isValidArgs(args)) {
      throw new Error(`Invalid arguments for ${operation}: args must be an object`);
    }
    return args;
  }

  private getAvailableToolNames(): string[] {
    return [
      'search_documents',
      'list_files', 
      'get_file_metadata',
      'update_file_metadata',
      'search_files_by_metadata',
      'force_reindex',
      'get_server_status',
      'list_available_models',
      'get_current_model_info', 
      'switch_embedding_model',
      'download_model',
      'get_model_cache_info',
      'get_download_progress',
      'vector_db_sync_check',
      'vector_db_cleanup_orphaned',
      'vector_db_force_sync',
      'vector_db_integrity_report'
    ];
  }
}