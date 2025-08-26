/**
 * MCP Configuration Migration Service
 * Handles migration of legacy RAG server configurations to the new unified MCP server system
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { ServerConfig } from '../types/mcp-server.types'
import { MCPConfigService, getMCPConfigService } from './mcp-config.service'

export interface LegacyRAGServerConfig {
  url?: string
  enabled?: boolean
  healthCheckInterval?: number
  connectTimeout?: number
}

export interface LegacyClientHostConfig {
  servers?: any[]
  ragServer?: LegacyRAGServerConfig
  settings?: {
    autoConnectOnStartup?: boolean
    maxConcurrentExecutions?: number
    executionTimeout?: number
    saveExecutionHistory?: boolean
    enableNotifications?: boolean
  }
}

export class MCPMigrationService {
  private configService: MCPConfigService
  private legacyConfigPath: string
  private migrationMarkerPath: string

  constructor() {
    this.configService = getMCPConfigService()
    const userDataPath = app.getPath('userData')
    this.legacyConfigPath = join(userDataPath, 'mcp-client-config.json')
    this.migrationMarkerPath = join(userDataPath, '.mcp-migration-completed')
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(): Promise<boolean> {
    try {
      // Check if migration marker exists
      await fs.access(this.migrationMarkerPath)
      return false // Migration already completed
    } catch {
      // Check if legacy config exists
      try {
        await fs.access(this.legacyConfigPath)
        return true // Legacy config exists, migration needed
      } catch {
        return false // No legacy config, no migration needed
      }
    }
  }

  /**
   * Perform migration from legacy configuration
   */
  async migrate(): Promise<void> {
    if (!(await this.needsMigration())) {
      console.log('📋 No MCP configuration migration needed')
      return
    }

    try {
      console.log('🚀 Starting MCP configuration migration...')

      // Load legacy configuration
      const legacyConfig = await this.loadLegacyConfig()
      
      // Get current MCP config
      const currentConfig = await this.configService.getConfig()
      
      // Migrate servers
      let migratedCount = 0
      
      // Migrate RAG server configuration
      if (legacyConfig.ragServer) {
        const ragServerConfig = this.migrateRAGServerConfig(legacyConfig.ragServer)
        if (ragServerConfig && !currentConfig.servers.some(s => s.id === ragServerConfig.id)) {
          currentConfig.servers.push(ragServerConfig)
          migratedCount++
          console.log(`✅ Migrated RAG server configuration`)
        }
      }
      
      // Migrate other legacy servers
      if (legacyConfig.servers) {
        for (const legacyServer of legacyConfig.servers) {
          const migratedServer = this.migrateLegacyServer(legacyServer)
          if (migratedServer && !currentConfig.servers.some(s => s.id === migratedServer.id)) {
            currentConfig.servers.push(migratedServer)
            migratedCount++
            console.log(`✅ Migrated server: ${migratedServer.name}`)
          }
        }
      }
      
      // Migrate settings
      if (legacyConfig.settings) {
        currentConfig.defaultSettings = {
          ...currentConfig.defaultSettings,
          autoConnect: legacyConfig.settings.autoConnectOnStartup ?? currentConfig.defaultSettings.autoConnect,
          healthCheckInterval: currentConfig.defaultSettings.healthCheckInterval,
          reconnectAttempts: currentConfig.defaultSettings.reconnectAttempts,
          reconnectDelay: currentConfig.defaultSettings.reconnectDelay,
        }
      }
      
      // Save migrated configuration
      await this.configService.saveConfig(currentConfig)
      
      // Create migration marker
      await this.createMigrationMarker()
      
      // Backup legacy config
      await this.backupLegacyConfig()
      
      console.log(`🎉 Migration completed successfully! Migrated ${migratedCount} server(s)`)
      
    } catch (error) {
      console.error('❌ Failed to migrate MCP configuration:', error)
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Load legacy configuration
   */
  private async loadLegacyConfig(): Promise<LegacyClientHostConfig> {
    try {
      const configData = await fs.readFile(this.legacyConfigPath, 'utf-8')
      return JSON.parse(configData) as LegacyClientHostConfig
    } catch (error) {
      console.warn('Warning: Could not load legacy configuration:', error)
      return {}
    }
  }

  /**
   * Migrate RAG server configuration to MCP server format
   */
  private migrateRAGServerConfig(ragConfig: LegacyRAGServerConfig): ServerConfig | null {
    if (!ragConfig.url) {
      console.warn('⚠️ RAG server configuration missing URL, skipping migration')
      return null
    }

    return {
      id: 'rag-server',
      name: 'RAG Server (Migrated)',
      description: 'Document search and retrieval server (migrated from legacy configuration)',
      transport: 'http',
      url: ragConfig.url,
      timeout: ragConfig.connectTimeout || 30000,
      enabled: ragConfig.enabled ?? true,
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 5,
      tags: ['search', 'documents', 'rag', 'migrated']
    }
  }

  /**
   * Migrate legacy server configuration
   */
  private migrateLegacyServer(legacyServer: any): ServerConfig | null {
    if (!legacyServer.id || !legacyServer.name) {
      console.warn('⚠️ Legacy server missing required fields, skipping:', legacyServer)
      return null
    }

    // Generate new ID to avoid conflicts
    const migratedId = `migrated-${legacyServer.id}`

    return {
      id: migratedId,
      name: `${legacyServer.name} (Migrated)`,
      description: legacyServer.description || 'Migrated from legacy configuration',
      transport: legacyServer.transport || 'stdio',
      command: legacyServer.command,
      args: legacyServer.args,
      cwd: legacyServer.cwd,
      env: legacyServer.env,
      url: legacyServer.url,
      headers: legacyServer.headers,
      timeout: legacyServer.timeout,
      enabled: legacyServer.enabled ?? true,
      autoReconnect: legacyServer.autoReconnect ?? true,
      reconnectDelay: legacyServer.reconnectDelay || 5000,
      maxReconnectAttempts: legacyServer.maxReconnectAttempts || 5,
      tags: [...(legacyServer.tags || []), 'migrated']
    }
  }

  /**
   * Create migration completion marker
   */
  private async createMigrationMarker(): Promise<void> {
    const marker = {
      migrationDate: new Date().toISOString(),
      version: '1.0.0',
      migratedFrom: 'legacy-mcp-client-config'
    }
    
    await fs.writeFile(this.migrationMarkerPath, JSON.stringify(marker, null, 2), 'utf-8')
  }

  /**
   * Backup legacy configuration
   */
  private async backupLegacyConfig(): Promise<void> {
    try {
      const backupPath = `${this.legacyConfigPath}.backup.${Date.now()}`
      await fs.copyFile(this.legacyConfigPath, backupPath)
      console.log(`📋 Legacy configuration backed up to: ${backupPath}`)
    } catch (error) {
      console.warn('Warning: Could not backup legacy configuration:', error)
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    needed: boolean
    completed: boolean
    hasLegacyConfig: boolean
    migrationDate?: string
  }> {
    const needed = await this.needsMigration()
    
    let completed = false
    let migrationDate: string | undefined
    
    try {
      const markerData = await fs.readFile(this.migrationMarkerPath, 'utf-8')
      const marker = JSON.parse(markerData)
      completed = true
      migrationDate = marker.migrationDate
    } catch {
      // Marker doesn't exist
    }
    
    let hasLegacyConfig = false
    try {
      await fs.access(this.legacyConfigPath)
      hasLegacyConfig = true
    } catch {
      // Legacy config doesn't exist
    }
    
    return {
      needed,
      completed,
      hasLegacyConfig,
      migrationDate
    }
  }

  /**
   * Force re-migration (for testing or recovery)
   */
  async forceMigration(): Promise<void> {
    try {
      await fs.unlink(this.migrationMarkerPath)
      console.log('🔄 Migration marker removed, forcing re-migration...')
    } catch {
      // Marker doesn't exist, continue
    }
    
    await this.migrate()
  }

  /**
   * Clean up legacy configuration files
   */
  async cleanupLegacyConfig(): Promise<void> {
    try {
      // Only cleanup if migration is completed
      const status = await this.getMigrationStatus()
      if (!status.completed) {
        throw new Error('Cannot cleanup: migration not completed')
      }
      
      await fs.unlink(this.legacyConfigPath)
      console.log('🧹 Legacy configuration file removed')
    } catch (error) {
      console.warn('Warning: Could not remove legacy configuration:', error)
    }
  }
}

// Singleton instance
let migrationService: MCPMigrationService | null = null

export function getMCPMigrationService(): MCPMigrationService {
  if (!migrationService) {
    migrationService = new MCPMigrationService()
  }
  return migrationService
}

/**
 * Perform automatic migration on startup if needed
 */
export async function performStartupMigration(): Promise<void> {
  const migrationService = getMCPMigrationService()
  
  if (await migrationService.needsMigration()) {
    console.log('🔄 Automatic configuration migration required...')
    await migrationService.migrate()
  }
}