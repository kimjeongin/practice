/**
 * Agent-related type definitions
 */

// Import from shared types to avoid circular dependency
import type { MCPTool } from '@shared/types/mcp.types'

// Ollama model types
export type OllamaModel = 'llama3.1:8b' | 'deepseek-r1:8b' | 'mistral:7b' | 'qwen2.5:7b'

// Agent types based on capabilities
export type AgentType = 'main' | 'reasoning' | 'fast'

// Agent configuration
export interface AgentConfig {
  type: AgentType
  model: OllamaModel
  temperature: number
  maxTokens: number
  systemPrompt?: string
}

// Tool selection decision by LLM
export interface ToolSelectionDecision {
  reasoning: string
  action: 'use_tool' | 'respond' | 'clarify'
  toolName?: string
  parameters?: Record<string, any>
  confidence?: number
}

// Continue decision by LLM  
export interface ContinueDecision {
  continue: boolean
  reasoning: string
  nextGoal?: string
}

// Agent message types
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCall?: {
    toolName: string
    parameters: Record<string, any>
    serverId: string
  }
  toolResult?: {
    success: boolean
    result?: any
    error?: string
    executionTime?: number
  }
  timestamp: Date
}

// Agent conversation context
export interface AgentContext {
  conversationId: string
  messages: AgentMessage[]
  availableTools: MCPTool[]
  currentGoal?: string
  maxIterations: number
  currentIteration: number
}

// Agent execution result
export interface AgentExecutionResult {
  success: boolean
  response: string
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

// Ollama API types
export interface OllamaGenerateRequest {
  model: string
  prompt: string
  system?: string
  template?: string
  context?: number[]
  stream?: boolean
  raw?: boolean
  format?: 'json'
  options?: {
    temperature?: number
    top_p?: number
    top_k?: number
    repeat_penalty?: number
    seed?: number
    num_ctx?: number
    num_predict?: number
  }
}

export interface OllamaGenerateResponse {
  model: string
  created_at: string
  response: string
  done: boolean
  context?: number[]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaModelInfo {
  name: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
  modified_at: string
}

// Enhanced MCP transport types for both stdio and http
export type EnhancedTransportType = 'stdio' | 'http' | 'streamable-http'

export interface EnhancedServerConfig {
  id: string
  name: string
  description?: string
  transport: EnhancedTransportType
  // stdio transport
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  // http transports
  url?: string
  headers?: Record<string, string>
  timeout?: number
  // common settings
  enabled: boolean
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
  tags?: string[]
}

// Agent orchestrator state
export interface AgentState {
  phase: 'analyzing' | 'selecting_tool' | 'executing_tool' | 'processing_result' | 'responding' | 'completed' | 'error'
  currentTool?: string
  currentServerId?: string
  iterationCount: number
  startTime: Date
  lastAction?: string
  context: AgentContext
}