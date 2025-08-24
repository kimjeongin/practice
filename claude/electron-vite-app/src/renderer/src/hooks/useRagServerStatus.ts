/**
 * React hook for monitoring RAG Server connection status
 */

import { useState, useEffect, useCallback } from 'react'

export interface RAGServerStatus {
  connected: boolean
  url: string
  lastCheck: Date | null
  error: string | null
  tools: string[]
}

export function useRagServerStatus() {
  const [status, setStatus] = useState<RAGServerStatus>({
    connected: false,
    url: 'http://localhost:3000',
    lastCheck: null,
    error: null,
    tools: []
  })
  const [isLoading, setIsLoading] = useState(false)

  // Fetch current status from main process
  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('rag-server:get-status')
      if (result?.success) {
        setStatus(result.data)
      } else {
        console.warn('Failed to get RAG server status:', result?.error)
      }
    } catch (error) {
      console.error('Error fetching RAG server status:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Trigger reconnection
  const reconnect = useCallback(async (): Promise<boolean> => {
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('rag-server:reconnect')
      if (result?.success) {
        setStatus(result.data.status)
        return result.data.success
      } else {
        console.warn('Failed to reconnect to RAG server:', result?.error)
        return false
      }
    } catch (error) {
      console.error('Error reconnecting to RAG server:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Test RAG server search functionality
  const testSearch = useCallback(async (query: string = 'test query') => {
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('rag-server:test-search', query)
      if (result?.success) {
        return result.data
      } else {
        console.warn('RAG server test search failed:', result?.error)
        throw new Error(result?.error || 'Test search failed')
      }
    } catch (error) {
      console.error('Error testing RAG server search:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Auto-refresh status periodically
  useEffect(() => {
    // Initial fetch
    fetchStatus()

    // Set up periodic refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000)

    return () => clearInterval(interval)
  }, [fetchStatus])

  return {
    status,
    isLoading,
    fetchStatus,
    reconnect,
    testSearch,
    // Convenience getters
    isConnected: status.connected,
    hasSearchTools: status.connected && status.tools.includes('search_documents'),
    lastCheckTime: status.lastCheck,
    connectionError: status.error
  }
}