import { ipcMain } from 'electron'
import { getLangGraphAgent, initializeAgentSystem, cleanupAgentSystem } from '../index'
import { AgentConfig } from '../types/agent.types'
import { AGENT_IPC_CHANNELS } from '@shared/constants/ipc-channels'

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
    try {
      const agent = getLangGraphAgent()
      const result = await agent.processQuery(query, conversationId, options)

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error('LangGraph Agent query processing failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
)

// Get available tools
ipcMain.handle(AGENT_IPC_CHANNELS.GET_AVAILABLE_TOOLS, async (_event) => {
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
ipcMain.handle(AGENT_IPC_CHANNELS.UPDATE_CONFIG, async (_event, config: Partial<AgentConfig>) => {
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
ipcMain.handle(AGENT_IPC_CHANNELS.GET_CONFIG, async (_event) => {
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
ipcMain.handle(AGENT_IPC_CHANNELS.HEALTH_CHECK, async (_event) => {
  try {
    // Simple health check - try to get agent and check if initialized
    const agent = getLangGraphAgent()

    // Test Ollama connection
    const ollamaResponse = await fetch('http://localhost:11434/api/version')
    const ollamaHealthy = ollamaResponse.ok

    // Get available models
    let availableModels: string[] = []
    if (ollamaHealthy) {
      const modelsResponse = await fetch('http://localhost:11434/api/tags')
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json()
        availableModels = modelsData.models?.map((m: any) => m.name) || []
      }
    }

    return {
      success: true,
      data: {
        ollamaHealthy,
        availableModels,
        availableTools: agent.getAvailableTools().length,
        config: agent.getConfig(),
      },
    }
  } catch (error) {
    console.error('LangGraph Agent health check failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: {
        ollamaHealthy: false,
        availableModels: [],
        availableTools: 0,
      },
    }
  }
})

// Cleanup agent system
ipcMain.handle(AGENT_IPC_CHANNELS.CLEANUP, async (_event) => {
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

// Get MCP servers status
ipcMain.handle('agent:get-mcp-servers', async (_event) => {
  try {
    // Get MCP loader service to access server configurations
    const { getMCPLoaderService } = await import('../services/mcp-loader.service')
    const mcpLoader = getMCPLoaderService()
    
    const servers = mcpLoader.getServers()
    const availableTools = mcpLoader.getTools()
    const toolsStats = mcpLoader.getToolsStats()
    
    const serverInfo = servers.map(server => ({
      id: server.name,
      name: server.name,
      status: 'connected', // MCP loader doesn't track individual server status
      toolCount: toolsStats[server.name] || 0,
      transport: server.transport || 'stdio',
      command: server.command,
      url: server.url
    }))

    return {
      success: true,
      data: {
        servers: serverInfo,
        totalServers: servers.length,
        connectedServers: servers.length, // All configured servers are considered connected
        totalTools: availableTools.length
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

// Test simple query (without conversation persistence)
ipcMain.handle(AGENT_IPC_CHANNELS.TEST_QUERY, async (_event, query: string) => {
  try {
    // Simple test using direct Ollama call
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: query,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 512,
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
