import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  ServerConfig,
  ServerConnection,
  MCPTool,
  ToolFilter,
  ExecutionResult,
  ExecutionHistoryEntry,
  IPCResponse,
} from '@shared/types/mcp.types'
import { MCP_IPC_CHANNELS, AGENT_IPC_CHANNELS } from '@shared/constants/ipc-channels'

// MCP Client Host API implementation
const clientHostAPI = {
  // ============================
  // Server Management
  // ============================
  addServer: async (serverConfig: Omit<ServerConfig, 'id'>): Promise<IPCResponse<ServerConfig>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.ADD_SERVER, serverConfig)
  },

  removeServer: async (serverId: string): Promise<IPCResponse<{ serverId: string }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.REMOVE_SERVER, serverId)
  },

  updateServer: async (
    serverId: string,
    updates: Partial<ServerConfig>
  ): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.UPDATE_SERVER, serverId, updates)
  },

  listServers: async (): Promise<IPCResponse<ServerConnection[]>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_SERVERS)
  },

  connectServer: async (
    serverId: string
  ): Promise<IPCResponse<{ serverId: string; connected: boolean }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.CONNECT_SERVER, serverId)
  },

  disconnectServer: async (
    serverId: string
  ): Promise<IPCResponse<{ serverId: string; connected: boolean }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.DISCONNECT_SERVER, serverId)
  },

  // ============================
  // Tool Discovery and Management
  // ============================
  listTools: async (serverId?: string): Promise<IPCResponse<MCPTool[]>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_TOOLS, serverId)
  },

  searchTools: async (filter: ToolFilter): Promise<IPCResponse<MCPTool[]>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_TOOLS, filter)
  },

  getToolDetails: async (serverId: string, toolName: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_TOOLS, serverId, toolName)
  },

  // ============================
  // Tool Execution
  // ============================
  executeTool: async (
    serverId: string,
    toolName: string,
    parameters: Record<string, any>,
    userId?: string
  ): Promise<IPCResponse<ExecutionResult>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.EXECUTE_TOOL, serverId, toolName, parameters, userId)
  },

  getExecutionHistory: async (limit?: number): Promise<IPCResponse<ExecutionHistoryEntry[]>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_EXECUTION_HISTORY, limit)
  },

  clearHistory: async (): Promise<IPCResponse<{ cleared: boolean }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.CLEAR_EXECUTION_HISTORY)
  },

  // ============================
  // Resources and Prompts
  // ============================
  listResources: async (serverId?: string): Promise<IPCResponse<any[]>> => {
    return ipcRenderer.invoke('mcp:list-resources', serverId)
  },

  readResource: async (serverId: string, uri: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('mcp:read-resource', serverId, uri)
  },

  listPrompts: async (serverId?: string): Promise<IPCResponse<any[]>> => {
    return ipcRenderer.invoke('mcp:list-prompts', serverId)
  },

  getPrompt: async (
    serverId: string,
    name: string,
    args?: Record<string, any>
  ): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('mcp:get-prompt', serverId, name, args)
  },

  // ============================
  // Configuration and Status
  // ============================
  getConfig: async (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('mcp:get-config')
  },

  updateConfig: async (updates: any): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('mcp:update-config', updates)
  },

  getStatus: async (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_STATUS)
  },

  // ============================
  // Events
  // ============================
  subscribeEvents: async (): Promise<IPCResponse<{ subscribed: boolean }>> => {
    return ipcRenderer.invoke('mcp:subscribe-events')
  },

  unsubscribeEvents: async (): Promise<IPCResponse<{ unsubscribed: boolean }>> => {
    return ipcRenderer.invoke('mcp:unsubscribe-events')
  },

  onEvent: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('client-host-event', callback)
  },

  removeEventListener: (callback: (event: any, data: any) => void) => {
    ipcRenderer.removeListener('client-host-event', callback)
  },

  // ============================
  // Utility Functions
  // ============================
  getCategories: async (): Promise<IPCResponse<string[]>> => {
    return ipcRenderer.invoke('client-host:get-categories')
  },

  getTags: async (): Promise<IPCResponse<string[]>> => {
    return ipcRenderer.invoke('client-host:get-tags')
  },

  addToFavorites: async (serverId: string, toolName: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('client-host:add-to-favorites', serverId, toolName)
  },

  removeFromFavorites: async (serverId: string, toolName: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('client-host:remove-from-favorites', serverId, toolName)
  },

  getFavorites: async (): Promise<IPCResponse<MCPTool[]>> => {
    return ipcRenderer.invoke('client-host:get-favorites')
  },

  getMostUsedTools: async (
    limit = 10
  ): Promise<IPCResponse<Array<{ tool: MCPTool; count: number }>>> => {
    return ipcRenderer.invoke('client-host:get-most-used-tools', limit)
  },

  getServerConfig: async (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.GET_SERVER_CONFIG)
  },

  updateServerConfig: async (config: any): Promise<IPCResponse<{ success: boolean }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.UPDATE_SERVER_CONFIG, config)
  },

  reloadConfig: async (): Promise<IPCResponse<{ success: boolean }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.RELOAD_CONFIG)
  },

  exportConfig: async (): Promise<IPCResponse<{ data: string }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.EXPORT_CONFIG)
  },

  importConfig: async (configJson: string): Promise<IPCResponse<{ success: boolean }>> => {
    return ipcRenderer.invoke(MCP_IPC_CHANNELS.IMPORT_CONFIG, configJson)
  },

  exportData: async (): Promise<IPCResponse<{ data: string }>> => {
    return ipcRenderer.invoke('client-host:export-data')
  },

  importData: async (jsonData: string): Promise<IPCResponse<{ imported: boolean }>> => {
    return ipcRenderer.invoke('client-host:import-data', jsonData)
  },
}

// Agent API implementation
const agentAPI = {
  // Initialize agent system
  initialize: async (config?: any): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.INITIALIZE, config)
  },

  // Process user query
  processQuery: async (
    query: string,
    conversationId?: string,
    options?: { maxIterations?: number; temperature?: number; model?: string }
  ): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.PROCESS_QUERY, query, conversationId, options)
  },

  // Test simple query
  testQuery: async (query: string): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.TEST_QUERY, query)
  },

  // Get available tools
  getAvailableTools: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_AVAILABLE_TOOLS)
  },

  // Update agent configuration
  updateConfig: async (config: any): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UPDATE_CONFIG, config)
  },

  // Get current configuration
  getConfig: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_CONFIG)
  },

  // Health check
  healthCheck: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.HEALTH_CHECK)
  },

  // Get MCP server connections status
  getMCPServers: async (): Promise<any> => {
    return ipcRenderer.invoke('agent:get-mcp-servers')
  },

  // Cleanup
  cleanup: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CLEANUP)
  },
}

// Custom APIs for renderer
const api = {
  clientHost: clientHostAPI,
  agent: agentAPI,
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
