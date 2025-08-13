import { McpRequest, McpResponse, McpTool } from '../types/index.js';

export type { McpTool };

export const MCP_PROTOCOL_VERSION = '2024-11-05';

export class McpProtocol {
  private tools: Map<string, McpTool> = new Map();
  private handlers: Map<string, (params: any) => Promise<any>> = new Map();

  constructor() {
    this.setupDefaultHandlers();
  }

  private setupDefaultHandlers(): void {
    // Initialize handler
    this.handlers.set('initialize', async (params) => {
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'RAG MCP Server',
          version: '1.0.0'
        }
      };
    });

    // List tools handler
    this.handlers.set('tools/list', async () => {
      return {
        tools: Array.from(this.tools.values())
      };
    });
  }

  registerTool(tool: McpTool, handler: (params: any) => Promise<any>): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(`tools/call:${tool.name}`, handler);
  }

  async handleRequest(request: McpRequest): Promise<McpResponse> {
    try {
      const { method, params } = request;
      
      // Handle tool calls
      let handlerKey = method;
      if (method === 'tools/call' && params?.name) {
        handlerKey = `tools/call:${params.name}`;
      }
      
      const handler = this.handlers.get(handlerKey);
      if (!handler) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
      }

      const result = await handler(params);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    } catch (error) {
      console.error('Error handling MCP request:', error);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Utility method to create a standardized tool definition
  static createTool(
    name: string,
    description: string,
    properties: Record<string, any>,
    required: string[] = []
  ): McpTool {
    return {
      name,
      description,
      inputSchema: {
        type: 'object',
        properties,
        required
      }
    };
  }
}