/**
 * Dashboard Server Implementation
 * Main server class that manages the dashboard web application
 */

import { FastifyInstance } from 'fastify'
import { logger } from '@/shared/logger/index.js'
import { createDashboardApp } from './app.js'
import { DashboardConfig, createDashboardConfig } from '../config/dashboard.config.js'

export class DashboardServer {
  private app: FastifyInstance | null = null
  private config: DashboardConfig
  private isRunning = false

  constructor(config?: Partial<DashboardConfig>) {
    this.config = createDashboardConfig(config)
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Dashboard server is already running')
      return
    }

    try {
      this.app = await createDashboardApp(this.config)

      await this.app.listen({
        port: this.config.port,
        host: this.config.host,
      })

      this.isRunning = true

      logger.info('Dashboard server started successfully', {
        port: this.config.port,
        host: this.config.host,
        url: `http://${this.config.host}:${this.config.port}`,
        cors: this.config.cors.enabled,
      })
    } catch (error) {
      logger.error('Failed to start dashboard server', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.app) {
      logger.warn('Dashboard server is not running')
      return
    }

    try {
      await this.app.close()
      this.app = null
      this.isRunning = false

      logger.info('Dashboard server stopped successfully')
    } catch (error) {
      logger.error('Failed to stop dashboard server', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Restart the dashboard server
   */
  async restart(): Promise<void> {
    logger.info('Restarting dashboard server...')
    await this.stop()
    await this.start()
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.isRunning,
      config: this.config,
      url: this.isRunning ? `http://${this.config.host}:${this.config.port}` : null,
    }
  }

  /**
   * Update server configuration
   */
  updateConfig(newConfig: Partial<DashboardConfig>) {
    this.config = createDashboardConfig({ ...this.config, ...newConfig })
    logger.info('Dashboard server configuration updated', this.config)
  }
}