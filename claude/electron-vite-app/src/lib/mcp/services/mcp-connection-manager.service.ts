import { EventEmitter } from 'events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { ServerConfig, ServerConnection, ServerStatus, MCPTool } from '../types/mcp-server.types'
import { MCPConfigService, getMCPConfigService } from './mcp-config.service'

export class ConnectionManager extends EventEmitter {
  private connections: Map<string, ServerConnection> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private configService: MCPConfigService
  private initialized = false

  constructor() {
    super()
    this.setMaxListeners(100) // Allow many event listeners
    this.configService = getMCPConfigService()
  }

  /**
   * Initialize the connection manager and load servers from config
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🔌 Initializing MCP Connection Manager...')
      
      // Load server configurations from file
      const config = await this.configService.getConfig()
      console.log(`📋 Loaded ${config.servers.length} server configurations`)
      
      // Add servers from configuration
      const enabledServers: string[] = []
      for (const serverConfig of config.servers) {
        try {
          await this.addServerFromConfig(serverConfig)
          if (serverConfig.enabled) {
            enabledServers.push(serverConfig.id)
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load server ${serverConfig.name}:`, error)
        }
      }
      
      // Auto-connect enabled servers if configured
      if (config.defaultSettings.autoConnect && enabledServers.length > 0) {
        console.log(`🚀 Auto-connecting to ${enabledServers.length} enabled servers...`)
        
        // Connect servers in parallel with error handling
        const connectionPromises = enabledServers.map(async serverId => {
          try {
            await this.connectServer(serverId)
          } catch (error) {
            console.warn(`⚠️ Failed to auto-connect to server ${serverId}:`, error)
          }
        })
        
        await Promise.allSettled(connectionPromises)
      }
      
      this.initialized = true
      console.log('✅ MCP Connection Manager initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize MCP Connection Manager:', error)
      throw error
    }
  }

  /**
   * Add a server from configuration without auto-connecting
   */
  private async addServerFromConfig(config: ServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      console.warn(`⚠️ Server with id ${config.id} already exists, skipping`)
      return
    }

    const connection: ServerConnection = {
      config,
      status: ServerStatus.DISCONNECTED,
      reconnectAttempts: 0,
      tools: [],
      resources: [],
      prompts: [],
    }

    this.connections.set(config.id, connection)
    this.emit('server-added', { serverId: config.id })
  }

  /**
   * Add a new server configuration and save to config file
   */
  async addServer(config: ServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      throw new Error(`Server with id ${config.id} already exists`)
    }

    // Add to configuration file
    await this.configService.addServer(config)

    const connection: ServerConnection = {
      config,
      status: ServerStatus.DISCONNECTED,
      reconnectAttempts: 0,
      tools: [],
      resources: [],
      prompts: [],
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

    // Remove from configuration file
    await this.configService.removeServer(serverId)

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

    // Update configuration in file
    await this.configService.updateServer(serverId, updates)

    // Disconnect if connected
    if (wasConnected) {
      await this.disconnectServer(serverId)
    }

    // Update in-memory configuration
    connection.config = { ...connection.config, ...updates }

    // Reconnect if it was connected and still enabled
    if (wasConnected && connection.config.enabled) {
      await this.connectServer(serverId)
    }

    this.emit('server-updated', { serverId })
  }

  /**
   * Connect to a server with enhanced error handling and stability
   */
  async connectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (
      connection.status === ServerStatus.CONNECTED ||
      connection.status === ServerStatus.CONNECTING
    ) {
      return // Already connected or connecting
    }

    const timeout = 15000 // 15 second timeout
    let timeoutId: NodeJS.Timeout | null = null

    try {
      connection.status = ServerStatus.CONNECTING
      this.emit('server-status-changed', { serverId, status: ServerStatus.CONNECTING })

      console.log(`🔌 Attempting to connect to MCP server: ${connection.config.name}`)

      // Create connection with timeout
      const connectionPromise = this.performConnection(connection)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Connection timeout after ${timeout}ms`))
        }, timeout)
      })

      await Promise.race([connectionPromise, timeoutPromise])

      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      // Update connection status
      connection.status = ServerStatus.CONNECTED
      connection.connectedAt = new Date()
      connection.lastError = undefined
      connection.reconnectAttempts = 0

      this.emit('server-connected', { serverId })
      this.emit('server-status-changed', { serverId, status: ServerStatus.CONNECTED })

      console.log(`✅ Connected to MCP server: ${connection.config.name}`)
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      connection.status = ServerStatus.ERROR
      connection.lastError = errorMessage

      this.emit('server-error', {
        serverId,
        error: connection.lastError,
      })
      this.emit('server-status-changed', { serverId, status: ServerStatus.ERROR })

      console.error(`❌ Failed to connect to server ${serverId}:`, errorMessage)

      // Clean up any partial connections
      await this.cleanupConnection(connection)

      // Schedule reconnect if enabled and not too many attempts
      if (
        connection.config.autoReconnect &&
        connection.reconnectAttempts < (connection.config.maxReconnectAttempts || 5)
      ) {
        this.scheduleReconnect(serverId)
      }

      throw error
    }
  }

  /**
   * Perform the actual connection setup
   */
  private async performConnection(connection: ServerConnection): Promise<void> {
    // Create transport based on configuration
    const transport = await this.createTransport(connection.config)

    // Create MCP client with enhanced error handling
    const client = new Client(
      {
        name: 'electron-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          // Define client capabilities if needed
        },
      }
    )

    // Set up error handlers before connecting (if available)
    if (typeof client.onerror !== 'undefined') {
      client.onerror = (error) => {
        console.error(`MCP client error for ${connection.config.name}:`, error)
        this.handleConnectionError(connection.config.id, error)
      }
    }

    // Connect to server
    await client.connect(transport)

    // Store connection references
    connection.client = client
    connection.transport = transport

    // Discover capabilities with retry logic
    await this.discoverCapabilitiesWithRetry(connection)
  }

  /**
   * Clean up partial connections
   */
  private async cleanupConnection(connection: ServerConnection): Promise<void> {
    try {
      if (connection.client) {
        await connection.client.close()
      }
    } catch (error) {
      console.warn(`Warning: Error cleaning up connection:`, error)
    }

    connection.client = undefined
    connection.transport = undefined
    connection.tools = []
    connection.resources = []
    connection.prompts = []
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(serverId: string, error: any): void {
    const connection = this.connections.get(serverId)
    if (!connection) return

    console.error(`Connection error for ${serverId}:`, error)

    // Mark as error state
    connection.status = ServerStatus.ERROR
    connection.lastError = error instanceof Error ? error.message : 'Connection error'

    this.emit('server-error', { serverId, error: connection.lastError })
    this.emit('server-status-changed', { serverId, status: ServerStatus.ERROR })

    // Schedule reconnect if appropriate
    if (
      connection.config.autoReconnect &&
      connection.reconnectAttempts < (connection.config.maxReconnectAttempts || 5)
    ) {
      this.scheduleReconnect(serverId)
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
   * Execute a tool on the appropriate server with enhanced error handling
   */
  async executeTool(
    serverId: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (connection.status !== ServerStatus.CONNECTED || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`)
    }

    // Verify tool exists
    const toolExists = connection.tools.some((tool) => tool.name === toolName)
    if (!toolExists) {
      throw new Error(`Tool '${toolName}' not found on server ${serverId}`)
    }

    const timeout = 30000 // 30 second timeout for tool execution
    let timeoutId: NodeJS.Timeout | null = null

    try {
      console.log(`⚡ Executing tool ${toolName} on server ${connection.config.name}`)

      const executionPromise = connection.client.callTool({
        name: toolName,
        arguments: parameters,
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Tool execution timeout after ${timeout}ms`))
        }, timeout)
      })

      const result = await Promise.race([executionPromise, timeoutPromise])

      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      console.log(`✅ Tool ${toolName} executed successfully`)
      return result
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Tool execution failed for ${toolName} on ${serverId}:`, errorMessage)

      // If the error suggests connection issues, mark server as having problems
      if (
        errorMessage.includes('connection') ||
        errorMessage.includes('transport') ||
        errorMessage.includes('closed')
      ) {
        console.warn(`Connection issue detected for server ${serverId}, marking as error state`)
        this.handleConnectionError(serverId, error)
      }

      throw new Error(`Tool execution failed: ${errorMessage}`)
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
          env: envVars,
        })

      case 'http':
        return this.createHttpTransport(config)

      case 'sse':
        if (!config.url) {
          throw new Error('URL is required for SSE transport')
        }
        return new SSEClientTransport(new URL(config.url))

      default:
        throw new Error(`Unsupported transport type: ${config.transport}`)
    }
  }

  /**
   * Discover server capabilities with retry logic
   */
  private async discoverCapabilitiesWithRetry(connection: ServerConnection): Promise<void> {
    if (!connection.client) return

    const maxRetries = 3
    let attempt = 1

    while (attempt <= maxRetries) {
      try {
        console.log(
          `🔍 Discovering capabilities for ${connection.config.name} (attempt ${attempt}/${maxRetries})...`
        )
        await this.discoverCapabilities(connection)
        return
      } catch (error) {
        console.warn(`Capability discovery attempt ${attempt} failed:`, error)

        if (attempt === maxRetries) {
          console.error(
            `Failed to discover capabilities for ${connection.config.name} after ${maxRetries} attempts`
          )
          // Don't fail the connection, just continue without capabilities
          return
        }

        // Wait before retry
        const delay = Math.pow(2, attempt - 1) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
        attempt++
      }
    }
  }

  /**
   * Discover server capabilities (tools, resources, prompts)
   */
  private async discoverCapabilities(connection: ServerConnection): Promise<void> {
    if (!connection.client) return

    try {
      // Discover tools with timeout
      const toolsPromise = connection.client.listTools()
      const toolsTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tools discovery timeout')), 5000)
      )

      try {
        const toolsResponse = await Promise.race([toolsPromise, toolsTimeout])
        connection.tools = toolsResponse.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || '',
          serverId: connection.config.id,
          serverName: connection.config.name,
          inputSchema: tool.inputSchema as any,
          category: this.categorizeToolByName(tool.name),
          tags: [],
        }))

        this.emit('tools-discovered', {
          serverId: connection.config.id,
          tools: connection.tools,
        })
      } catch (error) {
        console.warn(`Tools discovery failed for ${connection.config.name}:`, error)
        connection.tools = []
      }

      // Discover resources (optional)
      try {
        const resourcesPromise = connection.client.listResources()
        const resourcesTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Resources discovery timeout')), 3000)
        )

        const resourcesResponse = await Promise.race([resourcesPromise, resourcesTimeout])
        connection.resources = resourcesResponse.resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name || resource.uri,
          description: resource.description,
          mimeType: resource.mimeType,
          serverId: connection.config.id,
          serverName: connection.config.name,
        }))
      } catch (error) {
        // Resources might not be supported or timed out
        console.warn(`Resources not supported or accessible by ${connection.config.name}`)
        connection.resources = []
      }

      // Discover prompts (optional)
      try {
        const promptsPromise = connection.client.listPrompts()
        const promptsTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Prompts discovery timeout')), 3000)
        )

        const promptsResponse = await Promise.race([promptsPromise, promptsTimeout])
        connection.prompts = promptsResponse.prompts.map((prompt) => ({
          name: prompt.name,
          description: prompt.description || '',
          serverId: connection.config.id,
          serverName: connection.config.name,
          arguments: prompt.arguments?.map((arg) => ({
            name: arg.name,
            description: arg.description || '',
            required: arg.required || false,
          })),
        }))
      } catch (error) {
        // Prompts might not be supported or timed out
        console.warn(`Prompts not supported or accessible by ${connection.config.name}`)
        connection.prompts = []
      }

      console.log(
        `✅ Discovered capabilities for ${connection.config.name}: ${connection.tools.length} tools, ${connection.resources.length} resources, ${connection.prompts.length} prompts`
      )
    } catch (error) {
      console.error(`Failed to discover capabilities for ${connection.config.name}:`, error)
      throw error
    }
  }

  /**
   * Simple tool categorization based on name patterns
   */
  private categorizeToolByName(toolName: string): string {
    const name = toolName.toLowerCase()

    if (name.includes('search') || name.includes('find') || name.includes('query')) {
      return 'Search'
    } else if (
      name.includes('file') ||
      name.includes('read') ||
      name.includes('write') ||
      name.includes('upload')
    ) {
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

    console.log(
      `🔄 Scheduling reconnect attempt ${connection.reconnectAttempts} for ${connection.config.name} in ${delay}ms`
    )

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
    const disconnectPromises = Array.from(this.connections.keys()).map((serverId) =>
      this.disconnectServer(serverId).catch((error) =>
        console.warn(`Warning: Error disconnecting ${serverId}:`, error)
      )
    )

    await Promise.all(disconnectPromises)
    this.connections.clear()
    this.initialized = false

    console.log('✅ Connection Manager cleanup completed')
  }

  /**
   * Reload servers from configuration file
   */
  async reloadConfig(): Promise<void> {
    console.log('🔄 Reloading MCP server configuration...')
    
    try {
      // Get current configuration
      const config = await this.configService.loadConfig()
      
      // Get currently loaded server IDs
      const currentServerIds = new Set(this.connections.keys())
      const configServerIds = new Set(config.servers.map(s => s.id))
      
      // Remove servers that are no longer in config
      for (const serverId of currentServerIds) {
        if (!configServerIds.has(serverId)) {
          console.log(`🗑️ Removing server no longer in config: ${serverId}`)
          await this.removeServer(serverId)
        }
      }
      
      // Add or update servers from config
      for (const serverConfig of config.servers) {
        if (currentServerIds.has(serverConfig.id)) {
          // Update existing server
          const currentConfig = this.connections.get(serverConfig.id)?.config
          if (currentConfig && JSON.stringify(currentConfig) !== JSON.stringify(serverConfig)) {
            console.log(`🔄 Updating server config: ${serverConfig.id}`)
            await this.updateServer(serverConfig.id, serverConfig)
          }
        } else {
          // Add new server
          console.log(`➕ Adding new server from config: ${serverConfig.id}`)
          await this.addServerFromConfig(serverConfig)
          if (serverConfig.enabled && config.defaultSettings.autoConnect) {
            await this.connectServer(serverConfig.id)
          }
        }
      }
      
      console.log('✅ Configuration reloaded successfully')
    } catch (error) {
      console.error('❌ Failed to reload configuration:', error)
      throw error
    }
  }

  /**
   * Get configuration service
   */
  getConfigService(): MCPConfigService {
    return this.configService
  }

  /**
   * Create HTTP transport for MCP over HTTP
   */
  private createHttpTransport(config: ServerConfig): any {
    if (!config.url) {
      throw new Error('URL is required for HTTP transport')
    }

    return {
      async connect() {
        console.log(`🔗 Connecting to HTTP MCP server: ${config.url}`)
      },
      
      async close() {
        console.log(`🔌 Closing HTTP connection: ${config.url}`)
      },
      
      async send(message: any) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000)
          
          const response = await fetch(config.url!, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              ...config.headers,
            },
            body: JSON.stringify(message),
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const result = await response.json()
          return result
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timeout')
          }
          throw error
        }
      }
    }
  }
}

// Singleton instance
let connectionManager: ConnectionManager | null = null

export function getConnectionManager(): ConnectionManager {
  if (!connectionManager) {
    connectionManager = new ConnectionManager()
  }
  return connectionManager
}

export async function initializeConnectionManager(): Promise<ConnectionManager> {
  const manager = getConnectionManager()
  await manager.initialize()
  return manager
}
