import { ElectronAPI } from '@electron-toolkit/preload'
import { 
  ServerConfig, 
  ServerConnection, 
  MCPTool, 
  ToolFilter, 
  ExecutionResult,
  ExecutionHistoryEntry,
  IPCResponse
} from '../shared/types/mcp-types'

interface ClientHostAPI {
  // Server Management
  addServer: (serverConfig: Omit<ServerConfig, 'id'>) => Promise<IPCResponse<ServerConfig>>
  removeServer: (serverId: string) => Promise<IPCResponse<{ serverId: string }>>
  updateServer: (serverId: string, updates: Partial<ServerConfig>) => Promise<IPCResponse<any>>
  listServers: () => Promise<IPCResponse<ServerConnection[]>>
  connectServer: (serverId: string) => Promise<IPCResponse<{ serverId: string, connected: boolean }>>
  disconnectServer: (serverId: string) => Promise<IPCResponse<{ serverId: string, connected: boolean }>>

  // Tool Discovery and Management
  listTools: (serverId?: string) => Promise<IPCResponse<MCPTool[]>>
  searchTools: (filter: ToolFilter) => Promise<IPCResponse<MCPTool[]>>
  getToolDetails: (serverId: string, toolName: string) => Promise<IPCResponse<any>>

  // Tool Execution
  executeTool: (
    serverId: string, 
    toolName: string, 
    parameters: Record<string, any>,
    userId?: string
  ) => Promise<IPCResponse<ExecutionResult>>
  getExecutionHistory: (limit?: number) => Promise<IPCResponse<ExecutionHistoryEntry[]>>
  clearHistory: () => Promise<IPCResponse<{ cleared: boolean }>>

  // Resources and Prompts
  listResources: (serverId?: string) => Promise<IPCResponse<any[]>>
  readResource: (serverId: string, uri: string) => Promise<IPCResponse<any>>
  listPrompts: (serverId?: string) => Promise<IPCResponse<any[]>>
  getPrompt: (serverId: string, name: string, args?: Record<string, any>) => Promise<IPCResponse<any>>

  // Configuration and Status
  getConfig: () => Promise<IPCResponse<any>>
  updateConfig: (updates: any) => Promise<IPCResponse<any>>
  getStatus: () => Promise<IPCResponse<any>>

  // Events
  subscribeEvents: () => Promise<IPCResponse<{ subscribed: boolean }>>
  unsubscribeEvents: () => Promise<IPCResponse<{ unsubscribed: boolean }>>
  onEvent: (callback: (event: any, data: any) => void) => void
  removeEventListener: (callback: (event: any, data: any) => void) => void

  // Utility Functions
  getCategories: () => Promise<IPCResponse<string[]>>
  getTags: () => Promise<IPCResponse<string[]>>
  addToFavorites: (serverId: string, toolName: string) => Promise<IPCResponse<any>>
  removeFromFavorites: (serverId: string, toolName: string) => Promise<IPCResponse<any>>
  getFavorites: () => Promise<IPCResponse<MCPTool[]>>
  getMostUsedTools: (limit?: number) => Promise<IPCResponse<Array<{ tool: MCPTool, count: number }>>>
  addRagServer: () => Promise<IPCResponse<ServerConfig>>
  exportData: () => Promise<IPCResponse<{ data: string }>>
  importData: (jsonData: string) => Promise<IPCResponse<{ imported: boolean }>>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      clientHost: ClientHostAPI
    }
  }
}
