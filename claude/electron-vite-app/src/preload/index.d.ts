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
    parameters: Record<string, unknown>
    result: unknown
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
  timestamp: string
  agentInitialized: boolean
}

interface MCPServerConfig {
  id: string
  name: string
  description?: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  cwd?: string
  env?: Record<string, string>
  enabled?: boolean
}

interface MCPServer {
  id: string
  name: string
  status: string
  toolCount: number
  connectedAt?: Date
  lastError?: string
}

interface MCPServersData {
  servers: MCPServer[]
  totalServers: number
  connectedServers: number
  totalTools: number
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
  getAvailableTools: () => Promise<IPCResponse<Array<{ name: string; description: string }>>>

  // Configuration
  updateConfig: (config: Partial<AgentConfig>) => Promise<IPCResponse<AgentConfig>>
  getConfig: () => Promise<IPCResponse<AgentConfig>>

  // Health check
  healthCheck: () => Promise<IPCResponse<AgentHealthStatus>>

  // Initialization status
  getInitStatus: () => Promise<IPCResponse<{
    stage: string
    progress: number
    message: string
    error?: string
    timestamp: Date
  }>>
  isSystemReady: () => Promise<IPCResponse<{ isReady: boolean }>>

  // Get MCP server connections status
  getMCPServers: () => Promise<IPCResponse<MCPServersData>>

  // MCP Server Management
  addMCPServer: (serverConfig: MCPServerConfig) => Promise<IPCResponse<MCPServerConfig>>
  removeMCPServer: (serverId: string) => Promise<IPCResponse<{ serverId: string }>>
  connectMCPServer: (serverId: string) => Promise<IPCResponse<{ serverId: string; connected: boolean }>>
  disconnectMCPServer: (serverId: string) => Promise<IPCResponse<{ serverId: string; connected: boolean }>>
  updateMCPServer: (serverId: string, updates: Partial<MCPServerConfig>) => Promise<IPCResponse<{ serverId: string; updates: Partial<MCPServerConfig> }>>

  // Cleanup
  cleanup: () => Promise<IPCResponse<{ cleaned: boolean }>>
}

// API Client types
interface ApiClientAPI {
  healthCheck: () => Promise<any>
  login: (username: string, password: string) => Promise<any>
  logout: () => Promise<any>
  getLoginStatus: () => Promise<any>
  getUsers: () => Promise<any>
  createUser: (name: string, email: string) => Promise<any>
  getProtectedData: () => Promise<any>
  uploadFile: (fileName: string, content: string, title?: string, description?: string) => Promise<any>
  uploadMultipleFiles: (files: Array<{ name: string; content: string }>, category?: string) => Promise<any>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      agent: AgentAPI
      apiClient: ApiClientAPI
    }
  }
}
