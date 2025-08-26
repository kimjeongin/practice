/**
 * Log Controller
 * Handles log data endpoints for the dashboard
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { logger } from '@/shared/logger/index.js'

export class LogController {
  /**
   * Get log data for dashboard
   */
  async getLogs(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get error history from error monitor
      const errors = errorMonitor.getErrorHistory(20)
      
      // For now, we don't have real-time logs implementation
      // This would need to be enhanced with actual log streaming
      const recent: any[] = []

      const response = {
        errors: errors.map((error) => ({
          code: error.code,
          message: error.message,
          timestamp: error.timestamp,
          context: error.context,
        })),
        recent,
      }

      reply.send(response)
    } catch (error) {
      logger.error('Failed to get log data', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({ 
        error: 'Failed to get log data',
        message: 'Could not retrieve log information'
      })
    }
  }
}