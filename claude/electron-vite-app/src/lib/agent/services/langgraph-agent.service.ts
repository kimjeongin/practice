import { EventEmitter } from 'events'
import { ChatOllama } from '@langchain/ollama'
import { AgentExecutionResult, AgentConfig } from '../types/agent.types'
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
      ...config,
    }

    this.model = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: this.config.model!,
      temperature: this.config.temperature,
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
        availableTools: this.getAvailableTools().length,
      })
    } catch (error) {
      console.error('❌ Failed to initialize LangGraph Agent:', error)
      throw error
    }
  }

  /**
   * Process a user query with tool selection and execution
   */
  async processQuery(
    query: string,
    conversationId?: string,
    options: { maxIterations?: number; temperature?: number; model?: string } = {}
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now()
    const maxIterations = options.maxIterations || 5
    const toolsUsed: Array<{
      toolName: string
      serverId: string
      parameters: Record<string, any>
      result: any
      executionTime: number
    }> = []

    console.log(`🚀 LangGraphAgentService.processQuery started:`, {
      query: query.substring(0, 100),
      conversationId,
      isInitialized: this.isInitialized,
      options,
    })

    try {
      if (!this.isInitialized) {
        console.error('❌ Agent not initialized, attempting to reinitialize...')
        try {
          await this.initialize()
          if (!this.isInitialized) {
            throw new Error('Agent reinitialization failed')
          }
        } catch (reinitError) {
          console.error('❌ Agent reinitialization failed:', reinitError)
          throw new Error('Agent not initialized and reinitialization failed')
        }
      }

      console.log(`🤔 Processing query: "${query.substring(0, 50)}..."`)

      // Create or get conversation
      let convId = conversationId
      if (!convId && this.conversationManager) {
        try {
          convId = await this.conversationManager.createConversation(
            `Query: ${query.substring(0, 30)}...`
          )
          console.log(`📝 Created new conversation: ${convId}`)
        } catch (convError) {
          console.warn(
            '⚠️ Failed to create conversation, continuing without persistence:',
            convError
          )
        }
      }

      // Get available tools
      const availableTools = this.getAvailableTools()
      console.log(`🔧 Available tools: ${availableTools.length}`)

      let currentQuery = query
      let finalResponse = ''
      let iteration = 0

      // Iterative tool selection and execution
      while (iteration < maxIterations) {
        iteration++
        console.log(`🔄 Iteration ${iteration}/${maxIterations}`)

        try {
          // Analyze query and decide on tool usage
          const decision = await this.analyzeAndDecide(currentQuery, availableTools, toolsUsed)
          console.log(`🎯 Decision: ${decision.action}`, {
            toolName: decision.toolName,
            reasoning: decision.reasoning,
          })

          if (decision.action === 'respond') {
            // Generate final response
            finalResponse = await this.generateResponse(currentQuery, availableTools, toolsUsed)
            break
          } else if (decision.action === 'use_tool') {
            // Execute tool
            console.log(`🔧 Executing tool: ${decision.toolName}`)
            const toolResult = await this.executeTool(decision.toolName!, decision.parameters!)
            toolsUsed.push(toolResult)

            // Update query context with tool result
            currentQuery = `${currentQuery}\n\nTool "${decision.toolName}" result: ${JSON.stringify(toolResult.result, null, 2)}`

            // Check if we should continue or respond
            const continueDecision = await this.shouldContinue(currentQuery, toolsUsed)
            console.log(`🤔 Continue decision:`, continueDecision)

            if (!continueDecision.continue) {
              finalResponse = await this.generateResponse(currentQuery, availableTools, toolsUsed)
              break
            }
          } else if (decision.action === 'clarify') {
            finalResponse = `I need more information to help you: ${decision.reasoning}`
            break
          }
        } catch (iterationError) {
          console.error(`❌ Error in iteration ${iteration}:`, iterationError)
          // Continue to next iteration or break if critical
          if (iteration >= maxIterations - 1) {
            finalResponse = await this.generateResponse(currentQuery, availableTools, toolsUsed)
            break
          }
        }
      }

      // If we hit max iterations, generate a response anyway
      if (iteration >= maxIterations && !finalResponse) {
        console.log('⚠️ Reached maximum iterations, generating final response')
        try {
          finalResponse = await this.generateResponse(currentQuery, availableTools, toolsUsed)
        } catch (responseError) {
          console.error('❌ Failed to generate final response:', responseError)
          finalResponse =
            'I apologize, but I encountered difficulties processing your request. Please try rephrasing or try again.'
        }
      }

      // Store in conversation if manager available
      if (this.conversationManager && convId) {
        try {
          await this.conversationManager.addMessage(convId, {
            id: Date.now().toString(),
            role: 'user',
            content: query,
            conversationId: convId,
          })

          await this.conversationManager.addMessage(convId, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: finalResponse,
            conversationId: convId,
          })
        } catch (persistError) {
          console.warn('⚠️ Failed to persist conversation messages:', persistError)
        }
      }

      const totalTime = Date.now() - startTime
      console.log(`✅ Query processing completed in ${totalTime}ms`)

      return {
        success: true,
        response: finalResponse,
        conversationId: convId || 'default',
        toolsUsed: toolsUsed,
        totalExecutionTime: totalTime,
        iterations: iteration,
      }
    } catch (error) {
      const totalTime = Date.now() - startTime
      console.error('❌ Query processing failed:', error)

      // Reset internal state on critical errors
      if (
        error instanceof Error &&
        (error.message.includes('not initialized') ||
          error.message.includes('connection') ||
          error.message.includes('timeout'))
      ) {
        console.log('🔄 Resetting agent state due to critical error')
        this.isInitialized = false
      }

      return {
        success: false,
        response: 'Sorry, I encountered an error processing your request. Please try again.',
        conversationId: conversationId || 'default',
        toolsUsed: toolsUsed,
        totalExecutionTime: totalTime,
        iterations: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get available tools from MCP loader
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    if (!this.mcpLoader) return []

    return this.mcpLoader.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description || 'No description available',
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
        temperature: this.config.temperature,
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
   * Analyze query and decide on tool usage
   */
  private async analyzeAndDecide(
    query: string,
    availableTools: Array<{ name: string; description: string }>,
    toolsUsed: any[]
  ): Promise<{
    action: 'use_tool' | 'respond' | 'clarify'
    toolName?: string
    parameters?: Record<string, any>
    reasoning: string
  }> {
    const systemPrompt = `You are an AI agent that can analyze user queries and decide whether to use tools or respond directly.

Available Tools:
${availableTools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')}

Tools already used in this conversation: ${toolsUsed.map((t) => t.toolName).join(', ') || 'None'}

Analyze the user query and respond with a JSON object containing:
{
  "action": "use_tool" | "respond" | "clarify",
  "toolName": "tool_name_if_using_tool",
  "parameters": {"key": "value"} (if using tool),
  "reasoning": "explanation of decision"
}

Guidelines:
- Use "use_tool" if the query requires tool execution and you haven't already used that specific tool for this exact purpose
- Use "respond" if you can answer directly or have sufficient tool results
- Use "clarify" if the query is ambiguous
- Consider what tools have already been used to avoid redundancy`

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `Query: ${query}` },
      ]

      const response = await this.model.invoke(messages)
      const responseText =
        typeof response.content === 'string' ? response.content : String(response.content)

      // Try to parse JSON response
      try {
        return JSON.parse(responseText)
      } catch {
        // Fallback if JSON parsing fails
        if (responseText.toLowerCase().includes('tool') && availableTools.length > 0) {
          return {
            action: 'use_tool',
            toolName: availableTools[0].name,
            parameters: {},
            reasoning: 'Fallback tool selection due to parsing error',
          }
        }
        return {
          action: 'respond',
          reasoning: 'Could not parse decision, defaulting to direct response',
        }
      }
    } catch (error) {
      console.error('Error in decision making:', error)
      return {
        action: 'respond',
        reasoning: 'Error in decision making, providing direct response',
      }
    }
  }

  /**
   * Execute a tool with given parameters
   */
  private async executeTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<{
    toolName: string
    serverId: string
    parameters: Record<string, any>
    result: any
    executionTime: number
  }> {
    const startTime = Date.now()

    try {
      if (!this.mcpLoader) {
        throw new Error('MCP Loader not available')
      }

      console.log(`🔧 Executing tool: ${toolName}`)

      // Find the tool in available tools
      const availableTools = this.mcpLoader.getTools()
      const tool = availableTools.find((t) => t.name === toolName)

      if (!tool) {
        throw new Error(`Tool ${toolName} not found`)
      }

      // Execute the tool via MCP loader
      const result = await this.mcpLoader.executeTool(toolName, parameters)

      const executionTime = Date.now() - startTime
      console.log(`✅ Tool ${toolName} executed in ${executionTime}ms`)

      return {
        toolName,
        serverId: (tool as any).serverId || 'unknown',
        parameters,
        result,
        executionTime,
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      console.error(`❌ Tool execution failed: ${error}`)

      return {
        toolName,
        serverId: 'unknown',
        parameters,
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
        executionTime,
      }
    }
  }

  /**
   * Decide whether to continue with more tool usage
   */
  private async shouldContinue(
    query: string,
    toolsUsed: any[]
  ): Promise<{ continue: boolean; reasoning: string }> {
    if (toolsUsed.length >= 3) {
      return { continue: false, reasoning: 'Maximum tools used, should respond now' }
    }

    const systemPrompt = `Based on the user query and tools already used, decide whether to continue using more tools or respond to the user.

Tools used: ${toolsUsed.map((t) => `${t.toolName} (result: ${JSON.stringify(t.result)})`).join('; ')}

Respond with JSON:
{
  "continue": true/false,
  "reasoning": "explanation"
}`

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: query },
      ]

      const response = await this.model.invoke(messages)
      const responseText =
        typeof response.content === 'string' ? response.content : String(response.content)

      try {
        return JSON.parse(responseText)
      } catch {
        return { continue: false, reasoning: 'Fallback: stopping to provide response' }
      }
    } catch (error) {
      console.error('Error in continue decision:', error)
      return { continue: false, reasoning: 'Error in decision making' }
    }
  }

  /**
   * Generate final response based on query and tool results
   */
  private async generateResponse(
    query: string,
    availableTools: Array<{ name: string; description: string }>,
    toolsUsed: any[]
  ): Promise<string> {
    const systemPrompt = this.createSystemPrompt(availableTools, toolsUsed)

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: query },
      ]

      const response = await this.model.invoke(messages)
      return typeof response.content === 'string' ? response.content : String(response.content)
    } catch (error) {
      console.error('Error generating response:', error)
      return 'I apologize, but I encountered an error while generating a response.'
    }
  }

  /**
   * Create system prompt with tool information and usage history
   */
  private createSystemPrompt(
    tools: Array<{ name: string; description: string }>,
    toolsUsed: any[] = []
  ): string {
    const toolsList =
      tools.length > 0
        ? tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')
        : 'No tools currently available.'

    const toolsUsedInfo =
      toolsUsed.length > 0
        ? `\n\nTools used in this conversation:\n${toolsUsed.map((t) => `- ${t.toolName}: ${JSON.stringify(t.result)}`).join('\n')}`
        : ''

    return `You are a helpful AI assistant powered by Llama 3.1. You can help users with various tasks using available tools.

Available Tools:
${toolsList}${toolsUsedInfo}

Instructions:
- Be helpful, accurate, and concise
- Use the information from executed tools to provide informed responses
- Reference tool results when relevant to answer user questions
- If tools provided useful information, incorporate it into your response
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
export async function initializeLangGraphAgent(
  config?: AgentConfig
): Promise<LangGraphAgentService> {
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
