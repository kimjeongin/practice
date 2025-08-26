/**
 * Dashboard API Routes
 * All API endpoints for the monitoring dashboard
 */

import { FastifyInstance } from 'fastify'
import { HealthController } from '../controllers/health-controller.js'
import { ErrorController } from '../controllers/error-controller.js'
import { MetricsController } from '../controllers/metrics-controller.js'
import { LogController } from '../controllers/log-controller.js'

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  const healthController = new HealthController()
  const errorController = new ErrorController()
  const metricsController = new MetricsController()
  const logController = new LogController()

  // Health endpoint
  app.get('/health', async (request, reply) => {
    return healthController.getHealth(request, reply)
  })

  // Error statistics endpoint
  app.get('/errors', async (request, reply) => {
    return errorController.getErrorStats(request, reply)
  })

  // Circuit breakers endpoint
  app.get('/circuit-breakers', async (request, reply) => {
    return errorController.getCircuitBreakers(request, reply)
  })

  // Logs endpoint
  app.get('/logs', async (request, reply) => {
    return logController.getLogs(request, reply)
  })

  // Combined metrics endpoint
  app.get('/metrics', async (request, reply) => {
    return metricsController.getAllMetrics(request, reply)
  })

  // Sync status endpoint
  app.get('/sync-status', async (request, reply) => {
    return metricsController.getSyncStatus(request, reply)
  })
}