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
  IPC_CHANNELS
} from '../shared/types/mcp-types'

// MCP Client Host API implementation
const clientHostAPI = {
  // ============================
  // Server Management
  // ============================
  addServer: async (serverConfig: Omit<ServerConfig, 'id'>): Promise<IPCResponse<ServerConfig>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ADD_SERVER, serverConfig)
  },

  removeServer: async (serverId: string): Promise<IPCResponse<{ serverId: string }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMOVE_SERVER, serverId)
  },

  updateServer: async (serverId: string, updates: Partial<ServerConfig>): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SERVER, serverId, updates)
  },

  listServers: async (): Promise<IPCResponse<ServerConnection[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_SERVERS)
  },

  connectServer: async (serverId: string): Promise<IPCResponse<{ serverId: string, connected: boolean }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECT_SERVER, serverId)
  },

  disconnectServer: async (serverId: string): Promise<IPCResponse<{ serverId: string, connected: boolean }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DISCONNECT_SERVER, serverId)
  },

  // ============================
  // Tool Discovery and Management
  // ============================
  listTools: async (serverId?: string): Promise<IPCResponse<MCPTool[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_TOOLS, serverId)
  },

  searchTools: async (filter: ToolFilter): Promise<IPCResponse<MCPTool[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SEARCH_TOOLS, filter)
  },

  getToolDetails: async (serverId: string, toolName: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_TOOL_DETAILS, serverId, toolName)
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
    return ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_TOOL, serverId, toolName, parameters, userId)
  },

  getExecutionHistory: async (limit?: number): Promise<IPCResponse<ExecutionHistoryEntry[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_EXECUTION_HISTORY, limit)
  },

  clearHistory: async (): Promise<IPCResponse<{ cleared: boolean }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY)
  },

  // ============================
  // Resources and Prompts
  // ============================
  listResources: async (serverId?: string): Promise<IPCResponse<any[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_RESOURCES, serverId)
  },

  readResource: async (serverId: string, uri: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_RESOURCE, serverId, uri)
  },

  listPrompts: async (serverId?: string): Promise<IPCResponse<any[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_PROMPTS, serverId)
  },

  getPrompt: async (serverId: string, name: string, args?: Record<string, any>): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PROMPT, serverId, name, args)
  },

  // ============================
  // Configuration and Status
  // ============================
  getConfig: async (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG)
  },

  updateConfig: async (updates: any): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CONFIG, updates)
  },

  getStatus: async (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_STATUS)
  },

  // ============================
  // Events
  // ============================
  subscribeEvents: async (): Promise<IPCResponse<{ subscribed: boolean }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIBE_EVENTS)
  },

  unsubscribeEvents: async (): Promise<IPCResponse<{ unsubscribed: boolean }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UNSUBSCRIBE_EVENTS)
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

  getMostUsedTools: async (limit = 10): Promise<IPCResponse<Array<{ tool: MCPTool, count: number }>>> => {
    return ipcRenderer.invoke('client-host:get-most-used-tools', limit)
  },

  addRagServer: async (): Promise<IPCResponse<ServerConfig>> => {
    return ipcRenderer.invoke('client-host:add-rag-server')
  },

  exportData: async (): Promise<IPCResponse<{ data: string }>> => {
    return ipcRenderer.invoke('client-host:export-data')
  },

  importData: async (jsonData: string): Promise<IPCResponse<{ imported: boolean }>> => {
    return ipcRenderer.invoke('client-host:import-data', jsonData)
  }
}

// Custom APIs for renderer
const api = {
  clientHost: clientHostAPI
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
