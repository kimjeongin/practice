import { PrismaClient } from '@prisma/client'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { spawn } from 'child_process'

/**
 * Database setup utility for Electron app
 */
export class DatabaseSetup {
  private static prismaClient: PrismaClient | null = null
  private static initialized = false

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
            url: `file:${dbPath}`
          }
        },
        log: ['error', 'warn']
      })
    }
    return this.prismaClient
  }

  /**
   * Initialize the database
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🗄️ Initializing database...')
      
      const prisma = this.getPrismaClient()
      
      // Connect to database
      await prisma.$connect()
      console.log('✅ Database connected')

      // Push schema to database (creates tables if they don't exist)
      await this.pushSchema()
      
      this.initialized = true
      console.log('✅ Database initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * Push Prisma schema to database
   */
  private static async pushSchema(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('📋 Pushing database schema...')
      
      // Set environment variable for database URL
      const dbPath = this.getDatabasePath()
      const env = {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`
      }

      // Run prisma db push
      const child = spawn('npx', ['prisma', 'db', 'push', '--accept-data-loss'], {
        env,
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let output = ''
      let errorOutput = ''

      child.stdout?.on('data', (data) => {
        output += data.toString()
      })

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Database schema pushed successfully')
          resolve()
        } else {
          console.error('❌ Failed to push database schema:', errorOutput)
          reject(new Error(`Prisma db push failed with code ${code}: ${errorOutput}`))
        }
      })

      child.on('error', (error) => {
        console.error('❌ Failed to spawn prisma process:', error)
        reject(error)
      })
    })
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