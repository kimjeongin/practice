import { useState, useEffect, useCallback } from 'react'
import { 
  ServerConfig, 
  ServerConnection, 
  MCPTool, 
  ToolFilter,
  ExecutionHistoryEntry 
} from '../../../../shared/types/mcp.types'

interface ClientHostState {
  loading: boolean
  error: string | null
  servers: ServerConnection[]
  tools: MCPTool[]
  executionHistory: ExecutionHistoryEntry[]
  status: any
}

export function useClientHost() {
  const [state, setState] = useState<ClientHostState>({
    loading: true,
    error: null,
    servers: [],
    tools: [],
    executionHistory: [],
    status: null
  })

  // Error handling helper
  const handleError = useCallback((error: any, context: string) => {
    const message = error instanceof Error ? error.message : `${context} failed`
    setState(prev => ({ ...prev, error: message, loading: false }))
    console.error(`${context} error:`, error)
  }, [])

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // ============================
  // Server Management
  // ============================

  // Load servers
  const loadServers = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.listServers()
      
      if (response.success && response.data) {
        setState(prev => ({ 
          ...prev, 
          servers: response.data || [],
          loading: false 
        }))
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Load servers')
        return []
      }
    } catch (error) {
      handleError(error, 'Load servers')
      return []
    }
  }, [handleError])

  // Add server
  const addServer = useCallback(async (serverConfig: Omit<ServerConfig, 'id'>) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.addServer(serverConfig)
      
      if (response.success && response.data) {
        // Reload servers to get updated list
        await loadServers()
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Add server')
        return null
      }
    } catch (error) {
      handleError(error, 'Add server')
      return null
    }
  }, [handleError, loadServers])

  // Remove server
  const removeServer = useCallback(async (serverId: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.removeServer(serverId)
      
      if (response.success) {
        // Reload servers to get updated list
        await loadServers()
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Remove server')
        return false
      }
    } catch (error) {
      handleError(error, 'Remove server')
      return false
    }
  }, [handleError, loadServers])

  // Update server
  const updateServer = useCallback(async (serverId: string, updates: Partial<ServerConfig>) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.updateServer(serverId, updates)
      
      if (response.success) {
        // Reload servers to get updated list
        await loadServers()
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Update server')
        return false
      }
    } catch (error) {
      handleError(error, 'Update server')
      return false
    }
  }, [handleError, loadServers])

  // Connect server
  const connectServer = useCallback(async (serverId: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.connectServer(serverId)
      
      if (response.success) {
        // Reload servers to get updated status
        await loadServers()
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Connect server')
        return false
      }
    } catch (error) {
      handleError(error, 'Connect server')
      return false
    }
  }, [handleError, loadServers])

  // Disconnect server
  const disconnectServer = useCallback(async (serverId: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.disconnectServer(serverId)
      
      if (response.success) {
        // Reload servers to get updated status
        await loadServers()
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Disconnect server')
        return false
      }
    } catch (error) {
      handleError(error, 'Disconnect server')
      return false
    }
  }, [handleError, loadServers])

  // ============================
  // Tool Management
  // ============================

  // Load tools
  const loadTools = useCallback(async (serverId?: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.listTools(serverId)
      
      if (response.success && response.data) {
        setState(prev => ({ 
          ...prev, 
          tools: response.data || [],
          loading: false 
        }))
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Load tools')
        return []
      }
    } catch (error) {
      handleError(error, 'Load tools')
      return []
    }
  }, [handleError])

  // Search tools
  const searchTools = useCallback(async (filter: ToolFilter) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.searchTools(filter)
      
      if (response.success && response.data) {
        setState(prev => ({ 
          ...prev, 
          tools: response.data || [],
          loading: false 
        }))
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Search tools')
        return []
      }
    } catch (error) {
      handleError(error, 'Search tools')
      return []
    }
  }, [handleError])

  // Get tool details
  const getToolDetails = useCallback(async (serverId: string, toolName: string) => {
    try {
      const response = await window.api.clientHost.getToolDetails(serverId, toolName)
      
      if (response.success && response.data) {
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Get tool details')
        return null
      }
    } catch (error) {
      handleError(error, 'Get tool details')
      return null
    }
  }, [handleError])

  // ============================
  // Tool Execution
  // ============================

  // Execute tool
  const executeTool = useCallback(async (
    serverId: string, 
    toolName: string, 
    parameters: Record<string, any>,
    userId?: string
  ) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.executeTool(serverId, toolName, parameters, userId)
      
      setState(prev => ({ ...prev, loading: false }))
      
      if (response.success && response.data) {
        // Reload execution history
        loadExecutionHistory()
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Execute tool')
        return null
      }
    } catch (error) {
      handleError(error, 'Execute tool')
      return null
    }
  }, [handleError])

  // Load execution history
  const loadExecutionHistory = useCallback(async (limit?: number) => {
    try {
      const response = await window.api.clientHost.getExecutionHistory(limit)
      
      if (response.success && response.data) {
        setState(prev => ({ 
          ...prev, 
          executionHistory: response.data || []
        }))
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Load execution history')
        return []
      }
    } catch (error) {
      handleError(error, 'Load execution history')
      return []
    }
  }, [handleError])

  // Clear execution history
  const clearExecutionHistory = useCallback(async () => {
    try {
      const response = await window.api.clientHost.clearHistory()
      
      if (response.success) {
        setState(prev => ({ ...prev, executionHistory: [] }))
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Clear execution history')
        return false
      }
    } catch (error) {
      handleError(error, 'Clear execution history')
      return false
    }
  }, [handleError])

  // ============================
  // Favorites
  // ============================

  // Add to favorites
  const addToFavorites = useCallback(async (serverId: string, toolName: string) => {
    try {
      const response = await window.api.clientHost.addToFavorites(serverId, toolName)
      
      if (response.success) {
        // Reload tools to update favorite status
        await loadTools()
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Add to favorites')
        return false
      }
    } catch (error) {
      handleError(error, 'Add to favorites')
      return false
    }
  }, [handleError, loadTools])

  // Remove from favorites
  const removeFromFavorites = useCallback(async (serverId: string, toolName: string) => {
    try {
      const response = await window.api.clientHost.removeFromFavorites(serverId, toolName)
      
      if (response.success) {
        // Reload tools to update favorite status
        await loadTools()
        return true
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Remove from favorites')
        return false
      }
    } catch (error) {
      handleError(error, 'Remove from favorites')
      return false
    }
  }, [handleError, loadTools])

  // Get favorites
  const getFavorites = useCallback(async () => {
    try {
      const response = await window.api.clientHost.getFavorites()
      
      if (response.success && response.data) {
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Get favorites')
        return []
      }
    } catch (error) {
      handleError(error, 'Get favorites')
      return []
    }
  }, [handleError])

  // ============================
  // Status and Configuration
  // ============================

  // Load status
  const loadStatus = useCallback(async () => {
    try {
      const response = await window.api.clientHost.getStatus()
      
      if (response.success && response.data) {
        setState(prev => ({ ...prev, status: response.data }))
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Load status')
        return null
      }
    } catch (error) {
      handleError(error, 'Load status')
      return null
    }
  }, [handleError])

  // Get categories
  const getCategories = useCallback(async () => {
    try {
      const response = await window.api.clientHost.getCategories()
      
      if (response.success && response.data) {
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Get categories')
        return []
      }
    } catch (error) {
      handleError(error, 'Get categories')
      return []
    }
  }, [handleError])

  // Get tags
  const getTags = useCallback(async () => {
    try {
      const response = await window.api.clientHost.getTags()
      
      if (response.success && response.data) {
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Get tags')
        return []
      }
    } catch (error) {
      handleError(error, 'Get tags')
      return []
    }
  }, [handleError])

  // ============================
  // Quick Actions
  // ============================

  // Add RAG server
  const addRagServer = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const response = await window.api.clientHost.addRagServer()
      
      if (response.success && response.data) {
        // Reload servers to get updated list
        await loadServers()
        return response.data
      } else {
        handleError(new Error(response.error || 'Unknown error'), 'Add RAG server')
        return null
      }
    } catch (error) {
      handleError(error, 'Add RAG server')
      return null
    }
  }, [handleError, loadServers])

  // Initialize data on mount
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        loadServers(),
        loadTools(),
        loadExecutionHistory(10),
        loadStatus()
      ])
    }

    initializeData()
  }, [loadServers, loadTools, loadExecutionHistory, loadStatus])

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      loadServers()
      loadStatus()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [loadServers, loadStatus])

  return {
    // State
    loading: state.loading,
    error: state.error,
    servers: state.servers,
    tools: state.tools,
    executionHistory: state.executionHistory,
    status: state.status,
    
    // Server management
    loadServers,
    addServer,
    removeServer,
    updateServer,
    connectServer,
    disconnectServer,
    
    // Tool management
    loadTools,
    searchTools,
    getToolDetails,
    
    // Tool execution
    executeTool,
    loadExecutionHistory,
    clearExecutionHistory,
    
    // Favorites
    addToFavorites,
    removeFromFavorites,
    getFavorites,
    
    // Status and configuration
    loadStatus,
    getCategories,
    getTags,
    
    // Quick actions
    addRagServer,
    
    // Utility
    clearError
  }
}