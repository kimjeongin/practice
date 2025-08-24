import { EventEmitter } from 'events'
import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { ConnectionManager } from './mcp-connection-manager.service'
import { ToolDiscoveryService } from './mcp-tool-discovery.service'
import { 
  ServerConfig,
  ServerConnection,
  MCPTool,
  ToolFilter,
  ExecutionResult,
  ExecutionHistoryEntry,
  ClientHostConfig
} from '../types/mcp-server.types'

export class MCPClientHostService extends EventEmitter {
  private connectionManager: ConnectionManager
  private toolDiscoveryService: ToolDiscoveryService
  private config: ClientHostConfig
  private configPath: string
  private initialized = false

  constructor() {
    super()
    this.setMaxListeners(100)
    
    // Initialize services
    this.connectionManager = new ConnectionManager()
    this.toolDiscoveryService = new ToolDiscoveryService(this.connectionManager)
    
    // Set config path
    this.configPath = join(app.getPath('userData'), 'mcp-client-config.json')
    
    // Initialize default config
    this.config = {
      servers: [],
      settings: {
        autoConnectOnStartup: false,
        maxConcurrentExecutions: 5,
        executionTimeout: 30000,
        saveExecutionHistory: true,
        enableNotifications: true
      }
    }

    this.setupEventListeners()
  }

  /**
   * Initialize the client host service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    console.log('🚀 Initializing MCP Client Host Service...')

    try {
      // Load configuration
      await this.loadConfiguration()
      
      // Auto-connect enabled servers if configured
      if (this.config.settings.autoConnectOnStartup) {
        await this.autoConnectServers()
      }

      this.initialized = true
      console.log('✅ MCP Client Host Service initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize MCP Client Host Service:', error)
      throw error
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Forward connection manager events
    this.connectionManager.on('server-connected', (data) => {
      this.emit('server-connected', data)
      this.saveConfiguration() // Persist state changes
    })

    this.connectionManager.on('server-disconnected', (data) => {
      this.emit('server-disconnected', data)
    })

    this.connectionManager.on('server-error', (data) => {
      this.emit('server-error', data)
    })

    this.connectionManager.on('tools-discovered', (data) => {
      this.emit('tool-discovered', data)
    })

    // Forward tool discovery events
    this.toolDiscoveryService.on('tool-executed', (data) => {
      this.emit('tool-executed', data)
    })

    this.toolDiscoveryService.on('tools-updated', () => {
      this.emit('tools-updated', { serverId: 'all', tools: this.getAllTools() })
    })
  }

  // ============================
  // Server Management Methods
  // ============================

  /**
   * Add a new server configuration
   */
  async addServer(serverConfig: Omit<ServerConfig, 'id'>): Promise<ServerConfig> {
    const config: ServerConfig = {
      ...serverConfig,
      id: this.generateServerId(serverConfig.name)
    }

    await this.connectionManager.addServer(config)
    this.config.servers.push(config)
    await this.saveConfiguration()

    console.log(`➕ Added server: ${config.name}`)
    return config
  }

  /**
   * Remove a server
   */
  async removeServer(serverId: string): Promise<void> {
    await this.connectionManager.removeServer(serverId)
    this.config.servers = this.config.servers.filter(s => s.id !== serverId)
    await this.saveConfiguration()

    console.log(`➖ Removed server: ${serverId}`)
  }

  /**
   * Update server configuration
   */
  async updateServer(serverId: string, updates: Partial<ServerConfig>): Promise<void> {
    await this.connectionManager.updateServer(serverId, updates)
    
    const serverIndex = this.config.servers.findIndex(s => s.id === serverId)
    if (serverIndex >= 0) {
      this.config.servers[serverIndex] = { ...this.config.servers[serverIndex], ...updates }
      await this.saveConfiguration()
    }

    console.log(`🔄 Updated server: ${serverId}`)
  }

  /**
   * Connect to a specific server
   */
  async connectServer(serverId: string): Promise<void> {
    await this.connectionManager.connectServer(serverId)
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverId: string): Promise<void> {
    await this.connectionManager.disconnectServer(serverId)
  }

  /**
   * Get all server configurations
   */
  getServers(): ServerConfig[] {
    return [...this.config.servers]
  }

  /**
   * Get all server connections with status
   */
  getServerConnections(): ServerConnection[] {
    return this.connectionManager.getConnections()
  }

  /**
   * Get a specific server connection
   */
  getServerConnection(serverId: string): ServerConnection | undefined {
    return this.connectionManager.getConnection(serverId)
  }

  // ============================
  // Tool Discovery Methods
  // ============================

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    return this.toolDiscoveryService.getAllTools()
  }

  /**
   * Search tools with filtering
   */
  searchTools(filter: ToolFilter): MCPTool[] {
    return this.toolDiscoveryService.searchTools(filter)
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): MCPTool[] {
    return this.toolDiscoveryService.getServerTools(serverId)
  }

  /**
   * Get a specific tool
   */
  getTool(serverId: string, toolName: string): MCPTool | undefined {
    return this.toolDiscoveryService.getTool(serverId, toolName)
  }

  /**
   * Get detailed tool information
   */
  getToolDetails(serverId: string, toolName: string) {
    return this.toolDiscoveryService.getToolDetails(serverId, toolName)
  }

  /**
   * Get available categories
   */
  getCategories(): string[] {
    return this.toolDiscoveryService.getCategories()
  }

  /**
   * Get available tags
   */
  getTags(): string[] {
    return this.toolDiscoveryService.getTags()
  }

  // ============================
  // Tool Execution Methods
  // ============================

  /**
   * Execute a tool
   */
  async executeTool(
    serverId: string, 
    toolName: string, 
    parameters: Record<string, any>,
    userId?: string
  ): Promise<ExecutionResult> {
    return this.toolDiscoveryService.executeTool(serverId, toolName, parameters, userId)
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): ExecutionHistoryEntry[] {
    return this.toolDiscoveryService.getExecutionHistory(limit)
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.toolDiscoveryService.clearExecutionHistory()
  }

  /**
   * Get tool execution statistics
   */
  getToolStats(serverId?: string): { [key: string]: number } {
    return this.toolDiscoveryService.getToolStats(serverId)
  }

  /**
   * Get most used tools
   */
  getMostUsedTools(limit = 10): Array<{ tool: MCPTool, count: number }> {
    return this.toolDiscoveryService.getMostUsedTools(limit)
  }

  // ============================
  // Favorites Management
  // ============================

  /**
   * Add tool to favorites
   */
  addToFavorites(serverId: string, toolName: string): void {
    this.toolDiscoveryService.addToFavorites(serverId, toolName)
  }

  /**
   * Remove tool from favorites
   */
  removeFromFavorites(serverId: string, toolName: string): void {
    this.toolDiscoveryService.removeFromFavorites(serverId, toolName)
  }

  /**
   * Check if tool is favorite
   */
  isFavorite(serverId: string, toolName: string): boolean {
    return this.toolDiscoveryService.isFavorite(serverId, toolName)
  }

  /**
   * Get favorite tools
   */
  getFavoriteTools(): MCPTool[] {
    return this.toolDiscoveryService.getFavoriteTools()
  }

  // ============================
  // Configuration Management
  // ============================

  /**
   * Get current configuration
   */
  getConfiguration(): ClientHostConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  async updateConfiguration(updates: Partial<ClientHostConfig>): Promise<void> {
    this.config = { ...this.config, ...updates }
    await this.saveConfiguration()
  }

  /**
   * Load configuration from file
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8')
      const loadedConfig = JSON.parse(configData) as ClientHostConfig
      
      // Merge with defaults
      this.config = {
        servers: loadedConfig.servers || [],
        settings: { ...this.config.settings, ...loadedConfig.settings }
      }

      // Restore server configurations to connection manager
      for (const serverConfig of this.config.servers) {
        try {
          await this.connectionManager.addServer(serverConfig)
        } catch (error) {
          console.warn(`Failed to restore server ${serverConfig.name}:`, error)
        }
      }

      console.log(`📄 Loaded configuration with ${this.config.servers.length} servers`)
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('📄 No existing configuration found, using defaults')
        await this.saveConfiguration()
      } else {
        console.error('❌ Failed to load configuration:', error)
        throw error
      }
    }
  }

  /**
   * Save configuration to file
   */
  private async saveConfiguration(): Promise<void> {
    try {
      const configData = JSON.stringify(this.config, null, 2)
      await fs.writeFile(this.configPath, configData, 'utf-8')
    } catch (error) {
      console.error('❌ Failed to save configuration:', error)
    }
  }

  /**
   * Auto-connect to enabled servers
   */
  private async autoConnectServers(): Promise<void> {
    const enabledServers = this.config.servers.filter(s => s.enabled)
    
    if (enabledServers.length === 0) {
      console.log('ℹ️ No enabled servers to auto-connect')
      return
    }

    console.log(`🔌 Auto-connecting to ${enabledServers.length} enabled servers...`)

    const connectPromises = enabledServers.map(server => 
      this.connectionManager.connectServer(server.id).catch(error => 
        console.warn(`Failed to auto-connect to ${server.name}:`, error)
      )
    )

    await Promise.allSettled(connectPromises)
  }

  /**
   * Generate unique server ID
   */
  private generateServerId(name: string): string {
    const baseId = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const timestamp = Date.now().toString(36)
    return `${baseId}-${timestamp}`
  }

  // RAG Server methods removed - now uses independent HTTP server

  /**
   * Get system status
   */
  getStatus() {
    const connections = this.getServerConnections()
    const tools = this.getAllTools()
    const history = this.getExecutionHistory(10)

    return {
      initialized: this.initialized,
      totalServers: this.config.servers.length,
      connectedServers: connections.filter(c => c.status === 'connected').length,
      totalTools: tools.length,
      recentExecutions: history.length,
      uptime: process.uptime(),
      configPath: this.configPath
    }
  }

  /**
   * Export configuration and history
   */
  async exportData(): Promise<string> {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      config: this.config,
      executionHistory: this.getExecutionHistory(),
      favorites: this.getFavoriteTools().map(tool => `${tool.serverId}:${tool.name}`)
    }, null, 2)
  }

  /**
   * Import configuration and history
   */
  async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData)
      
      if (data.config) {
        await this.updateConfiguration(data.config)
      }
      
      if (data.executionHistory) {
        this.toolDiscoveryService.importExecutionHistory(JSON.stringify({
          executions: data.executionHistory
        }))
      }

      console.log('✅ Data import completed')
    } catch (error) {
      console.error('❌ Data import failed:', error)
      throw new Error('Invalid import data format')
    }
  }

  /**
   * Cleanup all services
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP Client Host Service...')

    await this.connectionManager.cleanup()
    
    // Save final configuration
    await this.saveConfiguration()

    this.initialized = false
    console.log('✅ MCP Client Host Service cleanup completed')
  }
}

// Singleton instance
let clientHostService: MCPClientHostService | null = null

export function getClientHostService(): MCPClientHostService {
  if (!clientHostService) {
    clientHostService = new MCPClientHostService()
  }
  return clientHostService
}

export async function startClientHostService(): Promise<MCPClientHostService> {
  const service = getClientHostService()
  await service.initialize()
  return service
}

export async function stopClientHostService(): Promise<void> {
  if (clientHostService) {
    await clientHostService.cleanup()
    clientHostService = null
  }
}