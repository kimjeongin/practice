import { EventEmitter } from 'events'
import { eq, desc, asc } from 'drizzle-orm'
import { AgentMessage, AgentContext } from '../types/agent.types'
import { db } from '../../database/db'
import { conversations, messages, toolCalls, Message, ToolCall, NewConversation, NewMessage, NewToolCall } from '../../database/schema'

/**
 * Service for managing agent conversations with persistent storage
 */
export class ConversationManager extends EventEmitter {
  private activeConversations: Map<string, AgentContext> = new Map()
  private initialized = false

  constructor() {
    super()
    this.setMaxListeners(100)
  }

  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🗄️ Initializing Conversation Manager...')
      
      // Initialize database
      await db.initialize()
      
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
      const newConversation: NewConversation = {
        title: title || `Conversation ${new Date().toLocaleString()}`,
      }

      const [conversation] = await db.getDB().insert(conversations).values(newConversation).returning()

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
      const conversation = await db.getDB().select().from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
        .then(results => results[0])

      if (!conversation) {
        return null
      }

      // Load messages with tool calls
      const dbMessages = await db.getDB().select({
        message: messages,
        toolCall: toolCalls,
      })
      .from(messages)
      .leftJoin(toolCalls, eq(messages.id, toolCalls.messageId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))

      // Group messages by message ID and collect tool calls
      const messageMap = new Map<string, { message: Message, toolCalls: ToolCall[] }>()
      
      for (const row of dbMessages) {
        const messageId = row.message.id
        if (!messageMap.has(messageId)) {
          messageMap.set(messageId, { message: row.message, toolCalls: [] })
        }
        if (row.toolCall) {
          messageMap.get(messageId)!.toolCalls.push(row.toolCall)
        }
      }

      // Convert database messages to AgentMessage format
      const agentMessages: AgentMessage[] = Array.from(messageMap.values()).map(({ message, toolCalls }) => {
        const agentMessage: AgentMessage = {
          id: message.id,
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
          timestamp: new Date(message.createdAt),
          conversationId: conversationId,
        }

        // Add tool call information if present
        if (toolCalls.length > 0) {
          const toolCall = toolCalls[0] // Assuming one tool call per message for now
          agentMessage.toolCall = {
            toolName: toolCall.toolName,
            parameters: toolCall.parameters as Record<string, any>,
            serverId: toolCall.serverId,
          }

          if (toolCall.result) {
            agentMessage.toolResult = {
              success: toolCall.status === 'success',
              result: toolCall.result,
              error: toolCall.errorMessage || undefined,
              executionTime: toolCall.executionTime || undefined,
            }
          }
        }

        return agentMessage
      })

      const context: AgentContext = {
        conversationId,
        messages: agentMessages,
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
      const newMessage: NewMessage = {
        conversationId: conversationId,
        role: message.role,
        content: message.content,
        metadata:
          message.toolCall || message.toolResult
            ? {
                toolCall: message.toolCall,
                toolResult: message.toolResult,
              }
            : undefined,
      }

      const [dbMessage] = await db.getDB().insert(messages).values(newMessage).returning()

      // Save tool call if present
      if (message.toolCall) {
        const newToolCall: NewToolCall = {
          messageId: dbMessage.id,
          toolName: message.toolCall.toolName,
          serverId: message.toolCall.serverId,
          serverName: '', // Will be populated by agent orchestrator
          parameters: message.toolCall.parameters,
          result: message.toolResult?.result || null,
          executionTime: message.toolResult?.executionTime || null,
          status:
            message.toolResult?.success === false
              ? 'error'
              : message.toolResult
                ? 'success'
                : 'pending',
          errorMessage: message.toolResult?.error || null,
        }

        await db.getDB().insert(toolCalls).values(newToolCall)
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
      await db.getDB().update(toolCalls)
        .set({
          result,
          executionTime: executionTime,
          status: success ? 'success' : 'error',
          errorMessage: error,
        })
        .where(eq(toolCalls.id, toolCallId))

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
      const conversationList = await db.getDB().select({
        id: conversations.id,
        title: conversations.title,
        created_at: conversations.createdAt,
        updated_at: conversations.updatedAt,
      })
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))

      return conversationList.map((conv) => ({
        ...conv,
        title: conv.title || 'Untitled',
        created_at: new Date(conv.created_at),
        updated_at: new Date(conv.updated_at),
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
      await db.getDB().update(conversations)
        .set({ title })
        .where(eq(conversations.id, conversationId))

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
      await db.getDB().delete(conversations)
        .where(eq(conversations.id, conversationId))

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
      await db.getDB().delete(messages)
        .where(eq(messages.conversationId, conversationId))

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
      const conversation = await db.getDB().select().from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
        .then(results => results[0])

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`)
      }

      const messageList = await db.getDB().select().from(messages)
        .where(eq(messages.conversationId, conversationId))

      const toolCallList = await db.getDB().select().from(toolCalls)
        .innerJoin(messages, eq(toolCalls.messageId, messages.id))
        .where(eq(messages.conversationId, conversationId))

      const successfulCalls = toolCallList.filter((tc) => tc.tool_calls.status === 'success')
      const errorCalls = toolCallList.filter((tc) => tc.tool_calls.status === 'error')

      const executionTimes = toolCallList
        .filter((tc) => tc.tool_calls.executionTime !== null)
        .map((tc) => tc.tool_calls.executionTime!)

      const avgExecutionTime =
        executionTimes.length > 0
          ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
          : 0

      return {
        messageCount: messageList.length,
        toolCallCount: toolCallList.length,
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
      // Simple text search in conversation titles
      const titleMatches = await db.getDB().select({
        id: conversations.id,
        title: conversations.title,
        created_at: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.title, query)) // Note: SQLite LIKE would be better here
      .orderBy(desc(conversations.updatedAt))

      // Search in message content
      const messageMatches = await db.getDB().select({
        id: conversations.id,
        title: conversations.title,
        created_at: conversations.createdAt,
        content: messages.content,
      })
      .from(conversations)
      .innerJoin(messages, eq(conversations.id, messages.conversationId))
      .where(eq(messages.content, query)) // Note: SQLite LIKE would be better here
      .orderBy(desc(conversations.updatedAt))
      .limit(1)

      // Combine results (simplified - in a real app you'd want to deduplicate)
      const allResults = [...titleMatches, ...messageMatches]
      
      return allResults.map((conv) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        created_at: new Date(conv.created_at),
        snippet: ('content' in conv && typeof conv.content === 'string') ? conv.content.substring(0, 150) + '...' : 'No matching messages',
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
      const conversation = await db.getDB().select().from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
        .then(results => results[0])

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`)
      }

      // Get messages with tool calls
      const messagesWithToolCalls = await db.getDB().select({
        message: messages,
        toolCall: toolCalls,
      })
      .from(messages)
      .leftJoin(toolCalls, eq(messages.id, toolCalls.messageId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))

      return JSON.stringify(
        {
          id: conversation.id,
          title: conversation.title,
          created_at: conversation.createdAt,
          updated_at: conversation.updatedAt,
          messages: messagesWithToolCalls.map((row) => ({
            role: row.message.role,
            content: row.message.content,
            created_at: row.message.createdAt,
            tool_calls: row.toolCall ? [row.toolCall] : [],
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
      await db.close()
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
