import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { SearchHandler } from '@/mcp/handlers/search-handler.js';
import { DocumentHandler } from '@/mcp/handlers/document-handler.js';
import { SystemHandler } from '@/mcp/handlers/system-handler.js';
import { ModelHandler } from '@/mcp/handlers/model-handler.js';
import { IFileRepository } from '@/rag/repositories/document-repository.js';
import { ServerConfig } from '@/shared/types/index.js';

export class MCPServer {
  private server: Server;

  constructor(
    private searchHandler: SearchHandler,
    private documentHandler: DocumentHandler,
    private systemHandler: SystemHandler,
    private modelHandler: ModelHandler,
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
          {
            name: 'search_documents',
            description: 'Search through indexed documents using natural language queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query in natural language',
                },
                topK: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 5)',
                  default: 5,
                  minimum: 1,
                  maximum: 50,
                },
                fileTypes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by file types (e.g., ["txt", "md", "pdf"])',
                },
                metadataFilters: {
                  type: 'object',
                  description: 'Filter by custom metadata key-value pairs',
                  additionalProperties: { type: 'string' },
                },
                useSemanticSearch: {
                  type: 'boolean',
                  description: 'Use semantic search with embeddings (default: true)',
                  default: true,
                },
                useHybridSearch: {
                  type: 'boolean',
                  description: 'Combine semantic and keyword search (default: false)',
                  default: false,
                },
                semanticWeight: {
                  type: 'number',
                  description: 'Weight for semantic search vs keyword search (0-1, default: 0.7)',
                  default: 0.7,
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['query'],
            },
          },
          // Add other tool definitions here...
          {
            name: 'list_files',
            description: 'List all indexed files with their metadata',
            inputSchema: {
              type: 'object',
              properties: {
                fileType: { type: 'string', description: 'Filter by specific file type' },
                limit: { type: 'number', description: 'Maximum number of files to return (default: 100)', default: 100 },
                offset: { type: 'number', description: 'Number of files to skip (default: 0)', default: 0 },
              },
              required: [],
            },
          },
          {
            name: 'get_server_status',
            description: 'Get the current status and statistics of the RAG server',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          // Model management tools
          {
            name: 'list_available_models',
            description: 'List all available embedding models with their specifications',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'get_current_model_info',
            description: 'Get information about the currently selected embedding model',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'switch_embedding_model',
            description: 'Switch to a different embedding model',
            inputSchema: {
              type: 'object',
              properties: {
                modelName: {
                  type: 'string',
                  description: 'The name of the model to switch to',
                  enum: ['all-MiniLM-L6-v2', 'all-MiniLM-L12-v2', 'bge-small-en', 'bge-base-en'],
                },
              },
              required: ['modelName'],
            },
          },
          {
            name: 'force_reindex',
            description: 'Force complete reindexing of all files',
            inputSchema: {
              type: 'object',
              properties: {
                clearCache: {
                  type: 'boolean',
                  description: 'Whether to clear the vector cache before reindexing (default: false)',
                  default: false,
                },
              },
              required: [],
            },
          },
          // Add sync tools
          ...this.systemHandler.getSyncTools(),
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
          case 'force_reindex':
            result = await this.documentHandler.handleForceReindex(this.validateAndCastArgs(args, 'force_reindex'));
            break;
          // Vector DB sync tools
          case 'vector_db_sync_check':
            result = await this.systemHandler.handleSyncCheck(args);
            break;
          case 'vector_db_cleanup_orphaned':
            result = await this.systemHandler.handleCleanupOrphaned(args);
            break;
          case 'vector_db_force_sync':
            result = await this.systemHandler.handleForceSync(args);
            break;
          case 'vector_db_integrity_report':
            result = await this.systemHandler.handleIntegrityReport(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
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
    console.log('🔗 Starting stdio MCP server transport...');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🎯 MCP Server started and ready for stdio connections');
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
}