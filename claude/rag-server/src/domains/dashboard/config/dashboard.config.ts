/**
 * Dashboard Configuration
 * Configuration settings for the monitoring dashboard
 */

export interface DashboardConfig {
  port: number
  host: string
  cors: {
    enabled: boolean
    allowedOrigins?: string[]
  }
  autoRefresh: {
    enabled: boolean
    intervalMs: number
  }
  logging: {
    enabled: boolean
    level: 'debug' | 'info' | 'warn' | 'error'
  }
}

export function createDashboardConfig(overrides?: Partial<DashboardConfig>): DashboardConfig {
  const defaultConfig: DashboardConfig = {
    port: 3001,
    host: 'localhost',
    cors: {
      enabled: true,
      allowedOrigins: ['*'],
    },
    autoRefresh: {
      enabled: true,
      intervalMs: 5000, // 5 seconds
    },
    logging: {
      enabled: true,
      level: 'info',
    },
  }

  return {
    ...defaultConfig,
    ...overrides,
    cors: {
      ...defaultConfig.cors,
      ...(overrides?.cors || {}),
    },
    autoRefresh: {
      ...defaultConfig.autoRefresh,
      ...(overrides?.autoRefresh || {}),
    },
    logging: {
      ...defaultConfig.logging,
      ...(overrides?.logging || {}),
    },
  }
}