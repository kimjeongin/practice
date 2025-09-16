/**
 * Shared UI Types for Agent Components
 */

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

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'thinking'
  content: string
  timestamp: Date
  toolsUsed?: Array<{
    toolName: string
    serverId: string
    parameters: Record<string, unknown>
    result: unknown
    executionTime: number
  }>
  executionTime?: number
  iterations?: number
  isStreaming?: boolean
  agentPhase?: string
}

export interface ThinkingStatus {
  phase: string
  message: string
  toolName?: string
  reasoning?: string
  toolParameters?: Record<string, unknown>
}