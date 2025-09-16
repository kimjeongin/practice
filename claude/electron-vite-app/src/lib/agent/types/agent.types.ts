/**
 * Agent-related type definitions
 */

// Ollama model types
export type OllamaModel =
  | 'llama3.1:8b'
  | 'deepseek-r1:8b'
  | 'deepseek-r1:1.5b'
  | 'mistral:7b'
  | 'qwen2.5:7b'
  | 'qwen3:4b'
  | 'qwen3:0.6b'
  | 'qwen3:1.7b'

// Agent types based on capabilities
export type AgentType = 'main' | 'reasoning' | 'fast'

// Agent configuration
export interface AgentConfig {
  type?: AgentType
  model?: OllamaModel
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

// Agent message types
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  conversationId: string
  toolCall?: {
    toolName: string
    parameters: Record<string, unknown>
    serverId: string
  }
  toolResult?: {
    success: boolean
    result?: unknown
    error?: string
    executionTime?: number
  }
}

// Agent execution result
export interface AgentExecutionResult {
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

// Legacy types for backward compatibility (deprecated)
export interface ToolSelectionDecision {
  reasoning: string
  action: 'use_tool' | 'respond' | 'clarify'
  toolName?: string
  parameters?: Record<string, unknown>
  confidence?: number
}

export interface ContinueDecision {
  continue: boolean
  reasoning: string
  nextGoal?: string
}

export interface AgentContext {
  conversationId: string
  messages: AgentMessage[]
  currentGoal?: string
  maxIterations: number
  currentIteration: number
}

export interface AgentState {
  phase: 'analyzing' | 'selecting_tool' | 'executing_tool' | 'responding' | 'completed' | 'error'
  currentTool?: string
  iterationCount: number
  startTime: Date
  context: AgentContext
}

// ============================
// MCP Integration Types
// ============================

// MCP Transport types
export type TransportType = 'stdio' | 'http' | 'sse'

// Server status enumeration
export enum ServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// MCP Server configuration for Agent system
export interface MCPServerConfig {
  id: string
  name: string
  description?: string
  transport: TransportType
  command?: string
  args?: string[]
  url?: string
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  enabled?: boolean
  category?: string
  tags?: string[]
}

// MCP Server connection information
export interface MCPServerConnection {
  config: MCPServerConfig
  status: ServerStatus
  error?: string
  connectedAt?: Date
  tools?: unknown[]
}

// IPC Response wrapper
export interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp?: Date
}

// Enhanced types for MCP compatibility (legacy)
export type EnhancedTransportType = 'stdio' | 'http' | 'sse'

export interface EnhancedServerConfig {
  id: string
  name: string
  description?: string
  transport: EnhancedTransportType
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout?: number
  enabled: boolean
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
  tags?: string[]
}
