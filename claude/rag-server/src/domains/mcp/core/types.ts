// MCP Core Types
export type McpRequestType = 'search' | 'document' | 'system' | 'model' | 'sync'

// MCP Tool Types
export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required?: string[]
  }
}

// JSON-RPC MCP Protocol Types
export interface McpRequest {
  jsonrpc: string
  id: string | number
  method: string
  params?: any
}

export interface McpResponse {
  jsonrpc: string
  id: string | number
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

// Internal MCP Request/Response Types
export interface InternalMcpRequest {
  type: McpRequestType
  payload: Record<string, any>
}

export interface InternalMcpResponse {
  success: boolean
  data?: any
  error?: string
}
