import { EventEmitter } from 'events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { 
  ServerConfig, 
  ServerConnection, 
  ServerStatus,
  MCPTool
} from '../types/mcp-server.types'

export class ConnectionManager extends EventEmitter {
  private connections: Map<string, ServerConnection> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    super()
    this.setMaxListeners(100) // Allow many event listeners
  }

  /**
   * Add a new server configuration
   */
  async addServer(config: ServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      throw new Error(`Server with id ${config.id} already exists`)
    }

    const connection: ServerConnection = {
      config,
      status: ServerStatus.DISCONNECTED,
      reconnectAttempts: 0,
      tools: [],
      resources: [],
      prompts: []
    }

    this.connections.set(config.id, connection)
    this.emit('server-added', { serverId: config.id })

    if (config.enabled) {
      await this.connectServer(config.id)
    }
  }

  /**
   * Remove a server and disconnect if connected
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

    // Clear reconnect timer
    const timer = this.reconnectTimers.get(serverId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(serverId)
    }

    this.connections.delete(serverId)
    this.emit('server-removed', { serverId })
  }

  /**
   * Update server configuration
   */
  async updateServer(serverId: string, updates: Partial<ServerConfig>): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    const wasConnected = connection.status === ServerStatus.CONNECTED
    
    // Disconnect if connected
    if (wasConnected) {
      await this.disconnectServer(serverId)
    }

    // Update configuration
    connection.config = { ...connection.config, ...updates }
    
    // Reconnect if it was connected and still enabled
    if (wasConnected && connection.config.enabled) {
      await this.connectServer(serverId)
    }

    this.emit('server-updated', { serverId })
  }

  /**
   * Connect to a server
   */
  async connectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (connection.status === ServerStatus.CONNECTED || connection.status === ServerStatus.CONNECTING) {
      return // Already connected or connecting
    }

    try {
      connection.status = ServerStatus.CONNECTING
      this.emit('server-status-changed', { serverId, status: ServerStatus.CONNECTING })

      // Create transport based on configuration
      const transport = await this.createTransport(connection.config)
      
      // Create MCP client
      const client = new Client({
        name: 'electron-mcp-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      })

      // Connect to server
      await client.connect(transport)

      // Update connection
      connection.client = client
      connection.transport = transport
      connection.status = ServerStatus.CONNECTED
      connection.connectedAt = new Date()
      connection.lastError = undefined
      connection.reconnectAttempts = 0

      // Discover capabilities
      await this.discoverCapabilities(connection)

      this.emit('server-connected', { serverId })
      this.emit('server-status-changed', { serverId, status: ServerStatus.CONNECTED })

      console.log(`✅ Connected to MCP server: ${connection.config.name}`)
    } catch (error) {
      connection.status = ServerStatus.ERROR
      connection.lastError = error instanceof Error ? error.message : 'Unknown error'
      
      this.emit('server-error', { 
        serverId, 
        error: connection.lastError 
      })
      this.emit('server-status-changed', { serverId, status: ServerStatus.ERROR })

      console.error(`❌ Failed to connect to server ${serverId}:`, error)

      // Schedule reconnect if enabled
      if (connection.config.autoReconnect && 
          connection.reconnectAttempts < (connection.config.maxReconnectAttempts || 5)) {
        this.scheduleReconnect(serverId)
      }

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

    // Clear reconnect timer
    const timer = this.reconnectTimers.get(serverId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(serverId)
    }

    try {
      if (connection.client) {
        await connection.client.close()
      }
    } catch (error) {
      console.warn(`Warning: Error closing client for ${serverId}:`, error)
    }

    connection.client = undefined
    connection.transport = undefined
    connection.status = ServerStatus.DISCONNECTED
    connection.connectedAt = undefined
    connection.tools = []
    connection.resources = []
    connection.prompts = []

    this.emit('server-disconnected', { serverId })
    this.emit('server-status-changed', { serverId, status: ServerStatus.DISCONNECTED })

    console.log(`🔌 Disconnected from server: ${connection.config.name}`)
  }

  /**
   * Get all server connections
   */
  getConnections(): ServerConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Get a specific server connection
   */
  getConnection(serverId: string): ServerConnection | undefined {
    return this.connections.get(serverId)
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = []
    for (const connection of this.connections.values()) {
      if (connection.status === ServerStatus.CONNECTED) {
        tools.push(...connection.tools)
      }
    }
    return tools
  }

  /**
   * Execute a tool on the appropriate server
   */
  async executeTool(serverId: string, toolName: string, parameters: Record<string, any>): Promise<any> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (connection.status !== ServerStatus.CONNECTED || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`)
    }

    try {
      const result = await connection.client.callTool({
        name: toolName,
        arguments: parameters
      })

      return result
    } catch (error) {
      console.error(`Tool execution failed for ${toolName} on ${serverId}:`, error)
      throw error
    }
  }

  /**
   * Create transport based on server configuration
   */
  private async createTransport(config: ServerConfig): Promise<any> {
    switch (config.transport) {
      case 'stdio':
        if (!config.command) {
          throw new Error('Command is required for stdio transport')
        }
        const envVars: Record<string, string> = {}
        // Copy process.env with string values only
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            envVars[key] = value
          }
        }
        // Override with config env
        if (config.env) {
          Object.assign(envVars, config.env)
        }

        return new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          cwd: config.cwd,
          env: envVars
        })
      
      case 'http':
      case 'sse':
        // TODO: Implement HTTP/SSE transports when needed
        throw new Error(`Transport ${config.transport} not yet implemented`)
      
      default:
        throw new Error(`Unsupported transport type: ${config.transport}`)
    }
  }

  /**
   * Discover server capabilities (tools, resources, prompts)
   */
  private async discoverCapabilities(connection: ServerConnection): Promise<void> {
    if (!connection.client) return

    try {
      // Discover tools
      const toolsResponse = await connection.client.listTools()
      connection.tools = toolsResponse.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        serverId: connection.config.id,
        serverName: connection.config.name,
        inputSchema: tool.inputSchema as any,
        category: this.categorizeToolByName(tool.name),
        tags: []
      }))

      this.emit('tools-discovered', { 
        serverId: connection.config.id, 
        tools: connection.tools 
      })

      // Discover resources
      try {
        const resourcesResponse = await connection.client.listResources()
        connection.resources = resourcesResponse.resources.map(resource => ({
          uri: resource.uri,
          name: resource.name || resource.uri,
          description: resource.description,
          mimeType: resource.mimeType,
          serverId: connection.config.id,
          serverName: connection.config.name
        }))
      } catch (error) {
        // Resources might not be supported
        console.warn(`Resources not supported by ${connection.config.name}`)
      }

      // Discover prompts
      try {
        const promptsResponse = await connection.client.listPrompts()
        connection.prompts = promptsResponse.prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description || '',
          serverId: connection.config.id,
          serverName: connection.config.name,
          arguments: prompt.arguments?.map(arg => ({
            name: arg.name,
            description: arg.description || '',
            required: arg.required || false
          }))
        }))
      } catch (error) {
        // Prompts might not be supported
        console.warn(`Prompts not supported by ${connection.config.name}`)
      }

      console.log(`🔍 Discovered capabilities for ${connection.config.name}: ${connection.tools.length} tools, ${connection.resources.length} resources, ${connection.prompts.length} prompts`)
    } catch (error) {
      console.error(`Failed to discover capabilities for ${connection.config.name}:`, error)
    }
  }

  /**
   * Simple tool categorization based on name patterns
   */
  private categorizeToolByName(toolName: string): string {
    const name = toolName.toLowerCase()
    
    if (name.includes('search') || name.includes('find') || name.includes('query')) {
      return 'Search'
    } else if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('upload')) {
      return 'File Operations'
    } else if (name.includes('web') || name.includes('http') || name.includes('api')) {
      return 'Web & API'
    } else if (name.includes('db') || name.includes('database') || name.includes('sql')) {
      return 'Database'
    } else if (name.includes('server') || name.includes('status') || name.includes('health')) {
      return 'System'
    } else {
      return 'General'
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(serverId: string): void {
    const connection = this.connections.get(serverId)
    if (!connection) return

    const delay = connection.config.reconnectDelay || 5000
    connection.reconnectAttempts++

    console.log(`🔄 Scheduling reconnect attempt ${connection.reconnectAttempts} for ${connection.config.name} in ${delay}ms`)

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(serverId)
      
      try {
        connection.status = ServerStatus.RECONNECTING
        this.emit('server-status-changed', { serverId, status: ServerStatus.RECONNECTING })
        
        await this.connectServer(serverId)
      } catch (error) {
        console.error(`Reconnect attempt failed for ${serverId}:`, error)
      }
    }, delay)

    this.reconnectTimers.set(serverId, timer)
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Connection Manager...')
    
    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()

    // Disconnect all servers
    const disconnectPromises = Array.from(this.connections.keys()).map(serverId => 
      this.disconnectServer(serverId).catch(error => 
        console.warn(`Warning: Error disconnecting ${serverId}:`, error)
      )
    )

    await Promise.all(disconnectPromises)
    this.connections.clear()

    console.log('✅ Connection Manager cleanup completed')
  }
}