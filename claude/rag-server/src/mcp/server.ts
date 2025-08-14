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
import { z } from 'zod';
import { DatabaseManager } from '../database/connection.js';
import { RAGService } from '../services/rag.js';
import { ServerConfig } from '../types/index.js';

export class MCPRAGServer {
  private server: Server;
  private db: DatabaseManager;
  private ragService: RAGService;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.databasePath);
    this.ragService = new RAGService(this.db, config);
    
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
    // Search documents tool
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
          {
            name: 'list_files',
            description: 'List all indexed files with their metadata',
            inputSchema: {
              type: 'object',
              properties: {
                fileType: {
                  type: 'string',
                  description: 'Filter by specific file type',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of files to return (default: 100)',
                  default: 100,
                  minimum: 1,
                  maximum: 1000,
                },
                offset: {
                  type: 'number',
                  description: 'Number of files to skip (for pagination, default: 0)',
                  default: 0,
                  minimum: 0,
                },
              },
              required: [],
            },
          },
          {
            name: 'get_file_metadata',
            description: 'Get detailed metadata for a specific file',
            inputSchema: {
              type: 'object',
              properties: {
                fileId: {
                  type: 'string',
                  description: 'The unique file identifier',
                },
                filePath: {
                  type: 'string',
                  description: 'The file path (alternative to fileId)',
                },
              },
              required: [],
            },
          },
          {
            name: 'update_file_metadata',
            description: 'Add or update custom metadata for a file',
            inputSchema: {
              type: 'object',
              properties: {
                fileId: {
                  type: 'string',
                  description: 'The unique file identifier',
                },
                filePath: {
                  type: 'string',
                  description: 'The file path (alternative to fileId)',
                },
                metadata: {
                  type: 'object',
                  description: 'Key-value pairs of metadata to set',
                  additionalProperties: { type: 'string' },
                },
              },
              required: ['metadata'],
            },
          },
          {
            name: 'search_files_by_metadata',
            description: 'Search files by their custom metadata',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: 'The metadata key to search for',
                },
                value: {
                  type: 'string',
                  description: 'The metadata value to search for (optional)',
                },
              },
              required: ['key'],
            },
          },
          {
            name: 'get_server_status',
            description: 'Get the current status and statistics of the RAG server',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_documents': {
            const query = args?.['query'] as string;
            const topK = args?.['topK'] as number;
            const fileTypes = args?.['fileTypes'] as string[];
            const metadataFilters = args?.['metadataFilters'] as Record<string, string>;
            const useSemanticSearch = args?.['useSemanticSearch'] as boolean;
            const useHybridSearch = args?.['useHybridSearch'] as boolean;
            const semanticWeight = args?.['semanticWeight'] as number;
            
            const results = await this.ragService.search(query, {
              topK,
              fileTypes,
              metadataFilters,
              useSemanticSearch,
              useHybridSearch,
              semanticWeight,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    query,
                    searchType: useHybridSearch ? 'hybrid' : (useSemanticSearch !== false ? 'semantic' : 'keyword'),
                    results: results.map(result => ({
                      content: result.content,
                      score: result.score,
                      semanticScore: 'semanticScore' in result ? result.semanticScore : undefined,
                      keywordScore: 'keywordScore' in result ? result.keywordScore : undefined,
                      hybridScore: 'hybridScore' in result ? result.hybridScore : undefined,
                      metadata: {
                        fileName: result.metadata.name || result.metadata.fileName || 'unknown',
                        filePath: result.metadata.path || result.metadata.filePath || 'unknown',
                        chunkIndex: result.chunkIndex,
                        fileType: result.metadata.fileType || 'unknown',
                        ...result.metadata
                      }
                    })),
                    totalResults: results.length,
                  }, null, 2),
                },
              ],
            };
          }

          case 'list_files': {
            const fileType = args?.['fileType'] as string;
            const limit = (args?.['limit'] as number) || 100;
            const offset = (args?.['offset'] as number) || 0;
            let files = this.db.getAllFiles();

            if (fileType) {
              files = files.filter(file => 
                file.fileType.toLowerCase() === fileType.toLowerCase()
              );
            }

            const totalFiles = files.length;
            const paginatedFiles = files.slice(offset, offset + limit);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    files: paginatedFiles.map(file => ({
                      id: file.id,
                      name: file.name,
                      path: file.path,
                      fileType: file.fileType,
                      size: file.size,
                      modifiedAt: file.modifiedAt.toISOString(),
                      createdAt: file.createdAt.toISOString(),
                      customMetadata: this.db.getFileMetadata(file.id),
                    })),
                    pagination: {
                      total: totalFiles,
                      limit,
                      offset,
                      hasMore: offset + limit < totalFiles,
                    },
                  }, null, 2),
                },
              ],
            };
          }

          case 'get_file_metadata': {
            const fileId = args?.['fileId'] as string;
            const filePath = args?.['filePath'] as string;

            if (!fileId && !filePath) {
              throw new Error('Either fileId or filePath must be provided');
            }

            let file = null;
            if (fileId) {
              file = this.db.getFileById(fileId);
            } else if (filePath) {
              file = this.db.getFileByPath(filePath);
            }

            if (!file) {
              throw new Error('File not found');
            }

            const customMetadata = this.db.getFileMetadata(file.id);
            const chunks = this.db.getDocumentChunks(file.id);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    file: {
                      id: file.id,
                      name: file.name,
                      path: file.path,
                      fileType: file.fileType,
                      size: file.size,
                      modifiedAt: file.modifiedAt.toISOString(),
                      createdAt: file.createdAt.toISOString(),
                      hash: file.hash,
                    },
                    customMetadata,
                    chunkCount: chunks.length,
                    chunks: chunks.map(chunk => ({
                      id: chunk.id,
                      chunkIndex: chunk.chunkIndex,
                      contentPreview: chunk.content.substring(0, 200) + 
                        (chunk.content.length > 200 ? '...' : ''),
                    })),
                  }, null, 2),
                },
              ],
            };
          }

          case 'update_file_metadata': {
            const fileId = args?.['fileId'] as string;
            const filePath = args?.['filePath'] as string;
            const metadata = args?.['metadata'] as Record<string, string>;

            if (!fileId && !filePath) {
              throw new Error('Either fileId or filePath must be provided');
            }

            let file = null;
            if (fileId) {
              file = this.db.getFileById(fileId);
            } else if (filePath) {
              file = this.db.getFileByPath(filePath);
            }

            if (!file) {
              throw new Error('File not found');
            }

            // Update metadata
            for (const [key, value] of Object.entries(metadata)) {
              this.db.setFileMetadata(file.id, key, String(value));
            }

            const updatedMetadata = this.db.getFileMetadata(file.id);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    fileId: file.id,
                    filePath: file.path,
                    updatedMetadata,
                  }, null, 2),
                },
              ],
            };
          }

          case 'search_files_by_metadata': {
            const key = args?.['key'] as string;
            const value = args?.['value'] as string;
            const files = this.db.searchFilesByMetadata(key, value);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    searchCriteria: { key, value },
                    files: files.map(file => ({
                      id: file.id,
                      name: file.name,
                      path: file.path,
                      fileType: file.fileType,
                      size: file.size,
                      modifiedAt: file.modifiedAt.toISOString(),
                      createdAt: file.createdAt.toISOString(),
                      customMetadata: this.db.getFileMetadata(file.id),
                    })),
                    totalResults: files.length,
                  }, null, 2),
                },
              ],
            };
          }

          case 'get_server_status': {
            const indexedFiles = this.ragService.getIndexedFilesCount();
            const indexedChunks = this.ragService.getIndexedChunksCount();
            const isReady = this.ragService.isReady();
            const isDbHealthy = this.db.isHealthy();

            // Get vector store info
            let vectorStoreInfo = null;
            try {
              vectorStoreInfo = await this.ragService.getVectorStoreInfo();
            } catch (error) {
              console.warn('Could not get vector store info:', error);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: {
                      ready: isReady,
                      databaseHealthy: isDbHealthy,
                      indexedFiles,
                      indexedChunks,
                      serviceType: 'rag',
                      vectorStore: vectorStoreInfo,
                    },
                    stats: {
                      totalFiles: indexedFiles,
                      totalChunks: indexedChunks,
                      avgChunksPerFile: indexedFiles > 0 ? 
                        Math.round(indexedChunks / indexedFiles) : 0,
                      vectorDocuments: vectorStoreInfo?.count || 0,
                    },
                    config: {
                      dataDirectory: this.config.dataDir,
                      embeddingService: this.config.embeddingService,
                      chunkSize: this.config.chunkSize,
                      similarityTopK: this.config.similarityTopK,
                    },
                    supportedFormats: ['.txt', '.md', '.json', '.xml', '.html', '.csv'],
                  }, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
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
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const files = this.db.getAllFiles();
      
      return {
        resources: files.map(file => ({
          uri: `file://${file.path}`,
          name: file.name,
          description: `${file.fileType.toUpperCase()} file (${file.size} bytes)`,
          mimeType: this.getMimeType(file.fileType),
        })),
      };
    });

    // Read specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (!uri.startsWith('file://')) {
        throw new Error('Only file:// URIs are supported');
      }
      
      const filePath = uri.replace('file://', '');
      const file = this.db.getFileByPath(filePath);
      
      if (!file) {
        throw new Error('File not found');
      }
      
      const chunks = this.db.getDocumentChunks(file.id);
      const content = chunks.map(chunk => chunk.content).join('\n\n');
      const metadata = this.db.getFileMetadata(file.id);
      
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
    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'rag_search',
            description: 'Perform a RAG search and provide contextual information',
            arguments: [
              {
                name: 'query',
                description: 'Search query',
                required: true,
              },
              {
                name: 'context_length',
                description: 'Number of context results to include',
                required: false,
              },
            ],
          },
          {
            name: 'summarize_documents',
            description: 'Summarize documents based on a topic or query',
            arguments: [
              {
                name: 'topic',
                description: 'Topic or theme to summarize',
                required: true,
              },
              {
                name: 'file_types',
                description: 'Comma-separated file types to include',
                required: false,
              },
            ],
          },
        ],
      };
    });

    // Handle prompt requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'rag_search': {
          const query = args?.['query'] as string;
          const contextLength = Number(args?.['context_length']) || 3;

          if (!query) {
            throw new Error('Query is required for rag_search prompt');
          }

          const results = await this.ragService.search(query, { topK: contextLength });
          
          const contextText = results.map(result => 
            `**${result.metadata.name}** (Score: ${result.score.toFixed(4)}):\n${result.content}`
          ).join('\n\n---\n\n');

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Based on the following context from the document repository, please answer the query: "${query}"\n\n**Context:**\n${contextText}\n\n**Query:** ${query}`,
                },
              },
            ],
          };
        }

        case 'summarize_documents': {
          const topic = args?.['topic'] as string;
          const fileTypesStr = args?.['file_types'] as string;

          if (!topic) {
            throw new Error('Topic is required for summarize_documents prompt');
          }

          const fileTypes = fileTypesStr ? fileTypesStr.split(',').map(t => t.trim()) : undefined;
          const results = await this.ragService.search(topic, { 
            topK: 10, 
            ...(fileTypes && { fileTypes })
          });

          const documentsText = results.map(result =>
            `**${result.metadata.name}**:\n${result.content.substring(0, 500)}...`
          ).join('\n\n---\n\n');

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please summarize the following documents related to "${topic}":\n\n${documentsText}\n\nProvide a comprehensive summary that covers the main points and key insights.`,
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
    try {
      console.log('🔄 Initializing RAG service...');
      await this.ragService.initialize();
      console.log('✅ RAG service initialized successfully');

      console.log('🔗 Starting stdio MCP server transport...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.log('🎯 RAG MCP Server started and ready for stdio connections');
      console.log(`📁 Data directory: ${this.config.dataDir}`);
      console.log(`📊 Indexed files: ${this.ragService.getIndexedFilesCount()}`);
      console.log(`📄 Indexed chunks: ${this.ragService.getIndexedChunksCount()}`);
      
      const vectorStoreInfo = await this.ragService.getVectorStoreInfo();
      console.log(`🔍 Vector store: ${vectorStoreInfo.name} (${vectorStoreInfo.count} documents)`);
    } catch (error) {
      console.error('❌ Failed to start RAG MCP Server:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down RAG MCP Server...');
    try {
      await this.ragService.shutdown();
      this.db.close();
      console.log('✅ RAG MCP Server shutdown completed');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}