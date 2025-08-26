/**
 * Metrics Controller
 * Handles combined metrics and sync status endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { CircuitBreakerManager } from '@/shared/utils/resilience.js'
import { logger } from '@/shared/logger/index.js'

export class MetricsController {
  /**
   * Get all metrics in a combined response
   */
  async getAllMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const health = errorMonitor.getSystemHealth()
      const errorStats = errorMonitor.getErrorStatistics()
      const circuitBreakers = CircuitBreakerManager.getStatus()
      const errorHistory = errorMonitor.getErrorHistory(10)

      const response = {
        health,
        errors: {
          byCode: Array.from(errorStats.byCode.entries()),
          byComponent: Array.from(errorStats.byComponent.entries()),
          byOperation: Array.from(errorStats.byOperation.entries()),
          timeline: errorStats.timeline,
          recent: errorHistory.map((error) => ({
            code: error.code,
            message: error.message,
            timestamp: error.timestamp,
            context: error.context,
          })),
        },
        circuitBreakers,
        timestamp: new Date().toISOString(),
      }

      reply.send(response)
    } catch (error) {
      logger.error('Failed to get combined metrics', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({ 
        error: 'Failed to get metrics data',
        message: 'Could not retrieve system metrics'
      })
    }
  }

  /**
   * Get synchronization status
   */
  async getSyncStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      // This is a placeholder implementation
      // In a real implementation, this would fetch from the SynchronizationManager
      const syncStatus = {
        lastSync: new Date().toISOString(),
        status: 'healthy', // 'healthy', 'warning', 'error'
        issues: {
          missingFiles: 0,
          orphanedVectors: 0,
          hashMismatches: 0,
          newFiles: 0,
          total: 0,
        },
        metrics: {
          totalFiles: 0,
          totalVectors: 0,
          totalChunks: 0,
          syncDuration: 0,
        },
      }

      reply.send(syncStatus)
    } catch (error) {
      logger.error('Failed to get sync status', error instanceof Error ? error : new Error(String(error)))
      reply.status(500).send({ 
        error: 'Failed to get sync status',
        message: 'Could not retrieve synchronization status'
      })
    }
  }
}