/**
 * Dashboard Page Routes
 * Routes for serving the main dashboard HTML pages
 */

import { FastifyInstance } from 'fastify'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFile } from 'fs/promises'
import { logger } from '@/shared/logger/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // Serve main dashboard page
  app.get('/', async (request, reply) => {
    try {
      const htmlPath = join(__dirname, '../../../public/index.html')
      const html = await readFile(htmlPath, 'utf-8')
      
      reply.type('text/html').send(html)
    } catch (error) {
      logger.error('Failed to serve dashboard page', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({
        error: 'Failed to load dashboard',
        message: 'Could not load the dashboard page',
      })
    }
  })

  // Alternative dashboard route
  app.get('/dashboard', async (request, reply) => {
    return reply.redirect('/', 301)
  })
}