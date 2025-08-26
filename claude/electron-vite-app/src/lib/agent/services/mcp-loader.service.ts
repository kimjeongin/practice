import { EventEmitter } from 'events'
import { StructuredTool } from '@langchain/core/tools'

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  transport?: 'stdio' | 'http'
  url?: string
}

/**
 * Simplified MCP Loader Service
 * Provides a clean interface for managing MCP tools and servers
 */
export class MCPLoaderService extends EventEmitter {
  private servers: MCPServerConfig[] = []
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
        serverCount: this.servers.length,
        toolCount: this.tools.length
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
    // For now, use a simple default configuration
    // This can be extended to load from file system later
    this.servers = [
      {
        name: 'example-server',
        command: 'node',
        args: ['server.js'],
        transport: 'stdio'
      }
    ]

    // Mock tools for demonstration
    this.tools = []
    this.toolsStats = {}
    
    this.servers.forEach(server => {
      this.toolsStats[server.name] = 0
    })

    console.log(`📋 Loaded ${this.servers.length} MCP server configurations`)
  }

  /**
   * Get all configured servers
   */
  getServers(): MCPServerConfig[] {
    return [...this.servers]
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
    this.servers.push(config)
    this.toolsStats[config.name] = 0
    
    this.emit('server-added', config)
    console.log(`➕ Added MCP server: ${config.name}`)
  }

  /**
   * Remove a server configuration
   */
  removeServer(serverName: string): void {
    this.servers = this.servers.filter(s => s.name !== serverName)
    delete this.toolsStats[serverName]
    
    this.emit('server-removed', serverName)
    console.log(`➖ Removed MCP server: ${serverName}`)
  }

  /**
   * Reload all server configurations
   */
  async reload(): Promise<void> {
    console.log('🔄 Reloading MCP server configurations...')
    
    await this.loadConfiguration()
    
    this.emit('reloaded', {
      serverCount: this.servers.length,
      toolCount: this.tools.length
    })
    
    console.log('✅ MCP configuration reloaded')
  }

  /**
   * Get server by name
   */
  getServer(name: string): MCPServerConfig | undefined {
    return this.servers.find(s => s.name === name)
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP Loader Service...')
    
    this.servers = []
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