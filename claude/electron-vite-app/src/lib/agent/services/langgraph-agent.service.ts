import { EventEmitter } from 'events'
import { ChatOllama } from '@langchain/ollama'
import { 
  AgentExecutionResult, 
  AgentConfig
} from '../types/agent.types'
import { ConversationManager, getConversationManager } from './conversation-manager.service'
import { MCPLoaderService, getMCPLoaderService } from './mcp-loader.service'

/**
 * Simplified LangGraph Agent Service
 * Provides a clean interface for agent operations using Ollama and MCP tools
 */
export class LangGraphAgentService extends EventEmitter {
  private model: ChatOllama
  private config: AgentConfig
  private conversationManager?: ConversationManager
  private mcpLoader?: MCPLoaderService
  private isInitialized = false

  constructor(config: AgentConfig = {}) {
    super()
    this.config = {
      type: 'main',
      model: 'llama3.1:8b',
      temperature: 0.7,
      maxTokens: 1024,
      ...config
    }
    
    this.model = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: this.config.model!,
      temperature: this.config.temperature
    })
  }

  /**
   * Initialize the agent with required services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      console.log('🚀 Initializing LangGraph Agent...')
      
      // Get service instances
      this.conversationManager = getConversationManager()
      this.mcpLoader = getMCPLoaderService()
      
      // Test Ollama connection
      await this.model.invoke([{ role: 'user', content: 'test' }])
      
      this.isInitialized = true
      console.log('✅ LangGraph Agent initialized successfully')
      
      this.emit('initialized', {
        model: this.config.model,
        availableTools: this.getAvailableTools().length
      })
    } catch (error) {
      console.error('❌ Failed to initialize LangGraph Agent:', error)
      throw error
    }
  }

  /**
   * Process a user query
   */
  async processQuery(
    query: string,
    conversationId?: string,
    _options: { maxIterations?: number; temperature?: number; model?: string } = {}
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now()
    
    try {
      if (!this.isInitialized) {
        throw new Error('Agent not initialized')
      }

      console.log(`🤔 Processing query: "${query.substring(0, 50)}..."`)

      // Create or get conversation
      let convId = conversationId
      if (!convId && this.conversationManager) {
        convId = await this.conversationManager.createConversation(`Query: ${query.substring(0, 30)}...`)
      }

      // Get available tools
      const availableTools = this.getAvailableTools()
      
      // Create context-aware prompt
      const systemPrompt = this.createSystemPrompt(availableTools)
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: query }
      ]

      // Generate response
      const response = await this.model.invoke(messages)
      const responseText = typeof response.content === 'string' ? response.content : String(response.content)

      // Store in conversation if manager available
      if (this.conversationManager && convId) {
        await this.conversationManager.addMessage(convId, {
          id: Date.now().toString(),
          role: 'user',
          content: query,
          conversationId: convId
        })
        
        await this.conversationManager.addMessage(convId, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: responseText,
          conversationId: convId
        })
      }

      const totalTime = Date.now() - startTime

      return {
        success: true,
        response: responseText,
        conversationId: convId || 'default',
        toolsUsed: [], // Simple implementation without actual tool execution
        totalExecutionTime: totalTime,
        iterations: 1
      }
    } catch (error) {
      console.error('❌ Query processing failed:', error)
      
      return {
        success: false,
        response: 'Sorry, I encountered an error processing your request.',
        conversationId: conversationId || 'default',
        toolsUsed: [],
        totalExecutionTime: Date.now() - startTime,
        iterations: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get available tools from MCP loader
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    if (!this.mcpLoader) return []
    
    return this.mcpLoader.getTools().map(tool => ({
      name: tool.name,
      description: tool.description || 'No description available'
    }))
  }

  /**
   * Update agent configuration
   */
  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Update model if needed
    if (newConfig.model || newConfig.temperature || newConfig.maxTokens) {
      this.model = new ChatOllama({
        baseUrl: 'http://localhost:11434',
        model: this.config.model!,
        temperature: this.config.temperature
      })
    }
    
    this.emit('config-updated', this.config)
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config }
  }

  /**
   * Create system prompt with tool information
   */
  private createSystemPrompt(tools: Array<{ name: string; description: string }>): string {
    const toolsList = tools.length > 0 
      ? tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')
      : 'No tools currently available.'

    return `You are a helpful AI assistant powered by Llama 3.1. You can help users with various tasks.

Available Tools:
${toolsList}

Instructions:
- Be helpful, accurate, and concise
- If you need to use tools, explain what you're doing
- Always provide clear and useful responses
- If you encounter limitations, explain them clearly`
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up LangGraph Agent...')
    this.isInitialized = false
    this.removeAllListeners()
    console.log('✅ LangGraph Agent cleanup completed')
  }
}

// Singleton instance
let instance: LangGraphAgentService | null = null

/**
 * Get the singleton LangGraph agent instance
 */
export function getLangGraphAgent(): LangGraphAgentService {
  if (!instance) {
    throw new Error('LangGraph Agent not initialized. Call initializeLangGraphAgent() first.')
  }
  return instance
}

/**
 * Initialize the LangGraph agent service
 */
export async function initializeLangGraphAgent(config?: AgentConfig): Promise<LangGraphAgentService> {
  if (instance) {
    console.log('⚠️ LangGraph Agent already initialized')
    return instance
  }

  console.log('🚀 Initializing LangGraph Agent Service...')
  
  instance = new LangGraphAgentService(config)
  await instance.initialize()
  
  console.log('✅ LangGraph Agent Service initialized')
  return instance
}

/**
 * Cleanup the LangGraph agent service
 */
export async function cleanupLangGraphAgent(): Promise<void> {
  if (instance) {
    await instance.cleanup()
    instance = null
  }
}