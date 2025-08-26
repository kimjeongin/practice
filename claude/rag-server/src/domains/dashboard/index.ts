/**
 * Dashboard Domain Entry Point
 * Exports the main dashboard server and configuration
 */

export { DashboardServer } from './src/server.js'
export type { DashboardConfig } from './config/dashboard.config.js'
export { createDashboardConfig } from './config/dashboard.config.js'
export { createDashboardApp } from './src/app.js'

// Re-export for convenience
export { HealthController } from './src/controllers/health-controller.js'
export { ErrorController } from './src/controllers/error-controller.js' 
export { LogController } from './src/controllers/log-controller.js'
export { MetricsController } from './src/controllers/metrics-controller.js'