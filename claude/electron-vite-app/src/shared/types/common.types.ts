/**
 * Common types shared across the application
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

// Basic server configuration
export interface ServerConfig {
  id: string
  name: string
  description?: string
  transport: TransportType
  command?: string
  args?: string[]
  url?: string
  cwd?: string
  env?: Record<string, string>
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
  tags?: string[]
  enabled: boolean
}

// IPC Response wrapper
export interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp: Date | string
}