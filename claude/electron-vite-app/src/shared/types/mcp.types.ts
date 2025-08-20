/**
 * MCP Types for Renderer
 * These are the shared MCP types that the renderer needs
 */

import type { ServerStatus, ServerConfig as BaseServerConfig } from './common.types'

// Re-export common types  
export type { TransportType, ServerStatus, IPCResponse } from './common.types'
export type ServerConfig = BaseServerConfig

// Tool execution example
export interface ToolExample {
  name: string
  description: string
  parameters: Record<string, any>
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

// Connection state information
export interface ServerConnection {
  config: ServerConfig
  status: ServerStatus
  client?: any
  transport?: any
  connectedAt?: Date
  lastError?: string
  reconnectAttempts: number
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
}

// Tool execution context
export interface ExecutionContext {
  toolName: string
  serverId: string
  serverName: string
  userId?: string
  timestamp: Date
}

// Tool execution result
export interface ExecutionResult {
  success: boolean
  result?: any
  error?: string
  executionTime: number
  timestamp: string
}

// Execution history entry
export interface ExecutionHistoryEntry {
  context: ExecutionContext
  result: ExecutionResult
}

// Tool search and filtering
export interface ToolFilter {
  query?: string
  search?: string
  category?: string
  categories?: string[]
  tags?: string[]
  serverId?: string
  serverIds?: string[]
  serverName?: string
  limit?: number
  offset?: number
}

// Configuration interfaces
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