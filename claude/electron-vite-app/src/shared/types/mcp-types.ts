/**
 * Core MCP Client Host Type Definitions
 * 
 * This file contains all the shared types and interfaces for the generic MCP Client Host
 */

// Transport types supported by MCP
export type TransportType = 'stdio' | 'http' | 'sse'

// Server status enumeration
export enum ServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  RECONNECTING = 'reconnecting'
}

// Server configuration interface
export interface ServerConfig {
  id: string
  name: string
  description?: string
  transport: TransportType
  command?: string  // For stdio transport
  args?: string[]   // For stdio transport
  url?: string      // For HTTP/SSE transport
  cwd?: string      // Working directory for stdio
  env?: Record<string, string>  // Environment variables
  autoReconnect?: boolean
  reconnectDelay?: number // milliseconds
  maxReconnectAttempts?: number
  enabled: boolean
  tags?: string[]   // For categorization
}

// Connection state information
export interface ServerConnection {
  config: ServerConfig
  status: ServerStatus
  client?: any  // MCP Client instance
  transport?: any  // Transport instance
  connectedAt?: Date
  lastError?: string
  reconnectAttempts: number
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
}

// Standardized MCP Tool interface
export interface MCPTool {
  name: string
  description: string
  serverId: string
  serverName: string
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  category?: string
  tags?: string[]
  examples?: ToolExample[]
}

// Tool execution example
export interface ToolExample {
  name: string
  description: string
  parameters: Record<string, any>
}

// MCP Resource interface
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
  serverName: string
}

// MCP Prompt interface  
export interface MCPPrompt {
  name: string
  description: string
  serverId: string
  serverName: string
  arguments?: {
    name: string
    description: string
    required: boolean
  }[]
}

// Tool execution context
export interface ExecutionContext {
  toolName: string
  serverId: string
  parameters: Record<string, any>
  requestId: string
  timestamp: Date
  userId?: string
}

// Tool execution result
export interface ExecutionResult {
  requestId: string
  success: boolean
  result?: any
  error?: string
  executionTime: number
  timestamp: Date
}

// Tool execution history entry
export interface ExecutionHistoryEntry {
  id: string
  context: ExecutionContext
  result: ExecutionResult
  favorite?: boolean
  notes?: string
}

// Client Host configuration
export interface ClientHostConfig {
  servers: ServerConfig[]
  settings: {
    autoConnectOnStartup: boolean
    maxConcurrentExecutions: number
    executionTimeout: number
    saveExecutionHistory: boolean
    enableNotifications: boolean
  }
}

// Events emitted by the Client Host
export interface ClientHostEvents {
  'server-connected': { serverId: string }
  'server-disconnected': { serverId: string, reason?: string }
  'server-error': { serverId: string, error: string }
  'tool-discovered': { serverId: string, tool: MCPTool }
  'tool-executed': { execution: ExecutionHistoryEntry }
  'tools-updated': { serverId: string, tools: MCPTool[] }
}

// Tool filter and search criteria
export interface ToolFilter {
  search?: string
  serverIds?: string[]
  categories?: string[]
  tags?: string[]
  hasExamples?: boolean
}

// Server management operations
export interface ServerOperation {
  type: 'add' | 'remove' | 'update' | 'connect' | 'disconnect' | 'reconnect'
  serverId: string
  config?: Partial<ServerConfig>
}

// UI State interfaces for frontend
export interface UIState {
  activeTab: 'servers' | 'tools' | 'executions' | 'settings'
  selectedServerId?: string
  selectedTool?: MCPTool
  executionHistory: ExecutionHistoryEntry[]
  favorites: string[] // tool names
}

// IPC channel names for communication between main and renderer
export const IPC_CHANNELS = {
  // Server management
  ADD_SERVER: 'client-host:add-server',
  REMOVE_SERVER: 'client-host:remove-server', 
  UPDATE_SERVER: 'client-host:update-server',
  LIST_SERVERS: 'client-host:list-servers',
  CONNECT_SERVER: 'client-host:connect-server',
  DISCONNECT_SERVER: 'client-host:disconnect-server',
  
  // Tool discovery and management
  LIST_TOOLS: 'client-host:list-tools',
  SEARCH_TOOLS: 'client-host:search-tools',
  GET_TOOL_DETAILS: 'client-host:get-tool-details',
  
  // Tool execution
  EXECUTE_TOOL: 'client-host:execute-tool',
  GET_EXECUTION_HISTORY: 'client-host:get-execution-history',
  CLEAR_HISTORY: 'client-host:clear-history',
  
  // Resources and prompts
  LIST_RESOURCES: 'client-host:list-resources',
  READ_RESOURCE: 'client-host:read-resource',
  LIST_PROMPTS: 'client-host:list-prompts',
  GET_PROMPT: 'client-host:get-prompt',
  
  // Settings and configuration
  GET_CONFIG: 'client-host:get-config',
  UPDATE_CONFIG: 'client-host:update-config',
  
  // Status and monitoring
  GET_STATUS: 'client-host:get-status',
  SUBSCRIBE_EVENTS: 'client-host:subscribe-events',
  UNSUBSCRIBE_EVENTS: 'client-host:unsubscribe-events'
} as const

// Type for IPC response wrapper
export interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: Date
}