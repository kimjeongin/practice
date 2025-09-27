import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AGENT_IPC_CHANNELS, API_CLIENT_IPC_CHANNELS } from '@shared/constants/ipc-channels'

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
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_MCP_SERVERS)
  },

  // MCP Server Management
  addMCPServer: async (serverConfig: any): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ADD_MCP_SERVER, serverConfig)
  },

  removeMCPServer: async (serverId: string): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REMOVE_MCP_SERVER, serverId)
  },

  connectMCPServer: async (serverId: string): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CONNECT_MCP_SERVER, serverId)
  },

  disconnectMCPServer: async (serverId: string): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DISCONNECT_MCP_SERVER, serverId)
  },

  updateMCPServer: async (serverId: string, updates: any): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UPDATE_MCP_SERVER, serverId, updates)
  },

  // Cleanup
  cleanup: async (): Promise<any> => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CLEANUP)
  },
}

// API Client implementation
const apiClientAPI = {
  // Health check
  healthCheck: async (): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.HEALTH_CHECK)
  },

  // Authentication
  login: async (username: string, password: string): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.LOGIN, username, password)
  },

  logout: async (): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.LOGOUT)
  },

  getLoginStatus: async (): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.GET_LOGIN_STATUS)
  },

  // User management
  getUsers: async (): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.GET_USERS)
  },

  createUser: async (name: string, email: string): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.CREATE_USER, name, email)
  },

  // Protected data
  getProtectedData: async (): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.GET_PROTECTED_DATA)
  },

  // File upload
  uploadFile: async (fileName: string, content: string, title?: string, description?: string): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.UPLOAD_FILE, fileName, content, title, description)
  },

  uploadMultipleFiles: async (files: Array<{ name: string; content: string }>, category?: string): Promise<any> => {
    return ipcRenderer.invoke(API_CLIENT_IPC_CHANNELS.UPLOAD_MULTIPLE_FILES, files, category)
  },
}

// Custom APIs for renderer
const api = {
  agent: agentAPI,
  apiClient: apiClientAPI,
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
