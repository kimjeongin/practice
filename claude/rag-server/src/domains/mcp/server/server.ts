import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { SearchHandler } from '../handlers/search.js'
import { InformationHandler } from '../handlers/information.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

export class MCPServer {
  private server: Server

  constructor(
    private searchHandler: SearchHandler,
    private informationHandler: InformationHandler,
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
    )

    this.setupTools()
    this.setupResources()
    this.setupPrompts()
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [...this.searchHandler.getTools(), ...this.informationHandler.getTools()],
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'search':
            return await this.searchHandler.handleSearch(this.validateAndCastArgs(args, 'search'))
          case 'search_similar':
            return await this.searchHandler.handleSearchSimilar(
              this.validateAndCastArgs(args, 'search_similar')
            )
          case 'search_by_question':
            return await this.searchHandler.handleSearchByQuestion(
              this.validateAndCastArgs(args, 'search_by_question')
            )
          case 'list_sources':
            return await this.informationHandler.handleListSources(
              this.validateAndCastArgs(args, 'list_sources')
            )
          default:
            // Graceful handling of unknown tools instead of crashing the service
            logger.warn('Unknown tool requested', {
              toolName: name,
              availableTools: this.getAvailableToolNames(),
            })
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: 'UnknownTool',
                      message: `Tool '${name}' is not available`,
                      availableTools: this.getAvailableToolNames(),
                      suggestion: 'Use the list_tools endpoint to see all available tools',
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        }
      }
    })
  }
  private getAvailableToolNames(): string[] {
    return [
      ...this.searchHandler.getTools().map((tool) => tool.name),
      ...this.informationHandler.getTools().map((tool) => tool.name),
    ]
  }

  private setupResources(): void {
    // Resources functionality temporarily removed - VectorStore-only architecture
    // Files are now managed through VectorStore metadata rather than database
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [],
      }
    })

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      
      // Basic file reading without database dependency
      if (!uri.startsWith('file://')) {
        throw new Error('Only file:// URIs are supported')
      }

      const filePath = uri.replace('file://', '')
      
      try {
        const { readFile } = await import('fs/promises')
        const content = await readFile(filePath, 'utf-8')
        
        return {
          contents: [
            {
              uri,
              mimeType: this.getMimeType(filePath.split('.').pop() || ''),
              text: content,
            },
          ],
        }
      } catch (error) {
        throw new Error('File not found')
      }
    })
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
      }
    })

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'rag_search': {
          const query = typeof args?.['query'] === 'string' ? args['query'] : undefined
          const contextLength = Number(args?.['context_length']) || 3

          if (!query) {
            throw new Error('Query is required for rag_search prompt')
          }

          const results = await this.searchHandler.handleSearch({
            query,
            limit: contextLength,
          })

          const contextText = results.results
            ? results.results
                .map(
                  (result) =>
                    `**${result.source.filename}** (Score: ${result.relevance_score.toFixed(
                      4
                    )}):\n${result.content}`
                )
                .join('\n\n---\n\n')
            : 'No results found'

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
          }
        }
        default:
          throw new Error(`Unknown prompt: ${name}`)
      }
    })
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
    }
    return mimeTypes[fileType.toLowerCase()] || 'text/plain'
  }

  async start(): Promise<void> {
    const { TransportFactory } = await import('../transport/transport-factory.js')

    // Validate transport configuration
    TransportFactory.validateConfig(this.config.mcp)

    console.log(`🔗 Starting MCP server with ${this.config.mcp.type} transport...`)

    const { transport, context } = await TransportFactory.createTransport(this.config.mcp)

    // Connect MCP server to transport
    await this.server.connect(transport)

    // Start HTTP server if needed
    if (context && this.config.mcp.type !== 'stdio') {
      await TransportFactory.startHTTPServer(context, this.config.mcp)
    }

    console.log(`🎯 MCP Server started and ready for ${this.config.mcp.type} connections`, {
      transport: this.config.mcp.type,
      port: this.config.mcp.port,
      host: this.config.mcp.host,
    })
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down MCP Server...')
    
    try {
      // Close MCP server connection
      if (this.server && 'close' in this.server && typeof this.server.close === 'function') {
        await this.server.close()
        logger.debug('MCP server connection closed')
      }
      
      // Additional cleanup logic can be added here
      logger.info('✅ MCP Server shutdown completed successfully')
    } catch (error) {
      logger.error(
        'Error during MCP server shutdown',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  private isValidArgs(args: Record<string, unknown> | undefined): args is Record<string, unknown> {
    return args !== undefined && typeof args === 'object' && args !== null
  }

  private validateAndCastArgs(args: Record<string, unknown> | undefined, operation: string): any {
    if (!this.isValidArgs(args)) {
      throw new Error(`Invalid arguments for ${operation}: args must be an object`)
    }
    return args
  }
}
