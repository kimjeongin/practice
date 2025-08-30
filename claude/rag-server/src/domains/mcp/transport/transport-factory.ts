/**
 * Transport Factory for MCP Server
 * Creates appropriate transport instances based on configuration
 */

import { randomUUID } from 'node:crypto'
import fastify, { FastifyInstance } from 'fastify'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { MCPTransportConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

export type TransportInstance = StdioServerTransport | StreamableHTTPServerTransport

export interface HTTPTransportContext {
  app: FastifyInstance
  transports: Map<string, StreamableHTTPServerTransport>
}

export class TransportFactory {
  /**
   * Create transport instance based on configuration
   */
  static async createTransport(config: MCPTransportConfig): Promise<{
    transport: TransportInstance
    context?: HTTPTransportContext
  }> {
    switch (config.type) {
      case 'stdio':
        return {
          transport: new StdioServerTransport(),
        }

      case 'streamable-http':
        return await TransportFactory.createStreamableHTTPTransport(config)

      default:
        throw new Error(`Unsupported transport type: ${config.type}`)
    }
  }

  /**
   * Create Streamable HTTP transport with Fastify
   */
  private static async createStreamableHTTPTransport(config: MCPTransportConfig): Promise<{
    transport: StreamableHTTPServerTransport
    context: HTTPTransportContext
  }> {
    const timeoutConfig = {
      connectionTimeout: parseInt(process.env.MCP_CONNECTION_TIMEOUT_MS || '120000'), // 2분
      keepAliveTimeout: parseInt(process.env.MCP_KEEP_ALIVE_TIMEOUT_MS || '65000'), // 65초
      requestTimeout: parseInt(process.env.MCP_REQUEST_TIMEOUT_MS || '90000'), // 90초 - 검색 작업 고려
    }

    logger.info('🔧 Configuring MCP HTTP server with timeouts', {
      connectionTimeout: timeoutConfig.connectionTimeout,
      keepAliveTimeout: timeoutConfig.keepAliveTimeout,
      requestTimeout: timeoutConfig.requestTimeout,
      component: 'TransportFactory',
    })

    const app = fastify({
      logger: false, // Use our own logger
      trustProxy: true,
      ...timeoutConfig,
    })

    // CORS setup
    if (config.enableCors) {
      await app.register(import('@fastify/cors'), {
        origin: config.allowedOrigins || ['*'],
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
        credentials: true,
      })
    }

    const transports = new Map<string, StreamableHTTPServerTransport>()

    // Create a single transport instance that will handle all requests
    const sharedTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, sharedTransport)
        logger.debug('MCP session initialized', { sessionId })
      },
      enableDnsRebindingProtection: config.enableDnsRebindingProtection || false,
      allowedHosts: config.host ? [config.host] : undefined,
      allowedOrigins: config.allowedOrigins,
    })

    // Clean up transport when closed
    sharedTransport.onclose = () => {
      if (sharedTransport.sessionId) {
        transports.delete(sharedTransport.sessionId)
        logger.debug('MCP session closed', { sessionId: sharedTransport.sessionId })

        // Reset transport state to allow new connections
        // This fixes the "Server already initialized" error
        try {
          if ('_initialized' in sharedTransport) {
            ;(sharedTransport as any)._initialized = false
          }
          if ('_sessionId' in sharedTransport) {
            ;(sharedTransport as any)._sessionId = null
          }
          logger.debug('Transport state reset for new connections')
        } catch (error) {
          logger.warn(
            'Error resetting transport state',
            error instanceof Error ? error : new Error(String(error))
          )
        }
      }
    }

    // Handle POST requests for client-to-server communication
    app.post('/mcp', async (request, reply) => {
      try {
        await sharedTransport.handleRequest(request.raw, reply.raw, request.body)
      } catch (error) {
        logger.error(
          'Error handling MCP request',
          error instanceof Error ? error : new Error(String(error))
        )
        reply.status(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        })
      }
    })

    // Handle GET requests for server-to-client notifications
    app.get('/mcp', async (request, reply) => {
      try {
        // Monitor connection close to reset transport state
        request.raw.on('close', () => {
          logger.debug('Client connection closed, resetting transport state')
          try {
            if ('_initialized' in sharedTransport) {
              ;(sharedTransport as any)._initialized = false
            }
            if ('_sessionId' in sharedTransport) {
              ;(sharedTransport as any)._sessionId = null
            }
          } catch (error) {
            logger.warn(
              'Error resetting transport state on connection close',
              error instanceof Error ? error : new Error(String(error))
            )
          }
        })

        await sharedTransport.handleRequest(request.raw, reply.raw)
      } catch (error) {
        logger.error(
          'Error handling MCP GET request',
          error instanceof Error ? error : new Error(String(error))
        )
        reply.status(500).send('Internal server error')
      }
    })

    // Handle DELETE requests for session termination
    app.delete('/mcp', async (request, reply) => {
      try {
        await sharedTransport.handleRequest(request.raw, reply.raw)

        // Explicitly reset transport state after DELETE
        logger.debug('DELETE request completed, resetting transport state')
        if ('_initialized' in sharedTransport) {
          ;(sharedTransport as any)._initialized = false
        }
        if ('_sessionId' in sharedTransport) {
          ;(sharedTransport as any)._sessionId = null
        }
      } catch (error) {
        logger.error(
          'Error handling MCP DELETE request',
          error instanceof Error ? error : new Error(String(error))
        )
        reply.status(500).send('Internal server error')
      }
    })

    // Health check endpoint
    app.get('/health', async (request, reply) => {
      reply.send({
        status: 'healthy',
        transport: 'streamable-http',
        activeSessions: transports.size,
        uptime: process.uptime(),
      })
    })

    return {
      transport: sharedTransport,
      context: { app, transports },
    }
  }

  /**
   * Start HTTP server for HTTP-based transports
   */
  static async startHTTPServer(
    context: HTTPTransportContext,
    config: MCPTransportConfig
  ): Promise<void> {
    try {
      await context.app.listen({
        port: config.port || 3000,
        host: config.host || 'localhost',
      })

      logger.info(`🚀 MCP ${config.type} server listening`, {
        port: config.port,
        host: config.host,
        cors: config.enableCors,
      })
    } catch (error) {
      logger.error(
        'Failed to start HTTP server',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Validate transport configuration
   */
  static validateConfig(config: MCPTransportConfig): void {
    const errors: string[] = []

    if (!['stdio', 'streamable-http'].includes(config.type)) {
      errors.push(`Invalid transport type: ${config.type}`)
    }

    if (config.type !== 'stdio') {
      if (!config.port || config.port < 1 || config.port > 65535) {
        errors.push('Port must be between 1 and 65535 for HTTP transports')
      }

      if (!config.host) {
        errors.push('Host is required for HTTP transports')
      }
    }

    if (config.sessionTimeout && config.sessionTimeout < 1000) {
      errors.push('Session timeout must be at least 1000ms')
    }

    if (errors.length > 0) {
      throw new Error(`Transport configuration validation failed:\n${errors.join('\n')}`)
    }
  }
}
