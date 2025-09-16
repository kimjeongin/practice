import { EventEmitter } from 'events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Tool } from '@langchain/core/tools'

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
  tools?: Tool[]
  client?: Client
  transport?: StdioClientTransport
}

/**
 * Enhanced MCP Loader Service
 * Provides a clean interface for managing MCP tools and servers with LangChain integration
 */
export class MCPLoaderService extends EventEmitter {
  private servers: Map<string, MCPServerConfig> = new Map()
  private connections: Map<string, ServerConnection> = new Map()
  private tools: Tool[] = []
  private toolsStats: Record<string, number> = {}
  private initialized = false
  private initializing = false

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /**
   * Initialize the MCP loader service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('✅ MCP Loader Service already initialized')
      return
    }

    if (this.initializing) {
      console.log('⏳ MCP Loader Service already initializing, waiting...')
      // Wait for current initialization to complete
      return new Promise((resolve, reject) => {
        const checkInit = () => {
          if (this.initialized) {
            resolve()
          } else if (!this.initializing) {
            reject(new Error('Initialization failed'))
          } else {
            setTimeout(checkInit, 100)
          }
        }
        checkInit()
      })
    }

    this.initializing = true

    try {
      console.log('🚀 Initializing MCP Loader Service...')

      // Load default configuration
      await this.loadConfiguration()

      // Auto-connect enabled servers
      const enabledServers = Array.from(this.servers.values()).filter((server) => server.enabled)
      console.log(`🔌 Auto-connecting ${enabledServers.length} enabled servers...`)

      for (const server of enabledServers) {
        try {
          await this.connectServer(server.id)
        } catch (error) {
          console.warn(`⚠️ Failed to auto-connect server ${server.name}:`, error)
        }
      }

      this.initialized = true
      this.initializing = false
      console.log('✅ MCP Loader Service initialized')

      this.emit('initialized', {
        serverCount: this.servers.size,
        toolCount: this.tools.length,
      })
    } catch (error) {
      this.initializing = false
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
        id: 'rag-server',
        name: 'RAG Server',
        description: 'RAG-based document search and Q&A',
        command: 'node',
        args: ['../rag-server/dist/app/index.js'],
        env: {
          DOCUMENTS_DIR: '../rag-server/documents',
          DATA_DIR: '../rag-server/.data',
        },
        transport: 'stdio',
        enabled: true, // Disable RAG server - path doesn't exist
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
  getTools(): Tool[] {
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

      // Create MCP client and transport
      const client = new Client(
        {
          name: 'electron-vite-app',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      )

      let transport: StdioClientTransport

      if (connection.config.transport === 'stdio' && connection.config.command) {
        // Create environment with proper type handling
        const baseEnv: Record<string, string> = {}
        for (const [key, value] of Object.entries(process.env)) {
          if (typeof value === 'string') {
            baseEnv[key] = value
          }
        }

        transport = new StdioClientTransport({
          command: connection.config.command,
          args: connection.config.args || [],
          env: { ...connection.config.env },
        })
      } else {
        throw new Error('Only stdio transport is currently supported')
      }

      // Connect to the server
      await client.connect(transport)

      // Get available tools
      const toolsResult = await client.listTools()
      console.log(`📋 Found ${toolsResult.tools?.length || 0} tools from ${connection.config.name}`)

      // Create a simple tool wrapper for MCP tools
      class MCPTool extends Tool {
        name: string
        description: string
        private client: Client
        private toolName: string

        constructor(client: Client, mcpTool: any) {
          super()
          this.client = client
          this.toolName = mcpTool.name
          this.name = mcpTool.name
          this.description = mcpTool.description || 'No description available'
        }

        async _call(args: string): Promise<string> {
          try {
            // Try to parse args as JSON, fall back to using as-is
            let parsedArgs
            try {
              parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
            } catch {
              parsedArgs = { input: args }
            }

            const result = await this.client.callTool({
              name: this.toolName,
              arguments: parsedArgs,
            })

            return JSON.stringify(result, null, 2)
          } catch (error) {
            throw new Error(
              `MCP tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          }
        }
      }

      // Convert MCP tools to our tool format
      const tools = (toolsResult.tools || []).map((mcpTool) => new MCPTool(client, mcpTool))

      connection.status = ServerStatus.CONNECTED
      connection.connectedAt = new Date()
      connection.error = undefined
      connection.client = client
      connection.transport = transport
      connection.tools = tools

      // Update global tools list
      this.tools = this.tools.filter(
        (tool) => !(tool as any).serverId || (tool as any).serverId !== serverId
      )
      tools.forEach((tool) => {
        ;(tool as any).serverId = serverId
        this.tools.push(tool)
      })

      this.toolsStats[serverId] = tools.length

      this.connections.set(serverId, connection)
      this.emit('server-connected', { serverId, server: connection.config })

      console.log(`✅ Connected to MCP server: ${connection.config.name} (${tools.length} tools)`)
    } catch (error) {
      connection.status = ServerStatus.ERROR
      connection.error = error instanceof Error ? error.message : 'Connection failed'

      // Cleanup on failure
      if (connection.client) {
        try {
          await connection.client.close()
        } catch (closeError) {
          console.warn('Failed to close client during cleanup:', closeError)
        }
      }
      connection.client = undefined
      connection.transport = undefined
      connection.tools = undefined

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

      // Close MCP client connection
      if (connection.client) {
        await connection.client.close()
      }

      // Remove tools from global list
      this.tools = this.tools.filter((tool) => (tool as any).serverId !== serverId)
      this.toolsStats[serverId] = 0

      connection.status = ServerStatus.DISCONNECTED
      connection.connectedAt = undefined
      connection.error = undefined
      connection.tools = undefined
      connection.client = undefined
      connection.transport = undefined

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

    if (!connection.client) {
      throw new Error(`No client available for tool ${toolName}`)
    }

    try {
      // Execute the tool through MCP client
      const result = await connection.client.callTool({
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

    // Force cleanup any remaining client connections
    for (const [serverId, connection] of this.connections.entries()) {
      if (connection.client) {
        try {
          await connection.client.close()
        } catch (error) {
          console.warn(`Warning: Failed to close client for ${serverId}:`, error)
        }
      }
    }

    this.servers.clear()
    this.connections.clear()
    this.tools = []
    this.toolsStats = {}
    this.initialized = false
    this.initializing = false

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
