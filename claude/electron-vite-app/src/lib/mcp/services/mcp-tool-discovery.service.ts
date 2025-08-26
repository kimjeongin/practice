import { EventEmitter } from 'events'
import { ConnectionManager } from './mcp-connection-manager.service'
import {
  MCPTool,
  ToolFilter,
  ExecutionContext,
  ExecutionResult,
  ExecutionHistoryEntry,
} from '../types/mcp-server.types'

export class ToolDiscoveryService extends EventEmitter {
  private connectionManager: ConnectionManager
  private toolCache: Map<string, MCPTool[]> = new Map() // serverId -> tools
  private executionHistory: ExecutionHistoryEntry[] = []
  private favorites: Set<string> = new Set() // tool identifiers (serverId:toolName)

  constructor(connectionManager: ConnectionManager) {
    super()
    this.connectionManager = connectionManager
    this.setupEventListeners()
  }

  /**
   * Setup event listeners for connection manager
   */
  private setupEventListeners(): void {
    this.connectionManager.on('server-connected', ({ serverId }) => {
      this.refreshServerTools(serverId)
    })

    this.connectionManager.on('server-disconnected', ({ serverId }) => {
      this.toolCache.delete(serverId)
      this.emit('tools-updated')
    })

    this.connectionManager.on('tools-discovered', ({ serverId, tools }) => {
      this.toolCache.set(serverId, tools)
      this.emit('tools-updated')
    })
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = []
    for (const tools of this.toolCache.values()) {
      allTools.push(...tools)
    }
    return allTools
  }

  /**
   * Search and filter tools based on criteria
   */
  searchTools(filter: ToolFilter): MCPTool[] {
    let tools = this.getAllTools()

    // Filter by server IDs
    if (filter.serverIds && filter.serverIds.length > 0) {
      tools = tools.filter((tool) => filter.serverIds!.includes(tool.serverId))
    }

    // Filter by search term
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase()
      tools = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(searchTerm) ||
          tool.description.toLowerCase().includes(searchTerm) ||
          tool.serverName.toLowerCase().includes(searchTerm) ||
          tool.category?.toLowerCase().includes(searchTerm) ||
          tool.tags?.some((tag) => tag.toLowerCase().includes(searchTerm))
      )
    }

    // Filter by categories
    if (filter.categories && filter.categories.length > 0) {
      tools = tools.filter((tool) => tool.category && filter.categories!.includes(tool.category))
    }

    // Filter by tags
    if (filter.tags && filter.tags.length > 0) {
      tools = tools.filter(
        (tool) => tool.tags && tool.tags.some((tag) => filter.tags!.includes(tag))
      )
    }

    // Filter by has examples
    if (filter.hasExamples) {
      tools = tools.filter((tool) => tool.examples && tool.examples.length > 0)
    }

    return tools
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): MCPTool[] {
    return this.toolCache.get(serverId) || []
  }

  /**
   * Get a specific tool by server and name
   */
  getTool(serverId: string, toolName: string): MCPTool | undefined {
    const serverTools = this.toolCache.get(serverId)
    return serverTools?.find((tool) => tool.name === toolName)
  }

  /**
   * Get all unique categories from all tools
   */
  getCategories(): string[] {
    const categories = new Set<string>()
    for (const tools of this.toolCache.values()) {
      for (const tool of tools) {
        if (tool.category) {
          categories.add(tool.category)
        }
      }
    }
    return Array.from(categories).sort()
  }

  /**
   * Get all unique tags from all tools
   */
  getTags(): string[] {
    const tags = new Set<string>()
    for (const tools of this.toolCache.values()) {
      for (const tool of tools) {
        if (tool.tags) {
          tool.tags.forEach((tag) => tags.add(tag))
        }
      }
    }
    return Array.from(tags).sort()
  }

  /**
   * Execute a tool and record the execution
   */
  async executeTool(
    serverId: string,
    toolName: string,
    parameters: Record<string, any>,
    userId?: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const requestId = this.generateRequestId()

    const context: ExecutionContext = {
      toolName,
      serverId,
      parameters,
      requestId,
      timestamp: new Date(),
      userId,
    }

    try {
      // Execute the tool via connection manager
      const result = await this.connectionManager.executeTool(serverId, toolName, parameters)

      const executionTime = Date.now() - startTime
      const executionResult: ExecutionResult = {
        requestId,
        success: true,
        result,
        executionTime,
        timestamp: new Date(),
      }

      // Record in history
      const historyEntry: ExecutionHistoryEntry = {
        id: requestId,
        context,
        result: executionResult,
        favorite: this.isFavorite(serverId, toolName),
      }

      this.executionHistory.unshift(historyEntry) // Add to beginning

      // Keep only last 1000 executions
      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(0, 1000)
      }

      this.emit('tool-executed', { execution: historyEntry })
      return executionResult
    } catch (error) {
      const executionTime = Date.now() - startTime
      const executionResult: ExecutionResult = {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        timestamp: new Date(),
      }

      // Record failed execution in history
      const historyEntry: ExecutionHistoryEntry = {
        id: requestId,
        context,
        result: executionResult,
        favorite: this.isFavorite(serverId, toolName),
      }

      this.executionHistory.unshift(historyEntry)

      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(0, 1000)
      }

      this.emit('tool-executed', { execution: historyEntry })
      throw error
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): ExecutionHistoryEntry[] {
    if (limit) {
      return this.executionHistory.slice(0, limit)
    }
    return [...this.executionHistory]
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionHistory = []
    this.emit('history-cleared')
  }

  /**
   * Get execution history for a specific tool
   */
  getToolExecutionHistory(serverId: string, toolName: string): ExecutionHistoryEntry[] {
    return this.executionHistory.filter(
      (entry) => entry.context.serverId === serverId && entry.context.toolName === toolName
    )
  }

  /**
   * Add tool to favorites
   */
  addToFavorites(serverId: string, toolName: string): void {
    const key = `${serverId}:${toolName}`
    this.favorites.add(key)
    this.emit('favorites-updated')
  }

  /**
   * Remove tool from favorites
   */
  removeFromFavorites(serverId: string, toolName: string): void {
    const key = `${serverId}:${toolName}`
    this.favorites.delete(key)
    this.emit('favorites-updated')
  }

  /**
   * Check if tool is in favorites
   */
  isFavorite(serverId: string, toolName: string): boolean {
    const key = `${serverId}:${toolName}`
    return this.favorites.has(key)
  }

  /**
   * Get all favorite tools
   */
  getFavoriteTools(): MCPTool[] {
    const favoriteTools: MCPTool[] = []

    for (const favoriteKey of this.favorites) {
      const [serverId, toolName] = favoriteKey.split(':')
      const tool = this.getTool(serverId, toolName)
      if (tool) {
        favoriteTools.push(tool)
      }
    }

    return favoriteTools
  }

  /**
   * Get tool execution statistics
   */
  getToolStats(serverId?: string): { [key: string]: number } {
    const stats: { [key: string]: number } = {}

    for (const entry of this.executionHistory) {
      if (serverId && entry.context.serverId !== serverId) {
        continue
      }

      const key = `${entry.context.serverId}:${entry.context.toolName}`
      stats[key] = (stats[key] || 0) + 1
    }

    return stats
  }

  /**
   * Get most used tools
   */
  getMostUsedTools(limit = 10): Array<{ tool: MCPTool; count: number }> {
    const stats = this.getToolStats()
    const toolCounts: Array<{ tool: MCPTool; count: number }> = []

    for (const [key, count] of Object.entries(stats)) {
      const [serverId, toolName] = key.split(':')
      const tool = this.getTool(serverId, toolName)
      if (tool) {
        toolCounts.push({ tool, count })
      }
    }

    return toolCounts.sort((a, b) => b.count - a.count).slice(0, limit)
  }

  /**
   * Refresh tools for a specific server
   */
  private async refreshServerTools(serverId: string): Promise<void> {
    const connection = this.connectionManager.getConnection(serverId)
    if (connection && connection.tools) {
      this.toolCache.set(serverId, connection.tools)
      this.emit('tools-updated')
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get detailed tool information including execution history
   */
  getToolDetails(
    serverId: string,
    toolName: string
  ): {
    tool: MCPTool | undefined
    isFavorite: boolean
    executionCount: number
    lastExecuted?: Date
    recentExecutions: ExecutionHistoryEntry[]
  } {
    const tool = this.getTool(serverId, toolName)
    const history = this.getToolExecutionHistory(serverId, toolName)

    return {
      tool,
      isFavorite: this.isFavorite(serverId, toolName),
      executionCount: history.length,
      lastExecuted: history.length > 0 ? history[0].context.timestamp : undefined,
      recentExecutions: history.slice(0, 5), // Last 5 executions
    }
  }

  /**
   * Export execution history to JSON
   */
  exportExecutionHistory(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalExecutions: this.executionHistory.length,
        executions: this.executionHistory,
      },
      null,
      2
    )
  }

  /**
   * Import execution history from JSON
   */
  importExecutionHistory(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData)
      if (data.executions && Array.isArray(data.executions)) {
        this.executionHistory = data.executions
        this.emit('history-imported')
      }
    } catch (error) {
      throw new Error('Invalid execution history format')
    }
  }
}
