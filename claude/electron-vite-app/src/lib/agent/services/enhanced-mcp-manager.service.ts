import { EventEmitter } from 'events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { 
  EnhancedServerConfig, 
  EnhancedTransportType 
} from '../types/agent.types'
import { 
  ServerConnection, 
  ServerStatus, 
  MCPTool 
} from '../../mcp/types/mcp-server.types'

/**
 * Enhanced MCP Connection Manager supporting stdio and streamable-http transports
 */
export class EnhancedMCPManager extends EventEmitter {
  private connections: Map<string, ServerConnection> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private httpClients: Map<string, any> = new Map() // For HTTP transport clients
  
  constructor() {
    super()
    this.setMaxListeners(100)
  }

  /**
   * Add a new server with enhanced transport support
   */
  async addServer(config: EnhancedServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      throw new Error(`Server with id ${config.id} already exists`)
    }

    const connection: ServerConnection = {
      config: this.convertToStandardConfig(config),
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
   * Connect to server using appropriate transport
   */
  async connectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      throw new Error(`Server ${serverId} not found`)
    }

    if (connection.status === ServerStatus.CONNECTED || 
        connection.status === ServerStatus.CONNECTING) {
      return
    }

    try {
      connection.status = ServerStatus.CONNECTING
      this.emit('server-status-changed', { serverId, status: ServerStatus.CONNECTING })

      const enhancedConfig = this.getEnhancedConfig(connection.config)
      const transport = await this.createEnhancedTransport(enhancedConfig)
      
      // Create MCP client
      const client = new Client({
        name: 'electron-agent-client',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      })

      // Connect using appropriate transport
      await client.connect(transport)

      // Update connection
      connection.client = client
      connection.transport = transport
      connection.status = ServerStatus.CONNECTED
      connection.connectedAt = new Date()
      connection.lastError = undefined
      connection.reconnectAttempts = 0

      // Store HTTP client reference if needed
      if (enhancedConfig.transport === 'http' || enhancedConfig.transport === 'streamable-http') {
        this.httpClients.set(serverId, { client, transport })
      }

      // Discover capabilities
      await this.discoverCapabilities(connection)

      this.emit('server-connected', { serverId })
      this.emit('server-status-changed', { serverId, status: ServerStatus.CONNECTED })

      console.log(`✅ Connected to MCP server: ${connection.config.name} via ${enhancedConfig.transport}`)

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
   * Create transport based on enhanced configuration
   */
  private async createEnhancedTransport(config: EnhancedServerConfig): Promise<any> {
    switch (config.transport) {
      case 'stdio':
        return this.createStdioTransport(config)
      
      case 'http':
        return this.createHttpTransport(config)
        
      case 'streamable-http':
        return this.createStreamableHttpTransport(config)
      
      default:
        throw new Error(`Unsupported transport type: ${config.transport}`)
    }
  }

  /**
   * Create stdio transport (existing implementation)
   */
  private async createStdioTransport(config: EnhancedServerConfig): Promise<any> {
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
  }

  /**
   * Create HTTP transport
   */
  private async createHttpTransport(config: EnhancedServerConfig): Promise<any> {
    if (!config.url) {
      throw new Error('URL is required for HTTP transport')
    }

    // For HTTP transport, we can use a custom implementation or a library
    // Here's a basic implementation that can be extended
    return {
      async connect() {
        // HTTP transport connection logic
        console.log(`Connecting to HTTP MCP server: ${config.url}`)
      },
      async close() {
        console.log(`Closing HTTP connection: ${config.url}`)
      },
      async send(message: any) {
        const response = await fetch(config.url!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.headers || {})
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(config.timeout || 30000)
        })
        
        if (!response.ok) {
          throw new Error(`HTTP request failed: ${response.statusText}`)
        }
        
        return response.json()
      }
    }
  }

  /**
   * Create streamable HTTP transport (SSE)
   */
  private async createStreamableHttpTransport(config: EnhancedServerConfig): Promise<any> {
    if (!config.url) {
      throw new Error('URL is required for streamable-http transport')
    }

    // Use SSE transport for streaming HTTP
    return new SSEClientTransport(new URL(config.url!))
  }

  /**
   * Disconnect from server
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

    // Clean up HTTP client reference
    this.httpClients.delete(serverId)

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
   * Execute tool with enhanced error handling
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

    try {
      const startTime = Date.now()
      
      const result = await connection.client.callTool({
        name: toolName,
        arguments: parameters
      })

      const executionTime = Date.now() - startTime

      this.emit('tool-executed', {
        serverId,
        toolName,
        parameters,
        result,
        executionTime
      })

      return result
    } catch (error) {
      console.error(`Tool execution failed for ${toolName} on ${serverId}:`, error)
      
      this.emit('tool-execution-error', {
        serverId,
        toolName,
        parameters,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }

  /**
   * Get all available tools from connected servers
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
   * Get tools filtered by transport type
   */
  getToolsByTransport(transportType: EnhancedTransportType): MCPTool[] {
    const tools: MCPTool[] = []
    for (const connection of this.connections.values()) {
      if (connection.status === ServerStatus.CONNECTED) {
        const enhancedConfig = this.getEnhancedConfig(connection.config)
        if (enhancedConfig.transport === transportType) {
          tools.push(...connection.tools)
        }
      }
    }
    return tools
  }

  /**
   * Get all connections
   */
  getConnections(): ServerConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Get connection by server ID
   */
  getConnection(serverId: string): ServerConnection | undefined {
    return this.connections.get(serverId)
  }

  /**
   * Discover server capabilities
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

      // Discover resources (optional)
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
        console.warn(`Resources not supported by ${connection.config.name}`)
      }

      // Discover prompts (optional)
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
        console.warn(`Prompts not supported by ${connection.config.name}`)
      }

      console.log(`🔍 Discovered capabilities for ${connection.config.name}: ${connection.tools.length} tools, ${connection.resources.length} resources, ${connection.prompts.length} prompts`)
    } catch (error) {
      console.error(`Failed to discover capabilities for ${connection.config.name}:`, error)
    }
  }

  /**
   * Categorize tool by name patterns
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
   * Convert enhanced config to standard config
   */
  private convertToStandardConfig(enhancedConfig: EnhancedServerConfig): any {
    return {
      id: enhancedConfig.id,
      name: enhancedConfig.name,
      description: enhancedConfig.description,
      transport: enhancedConfig.transport === 'streamable-http' ? 'sse' : enhancedConfig.transport,
      command: enhancedConfig.command,
      args: enhancedConfig.args,
      cwd: enhancedConfig.cwd,
      env: enhancedConfig.env,
      url: enhancedConfig.url,
      enabled: enhancedConfig.enabled,
      autoReconnect: enhancedConfig.autoReconnect,
      reconnectDelay: enhancedConfig.reconnectDelay,
      maxReconnectAttempts: enhancedConfig.maxReconnectAttempts,
      tags: enhancedConfig.tags
    }
  }

  /**
   * Get enhanced config from standard config
   */
  private getEnhancedConfig(standardConfig: any): EnhancedServerConfig {
    return {
      id: standardConfig.id,
      name: standardConfig.name,
      description: standardConfig.description,
      transport: standardConfig.transport === 'sse' ? 'streamable-http' : standardConfig.transport,
      command: standardConfig.command,
      args: standardConfig.args,
      cwd: standardConfig.cwd,
      env: standardConfig.env,
      url: standardConfig.url,
      headers: {},
      timeout: 30000,
      enabled: standardConfig.enabled,
      autoReconnect: standardConfig.autoReconnect,
      reconnectDelay: standardConfig.reconnectDelay,
      maxReconnectAttempts: standardConfig.maxReconnectAttempts,
      tags: standardConfig.tags
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Enhanced MCP Manager...')
    
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
    this.httpClients.clear()

    console.log('✅ Enhanced MCP Manager cleanup completed')
  }
}

// Singleton instance
let enhancedMCPManager: EnhancedMCPManager | null = null

export function getEnhancedMCPManager(): EnhancedMCPManager {
  if (!enhancedMCPManager) {
    enhancedMCPManager = new EnhancedMCPManager()
  }
  return enhancedMCPManager
}