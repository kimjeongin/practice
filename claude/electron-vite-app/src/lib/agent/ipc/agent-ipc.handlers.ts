import { ipcMain } from 'electron'
import { getAgentOrchestrator, initializeAgentSystem, cleanupAgentSystem } from '../index'
import { AgentConfig } from '../types/agent.types'
import { AGENT_IPC_CHANNELS } from '@shared/constants/ipc-channels'

/**
 * IPC Handlers for Agent System
 */

// Agent system initialization
ipcMain.handle(AGENT_IPC_CHANNELS.INITIALIZE, async (_event, config?: Partial<AgentConfig>) => {
  try {
    const system = await initializeAgentSystem({
      agent: config
    })
    return {
      success: true,
      data: {
        initialized: true,
        availableTools: system.orchestrator.getAvailableTools().length
      }
    }
  } catch (error) {
    console.error('Agent initialization failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Process user query
ipcMain.handle(AGENT_IPC_CHANNELS.PROCESS_QUERY, async (
  _event, 
  query: string, 
  conversationId?: string,
  options?: { maxIterations?: number; temperature?: number; model?: string }
) => {
  try {
    const orchestrator = getAgentOrchestrator()
    const result = await orchestrator.processQuery(query, conversationId, options)
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Agent query processing failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Get available tools
ipcMain.handle(AGENT_IPC_CHANNELS.GET_AVAILABLE_TOOLS, async (_event) => {
  try {
    const orchestrator = getAgentOrchestrator()
    const tools = orchestrator.getAvailableTools()
    
    return {
      success: true,
      data: tools
    }
  } catch (error) {
    console.error('Failed to get available tools:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Update agent configuration
ipcMain.handle(AGENT_IPC_CHANNELS.UPDATE_CONFIG, async (_event, config: Partial<AgentConfig>) => {
  try {
    const orchestrator = getAgentOrchestrator()
    orchestrator.updateConfig(config)
    
    return {
      success: true,
      data: orchestrator.getConfig()
    }
  } catch (error) {
    console.error('Failed to update agent config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Get agent configuration
ipcMain.handle(AGENT_IPC_CHANNELS.GET_CONFIG, async (_event) => {
  try {
    const orchestrator = getAgentOrchestrator()
    const config = orchestrator.getConfig()
    
    return {
      success: true,
      data: config
    }
  } catch (error) {
    console.error('Failed to get agent config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Health check
ipcMain.handle(AGENT_IPC_CHANNELS.HEALTH_CHECK, async (_event) => {
  try {
    // Simple health check - try to get orchestrator and check if initialized
    const orchestrator = getAgentOrchestrator()
    
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
        availableTools: orchestrator.getAvailableTools().length,
        config: orchestrator.getConfig()
      }
    }
  } catch (error) {
    console.error('Agent health check failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: {
        ollamaHealthy: false,
        availableModels: [],
        availableTools: 0
      }
    }
  }
})

// Cleanup agent system
ipcMain.handle(AGENT_IPC_CHANNELS.CLEANUP, async (_event) => {
  try {
    await cleanupAgentSystem()
    return {
      success: true
    }
  } catch (error) {
    console.error('Agent cleanup failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: query,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 512
        }
      })
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
        evalDuration: result.eval_duration
      }
    }
  } catch (error) {
    console.error('Agent test query failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

console.log('🔌 Agent IPC handlers registered')