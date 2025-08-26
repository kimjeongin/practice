/**
 * Health Controller
 * Handles system health monitoring endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { logger } from '@/shared/logger/index.js'

export class HealthController {
  /**
   * Get system health status
   */
  async getHealth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const health = errorMonitor.getSystemHealth()
      
      reply.send(health)
    } catch (error) {
      logger.error('Failed to get health data', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({ 
        error: 'Failed to get health data',
        message: 'Could not retrieve system health information'
      })
    }
  }
}