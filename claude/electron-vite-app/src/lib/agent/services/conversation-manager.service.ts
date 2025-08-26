import { EventEmitter } from 'events'
import { PrismaClient } from '@prisma/client'
import { AgentMessage, AgentContext } from '../types/agent.types'
import { DatabaseSetup } from '../../database/database-setup'

/**
 * Service for managing agent conversations with persistent storage
 */
export class ConversationManager extends EventEmitter {
  private prisma: PrismaClient
  private activeConversations: Map<string, AgentContext> = new Map()
  private initialized = false

  constructor() {
    super()
    this.setMaxListeners(100)

    // Use centralized database setup
    this.prisma = DatabaseSetup.getPrismaClient()
  }

  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🗄️ Initializing Conversation Manager...')

      // Database setup is handled by DatabaseSetup utility
      // Just test that connection works
      const isConnected = await DatabaseSetup.testConnection()
      if (!isConnected) {
        throw new Error('Database connection failed')
      }

      this.initialized = true
      console.log('✅ Conversation Manager initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize Conversation Manager:', error)
      throw error
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(title?: string): Promise<string> {
    try {
      const conversation = await this.prisma.conversation.create({
        data: {
          title: title || `Conversation ${new Date().toLocaleString()}`,
        },
      })

      const context: AgentContext = {
        conversationId: conversation.id,
        messages: [],
        maxIterations: 10,
        currentIteration: 0,
      }

      this.activeConversations.set(conversation.id, context)

      this.emit('conversation-created', {
        conversationId: conversation.id,
        title: conversation.title,
      })

      console.log(`📝 Created new conversation: ${conversation.id}`)
      return conversation.id
    } catch (error) {
      console.error('Failed to create conversation:', error)
      throw error
    }
  }

  /**
   * Get conversation context
   */
  async getConversation(conversationId: string): Promise<AgentContext | null> {
    try {
      // Check if conversation is already loaded in memory
      if (this.activeConversations.has(conversationId)) {
        return this.activeConversations.get(conversationId)!
      }

      // Load from database
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            include: {
              tool_calls: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
      })

      if (!conversation) {
        return null
      }

      // Convert database messages to AgentMessage format
      const messages: AgentMessage[] = conversation.messages.map((dbMessage) => {
        const agentMessage: AgentMessage = {
          id: dbMessage.id,
          role: dbMessage.role as 'user' | 'assistant' | 'system',
          content: dbMessage.content,
          timestamp: dbMessage.created_at,
          conversationId: conversationId,
        }

        // Add tool call information if present
        if (dbMessage.tool_calls.length > 0) {
          const toolCall = dbMessage.tool_calls[0] // Assuming one tool call per message for now
          agentMessage.toolCall = {
            toolName: toolCall.tool_name,
            parameters: toolCall.parameters as Record<string, any>,
            serverId: toolCall.server_id,
          }

          if (toolCall.result) {
            agentMessage.toolResult = {
              success: toolCall.status === 'success',
              result: toolCall.result,
              error: toolCall.error_message || undefined,
              executionTime: toolCall.execution_time || undefined,
            }
          }
        }

        return agentMessage
      })

      const context: AgentContext = {
        conversationId,
        messages,
        maxIterations: 10,
        currentIteration: 0,
      }

      this.activeConversations.set(conversationId, context)
      return context
    } catch (error) {
      console.error(`Failed to get conversation ${conversationId}:`, error)
      throw error
    }
  }

  /**
   * Add message to conversation
   */
  async addMessage(
    conversationId: string,
    message: Omit<AgentMessage, 'timestamp'>
  ): Promise<void> {
    try {
      const agentMessage: AgentMessage = {
        ...message,
        timestamp: new Date(),
      }

      // Update in-memory context
      const context = this.activeConversations.get(conversationId)
      if (context) {
        context.messages.push(agentMessage)
      }

      // Save to database
      const dbMessage = await this.prisma.message.create({
        data: {
          conversation_id: conversationId,
          role: message.role,
          content: message.content,
          metadata:
            message.toolCall || message.toolResult
              ? {
                  toolCall: message.toolCall,
                  toolResult: message.toolResult,
                }
              : undefined,
        },
      })

      // Save tool call if present
      if (message.toolCall) {
        await this.prisma.toolCall.create({
          data: {
            message_id: dbMessage.id,
            tool_name: message.toolCall.toolName,
            server_id: message.toolCall.serverId,
            server_name: '', // Will be populated by agent orchestrator
            parameters: message.toolCall.parameters,
            result: message.toolResult?.result || null,
            execution_time: message.toolResult?.executionTime || null,
            status:
              message.toolResult?.success === false
                ? 'error'
                : message.toolResult
                  ? 'success'
                  : 'pending',
            error_message: message.toolResult?.error || null,
          },
        })
      }

      this.emit('message-added', { conversationId, message: agentMessage })
    } catch (error) {
      console.error('Failed to add message:', error)
      throw error
    }
  }

  /**
   * Update tool call result
   */
  async updateToolCallResult(
    conversationId: string,
    toolCallId: string,
    result: any,
    executionTime: number,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      await this.prisma.toolCall.update({
        where: { id: toolCallId },
        data: {
          result,
          execution_time: executionTime,
          status: success ? 'success' : 'error',
          error_message: error,
        },
      })

      // Update in-memory context
      const context = this.activeConversations.get(conversationId)
      if (context) {
        const lastMessage = context.messages[context.messages.length - 1]
        if (lastMessage && lastMessage.toolCall) {
          lastMessage.toolResult = {
            success,
            result,
            error,
            executionTime,
          }
        }
      }

      this.emit('tool-call-updated', { conversationId, toolCallId, success })
    } catch (error) {
      console.error('Failed to update tool call result:', error)
      throw error
    }
  }

  /**
   * Get conversation history for display
   */
  async getConversationHistory(conversationId: string, limit?: number): Promise<AgentMessage[]> {
    const context = await this.getConversation(conversationId)
    if (!context) {
      throw new Error(`Conversation ${conversationId} not found`)
    }

    if (limit) {
      return context.messages.slice(-limit)
    }

    return context.messages
  }

  /**
   * Get all conversations
   */
  async getAllConversations(): Promise<
    Array<{ id: string; title: string; created_at: Date; updated_at: Date }>
  > {
    try {
      const conversations = await this.prisma.conversation.findMany({
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          title: true,
          created_at: true,
          updated_at: true,
        },
      })

      return conversations.map((conv) => ({
        ...conv,
        title: conv.title || 'Untitled',
      }))
    } catch (error) {
      console.error('Failed to get all conversations:', error)
      throw error
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      })

      this.emit('conversation-updated', { conversationId, title })
    } catch (error) {
      console.error('Failed to update conversation title:', error)
      throw error
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      // Remove from memory
      this.activeConversations.delete(conversationId)

      // Delete from database (cascade will handle related records)
      await this.prisma.conversation.delete({
        where: { id: conversationId },
      })

      this.emit('conversation-deleted', { conversationId })
      console.log(`🗑️ Deleted conversation: ${conversationId}`)
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      throw error
    }
  }

  /**
   * Clear conversation messages but keep the conversation
   */
  async clearConversationMessages(conversationId: string): Promise<void> {
    try {
      await this.prisma.message.deleteMany({
        where: { conversation_id: conversationId },
      })

      // Update in-memory context
      const context = this.activeConversations.get(conversationId)
      if (context) {
        context.messages = []
        context.currentIteration = 0
      }

      this.emit('conversation-cleared', { conversationId })
    } catch (error) {
      console.error('Failed to clear conversation messages:', error)
      throw error
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(conversationId: string): Promise<{
    messageCount: number
    toolCallCount: number
    avgExecutionTime: number
    successfulToolCalls: number
    errorToolCalls: number
  }> {
    try {
      const stats = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            include: {
              tool_calls: true,
            },
          },
        },
      })

      if (!stats) {
        throw new Error(`Conversation ${conversationId} not found`)
      }

      const allToolCalls = stats.messages.flatMap((m) => m.tool_calls)
      const successfulCalls = allToolCalls.filter((tc) => tc.status === 'success')
      const errorCalls = allToolCalls.filter((tc) => tc.status === 'error')

      const executionTimes = allToolCalls
        .filter((tc) => tc.execution_time !== null)
        .map((tc) => tc.execution_time!)

      const avgExecutionTime =
        executionTimes.length > 0
          ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
          : 0

      return {
        messageCount: stats.messages.length,
        toolCallCount: allToolCalls.length,
        avgExecutionTime,
        successfulToolCalls: successfulCalls.length,
        errorToolCalls: errorCalls.length,
      }
    } catch (error) {
      console.error('Failed to get conversation stats:', error)
      throw error
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(query: string): Promise<
    Array<{
      id: string
      title: string
      created_at: Date
      snippet: string
    }>
  > {
    try {
      // Simple text search in conversation titles and message content
      const conversations = await this.prisma.conversation.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            {
              messages: {
                some: {
                  content: { contains: query },
                },
              },
            },
          ],
        },
        include: {
          messages: {
            where: {
              content: { contains: query },
            },
            take: 1,
            select: { content: true },
          },
        },
        orderBy: { updated_at: 'desc' },
      })

      return conversations.map((conv) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        created_at: conv.created_at,
        snippet: conv.messages[0]?.content.substring(0, 150) + '...' || 'No matching messages',
      }))
    } catch (error) {
      console.error('Failed to search conversations:', error)
      throw error
    }
  }

  /**
   * Export conversation data
   */
  async exportConversation(conversationId: string): Promise<string> {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            include: {
              tool_calls: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
      })

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`)
      }

      return JSON.stringify(
        {
          id: conversation.id,
          title: conversation.title,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          messages: conversation.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            created_at: msg.created_at,
            tool_calls: msg.tool_calls,
          })),
        },
        null,
        2
      )
    } catch (error) {
      console.error('Failed to export conversation:', error)
      throw error
    }
  }

  /**
   * Cleanup and close database connections
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Conversation Manager...')

    try {
      await this.prisma.$disconnect()
      this.activeConversations.clear()
      this.removeAllListeners()

      console.log('✅ Conversation Manager cleanup completed')
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  }
}

// Singleton instance
let conversationManager: ConversationManager | null = null

export function getConversationManager(): ConversationManager {
  if (!conversationManager) {
    conversationManager = new ConversationManager()
  }
  return conversationManager
}

export async function initializeConversationManager(): Promise<ConversationManager> {
  const manager = getConversationManager()
  await manager.initialize()
  return manager
}
