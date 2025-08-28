import { EventEmitter } from 'events'
import { StructuredTool } from '@langchain/core/tools'

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  id: string
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  transport?: 'stdio' | 'http'
  url?: string
  enabled?: boolean
  description?: string
}

/**
 * Server Connection Status
 */
export enum ServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Server Connection Information
 */
export interface ServerConnection {
  config: MCPServerConfig
  status: ServerStatus
  error?: string
  connectedAt?: Date
  tools?: StructuredTool[]
}

/**
 * Enhanced MCP Loader Service
 * Provides a clean interface for managing MCP tools and servers with LangChain integration
 */
export class MCPLoaderService extends EventEmitter {
  private servers: Map<string, MCPServerConfig> = new Map()
  private connections: Map<string, ServerConnection> = new Map()
  private tools: StructuredTool[] = []
  private toolsStats: Record<string, number> = {}
  private initialized = false

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /**
   * Initialize the MCP loader service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🚀 Initializing MCP Loader Service...')

      // Load default configuration
      await this.loadConfiguration()

      this.initialized = true
      console.log('✅ MCP Loader Service initialized')

      this.emit('initialized', {
        serverCount: this.servers.size,
        toolCount: this.tools.length,
      })
    } catch (error) {
      console.error('❌ Failed to initialize MCP Loader:', error)
      throw error
    }
  }

  /**
   * Load server configuration
   */
  private async loadConfiguration(): Promise<void> {
    // Load default MCP server configurations
    const defaultServers: MCPServerConfig[] = [
      {
        id: 'filesystem-server',
        name: 'Filesystem Server',
        description: 'Local filesystem operations',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/jeongin'],
        transport: 'stdio',
        enabled: false,
      },
      {
        id: 'web-search-server',
        name: 'Web Search Server',
        description: 'Web search capabilities',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: {
          BRAVE_API_KEY: process.env.BRAVE_API_KEY || '',
        },
        transport: 'stdio',
        enabled: false,
      },
    ]

    // Add servers to the map
    for (const server of defaultServers) {
      this.servers.set(server.id, server)
      this.toolsStats[server.id] = 0

      // Create initial connection entry
      this.connections.set(server.id, {
        config: server,
        status: ServerStatus.DISCONNECTED,
      })
    }

    console.log(`📋 Loaded ${this.servers.size} MCP server configurations`)
  }

  /**
   * Get all configured servers
   */
  getServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
  }

  /**
   * Get server connections with status
   */
  getConnections(): ServerConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Get specific server connection
   */
  getConnection(serverId: string): ServerConnection | undefined {
    return this.connections.get(serverId)
  }

  /**
   * Get all available tools
   */
  getTools(): StructuredTool[] {
    return [...this.tools]
  }

  /**
   * Get tools statistics by server
   */
  getToolsStats(): Record<string, number> {
    return { ...this.toolsStats }
  }

  /**
   * Add a new server configuration
   */
  addServer(config: MCPServerConfig): void {
    if (!config.id) {
      config.id = this.generateServerId(config.name)
    }

    this.servers.set(config.id, config)
    this.toolsStats[config.id] = 0

    // Create connection entry
    this.connections.set(config.id, {
      config,
      status: ServerStatus.DISCONNECTED,
    })

    this.emit('server-added', config)
    console.log(`➕ Added MCP server: ${config.name}`)
  }

  /**
   * Connect to a server
   */
  async connectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (connection.status === ServerStatus.CONNECTED) {
      console.log(`⚠️ Server ${serverId} is already connected`)
      return
    }

    try {
      console.log(`🔌 Connecting to MCP server: ${connection.config.name}`)
      connection.status = ServerStatus.CONNECTING
      this.connections.set(serverId, connection)

      // TODO: Implement actual MCP server connection logic here
      // For now, simulate connection
      await new Promise((resolve) => setTimeout(resolve, 1000))

      connection.status = ServerStatus.CONNECTED
      connection.connectedAt = new Date()
      connection.error = undefined

      this.connections.set(serverId, connection)
      this.emit('server-connected', { serverId, server: connection.config })

      console.log(`✅ Connected to MCP server: ${connection.config.name}`)
    } catch (error) {
      connection.status = ServerStatus.ERROR
      connection.error = error instanceof Error ? error.message : 'Connection failed'
      this.connections.set(serverId, connection)

      this.emit('server-error', { serverId, error: connection.error })
      console.error(`❌ Failed to connect to ${connection.config.name}:`, error)
      throw error
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (connection.status === ServerStatus.DISCONNECTED) {
      console.log(`⚠️ Server ${serverId} is already disconnected`)
      return
    }

    try {
      console.log(`🔌 Disconnecting from MCP server: ${connection.config.name}`)

      // TODO: Implement actual MCP server disconnection logic

      connection.status = ServerStatus.DISCONNECTED
      connection.connectedAt = undefined
      connection.error = undefined
      connection.tools = undefined

      this.connections.set(serverId, connection)
      this.emit('server-disconnected', { serverId, server: connection.config })

      console.log(`✅ Disconnected from MCP server: ${connection.config.name}`)
    } catch (error) {
      console.error(`❌ Failed to disconnect from ${connection.config.name}:`, error)
      throw error
    }
  }

  /**
   * Remove a server configuration
   */
  async removeServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    // Disconnect if connected
    if (connection.status === ServerStatus.CONNECTED) {
      await this.disconnectServer(serverId)
    }

    this.servers.delete(serverId)
    this.connections.delete(serverId)
    delete this.toolsStats[serverId]

    this.emit('server-removed', { serverId, server: connection.config })
    console.log(`➖ Removed MCP server: ${connection.config.name}`)
  }

  /**
   * Reload all server configurations
   */
  async reload(): Promise<void> {
    console.log('🔄 Reloading MCP server configurations...')

    await this.loadConfiguration()

    this.emit('reloaded', {
      serverCount: this.servers.size,
      toolCount: this.tools.length,
    })

    console.log('✅ MCP configuration reloaded')
  }

  /**
   * Get server by name
   */
  getServerByName(name: string): MCPServerConfig | undefined {
    return Array.from(this.servers.values()).find((s) => s.name === name)
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Generate unique server ID
   */
  private generateServerId(name: string): string {
    const baseId = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const timestamp = Date.now().toString(36)
    return `${baseId}-${timestamp}`
  }

  /**
   * Get server by ID
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    return this.servers.get(serverId)
  }

  /**
   * Update server configuration
   */
  async updateServer(serverId: string, updates: Partial<MCPServerConfig>): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new Error(`Server ${serverId} not found`)
    }

    const updatedServer = { ...server, ...updates, id: serverId }
    this.servers.set(serverId, updatedServer)

    // Update connection config
    const connection = this.connections.get(serverId)
    if (connection) {
      connection.config = updatedServer
      this.connections.set(serverId, connection)
    }

    this.emit('server-updated', { serverId, server: updatedServer })
    console.log(`🔄 Updated MCP server: ${updatedServer.name}`)
  }

  /**
   * Execute a tool by name with given parameters
   */
  async executeTool(toolName: string, parameters: Record<string, any> = {}): Promise<any> {
    console.log(`🔧 Executing tool: ${toolName}`)

    // Find the tool
    const tool = this.tools.find((t) => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`)
    }

    // Find the connection for this tool
    const serverId = (tool as any).serverId || 'unknown'
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== ServerStatus.CONNECTED) {
      throw new Error(`Server for tool ${toolName} is not connected`)
    }

    try {
      // Execute the tool through MCP client
      const result = await (connection as any).client.callTool({
        name: toolName,
        arguments: parameters,
      })

      console.log(`✅ Tool ${toolName} executed successfully`)
      return result
    } catch (error) {
      console.error(`❌ Tool execution failed for ${toolName}:`, error)
      throw new Error(
        `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get status summary
   */
  getStatus() {
    const connections = Array.from(this.connections.values())

    return {
      initialized: this.initialized,
      totalServers: this.servers.size,
      connectedServers: connections.filter((c) => c.status === ServerStatus.CONNECTED).length,
      totalTools: this.tools.length,
      serverStats: this.toolsStats,
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP Loader Service...')

    // Disconnect all connected servers
    const connectedServers = Array.from(this.connections.entries())
      .filter(([, connection]) => connection.status === ServerStatus.CONNECTED)
      .map(([serverId]) => serverId)

    for (const serverId of connectedServers) {
      try {
        await this.disconnectServer(serverId)
      } catch (error) {
        console.warn(`Warning: Failed to disconnect server ${serverId}:`, error)
      }
    }

    this.servers.clear()
    this.connections.clear()
    this.tools = []
    this.toolsStats = {}
    this.initialized = false

    this.removeAllListeners()
    console.log('✅ MCP Loader cleanup completed')
  }
}

// Singleton instance
let instance: MCPLoaderService | null = null

/**
 * Get the singleton MCP loader instance
 */
export function getMCPLoaderService(): MCPLoaderService {
  if (!instance) {
    throw new Error('MCP Loader Service not initialized. Call initializeMCPLoaderService() first.')
  }
  return instance
}

/**
 * Initialize the MCP loader service
 */
export async function initializeMCPLoaderService(): Promise<MCPLoaderService> {
  if (instance) {
    console.log('⚠️ MCP Loader Service already initialized')
    return instance
  }

  console.log('🚀 Initializing MCP Loader Service...')

  instance = new MCPLoaderService()
  await instance.initialize()

  console.log('✅ MCP Loader Service initialized')
  return instance
}

/**
 * Cleanup the MCP loader service
 */
export async function cleanupMCPLoaderService(): Promise<void> {
  if (instance) {
    await instance.cleanup()
    instance = null
  }
}
