import { EventEmitter } from 'events'
import { ChatOllama } from '@langchain/ollama'
import { AgentExecutionResult, AgentConfig } from '../types/agent.types'
import { ConversationManager, getConversationManager } from './conversation-manager.service'
import { MCPLoaderService, getMCPLoaderService } from './mcp-loader.service'
import { getDefaultModel, getModelConfig } from '../../config/model.config'

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
  private isInitializing = false
  private stats: {
    totalQueries: number
    toolUsageCount: Record<string, number>
    averageResponseTime: number
    successfulResponses: number
    errors: number
  }

  constructor(config: AgentConfig = {}) {
    super()

    // Get default model and its configuration
    const defaultModel = getDefaultModel()
    const modelConfig = getModelConfig(config.model || defaultModel)

    this.config = {
      type: 'main',
      model: config.model || defaultModel,
      temperature: config.temperature || modelConfig?.temperature || 0.3,
      maxTokens: config.maxTokens || modelConfig?.maxTokens || 4096,
      ...config,
    }

    this.model = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: this.config.model!,
      temperature: this.config.temperature,
    })

    this.stats = {
      totalQueries: 0,
      toolUsageCount: {},
      averageResponseTime: 0,
      successfulResponses: 0,
      errors: 0,
    }
  }

  /**
   * Initialize the agent with required services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('✅ LangGraph Agent already initialized')
      return
    }

    if (this.isInitializing) {
      console.log('⏳ LangGraph Agent already initializing, waiting...')
      // Wait for current initialization to complete
      return new Promise((resolve, reject) => {
        const checkInit = (): void => {
          if (this.isInitialized) {
            resolve()
          } else if (!this.isInitializing) {
            reject(new Error('Initialization failed'))
          } else {
            setTimeout(checkInit, 100)
          }
        }
        checkInit()
      })
    }

    this.isInitializing = true

    try {
      console.log('🚀 Initializing LangGraph Agent...')

      // Get service instances
      this.conversationManager = getConversationManager()
      this.mcpLoader = getMCPLoaderService()

      // Test Ollama connection
      await this.model.invoke([{ role: 'user', content: 'test' }])

      this.isInitialized = true
      this.isInitializing = false
      console.log('✅ LangGraph Agent initialized successfully')

      this.emit('initialized', {
        model: this.config.model,
        availableTools: this.getAvailableTools().length,
      })
    } catch (error) {
      this.isInitializing = false
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
      parameters: Record<string, unknown>
      result: unknown
      executionTime: number
    }> = []

    console.log(`🚀 LangGraphAgentService.processQuery started:`, {
      query: query.substring(0, 100),
      conversationId,
      isInitialized: this.isInitialized,
      options,
    })

    // Update stats
    this.stats.totalQueries++

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

          // Emit thinking status with tool selection info
          if (decision.action === 'use_tool' && decision.toolName) {
            this.emit('thinking', {
              phase: 'tool_selected',
              message: `Selected ${decision.toolName} tool for execution`,
              toolName: decision.toolName,
              reasoning: decision.reasoning,
              toolParameters: decision.parameters
            })
          }

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

      // Update stats
      this.stats.successfulResponses++
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime * (this.stats.successfulResponses - 1) + totalTime) /
        this.stats.successfulResponses

      // Track tool usage
      toolsUsed.forEach((tool) => {
        this.stats.toolUsageCount[tool.toolName] =
          (this.stats.toolUsageCount[tool.toolName] || 0) + 1
      })

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

      // Update error stats
      this.stats.errors++

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _toolsUsed: unknown[]
  ): Promise<{
    action: 'use_tool' | 'respond' | 'clarify'
    toolName?: string
    parameters?: Record<string, unknown>
    reasoning: string
  }> {
    // Enhanced heuristics for tool selection
    const queryLower = query.toLowerCase()

    // RAG/Search keywords
    const searchKeywords = [
      'search', 'find', 'look for', 'document', 'file', 'information about',
      '에 대해', '찾아', '검색', '문서', '파일', '정보'
    ]

    // Check if query needs search tool
    const needsSearch = searchKeywords.some((keyword) => queryLower.includes(keyword))

    if (needsSearch && availableTools.find(tool => tool.name === 'search')) {
      console.log('🎯 Query needs search tool based on keywords')

      // Extract search parameters
      const searchParams = this.extractSearchParameters(query)

      return {
        action: 'use_tool',
        toolName: 'search',
        parameters: searchParams,
        reasoning: `Query contains search-related keywords and we have search capability. Extracted search query: "${searchParams.query}"`
      }
    }

    // Fallback to model decision for complex cases
    const systemPrompt = `You are a helpful AI assistant. Analyze the user query and decide what to do.

Available tools:
${availableTools.map((tool, idx) => `${idx + 1}. ${tool.name}: ${tool.description || 'No description'}`).join('\n') || 'None available'}

Respond ONLY with valid JSON in this exact format:
{"action": "respond", "reasoning": "I can answer this directly without tools"}

OR if you need to use a tool:
{"action": "use_tool", "toolName": "search", "parameters": {"query": "search terms here"}, "reasoning": "User is asking for information that needs to be searched"}

Guidelines:
- Use "search" tool for questions about specific topics, documents, or when user asks to find information
- Use "respond" for general questions, greetings, or when you can answer without external data
- Korean queries like "파이썬에 대해 알려줘" or "문서에서 찾아줘" should use search tool`

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `Query: ${query}` },
      ]

      const response = await this.model.invoke(messages)
      let responseText =
        typeof response.content === 'string' ? response.content : String(response.content)

      // Clean the response first
      responseText = this.cleanResponse(responseText)

      // Try to parse JSON response
      try {
        const decision = JSON.parse(responseText)
        console.log('🤖 Model decision:', decision)
        return decision
      } catch (parseError) {
        console.warn('📝 Could not parse decision JSON, using fallback logic', parseError)

        // Better fallback logic
        if (needsSearch) {
          return {
            action: 'use_tool',
            toolName: 'search',
            parameters: this.extractSearchParameters(query),
            reasoning: 'Fallback: Query appears to need search based on keyword analysis',
          }
        } else {
          return {
            action: 'respond',
            reasoning: 'Fallback: Using direct response as no search indicators found',
          }
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
   * Extract search parameters from query
   */
  private extractSearchParameters(query: string): Record<string, unknown> {
    // Simple parameter extraction
    const cleanQuery = query
      .replace(/search for|find|look for|에 대해|찾아|검색/gi, '')
      .replace(/in documents?|문서에서/gi, '')
      .trim()

    return {
      query: cleanQuery || query,
      limit: 5
    }
  }

  /**
   * Execute a tool with given parameters
   */
  private async executeTool(
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<{
    toolName: string
    serverId: string
    parameters: Record<string, unknown>
    result: unknown
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
        serverId: (tool as { serverId?: string }).serverId || 'unknown',
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
    toolsUsed: unknown[]
  ): Promise<{ continue: boolean; reasoning: string }> {
    // For small model, keep it simple - limit to 1 tool max and then respond
    if (toolsUsed.length >= 1) {
      return { continue: false, reasoning: 'One tool used, now responding' }
    }

    // Simple heuristic - continue only if query explicitly asks for file operations
    const needsTools =
      query.toLowerCase().includes('file') ||
      query.toLowerCase().includes('read') ||
      query.toLowerCase().includes('write')

    return {
      continue: needsTools && toolsUsed.length === 0,
      reasoning: needsTools ? 'Query needs file operations' : 'Can answer directly',
    }
  }

  /**
   * Generate final response based on query and tool results
   */
  private async generateResponse(
    query: string,
    _availableTools: Array<{ name: string; description: string }>,
    toolsUsed: unknown[]
  ): Promise<string> {
    const systemPrompt = this.createSystemPrompt([], toolsUsed)

    try {
      // Emit thinking status for response generation
      this.emit('thinking', {
        phase: 'generating_response',
        message: 'Generating final response based on tool results...',
        reasoning:
          toolsUsed.length > 0
            ? `Using results from ${toolsUsed.length} tool(s) to compose answer`
            : 'Generating direct response without tools',
      })

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: query },
      ]

      const response = await this.model.invoke(messages)
      let content =
        typeof response.content === 'string' ? response.content : String(response.content)

      // Clean up qwen3 model artifacts
      content = this.cleanResponse(content)

      return content
    } catch (error) {
      console.error('Error generating response:', error)
      return 'I apologize, but I encountered an error while generating a response.'
    }
  }

  /**
   * Create system prompt with tool information and usage history
   */
  private createSystemPrompt(
    _tools: Array<{ name: string; description: string }>,
    toolsUsed: unknown[] = []
  ): string {
    let systemPrompt = 'You are a helpful AI assistant. Answer the user\'s question directly and clearly.'

    if (toolsUsed.length > 0) {
      systemPrompt += '\n\nContext from tools:'

      toolsUsed.forEach((toolResult, index) => {
        const typedResult = toolResult as {
          toolName: string
          result: unknown
          parameters?: Record<string, unknown>
        }

        systemPrompt += `\n\n${index + 1}. Tool: ${typedResult.toolName}`

        if (typedResult.parameters) {
          systemPrompt += `\n   Parameters: ${JSON.stringify(typedResult.parameters, null, 2)}`
        }

        // Format the result based on its structure
        if (typeof typedResult.result === 'object' && typedResult.result !== null) {
          const resultObj = typedResult.result as Record<string, unknown>

          // Handle MCP tool result format
          if ('content' in resultObj && Array.isArray(resultObj.content)) {
            const content = resultObj.content as Array<{ type: string; text?: string }>
            const textContent = content
              .filter(item => item.type === 'text' && item.text)
              .map(item => item.text)
              .join('\n')

            if (textContent) {
              systemPrompt += `\n   Result: ${textContent}`
            } else {
              systemPrompt += `\n   Result: ${JSON.stringify(resultObj, null, 2)}`
            }
          } else {
            systemPrompt += `\n   Result: ${JSON.stringify(resultObj, null, 2)}`
          }
        } else {
          systemPrompt += `\n   Result: ${String(typedResult.result)}`
        }
      })

      systemPrompt += '\n\nPlease use the above information from the tools to provide a comprehensive and accurate answer. If the tool results contain relevant information, incorporate it naturally into your response. If the results are empty or not relevant, acknowledge this and provide the best answer you can based on your knowledge.'
    }

    systemPrompt += '\n\nBe concise, helpful, and accurate in your response.'

    return systemPrompt
  }

  /**
   * Clean up model response artifacts
   */
  private cleanResponse(content: string): string {
    // Remove think tags and content
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    // Remove extra whitespace
    content = content.replace(/\n\s*\n/g, '\n').trim()

    // If response is empty after cleaning, provide a fallback
    if (!content) {
      content = 'I understand your request. How can I help you?'
    }

    return content
  }

  /**
   * Get agent statistics and performance metrics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalQueries > 0 ?
        (this.stats.successfulResponses / this.stats.totalQueries) * 100 : 0,
      topTools: Object.entries(this.stats.toolUsageCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .reduce((acc, [tool, count]) => ({ ...acc, [tool]: count }), {}),
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalQueries: 0,
      toolUsageCount: {},
      averageResponseTime: 0,
      successfulResponses: 0,
      errors: 0,
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up LangGraph Agent...')
    this.isInitialized = false
    this.isInitializing = false
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
