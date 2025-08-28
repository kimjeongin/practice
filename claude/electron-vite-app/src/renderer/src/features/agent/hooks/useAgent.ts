import { useState, useCallback } from 'react'

// Types for Agent API
interface AgentConfig {
  type?: 'main' | 'reasoning' | 'fast'
  model?: string
  temperature?: number
  maxTokens?: number
}

interface AgentExecutionResult {
  success: boolean
  response: string
  conversationId: string
  toolsUsed: Array<{
    toolName: string
    serverId: string
    parameters: Record<string, any>
    result: any
    executionTime: number
  }>
  totalExecutionTime: number
  iterations: number
  error?: string
}

interface AgentHealthStatus {
  ollamaHealthy: boolean
  availableModels: string[]
  availableTools: number
  config?: AgentConfig
}

/**
 * React hook for interacting with the Agent System via IPC
 */
export function useAgent() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthStatus, setHealthStatus] = useState<AgentHealthStatus | null>(null)

  // Initialize agent system
  const initialize = useCallback(async (config?: AgentConfig) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await window.api.agent.initialize(config)

      if (result.success) {
        setIsInitialized(true)
        // After initialization, get health status
        await checkHealth()
      } else {
        setError(result.error || 'Failed to initialize agent system')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Process user query
  const processQuery = useCallback(
    async (
      query: string,
      conversationId?: string,
      options?: { maxIterations?: number; temperature?: number; model?: string }
    ): Promise<AgentExecutionResult | null> => {
      console.log('🔄 processQuery called:', {
        query: query.substring(0, 50),
        conversationId,
        isInitialized,
        isLoading,
      })

      if (!isInitialized) {
        console.warn('⚠️ Agent system not initialized, attempting to reinitialize...')
        try {
          await initialize()
          if (!isInitialized) {
            const errorMsg = 'Agent system not initialized and reinitialization failed'
            setError(errorMsg)
            return null
          }
        } catch (reinitError) {
          const errorMsg = 'Failed to reinitialize agent system'
          console.error('❌ Reinitialization failed:', reinitError)
          setError(errorMsg)
          return null
        }
      }

      if (isLoading) {
        console.warn('⚠️ processQuery called while already loading, ignoring request')
        return null
      }

      setIsLoading(true)
      setError(null)
      console.log('▶️ Starting query processing...')

      // Add timeout mechanism
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query processing timeout after 60 seconds')), 60000)
      })

      try {
        const resultPromise = window.api.agent.processQuery(query, conversationId, options)
        const result = await Promise.race([resultPromise, timeoutPromise])

        console.log('✅ Query processing result:', {
          success: result.success,
          hasData: !!result.data,
        })

        if (result.success) {
          return result.data || null
        } else {
          const errorMsg = result.error || 'Failed to process query'
          console.error('❌ Query processing failed:', errorMsg)

          // Check if we should reinitialize based on server response
          if ((result as any).metadata?.shouldReinitialize) {
            console.warn('🔄 Server suggests reinitialization, marking as uninitialized')
            setIsInitialized(false)
          }

          setError(errorMsg)
          return null
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ Query processing error:', error)
        setError(errorMessage)
        return null
      } finally {
        console.log('🏁 Query processing completed, resetting loading state')
        setIsLoading(false)
      }
    },
    [isInitialized, isLoading, initialize]
  )

  // Test simple query (for basic testing)
  const testQuery = useCallback(async (query: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await window.api.agent.testQuery(query)

      if (result.success) {
        return result.data || null
      } else {
        setError(result.error || 'Test query failed')
        return null
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Get available tools
  const getAvailableTools = useCallback(async () => {
    if (!isInitialized) {
      return []
    }

    try {
      const result = await window.api.agent.getAvailableTools()

      if (result.success) {
        return result.data || null
      } else {
        console.warn('Failed to get available tools:', result.error)
        return []
      }
    } catch (error) {
      console.warn('Error getting available tools:', error)
      return []
    }
  }, [isInitialized])

  // Update agent configuration
  const updateConfig = useCallback(
    async (config: Partial<AgentConfig>) => {
      if (!isInitialized) {
        setError('Agent system not initialized')
        return
      }

      try {
        const result = await window.api.agent.updateConfig(config)

        if (!result.success) {
          setError(result.error || 'Failed to update configuration')
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Unknown error')
      }
    },
    [isInitialized]
  )

  // Get current configuration
  const getConfig = useCallback(async (): Promise<AgentConfig | null> => {
    if (!isInitialized) {
      return null
    }

    try {
      const result = await window.api.agent.getConfig()

      if (result.success) {
        return result.data || null
      } else {
        console.warn('Failed to get configuration:', result.error)
        return null
      }
    } catch (error) {
      console.warn('Error getting configuration:', error)
      return null
    }
  }, [isInitialized])

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const result = await window.api.agent.healthCheck()

      if (result.success) {
        setHealthStatus(result.data || null)
        return result.data || null
      } else {
        setHealthStatus({
          ollamaHealthy: false,
          availableModels: [],
          availableTools: 0,
        })
        setError(result.error || 'Health check failed')
        return null
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
      setHealthStatus({
        ollamaHealthy: false,
        availableModels: [],
        availableTools: 0,
      })
      return null
    }
  }, [])

  // Cleanup
  const cleanup = useCallback(async () => {
    try {
      await window.api.agent.cleanup()
      setIsInitialized(false)
      setHealthStatus(null)
    } catch (error) {
      console.warn('Cleanup error:', error)
    }
  }, [])

  // Clear error and reset states if needed
  const clearError = useCallback(() => {
    console.log('🧹 Clearing error and resetting states')
    setError(null)
    // Also reset loading state if it's stuck
    setIsLoading(false)
  }, [])

  return {
    // State
    isInitialized,
    isLoading,
    error,
    healthStatus,

    // Actions
    initialize,
    processQuery,
    testQuery,
    getAvailableTools,
    updateConfig,
    getConfig,
    checkHealth,
    cleanup,
    clearError,
  }
}
