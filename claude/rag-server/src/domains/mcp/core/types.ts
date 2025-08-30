// MCP Core Types
export type MCPRequestType = 'search' | 'document' | 'system' | 'model' | 'sync'

export interface MCPRequest {
  type: MCPRequestType
  payload: Record<string, any>
}

export interface MCPResponse {
  success: boolean
  data?: any
  error?: string
}

// MCP Tool Types (moved from shared/types)
export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required?: string[]
  }
}

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
