import { EventEmitter } from 'events'
import { 
  AgentExecutionResult, 
  AgentState, 
  ToolSelectionDecision, 
  ContinueDecision,
  AgentConfig,
  AgentMessage
} from '../types/agent.types'
import { MCPTool } from '../../mcp/types/mcp-server.types'
import { OllamaService, getOllamaService } from './ollama.service'
import { EnhancedMCPManager, getEnhancedMCPManager } from './enhanced-mcp-manager.service'
import { ConversationManager, getConversationManager } from './conversation-manager.service'
import {
  createToolSelectionSystemPrompt,
  createToolSelectionPrompt,
  createContinueDecisionSystemPrompt,
  createContinueDecisionPrompt,
  createFinalResponseSystemPrompt,
  createFinalResponsePrompt,
  createErrorRecoveryPrompt
} from '../prompts/agent-prompts'

/**
 * Main Agent Orchestrator implementing ReAct pattern
 * Coordinates between Ollama LLM, MCP tools, and conversation management
 */
export class AgentOrchestrator extends EventEmitter {
  private ollamaService: OllamaService
  private mcpManager: EnhancedMCPManager
  private conversationManager: ConversationManager
  private config: AgentConfig
  private initialized = false

  constructor(config?: Partial<AgentConfig>) {
    super()
    this.setMaxListeners(100)

    // Initialize services
    this.ollamaService = getOllamaService()
    this.mcpManager = getEnhancedMCPManager()
    this.conversationManager = getConversationManager()

    // Set default config
    this.config = {
      type: 'main',
      model: 'llama3.1:8b',
      temperature: 0.7,
      maxTokens: 1024,
      ...config
    }
  }

  /**
   * Initialize the agent orchestrator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🤖 Initializing Agent Orchestrator...')

      // Initialize all services - check if Ollama is available
      await this.ollamaService.healthCheck()
      await this.conversationManager.initialize()

      // Verify model availability
      const isModelAvailable = await this.ollamaService.isModelAvailable(this.config.model)
      if (!isModelAvailable) {
        console.warn(`Model ${this.config.model} not available, pulling...`)
        await this.ollamaService.pullModel(this.config.model)
      }

      this.initialized = true
      console.log('✅ Agent Orchestrator initialized successfully')

    } catch (error) {
      console.error('❌ Failed to initialize Agent Orchestrator:', error)
      throw error
    }
  }

  /**
   * Process user query using ReAct pattern
   */
  async processQuery(
    userQuery: string,
    conversationId?: string,
    options?: {
      maxIterations?: number
      temperature?: number
      model?: string
    }
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now()

    try {
      // Create or get conversation
      let convId = conversationId
      if (!convId) {
        convId = await this.conversationManager.createConversation()
      }

      // Get conversation context
      let context = await this.conversationManager.getConversation(convId)
      if (!context) {
        throw new Error(`Conversation ${convId} not found`)
      }

      // Add user message
      await this.conversationManager.addMessage(convId, {
        role: 'user',
        content: userQuery
      })

      // Update context with available tools
      context.availableTools = this.mcpManager.getAllTools()
      context.maxIterations = options?.maxIterations || 10
      context.currentIteration = 0

      // Initialize agent state
      const agentState: AgentState = {
        phase: 'analyzing',
        iterationCount: 0,
        startTime: new Date(startTime),
        context
      }

      this.emit('agent-started', { conversationId: convId, query: userQuery })

      // Execute ReAct loop
      const result = await this.executeReActLoop(agentState, userQuery, options)

      const totalExecutionTime = Date.now() - startTime
      
      console.log(`🎯 Agent processing completed in ${totalExecutionTime}ms`)

      return {
        ...result,
        totalExecutionTime
      }

    } catch (error) {
      console.error('Agent processing failed:', error)
      
      const totalExecutionTime = Date.now() - startTime
      
      return {
        success: false,
        response: `I apologize, but I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolsUsed: [],
        totalExecutionTime,
        iterations: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Execute the main ReAct loop
   */
  private async executeReActLoop(
    agentState: AgentState,
    originalQuery: string,
    options?: { temperature?: number; model?: string }
  ): Promise<Omit<AgentExecutionResult, 'totalExecutionTime'>> {
    const toolsUsed: AgentExecutionResult['toolsUsed'] = []
    const maxIterations = agentState.context.maxIterations
    
    let shouldContinue = true
    let finalResponse = ''

    while (shouldContinue && agentState.iterationCount < maxIterations) {
      agentState.iterationCount++
      agentState.context.currentIteration = agentState.iterationCount

      this.emit('agent-iteration', { 
        iteration: agentState.iterationCount, 
        phase: agentState.phase,
        conversationId: agentState.context.conversationId
      })

      try {
        // Emit current phase for UI updates
        this.emit('agent-phase-change', {
          conversationId: agentState.context.conversationId,
          phase: agentState.phase,
          iteration: agentState.iterationCount,
          message: `Phase: ${agentState.phase}`
        })

        switch (agentState.phase) {
          case 'analyzing':
            this.emit('agent-thinking', {
              conversationId: agentState.context.conversationId,
              message: '🤔 Analyzing your request and available tools...'
            })
            agentState.phase = 'selecting_tool'
            break

          case 'selecting_tool':
            this.emit('agent-thinking', {
              conversationId: agentState.context.conversationId,
              message: '🔍 Selecting the best tool for your request...'
            })
            const decision = await this.selectTool(agentState, originalQuery, options)
            
            if (decision.action === 'use_tool' && decision.toolName && decision.parameters) {
              this.emit('agent-tool-selected', {
                conversationId: agentState.context.conversationId,
                toolName: decision.toolName,
                reasoning: decision.reasoning,
                parameters: decision.parameters
              })
              agentState.phase = 'executing_tool'
              agentState.currentTool = decision.toolName
              
              // Find server for the tool
              const tool = agentState.context.availableTools.find(t => t.name === decision.toolName)
              if (tool) {
                agentState.currentServerId = tool.serverId
              }

            } else if (decision.action === 'respond') {
              agentState.phase = 'responding'
              
            } else {
              // Need clarification or other action
              agentState.phase = 'responding'
              finalResponse = decision.reasoning || 'I need more information to help you.'
            }
            break

          case 'executing_tool':
            if (agentState.currentTool && agentState.currentServerId) {
              this.emit('agent-thinking', {
                conversationId: agentState.context.conversationId,
                message: `⚡ Executing ${agentState.currentTool}...`
              })
              const toolResult = await this.executeTool(
                agentState,
                agentState.currentTool,
                agentState.currentServerId
              )
              
              toolsUsed.push(toolResult)
              agentState.phase = 'processing_result'
            } else {
              throw new Error('Tool execution requested but no tool selected')
            }
            break

          case 'processing_result':
            this.emit('agent-thinking', {
              conversationId: agentState.context.conversationId,
              message: '📊 Analyzing results and deciding next steps...'
            })
            const continueDecision = await this.shouldContinue(agentState, originalQuery)
            
            if (continueDecision.continue) {
              this.emit('agent-continuing', {
                conversationId: agentState.context.conversationId,
                reasoning: continueDecision.reasoning,
                nextGoal: continueDecision.nextGoal
              })
              agentState.phase = 'selecting_tool'
              agentState.context.currentGoal = continueDecision.nextGoal
            } else {
              agentState.phase = 'responding'
            }
            break

          case 'responding':
            this.emit('agent-thinking', {
              conversationId: agentState.context.conversationId,
              message: '✍️ Generating final response based on gathered information...'
            })
            finalResponse = await this.generateFinalResponse(agentState, originalQuery, toolsUsed)
            agentState.phase = 'completed'
            shouldContinue = false
            break

          case 'completed':
            shouldContinue = false
            break

          case 'error':
            shouldContinue = false
            break
        }

      } catch (error) {
        console.error(`Error in iteration ${agentState.iterationCount}:`, error)
        
        // Try to recover from error
        const recovery = await this.handleError(error, agentState, originalQuery)
        
        if (recovery.canRecover) {
          agentState.phase = recovery.nextPhase
          agentState.lastAction = `Error recovery: ${recovery.message}`
        } else {
          agentState.phase = 'error'
          finalResponse = recovery.message
          shouldContinue = false
        }
      }
    }

    // Add final response to conversation
    if (finalResponse) {
      await this.conversationManager.addMessage(agentState.context.conversationId, {
        role: 'assistant',
        content: finalResponse
      })
    }

    // Handle max iterations reached
    if (agentState.iterationCount >= maxIterations && agentState.phase !== 'completed') {
      console.warn(`Agent reached max iterations (${maxIterations})`)
      
      if (!finalResponse) {
        finalResponse = "I've been working on your request but haven't completed it within the allowed time. Here's what I was able to gather so far."
      }
    }

    this.emit('agent-completed', {
      conversationId: agentState.context.conversationId,
      iterations: agentState.iterationCount,
      toolsUsed: toolsUsed.length,
      success: agentState.phase === 'completed'
    })

    return {
      success: agentState.phase === 'completed' || toolsUsed.length > 0,
      response: finalResponse || 'I was unable to complete your request.',
      toolsUsed,
      iterations: agentState.iterationCount
    }
  }

  /**
   * Select appropriate tool using LLM
   */
  private async selectTool(
    agentState: AgentState,
    originalQuery: string,
    options?: { temperature?: number; model?: string }
  ): Promise<ToolSelectionDecision> {
    try {
      const systemPrompt = createToolSelectionSystemPrompt(agentState.context.availableTools)
      const userPrompt = createToolSelectionPrompt(
        originalQuery,
        agentState.context.messages,
        agentState.context.currentGoal
      )

      this.emit('tool-selection-started', { 
        conversationId: agentState.context.conversationId,
        availableTools: agentState.context.availableTools.length
      })

      const decision = await this.ollamaService.generateJSON<ToolSelectionDecision>(
        (options?.model || this.config.model) as any,
        userPrompt,
        systemPrompt,
        {
          temperature: options?.temperature || this.config.temperature,
          num_predict: this.config.maxTokens
        }
      )

      this.emit('tool-selected', {
        conversationId: agentState.context.conversationId,
        decision
      })

      return decision

    } catch (error) {
      console.error('Tool selection failed:', error)
      throw new Error(`Failed to select tool: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Execute selected tool
   */
  private async executeTool(
    agentState: AgentState,
    toolName: string,
    serverId: string
  ): Promise<AgentExecutionResult['toolsUsed'][0]> {
    const startTime = Date.now()

    try {
      this.emit('tool-execution-started', {
        conversationId: agentState.context.conversationId,
        toolName,
        serverId
      })

      // Get the last message to extract parameters
      const lastMessage = agentState.context.messages[agentState.context.messages.length - 1]
      const parameters = this.extractParametersFromLastDecision(lastMessage) || {}

      // Execute tool via MCP manager
      const result = await this.mcpManager.executeTool(serverId, toolName, parameters)
      const executionTime = Date.now() - startTime

      // Add tool result to conversation
      await this.conversationManager.addMessage(agentState.context.conversationId, {
        role: 'tool',
        content: JSON.stringify(result),
        toolCall: {
          toolName,
          parameters,
          serverId
        },
        toolResult: {
          success: true,
          result,
          executionTime
        }
      })

      this.emit('tool-execution-completed', {
        conversationId: agentState.context.conversationId,
        toolName,
        serverId,
        executionTime,
        success: true
      })

      return {
        toolName,
        serverId,
        parameters,
        result,
        executionTime
      }

    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Add error result to conversation
      await this.conversationManager.addMessage(agentState.context.conversationId, {
        role: 'tool',
        content: `Error: ${errorMessage}`,
        toolCall: {
          toolName,
          parameters: {},
          serverId
        },
        toolResult: {
          success: false,
          error: errorMessage,
          executionTime
        }
      })

      this.emit('tool-execution-failed', {
        conversationId: agentState.context.conversationId,
        toolName,
        serverId,
        error: errorMessage,
        executionTime
      })

      throw error
    }
  }

  /**
   * Determine if agent should continue with more actions
   */
  private async shouldContinue(
    agentState: AgentState,
    originalQuery: string
  ): Promise<ContinueDecision> {
    try {
      const systemPrompt = createContinueDecisionSystemPrompt()
      const lastToolResult = this.getLastToolResult(agentState.context.messages)
      const userPrompt = createContinueDecisionPrompt(
        agentState.context.messages,
        lastToolResult,
        originalQuery
      )

      const decision = await this.ollamaService.generateJSON<ContinueDecision>(
        this.config.model,
        userPrompt,
        systemPrompt,
        {
          temperature: 0.3, // Lower temperature for more consistent decisions
          num_predict: 512
        }
      )

      return decision

    } catch (error) {
      console.error('Continue decision failed:', error)
      
      // Default to not continuing if we can't decide
      return {
        continue: false,
        reasoning: 'Failed to determine next action, providing current results'
      }
    }
  }

  /**
   * Generate final response to user
   */
  private async generateFinalResponse(
    agentState: AgentState,
    originalQuery: string,
    toolsUsed: AgentExecutionResult['toolsUsed']
  ): Promise<string> {
    try {
      const systemPrompt = createFinalResponseSystemPrompt()
      const toolResults = toolsUsed.map(tool => tool.result)
      const userPrompt = createFinalResponsePrompt(
        originalQuery,
        agentState.context.messages,
        toolResults
      )

      const response = await this.ollamaService.generate({
        model: this.config.model,
        prompt: userPrompt,
        system: systemPrompt,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      })

      return response.response

    } catch (error) {
      console.error('Final response generation failed:', error)
      
      // Fallback response
      return `Based on the tools I used, here's what I found: ${toolsUsed.map(t => 
        typeof t.result === 'object' ? JSON.stringify(t.result) : t.result
      ).join('. ')}`
    }
  }

  /**
   * Handle errors and attempt recovery
   */
  private async handleError(
    error: any,
    agentState: AgentState,
    originalQuery: string
  ): Promise<{
    canRecover: boolean
    nextPhase: AgentState['phase']
    message: string
  }> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    console.error('Handling agent error:', errorMessage)

    // Check if it's a tool execution error that we can recover from
    if (agentState.phase === 'executing_tool' && agentState.currentTool) {
      try {
        const recoveryPrompt = createErrorRecoveryPrompt(
          errorMessage,
          agentState.currentTool,
          originalQuery,
          agentState.context.availableTools
        )

        const recovery = await this.ollamaService.generateJSON(
          this.config.model as any,
          recoveryPrompt,
          'You are helping recover from a tool execution error.',
          { temperature: 0.5 }
        )

        if (recovery.action === 'use_tool') {
          return {
            canRecover: true,
            nextPhase: 'selecting_tool',
            message: recovery.reasoning
          }
        } else {
          return {
            canRecover: true,
            nextPhase: 'responding',
            message: recovery.message || recovery.reasoning
          }
        }
      } catch (recoveryError) {
        console.error('Recovery attempt failed:', recoveryError)
      }
    }

    // Cannot recover
    return {
      canRecover: false,
      nextPhase: 'error',
      message: `I encountered an error and cannot continue: ${errorMessage}`
    }
  }

  /**
   * Extract parameters from the last LLM decision
   */
  private extractParametersFromLastDecision(message: AgentMessage): Record<string, any> | null {
    // This is a simplified implementation
    // In practice, you'd want to store the decision parameters more explicitly
    if (message.toolCall) {
      return message.toolCall.parameters
    }
    return null
  }

  /**
   * Get last tool result from conversation
   */
  private getLastToolResult(messages: AgentMessage[]): any {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message.role === 'tool' && message.toolResult) {
        return message.toolResult.result
      }
    }
    return null
  }

  /**
   * Update agent configuration
   */
  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.emit('config-updated', this.config)
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config }
  }

  /**
   * Get available tools from MCP manager
   */
  getAvailableTools(): MCPTool[] {
    return this.mcpManager.getAllTools()
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Agent Orchestrator...')
    
    this.removeAllListeners()
    await this.conversationManager.cleanup()
    await this.mcpManager.cleanup()
    await this.ollamaService.cleanup()
    
    this.initialized = false
    console.log('✅ Agent Orchestrator cleanup completed')
  }
}

// Singleton instance
let agentOrchestrator: AgentOrchestrator | null = null

export function getAgentOrchestrator(config?: Partial<AgentConfig>): AgentOrchestrator {
  if (!agentOrchestrator) {
    agentOrchestrator = new AgentOrchestrator(config)
  }
  return agentOrchestrator
}

export async function initializeAgentOrchestrator(config?: Partial<AgentConfig>): Promise<AgentOrchestrator> {
  const orchestrator = getAgentOrchestrator(config)
  await orchestrator.initialize()
  return orchestrator
}