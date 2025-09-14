import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AGENT_IPC_CHANNELS } from '@shared/constants/ipc-channels'

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

  // Get initialization status
  getInitStatus: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_INIT_STATUS)
  },

  // Check if system is ready
  isSystemReady: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.IS_SYSTEM_READY)
  },

  // Get MCP server connections status
  getMCPServers: async (): Promise<any> => {
    return ipcRenderer.invoke('agent:get-mcp-servers')
  },

  // MCP Server Management
  addMCPServer: async (serverConfig: any): Promise<any> => {
    return ipcRenderer.invoke('agent:add-mcp-server', serverConfig)
  },

  removeMCPServer: async (serverId: string): Promise<any> => {
    return ipcRenderer.invoke('agent:remove-mcp-server', serverId)
  },

  connectMCPServer: async (serverId: string): Promise<any> => {
    return ipcRenderer.invoke('agent:connect-mcp-server', serverId)
  },

  disconnectMCPServer: async (serverId: string): Promise<any> => {
    return ipcRenderer.invoke('agent:disconnect-mcp-server', serverId)
  },

  updateMCPServer: async (serverId: string, updates: any): Promise<any> => {
    return ipcRenderer.invoke('agent:update-mcp-server', serverId, updates)
  },

  // Cleanup
  cleanup: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CLEANUP)
  },
}

// Custom APIs for renderer
const api = {
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
