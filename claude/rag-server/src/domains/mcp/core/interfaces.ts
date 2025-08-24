// MCP Core Interfaces
export interface MCPHandler {
  handle(request: any): Promise<any>
}

export interface MCPServerConfig {
  name: string
  version: string
}
