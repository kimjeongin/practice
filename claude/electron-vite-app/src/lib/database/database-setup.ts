import { PrismaClient } from '@prisma/client'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

/**
 * Database setup utility for Electron app
 */
export class DatabaseSetup {
  private static prismaClient: PrismaClient | null = null
  private static initialized = false
  private static initializationPromise: Promise<void> | null = null

  /**
   * Get the database path in user data directory
   */
  static getDatabasePath(): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'agent.db')
  }

  /**
   * Get the Prisma client instance
   */
  static getPrismaClient(): PrismaClient {
    if (!this.prismaClient) {
      const dbPath = this.getDatabasePath()

      // Ensure the user data directory exists
      const userDataPath = app.getPath('userData')
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
      }

      this.prismaClient = new PrismaClient({
        datasources: {
          db: {
            url: `file:${dbPath}`,
          },
        },
        log: ['error', 'warn'],
      })
    }
    return this.prismaClient
  }

  /**
   * Initialize the database with retry logic
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return

    // Prevent multiple simultaneous initialization attempts
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = this.performInitialization()
    return this.initializationPromise
  }

  /**
   * Perform the actual database initialization
   */
  private static async performInitialization(): Promise<void> {
    const maxRetries = 3
    let attempt = 1

    while (attempt <= maxRetries) {
      try {
        console.log(`🗄️ Initializing database (attempt ${attempt}/${maxRetries})...`)

        const prisma = this.getPrismaClient()

        // Connect to database with timeout
        const connectPromise = prisma.$connect()
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Database connection timeout')), 10000)
        )

        await Promise.race([connectPromise, timeoutPromise])
        console.log('✅ Database connected')

        // Verify schema and create tables if needed using direct SQL
        await this.ensureSchema(prisma)

        this.initialized = true
        this.initializationPromise = null
        console.log('✅ Database initialized successfully')
        return
      } catch (error) {
        console.error(`❌ Database initialization attempt ${attempt} failed:`, error)

        if (attempt === maxRetries) {
          this.initializationPromise = null
          throw new Error(
            `Failed to initialize database after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }

        // Wait before retry with exponential backoff
        const delay = Math.pow(2, attempt - 1) * 1000
        console.log(`⏳ Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        attempt++
      }
    }
  }

  /**
   * Ensure database schema exists using direct SQL commands
   */
  private static async ensureSchema(prisma: PrismaClient): Promise<void> {
    try {
      console.log('📋 Ensuring database schema...')

      // Create tables using raw SQL to avoid external process dependencies
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "conversations" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "title" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "messages" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "conversation_id" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "metadata" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE
        );
      `

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "tool_calls" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "message_id" TEXT NOT NULL,
          "tool_name" TEXT NOT NULL,
          "server_id" TEXT NOT NULL,
          "server_name" TEXT,
          "parameters" TEXT NOT NULL,
          "result" TEXT,
          "execution_time" INTEGER,
          "status" TEXT NOT NULL,
          "reasoning" TEXT,
          "error_message" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE CASCADE
        );
      `

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "agent_sessions" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "conversation_id" TEXT NOT NULL,
          "agent_type" TEXT NOT NULL,
          "model_name" TEXT NOT NULL,
          "context_length" INTEGER NOT NULL DEFAULT 4096,
          "max_tokens" INTEGER NOT NULL DEFAULT 1024,
          "temperature" REAL NOT NULL DEFAULT 0.7,
          "system_prompt" TEXT,
          "active" BOOLEAN NOT NULL DEFAULT true,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "server_connections" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "server_id" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "transport_type" TEXT NOT NULL,
          "command" TEXT,
          "args" TEXT,
          "cwd" TEXT,
          "env" TEXT,
          "url" TEXT,
          "headers" TEXT,
          "enabled" BOOLEAN NOT NULL DEFAULT true,
          "auto_reconnect" BOOLEAN NOT NULL DEFAULT true,
          "reconnect_delay" INTEGER NOT NULL DEFAULT 5000,
          "max_reconnect" INTEGER NOT NULL DEFAULT 5,
          "last_connected_at" DATETIME,
          "connection_count" INTEGER NOT NULL DEFAULT 0,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "tool_metadata" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "server_id" TEXT NOT NULL,
          "tool_name" TEXT NOT NULL,
          "description" TEXT NOT NULL,
          "input_schema" TEXT NOT NULL,
          "category" TEXT,
          "tags" TEXT,
          "examples" TEXT,
          "usage_count" INTEGER NOT NULL DEFAULT 0,
          "last_used_at" DATETIME,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("server_id") REFERENCES "server_connections" ("server_id") ON DELETE CASCADE,
          UNIQUE("server_id", "tool_name")
        );
      `

      // Create indexes for better performance
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages"("conversation_id");`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "tool_calls_message_id_idx" ON "tool_calls"("message_id");`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "tool_metadata_server_id_idx" ON "tool_metadata"("server_id");`

      console.log('✅ Database schema ensured')
    } catch (error) {
      console.error('❌ Failed to ensure database schema:', error)
      throw error
    }
  }

  /**
   * Test database connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      const prisma = this.getPrismaClient()
      await prisma.$connect()

      // Try a simple query to verify tables exist
      await prisma.conversation.findMany({ take: 1 })

      return true
    } catch (error) {
      console.error('❌ Database connection test failed:', error)
      return false
    }
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.prismaClient) {
      await this.prismaClient.$disconnect()
      this.prismaClient = null
      this.initialized = false
      console.log('🔌 Database connection closed')
    }
  }

  /**
   * Reset database (for development)
   */
  static async reset(): Promise<void> {
    if (this.prismaClient) {
      await this.close()
    }

    // Delete the database file
    const dbPath = this.getDatabasePath()
    if (existsSync(dbPath)) {
      const fs = require('fs')
      fs.unlinkSync(dbPath)
      console.log('🗑️ Database file deleted')
    }

    // Reinitialize
    await this.initialize()
  }
}
