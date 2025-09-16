import { ipcMain } from 'electron'
import { getLangGraphAgent, initializeAgentSystem, cleanupAgentSystem } from '../index'
import { AgentConfig } from '../types/agent.types'
import { AGENT_IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { getMCPLoaderService, MCPServerConfig } from '../services/mcp-loader.service'
import { getInitializationManager } from '../services/initialization-manager.service'

/**
 * IPC Handlers for Agent System
 */

// Agent system initialization
ipcMain.handle(AGENT_IPC_CHANNELS.INITIALIZE, async (_event, config?: Partial<AgentConfig>) => {
  try {
    const system = await initializeAgentSystem({
      agent: config,
    })
    return {
      success: true,
      data: {
        initialized: true,
        availableTools: system.agent.getAvailableTools().length,
      },
    }
  } catch (error) {
    console.error('LangGraph Agent initialization failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Process user query
ipcMain.handle(
  AGENT_IPC_CHANNELS.PROCESS_QUERY,
  async (
    _event,
    query: string,
    conversationId?: string,
    options?: { maxIterations?: number; temperature?: number; model?: string }
  ) => {
    console.log('🔌 IPC: Processing query request:', {
      query: query.substring(0, 100),
      conversationId,
      options,
    })

    try {
      const agent = getLangGraphAgent()

      // Check agent state before processing
      if (!agent) {
        console.error('❌ IPC: Agent instance not available')
        return {
          success: false,
          error: 'Agent system not available. Please restart the application.',
        }
      }

      console.log('▶️ IPC: Calling agent.processQuery')
      const result = await agent.processQuery(query, conversationId, options)

      console.log('✅ IPC: Query processing completed:', {
        success: result.success,
        hasResponse: !!result.response,
        toolsUsed: result.toolsUsed?.length || 0,
        executionTime: result.totalExecutionTime,
      })

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error('❌ IPC: LangGraph Agent query processing failed:', error)

      // Provide more detailed error information
      let errorMessage = 'Unknown error occurred during query processing'
      let shouldReinitialize = false

      if (error instanceof Error) {
        errorMessage = error.message

        // Check if this is a critical error that requires reinitialization
        if (
          error.message.includes('not initialized') ||
          error.message.includes('Agent not available') ||
          error.message.includes('connection')
        ) {
          shouldReinitialize = true
        }
      }

      return {
        success: false,
        error: errorMessage,
        metadata: {
          shouldReinitialize,
          timestamp: new Date().toISOString(),
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        },
      }
    }
  }
)

// Get available tools
ipcMain.handle(AGENT_IPC_CHANNELS.GET_AVAILABLE_TOOLS, async () => {
  try {
    const agent = getLangGraphAgent()
    const tools = agent.getAvailableTools()

    return {
      success: true,
      data: tools,
    }
  } catch (error) {
    console.error('Failed to get available tools:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Update agent configuration
ipcMain.handle(AGENT_IPC_CHANNELS.UPDATE_CONFIG, async (_, config: Partial<AgentConfig>) => {
  try {
    const agent = getLangGraphAgent()
    agent.updateConfig(config)

    return {
      success: true,
      data: agent.getConfig(),
    }
  } catch (error) {
    console.error('Failed to update agent config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Get agent configuration
ipcMain.handle(AGENT_IPC_CHANNELS.GET_CONFIG, async () => {
  try {
    const agent = getLangGraphAgent()
    const config = agent.getConfig()

    return {
      success: true,
      data: config,
    }
  } catch (error) {
    console.error('Failed to get agent config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Health check
ipcMain.handle(AGENT_IPC_CHANNELS.HEALTH_CHECK, async () => {
  console.log('🔌 IPC: Health check requested')

  try {
    // Simple health check - try to get agent and check if initialized
    const agent = getLangGraphAgent()
    console.log('🏥 IPC: Agent instance obtained, checking health...')

    // Test Ollama connection with timeout
    let ollamaHealthy = false
    let availableModels: string[] = []

    try {
      const ollamaResponse = await Promise.race([
        fetch('http://localhost:11434/api/version'),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Ollama health check timeout')), 5000)
        ),
      ])
      ollamaHealthy = ollamaResponse.ok
      console.log('🏥 IPC: Ollama health check:', ollamaHealthy ? 'healthy' : 'unhealthy')

      // Get available models
      if (ollamaHealthy) {
        try {
          const modelsResponse = await Promise.race([
            fetch('http://localhost:11434/api/tags'),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error('Models fetch timeout')), 5000)
            ),
          ])
          if (modelsResponse.ok) {
            const modelsData = (await modelsResponse.json()) as { models?: Array<{ name: string }> }
            availableModels = modelsData.models?.map((m) => m.name) || []
            console.log('🏥 IPC: Available models:', availableModels.length)
          }
        } catch (modelsError) {
          console.warn('⚠️ IPC: Failed to fetch models:', modelsError)
        }
      }
    } catch (ollamaError) {
      console.warn('⚠️ IPC: Ollama health check failed:', ollamaError)
    }

    const availableTools = agent ? agent.getAvailableTools().length : 0
    const config = agent ? agent.getConfig() : null

    console.log('✅ IPC: Health check completed:', {
      ollamaHealthy,
      availableModels: availableModels.length,
      availableTools,
      hasConfig: !!config,
    })

    return {
      success: true,
      data: {
        ollamaHealthy,
        availableModels,
        availableTools,
        config,
        timestamp: new Date().toISOString(),
        agentInitialized: !!agent,
      },
    }
  } catch (error) {
    console.error('❌ IPC: LangGraph Agent health check failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: {
        ollamaHealthy: false,
        availableModels: [],
        availableTools: 0,
        timestamp: new Date().toISOString(),
        agentInitialized: false,
      },
    }
  }
})

// Cleanup agent system
ipcMain.handle(AGENT_IPC_CHANNELS.CLEANUP, async () => {
  try {
    await cleanupAgentSystem()
    return {
      success: true,
    }
  } catch (error) {
    console.error('Agent cleanup failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Get initialization status
ipcMain.handle(AGENT_IPC_CHANNELS.GET_INIT_STATUS, async () => {
  try {
    const initManager = getInitializationManager()
    const status = initManager.getStatus()

    return {
      success: true,
      data: status,
    }
  } catch (error) {
    console.error('Failed to get initialization status:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Check if system is ready
ipcMain.handle(AGENT_IPC_CHANNELS.IS_SYSTEM_READY, async () => {
  try {
    const initManager = getInitializationManager()
    const isReady = initManager.isSystemReady()

    return {
      success: true,
      data: { isReady },
    }
  } catch (error) {
    console.error('Failed to check system readiness:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Get MCP servers status
ipcMain.handle('agent:get-mcp-servers', async () => {
  try {
    const mcpLoader = getMCPLoaderService()

    const connections = mcpLoader.getConnections()
    const availableTools = mcpLoader.getTools()
    const status = mcpLoader.getStatus()

    // Clean connections data to avoid serialization issues
    const cleanConnections = connections.map((conn) => ({
      id: conn.config.id,
      name: conn.config.name,
      description: conn.config.description,
      status: conn.status,
      toolCount: conn.tools?.length || 0,
      connectedAt: conn.connectedAt,
      lastError: conn.error,
      // Remove non-serializable fields like client, transport, tools
    }))

    return {
      success: true,
      data: {
        servers: cleanConnections,
        totalServers: cleanConnections.length,
        connectedServers: cleanConnections.filter((s) => s.status === 'connected').length,
        totalTools: availableTools.length,
      },
    }
  } catch (error) {
    console.error('Failed to get MCP servers:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Add MCP server
ipcMain.handle('agent:add-mcp-server', async (_, serverConfig: MCPServerConfig) => {
  try {
    const mcpLoader = getMCPLoaderService()

    mcpLoader.addServer(serverConfig)

    return {
      success: true,
      data: serverConfig,
    }
  } catch (error) {
    console.error('Failed to add MCP server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Remove MCP server
ipcMain.handle('agent:remove-mcp-server', async (_, serverId: string) => {
  try {
    const mcpLoader = getMCPLoaderService()

    await mcpLoader.removeServer(serverId)

    return {
      success: true,
      data: { serverId },
    }
  } catch (error) {
    console.error('Failed to remove MCP server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Connect to MCP server
ipcMain.handle('agent:connect-mcp-server', async (_, serverId: string) => {
  try {
    const mcpLoader = getMCPLoaderService()

    await mcpLoader.connectServer(serverId)

    return {
      success: true,
      data: { serverId, connected: true },
    }
  } catch (error) {
    console.error('Failed to connect MCP server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Disconnect from MCP server
ipcMain.handle('agent:disconnect-mcp-server', async (_, serverId: string) => {
  try {
    const mcpLoader = getMCPLoaderService()

    await mcpLoader.disconnectServer(serverId)

    return {
      success: true,
      data: { serverId, connected: false },
    }
  } catch (error) {
    console.error('Failed to disconnect MCP server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Update MCP server
ipcMain.handle(
  'agent:update-mcp-server',
  async (_, serverId: string, updates: Partial<MCPServerConfig>) => {
    try {
      const mcpLoader = getMCPLoaderService()

      await mcpLoader.updateServer(serverId, updates)

      return {
        success: true,
        data: { serverId, updates },
      }
    } catch (error) {
      console.error('Failed to update MCP server:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
)

// Test simple query (without conversation persistence)
ipcMain.handle(AGENT_IPC_CHANNELS.TEST_QUERY, async (_, query: string) => {
  try {
    // Simple test using direct Ollama call
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3:1.7b',
        prompt: query,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 256,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      data: {
        response: result.response,
        model: result.model,
        totalDuration: result.total_duration,
        loadDuration: result.load_duration,
        evalDuration: result.eval_duration,
      },
    }
  } catch (error) {
    console.error('Agent test query failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

console.log('🔌 LangGraph Agent IPC handlers registered')
