import { useState, useEffect, useCallback } from 'react'

interface MCPServer {
  id: string
  name: string
  status: string
  toolCount: number
  connectedAt?: Date
  lastError?: string
}

interface MCPServersData {
  servers: MCPServer[]
  totalServers: number
  connectedServers: number
  totalTools: number
}

/**
 * React hook for managing MCP servers status
 */
export function useMCPServers(): {
  servers: MCPServersData
  isLoading: boolean
  error: string | null
  getServerByStatus: (status: string) => MCPServer[]
  getConnectedServers: () => MCPServer[]
  getDisconnectedServers: () => MCPServer[]
  getServerById: (serverId: string) => MCPServer | undefined
  refresh: () => void
} {
  const [servers, setServers] = useState<MCPServersData>({
    servers: [],
    totalServers: 0,
    connectedServers: 0,
    totalTools: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchServers = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await window.api.agent.getMCPServers()

      if (result.success) {
        setServers(result.data)
      } else {
        setError(result.error || 'Failed to fetch MCP servers')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServers()

    // Refresh every 10 seconds
    const interval = setInterval(fetchServers, 10000)

    return () => clearInterval(interval)
  }, [fetchServers])

  const getServerByStatus = useCallback(
    (status: string) => {
      return servers.servers.filter((server) => server.status === status)
    },
    [servers.servers]
  )

  const getConnectedServers = useCallback(() => {
    return getServerByStatus('connected')
  }, [getServerByStatus])

  const getDisconnectedServers = useCallback(() => {
    return getServerByStatus('disconnected')
  }, [getServerByStatus])

  const getServerById = useCallback(
    (serverId: string) => {
      return servers.servers.find((server) => server.id === serverId)
    },
    [servers.servers]
  )

  const refresh = useCallback(() => {
    fetchServers()
  }, [fetchServers])

  return {
    servers,
    isLoading,
    error,
    getServerByStatus,
    getConnectedServers,
    getDisconnectedServers,
    getServerById,
    refresh,
  }
}
