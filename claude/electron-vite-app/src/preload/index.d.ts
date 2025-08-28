import { ElectronAPI } from '@electron-toolkit/preload'
import { IPCResponse } from '@lib/agent/types/agent.types'

// Agent types
interface AgentConfig {
  type?: 'main' | 'reasoning' | 'fast'
  model?: string
  temperature?: number
  maxTokens?: number
}

interface AgentExecutionResult {
  success: boolean
  response: string
  conversationId: string
  toolsUsed: Array<{
    toolName: string
    serverId: string
    parameters: Record<string, any>
    result: any
    executionTime: number
  }>
  totalExecutionTime: number
  iterations: number
  error?: string
}

interface AgentHealthStatus {
  ollamaHealthy: boolean
  availableModels: string[]
  availableTools: number
  config?: AgentConfig
}

interface AgentAPI {
  // Initialize agent system
  initialize: (config?: AgentConfig) => Promise<IPCResponse<{ initialized: boolean }>>

  // Process user query
  processQuery: (
    query: string,
    conversationId?: string,
    options?: { maxIterations?: number; temperature?: number; model?: string }
  ) => Promise<IPCResponse<AgentExecutionResult>>

  // Test simple query
  testQuery: (query: string) => Promise<IPCResponse<AgentExecutionResult>>

  // Get available tools
  getAvailableTools: () => Promise<IPCResponse<any[]>>

  // Configuration
  updateConfig: (config: Partial<AgentConfig>) => Promise<IPCResponse<AgentConfig>>
  getConfig: () => Promise<IPCResponse<AgentConfig>>

  // Health check
  healthCheck: () => Promise<IPCResponse<AgentHealthStatus>>

  // Get MCP server connections status
  getMCPServers: () => Promise<IPCResponse<any>>

  // MCP Server Management
  addMCPServer: (serverConfig: any) => Promise<IPCResponse<any>>
  removeMCPServer: (serverId: string) => Promise<IPCResponse<any>>
  connectMCPServer: (serverId: string) => Promise<IPCResponse<any>>
  disconnectMCPServer: (serverId: string) => Promise<IPCResponse<any>>
  updateMCPServer: (serverId: string, updates: any) => Promise<IPCResponse<any>>

  // Cleanup
  cleanup: () => Promise<IPCResponse<{ cleaned: boolean }>>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      agent: AgentAPI
    }
  }
}
