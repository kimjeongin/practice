/**
 * MCP Server Configuration Management Service
 * Handles loading, saving, and managing MCP server configurations from file
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { ServerConfig } from '../types/mcp-server.types'

export interface MCPServerConfigFile {
  version: string
  servers: ServerConfig[]
  defaultSettings: {
    autoConnect: boolean
    reconnectAttempts: number
    reconnectDelay: number
    healthCheckInterval: number
  }
}

const DEFAULT_CONFIG: MCPServerConfigFile = {
  version: '1.0.0',
  servers: [
    // Example RAG server configuration
    {
      id: 'rag-server',
      name: 'RAG Server',
      description: 'Document search and retrieval server',
      transport: 'http',
      url: 'http://localhost:3000',
      enabled: true,
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 5,
      tags: ['search', 'documents', 'rag']
    },
    // Example stdio server configuration
    {
      id: 'filesystem-server',
      name: 'File System Server',
      description: 'File operations MCP server',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
      enabled: false,
      autoReconnect: true,
      reconnectDelay: 3000,
      maxReconnectAttempts: 3,
      tags: ['filesystem', 'files']
    }
  ],
  defaultSettings: {
    autoConnect: true,
    reconnectAttempts: 5,
    reconnectDelay: 5000,
    healthCheckInterval: 30000
  }
}

export class MCPConfigService {
  private configPath: string
  private config: MCPServerConfigFile | null = null
  private watchers: ((config: MCPServerConfigFile) => void)[] = []

  constructor() {
    const userDataPath = app.getPath('userData')
    this.configPath = join(userDataPath, 'mcp-servers.json')
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<MCPServerConfigFile> {
    try {
      console.log(`📋 Loading MCP server configuration from: ${this.configPath}`)
      
      const configData = await fs.readFile(this.configPath, 'utf-8')
      const parsedConfig = JSON.parse(configData) as MCPServerConfigFile
      
      // Validate and merge with defaults
      this.config = this.validateAndMergeConfig(parsedConfig)
      
      console.log(`✅ Loaded ${this.config.servers.length} MCP server configurations`)
      return this.config
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('📋 No existing configuration found, creating default configuration')
        return await this.createDefaultConfig()
      } else {
        console.error('❌ Failed to load MCP configuration:', error)
        throw new Error(`Failed to load MCP configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: MCPServerConfigFile): Promise<void> {
    try {
      console.log('💾 Saving MCP server configuration')
      
      // Ensure directory exists
      await fs.mkdir(join(this.configPath, '..'), { recursive: true })
      
      // Save with pretty formatting
      const configJson = JSON.stringify(config, null, 2)
      await fs.writeFile(this.configPath, configJson, 'utf-8')
      
      this.config = config
      this.notifyWatchers(config)
      
      console.log(`✅ Saved ${config.servers.length} server configurations`)
    } catch (error) {
      console.error('❌ Failed to save MCP configuration:', error)
      throw new Error(`Failed to save MCP configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get current configuration
   */
  async getConfig(): Promise<MCPServerConfigFile> {
    if (!this.config) {
      return await this.loadConfig()
    }
    return this.config
  }

  /**
   * Get enabled servers for auto-connection
   */
  async getEnabledServers(): Promise<ServerConfig[]> {
    const config = await this.getConfig()
    return config.servers.filter(server => server.enabled)
  }

  /**
   * Add a new server configuration
   */
  async addServer(serverConfig: Omit<ServerConfig, 'id'>): Promise<ServerConfig> {
    const config = await this.getConfig()
    
    // Generate unique ID
    const id = this.generateServerId(serverConfig.name)
    const newServer: ServerConfig = {
      id,
      ...serverConfig
    }
    
    // Check for duplicate IDs
    if (config.servers.some(s => s.id === id)) {
      throw new Error(`Server with ID "${id}" already exists`)
    }
    
    config.servers.push(newServer)
    await this.saveConfig(config)
    
    console.log(`➕ Added new MCP server: ${newServer.name} (${newServer.id})`)
    return newServer
  }

  /**
   * Update an existing server configuration
   */
  async updateServer(serverId: string, updates: Partial<Omit<ServerConfig, 'id'>>): Promise<ServerConfig> {
    const config = await this.getConfig()
    
    const serverIndex = config.servers.findIndex(s => s.id === serverId)
    if (serverIndex === -1) {
      throw new Error(`Server with ID "${serverId}" not found`)
    }
    
    const updatedServer = { ...config.servers[serverIndex], ...updates }
    config.servers[serverIndex] = updatedServer
    
    await this.saveConfig(config)
    
    console.log(`✏️ Updated MCP server: ${updatedServer.name} (${updatedServer.id})`)
    return updatedServer
  }

  /**
   * Remove a server configuration
   */
  async removeServer(serverId: string): Promise<void> {
    const config = await this.getConfig()
    
    const serverIndex = config.servers.findIndex(s => s.id === serverId)
    if (serverIndex === -1) {
      throw new Error(`Server with ID "${serverId}" not found`)
    }
    
    const removedServer = config.servers.splice(serverIndex, 1)[0]
    await this.saveConfig(config)
    
    console.log(`🗑️ Removed MCP server: ${removedServer.name} (${removedServer.id})`)
  }

  /**
   * Get server configuration by ID
   */
  async getServer(serverId: string): Promise<ServerConfig | null> {
    const config = await this.getConfig()
    return config.servers.find(s => s.id === serverId) || null
  }

  /**
   * Watch for configuration changes
   */
  onConfigChange(callback: (config: MCPServerConfigFile) => void): void {
    this.watchers.push(callback)
  }

  /**
   * Remove configuration change watcher
   */
  removeConfigWatcher(callback: (config: MCPServerConfigFile) => void): void {
    const index = this.watchers.indexOf(callback)
    if (index > -1) {
      this.watchers.splice(index, 1)
    }
  }

  /**
   * Create default configuration file
   */
  private async createDefaultConfig(): Promise<MCPServerConfigFile> {
    await this.saveConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }

  /**
   * Validate and merge configuration with defaults
   */
  private validateAndMergeConfig(config: Partial<MCPServerConfigFile>): MCPServerConfigFile {
    const mergedConfig: MCPServerConfigFile = {
      version: config.version || DEFAULT_CONFIG.version,
      servers: config.servers || [],
      defaultSettings: {
        ...DEFAULT_CONFIG.defaultSettings,
        ...config.defaultSettings
      }
    }

    // Validate each server configuration
    mergedConfig.servers = mergedConfig.servers.map(server => ({
      id: server.id,
      name: server.name,
      description: server.description || '',
      transport: server.transport,
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: server.env,
      url: server.url,
      headers: server.headers,
      timeout: server.timeout,
      enabled: server.enabled !== undefined ? server.enabled : true,
      autoReconnect: server.autoReconnect !== undefined ? server.autoReconnect : true,
      reconnectDelay: server.reconnectDelay || mergedConfig.defaultSettings.reconnectDelay,
      maxReconnectAttempts: server.maxReconnectAttempts || mergedConfig.defaultSettings.reconnectAttempts,
      tags: server.tags || []
    }))

    return mergedConfig
  }

  /**
   * Generate a unique server ID from name
   */
  private generateServerId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  /**
   * Notify all watchers of configuration changes
   */
  private notifyWatchers(config: MCPServerConfigFile): void {
    this.watchers.forEach(callback => {
      try {
        callback(config)
      } catch (error) {
        console.error('Error in config watcher callback:', error)
      }
    })
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath
  }

  /**
   * Export configuration as JSON string
   */
  async exportConfig(): Promise<string> {
    const config = await this.getConfig()
    return JSON.stringify(config, null, 2)
  }

  /**
   * Import configuration from JSON string
   */
  async importConfig(configJson: string): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson) as Partial<MCPServerConfigFile>
      const validatedConfig = this.validateAndMergeConfig(importedConfig)
      await this.saveConfig(validatedConfig)
      console.log('📥 Successfully imported MCP server configuration')
    } catch (error) {
      console.error('❌ Failed to import configuration:', error)
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Invalid JSON'}`)
    }
  }
}

// Singleton instance
let mcpConfigService: MCPConfigService | null = null

export function getMCPConfigService(): MCPConfigService {
  if (!mcpConfigService) {
    mcpConfigService = new MCPConfigService()
  }
  return mcpConfigService
}