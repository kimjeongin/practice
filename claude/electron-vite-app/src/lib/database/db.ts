import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import * as schema from './schema'

class DatabaseManager {
  private static instance: DatabaseManager
  private db: ReturnType<typeof drizzle<typeof schema>> | null = null
  private sqliteInstance: Database.Database | null = null

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  private getDatabasePath(): string {
    // In development, use local file
    if (process.env.NODE_ENV === 'development') {
      return './agent.db'
    }
    
    // In production, use userData directory
    try {
      const userDataPath = app.getPath('userData')
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
      }
      return join(userDataPath, 'agent.db')
    } catch {
      return './agent.db'
    }
  }

  async initialize(): Promise<void> {
    if (this.db) return

    const dbPath = this.getDatabasePath()
    console.log(`🗄️ Database path: ${dbPath}`)
    
    // Create SQLite connection
    this.sqliteInstance = new Database(dbPath)
    
    // Enable optimizations
    this.sqliteInstance.pragma('journal_mode = WAL')
    this.sqliteInstance.pragma('foreign_keys = ON')
    
    // Initialize Drizzle
    this.db = drizzle(this.sqliteInstance, { schema })
    
    // Run migrations
    await this.runMigrations()
    
    console.log('✅ Database initialized successfully')
  }

  private async ensureMigrationsExist(): Promise<void> {
    const migrationsDir = './drizzle'
    
    // Check if migrations directory exists and has files
    if (!existsSync(migrationsDir)) {
      console.log('📋 Migrations directory not found, generating...')
      await this.generateMigrations()
    } else {
      // Check if directory is empty or only has meta.json
      const files = require('fs').readdirSync(migrationsDir)
      const sqlFiles = files.filter((file: string) => file.endsWith('.sql'))
      
      if (sqlFiles.length === 0) {
        console.log('📋 No migration files found, generating...')
        await this.generateMigrations()
      }
    }
  }

  private async generateMigrations(): Promise<void> {
    try {
      console.log('🔄 Generating Drizzle migrations...')
      
      // Try yarn first, then npm as fallback
      const useYarn = existsSync('./yarn.lock')
      const command = useYarn 
        ? 'yarn drizzle-kit generate' 
        : 'npx drizzle-kit generate'
      
      execSync(command, { 
        stdio: 'inherit',
        cwd: process.cwd()
      })
      
      console.log('✅ Migrations generated successfully')
    } catch (error) {
      console.error('❌ Failed to generate migrations:', error)
      // In production, we might want to create tables directly instead of failing
      if (process.env.NODE_ENV === 'production') {
        console.log('🔧 Attempting to create tables directly...')
        await this.createTablesDirectly()
      } else {
        throw new Error(`Migration generation failed: ${error}`)
      }
    }
  }

  private async createTablesDirectly(): Promise<void> {
    if (!this.sqliteInstance) throw new Error('SQLite instance not available')
    
    try {
      // Create tables directly using SQL (fallback for production)
      this.sqliteInstance.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS tool_calls (
          id TEXT PRIMARY KEY NOT NULL,
          message_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          server_id TEXT NOT NULL,
          server_name TEXT,
          parameters TEXT NOT NULL,
          result TEXT,
          execution_time INTEGER,
          status TEXT NOT NULL,
          reasoning TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          agent_type TEXT NOT NULL,
          model_name TEXT NOT NULL,
          context_length INTEGER DEFAULT 4096 NOT NULL,
          max_tokens INTEGER DEFAULT 1024 NOT NULL,
          temperature REAL DEFAULT 0.7 NOT NULL,
          system_prompt TEXT,
          active INTEGER DEFAULT 1 NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS server_connections (
          id TEXT PRIMARY KEY NOT NULL,
          server_id TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          transport_type TEXT NOT NULL,
          command TEXT,
          args TEXT,
          cwd TEXT,
          env TEXT,
          url TEXT,
          headers TEXT,
          enabled INTEGER DEFAULT 1 NOT NULL,
          auto_reconnect INTEGER DEFAULT 1 NOT NULL,
          reconnect_delay INTEGER DEFAULT 5000 NOT NULL,
          max_reconnect INTEGER DEFAULT 5 NOT NULL,
          last_connected_at TEXT,
          connection_count INTEGER DEFAULT 0 NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS tool_metadata (
          id TEXT PRIMARY KEY NOT NULL,
          server_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          description TEXT NOT NULL,
          input_schema TEXT NOT NULL,
          category TEXT,
          tags TEXT,
          examples TEXT,
          usage_count INTEGER DEFAULT 0 NOT NULL,
          last_used_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (server_id) REFERENCES server_connections(server_id) ON DELETE CASCADE
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS server_connections_server_id_unique 
        ON server_connections (server_id);
      `)
      
      console.log('✅ Tables created directly')
    } catch (error) {
      console.error('❌ Failed to create tables directly:', error)
      throw error
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    try {
      // First check if database already has tables
      const hasExistingTables = await this.checkExistingTables()
      
      if (hasExistingTables) {
        console.log('📋 Existing database found, loading data...')
        return // Database already set up, just return
      }
      
      console.log('📋 Setting up new database...')
      
      // Ensure migrations exist before trying to run them
      await this.ensureMigrationsExist()
      
      // Run the migrations
      await migrate(this.db, { migrationsFolder: './drizzle' })
      console.log('✅ Database setup completed')
    } catch (error) {
      console.error('❌ Migration error:', error)
      throw error
    }
  }

  private async checkExistingTables(): Promise<boolean> {
    if (!this.sqliteInstance) return false
    
    try {
      const result = this.sqliteInstance.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='conversations'
      `).get()
      
      return result !== undefined
    } catch (error) {
      return false
    }
  }

  getDB(): ReturnType<typeof drizzle<typeof schema>> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }

  async close(): Promise<void> {
    if (this.sqliteInstance) {
      this.sqliteInstance.close()
      this.sqliteInstance = null
      this.db = null
      console.log('🔌 Database connection closed')
    }
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance()

// Export schema for type inference
export * from './schema'