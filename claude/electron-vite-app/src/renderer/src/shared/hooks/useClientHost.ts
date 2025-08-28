import { useState, useEffect, useCallback } from 'react'
import type {
  MCPServerConfig,
  MCPServerConnection as ServerConnection,
} from '../../../../lib/agent/types/agent.types'

interface AgentHostState {
  loading: boolean
  error: string | null
  servers: ServerConnection[]
  status: any
}

export function useClientHost() {
  const [state, setState] = useState<AgentHostState>({
    loading: true,
    error: null,
    servers: [],
    status: null,
  })

  // Error handling helper
  const handleError = useCallback((error: any, context: string) => {
    const message = error instanceof Error ? error.message : `${context} failed`
    setState((prev) => ({ ...prev, error: message, loading: false }))
    console.error(`${context} error:`, error)
  }, [])

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  // ============================
  // Server Management
  // ============================

  // Load servers
  const loadServers = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await window.api.agent.getMCPServers()

      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          servers: response.data.servers || [],
          loading: false,
        }))
        return response.data.servers
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
  const addServer = useCallback(
    async (serverConfig: Omit<MCPServerConfig, 'id'>) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        const response = await window.api.agent.addMCPServer(serverConfig)

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
    },
    [handleError, loadServers]
  )

  // Remove server
  const removeServer = useCallback(
    async (serverId: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        const response = await window.api.agent.removeMCPServer(serverId)

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
    },
    [handleError, loadServers]
  )

  // Update server
  const updateServer = useCallback(
    async (serverId: string, updates: Partial<MCPServerConfig>) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        const response = await window.api.agent.updateMCPServer(serverId, updates)

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
    },
    [handleError, loadServers]
  )

  // Connect server
  const connectServer = useCallback(
    async (serverId: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        const response = await window.api.agent.connectMCPServer(serverId)

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
    },
    [handleError, loadServers]
  )

  // Disconnect server
  const disconnectServer = useCallback(
    async (serverId: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        const response = await window.api.agent.disconnectMCPServer(serverId)

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
    },
    [handleError, loadServers]
  )

  // ============================
  // Status and Configuration
  // ============================

  // Load status
  const loadStatus = useCallback(async () => {
    try {
      const response = await window.api.agent.getMCPServers()

      if (response.success && response.data) {
        setState((prev) => ({ ...prev, status: response.data }))
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

  // Initialize data on mount
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([loadServers(), loadStatus()])
    }

    initializeData()
  }, [loadServers, loadStatus])

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
    status: state.status,

    // Server management
    loadServers,
    addServer,
    removeServer,
    updateServer,
    connectServer,
    disconnectServer,

    // Status and configuration
    loadStatus,

    // Utility
    clearError,
  }
}
