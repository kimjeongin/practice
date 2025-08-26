/**
 * Error Controller
 * Handles error statistics and circuit breaker endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { CircuitBreakerManager } from '@/shared/utils/resilience.js'
import { logger } from '@/shared/logger/index.js'

export class ErrorController {
  /**
   * Get error statistics
   */
  async getErrorStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = errorMonitor.getErrorStatistics()
      const response = {
        byCode: Array.from(stats.byCode.entries()),
        byComponent: Array.from(stats.byComponent.entries()),
        byOperation: Array.from(stats.byOperation.entries()),
        timeline: stats.timeline,
      }
      
      reply.send(response)
    } catch (error) {
      logger.error('Failed to get error statistics', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({ 
        error: 'Failed to get error data',
        message: 'Could not retrieve error statistics'
      })
    }
  }

  /**
   * Get circuit breaker status
   */
  async getCircuitBreakers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const status = CircuitBreakerManager.getStatus()
      
      reply.send(status)
    } catch (error) {
      logger.error('Failed to get circuit breaker data', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({ 
        error: 'Failed to get circuit breaker data',
        message: 'Could not retrieve circuit breaker status'
      })
    }
  }
}