/**
 * Dashboard Fastify App Configuration
 * Sets up the main Fastify application with all plugins and routes
 */

import fastify, { FastifyInstance } from 'fastify'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logger } from '@/shared/logger/index.js'
import { DashboardConfig } from '../config/dashboard.config.js'
import { setupRoutes } from './routes/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function createDashboardApp(config: DashboardConfig): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Use our own logger
    trustProxy: true,
  })

  try {
    // Register CORS if enabled
    if (config.cors.enabled) {
      await app.register(import('@fastify/cors'), {
        origin: config.cors.allowedOrigins || ['*'],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    }

    // Register static file serving for public directory
    const publicPath = join(__dirname, '../../public')
    await app.register(import('@fastify/static'), {
      root: publicPath,
      prefix: '/',
      decorateReply: false,
      schemaHide: true,
      index: false, // Don't serve index.html automatically
    })

    // Setup custom routes
    await setupRoutes(app)

    // Global error handler
    app.setErrorHandler((error, request, reply) => {
      logger.error('Dashboard request error', error, {
        url: request.url,
        method: request.method,
      })

      reply.status(500).send({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
      })
    })

    // 404 handler
    app.setNotFoundHandler((request, reply) => {
      logger.warn('Dashboard route not found', {
        url: request.url,
        method: request.method,
      })

      reply.status(404).send({
        error: 'Not Found',
        message: 'The requested resource was not found',
      })
    })

    logger.info('Dashboard app configured successfully', {
      cors: config.cors.enabled,
      publicPath,
    })

    return app
  } catch (error) {
    logger.error('Failed to configure dashboard app', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}