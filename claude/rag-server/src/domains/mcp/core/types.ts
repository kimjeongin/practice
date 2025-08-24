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
