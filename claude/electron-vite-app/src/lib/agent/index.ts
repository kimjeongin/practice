/**
 * Agent System Entry Point
 * Provides easy access to all agent services and orchestrator
 */

// Services
export {
  ConversationManager,
  getConversationManager,
  initializeConversationManager,
} from './services/conversation-manager.service'
export {
  LangGraphAgentService,
  getLangGraphAgent,
  initializeLangGraphAgent,
} from './services/langgraph-agent.service'
export {
  MCPLoaderService,
  getMCPLoaderService,
  initializeMCPLoaderService,
} from './services/mcp-loader.service'


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
  EnhancedServerConfig,
} from './types/agent.types'

// MCP Types
export type {
  MCPServerConfig,
} from './services/mcp-loader.service'


/**
 * Initialize the complete agent system with LangGraph
 */
export async function initializeAgentSystem(config?: {
  agent?: {
    type?: 'main' | 'reasoning' | 'fast'
    model?: string
    temperature?: number
    maxTokens?: number
  }
}) {
  console.log('🚀 Initializing LangGraph Agent System...')

  try {
    // Initialize conversation manager
    const { initializeConversationManager } = await import(
      './services/conversation-manager.service'
    )
    const conversationManager = await initializeConversationManager()

    // Initialize MCP loader service
    const { initializeMCPLoaderService } = await import('./services/mcp-loader.service')
    const mcpLoaderService = await initializeMCPLoaderService()

    // Initialize LangGraph agent
    const { initializeLangGraphAgent } = await import('./services/langgraph-agent.service')
    const agent = await initializeLangGraphAgent(config?.agent as any)

    console.log('✅ LangGraph Agent System initialized successfully')

    return {
      agent,
      services: {
        mcp: mcpLoaderService,
        conversation: conversationManager,
      },
    }
  } catch (error) {
    console.error('❌ Failed to initialize LangGraph Agent System:', error)
    throw error
  }
}

/**
 * Quick test function for the LangGraph agent system
 */
export async function testAgentSystem(): Promise<void> {
  console.log('🧪 Testing LangGraph Agent System...')

  try {
    const system = await initializeAgentSystem()

    // Test 1: Check available tools
    const tools = system.agent.getAvailableTools()
    console.log(`Available Tools: ${tools.length}`)

    // Test 2: Create test conversation
    const conversationId =
      await system.services.conversation.createConversation('Test Conversation')
    console.log(`Test Conversation Created: ${conversationId}`)

    // Test 3: Simple query processing
    console.log('Testing simple query processing...')
    const result = await system.agent.processQuery(
      'Hello! Please introduce yourself and tell me what you can do.',
      conversationId
    )

    console.log('Agent Response:', result.response)
    console.log(`Execution Time: ${result.totalExecutionTime}ms`)
    console.log(`Iterations: ${result.iterations}`)
    console.log(`Tools Used: ${result.toolsUsed.length}`)

    console.log('✅ LangGraph Agent System test completed successfully')
  } catch (error) {
    console.error('❌ LangGraph Agent System test failed:', error)
    throw error
  }
}

/**
 * Demo function showing LangGraph agent capabilities
 */
export async function demoAgentCapabilities(): Promise<void> {
  console.log('🎭 Running LangGraph Agent Capabilities Demo...')

  try {
    const system = await initializeAgentSystem()

    // Get available tools from MCP loader
    const tools = system.agent.getAvailableTools()
    console.log(`Available Tools: ${tools.map((t) => `${t.name}`).join(', ')}`)

    // Create demo conversation
    const conversationId = await system.services.conversation.createConversation('Agent Demo')

    // Test with a general query
    const result = await system.agent.processQuery(
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

    console.log('✅ LangGraph Agent Demo completed successfully')
  } catch (error) {
    console.error('❌ LangGraph Agent Demo failed:', error)
    throw error
  }
}

/**
 * Cleanup all agent services
 */
export async function cleanupAgentSystem(): Promise<void> {
  console.log('🧹 Cleaning up LangGraph Agent System...')

  try {
    const { getLangGraphAgent } = await import('./services/langgraph-agent.service')
    const agent = getLangGraphAgent()
    await agent.cleanup()

    console.log('✅ LangGraph Agent System cleanup completed')
  } catch (error) {
    console.error('❌ LangGraph Agent System cleanup failed:', error)
  }
}
