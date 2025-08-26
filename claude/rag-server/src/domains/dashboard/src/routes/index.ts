/**
 * Dashboard Routes Setup
 * Main route configuration for the dashboard application
 */

import { FastifyInstance } from 'fastify'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logger } from '@/shared/logger/index.js'
import { apiRoutes } from './api.js'
import { dashboardRoutes } from './dashboard.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  try {
    // Register dashboard page routes
    await app.register(dashboardRoutes)

    // Register API routes with prefix
    await app.register(apiRoutes, { prefix: '/api' })

    logger.info('Dashboard routes registered successfully')
  } catch (error) {
    logger.error('Failed to setup dashboard routes', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}