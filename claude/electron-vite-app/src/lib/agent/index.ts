/**
 * Agent System Entry Point
 * Provides easy access to all agent services and orchestrator
 */

// Services
export { OllamaService, getOllamaService, initializeOllamaService } from './services/ollama.service'
export { EnhancedMCPManager, getEnhancedMCPManager } from './services/enhanced-mcp-manager.service'
export { ConversationManager, getConversationManager, initializeConversationManager } from './services/conversation-manager.service'
export { AgentOrchestrator, getAgentOrchestrator, initializeAgentOrchestrator } from './services/agent-orchestrator.service'

// Types
export type {
  OllamaModel,
  AgentType,
  AgentConfig,
  ToolSelectionDecision,
  ContinueDecision,
  AgentMessage,
  AgentContext,
  AgentExecutionResult,
  AgentState,
  EnhancedTransportType,
  EnhancedServerConfig
} from './types/agent.types'

// Prompts (for external usage if needed)
export {
  createToolSelectionSystemPrompt,
  createToolSelectionPrompt,
  createContinueDecisionSystemPrompt,
  createContinueDecisionPrompt,
  createFinalResponseSystemPrompt,
  createFinalResponsePrompt
} from './prompts/agent-prompts'

/**
 * Initialize the complete agent system
 */
export async function initializeAgentSystem(config?: {
  ollama?: {
    baseUrl?: string
    timeout?: number
  }
  agent?: {
    type?: 'main' | 'reasoning' | 'fast'
    model?: string
    temperature?: number
    maxTokens?: number
  }
}): Promise<{
  orchestrator: any
  services: {
    ollama: any
    mcp: any
    conversation: any
  }
}> {
  console.log('🚀 Initializing Agent System...')

  try {
    // Initialize Ollama service
    const { getOllamaService } = await import('./services/ollama.service')
    const ollamaService = getOllamaService()
    if (config?.ollama) {
      // If custom config provided, create new instance
      // Note: This is simplified - in practice you'd want better config management
    }

    // Initialize services in order
    const healthCheck = await ollamaService.healthCheck()
    if (!healthCheck) {
      throw new Error('Ollama service is not available. Please ensure Ollama is running.')
    }

    await ollamaService.listModels()

    // Initialize conversation manager
    const { initializeConversationManager } = await import('./services/conversation-manager.service')
    const conversationManager = await initializeConversationManager()

    // Initialize MCP manager
    const { getEnhancedMCPManager } = await import('./services/enhanced-mcp-manager.service')
    const mcpManager = getEnhancedMCPManager()

    // Initialize agent orchestrator
    const { initializeAgentOrchestrator } = await import('./services/agent-orchestrator.service')
    const orchestrator = await initializeAgentOrchestrator(config?.agent as any)

    console.log('✅ Agent System initialized successfully')

    return {
      orchestrator,
      services: {
        ollama: ollamaService,
        mcp: mcpManager,
        conversation: conversationManager
      }
    }

  } catch (error) {
    console.error('❌ Failed to initialize Agent System:', error)
    throw error
  }
}

/**
 * Quick test function for the agent system
 */
export async function testAgentSystem(): Promise<void> {
  console.log('🧪 Testing Agent System...')

  try {
    const system = await initializeAgentSystem()

    // Test 1: Basic health checks
    const ollamaHealth = await system.services.ollama.healthCheck()
    console.log(`Ollama Health: ${ollamaHealth ? '✅' : '❌'}`)

    // Test 2: List available models
    const models = await system.services.ollama.listModels()
    console.log(`Available Models: ${models.map(m => m.name).join(', ')}`)

    // Test 3: Create test conversation
    const conversationId = await system.services.conversation.createConversation('Test Conversation')
    console.log(`Test Conversation Created: ${conversationId}`)

    // Test 4: Simple query processing (without MCP servers for now)
    console.log('Testing simple query processing...')
    const result = await system.orchestrator.processQuery(
      'Hello! Please introduce yourself and tell me what you can do.',
      conversationId
    )

    console.log('Agent Response:', result.response)
    console.log(`Execution Time: ${result.totalExecutionTime}ms`)
    console.log(`Iterations: ${result.iterations}`)
    console.log(`Tools Used: ${result.toolsUsed.length}`)

    console.log('✅ Agent System test completed successfully')

  } catch (error) {
    console.error('❌ Agent System test failed:', error)
    throw error
  }
}

/**
 * Demo function showing agent capabilities (RAG server connection removed)
 */
export async function demoAgentCapabilities(): Promise<void> {
  console.log('🎭 Running Agent Capabilities Demo...')

  try {
    const system = await initializeAgentSystem()

    // Get available tools from any connected MCP servers
    const tools = system.services.mcp.getAllTools()
    console.log(`Available Tools: ${tools.map(t => `${t.name} (${t.serverName})`).join(', ')}`)

    // Create demo conversation
    const conversationId = await system.services.conversation.createConversation('Agent Demo')

    // Test with a general query
    const result = await system.orchestrator.processQuery(
      'Hello! Please tell me what tools you have available and what you can help me with.',
      conversationId,
      { maxIterations: 3 }
    )

    console.log('Demo Results:')
    console.log('Response:', result.response)
    console.log(`Tools Used: ${result.toolsUsed.length}`)
    result.toolsUsed.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.toolName} (${tool.executionTime}ms)`)
    })

    console.log('✅ Agent Demo completed successfully')

  } catch (error) {
    console.error('❌ Agent Demo failed:', error)
    throw error
  }
}

/**
 * Cleanup all agent services
 */
export async function cleanupAgentSystem(): Promise<void> {
  console.log('🧹 Cleaning up Agent System...')

  try {
    const { getAgentOrchestrator } = await import('./services/agent-orchestrator.service')
    const orchestrator = getAgentOrchestrator()
    await orchestrator.cleanup()

    console.log('✅ Agent System cleanup completed')

  } catch (error) {
    console.error('❌ Agent System cleanup failed:', error)
  }
}