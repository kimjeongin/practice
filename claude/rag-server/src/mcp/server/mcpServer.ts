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

import { SearchHandler } from '../handlers/searchHandler.js';
import { DocumentHandler } from '../handlers/documentHandler.js';
import { SystemHandler } from '../handlers/systemHandler.js';
import { ModelHandler } from '../handlers/modelHandler.js';
import { IFileRepository } from '../../rag/repositories/documentRepository.js';
import { ServerConfig } from '../../shared/types/index.js';

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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'search_documents':
            result = await this.searchHandler.handleSearchDocuments(args as any);
            break;
          case 'list_files':
            result = await this.documentHandler.handleListFiles(args as any);
            break;
          case 'get_file_metadata':
            result = await this.documentHandler.handleGetFileMetadata(args as any);
            break;
          case 'update_file_metadata':
            result = await this.documentHandler.handleUpdateFileMetadata(args as any);
            break;
          case 'search_files_by_metadata':
            result = await this.documentHandler.handleSearchFilesByMetadata(args as any);
            break;
          case 'get_server_status':
            result = await this.systemHandler.handleGetServerStatus();
            break;
          case 'list_available_models':
            result = await this.modelHandler.handleListAvailableModels();
            break;
          case 'switch_embedding_model':
            result = await this.modelHandler.handleSwitchEmbeddingModel(args as any);
            break;
          case 'download_model':
            result = await this.modelHandler.handleDownloadModel(args as any);
            break;
          case 'get_model_cache_info':
            result = await this.modelHandler.handleGetModelCacheInfo();
            break;
          case 'get_download_progress':
            result = await this.modelHandler.handleGetDownloadProgress();
            break;
          case 'force_reindex':
            result = await this.modelHandler.handleForceReindex(args as any);
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
      const files = this.fileRepository.getAllFiles();
      
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
      const file = this.fileRepository.getFileByPath(filePath);
      
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
          const query = args?.['query'] as string;
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
}