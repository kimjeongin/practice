/**
 * Transport Factory for MCP Server
 * Creates appropriate transport instances based on configuration
 */

import { randomUUID } from 'node:crypto'
import fastify, { FastifyInstance } from 'fastify'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { MCPTransportConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

export type TransportInstance =
  | StdioServerTransport
  | StreamableHTTPServerTransport
  | SSEServerTransport

export interface HTTPTransportContext {
  app: FastifyInstance
  transports: Map<string, StreamableHTTPServerTransport | SSEServerTransport>
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

      case 'sse':
        return await TransportFactory.createSSETransport(config)

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
    const app = fastify({
      logger: false, // Use our own logger
      trustProxy: true,
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

    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', async (request, reply) => {
      try {
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
   * Create SSE transport with Fastify
   */
  private static async createSSETransport(config: MCPTransportConfig): Promise<{
    transport: SSEServerTransport
    context: HTTPTransportContext
  }> {
    const app = fastify({
      logger: false,
      trustProxy: true,
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

    const transports = new Map<string, SSEServerTransport>()

    // SSE endpoint for older clients
    app.get('/sse', async (request, reply) => {
      const transport = new SSEServerTransport('/messages', reply.raw)
      transports.set(transport.sessionId, transport)

      reply.raw.on('close', () => {
        transports.delete(transport.sessionId)
        logger.debug('SSE session closed', { sessionId: transport.sessionId })
      })
    })

    // Message endpoint for older clients
    app.post('/messages', async (request, reply) => {
      const sessionId = (request.query as any)?.sessionId as string
      const transport = transports.get(sessionId)

      if (transport) {
        await transport.handlePostMessage(request.raw, reply.raw, request.body)
      } else {
        reply.status(400).send('No transport found for sessionId')
      }
    })

    // Health check endpoint
    app.get('/health', async (request, reply) => {
      reply.send({
        status: 'healthy',
        transport: 'sse',
        activeSessions: transports.size,
        uptime: process.uptime(),
      })
    })

    // Create initial transport (placeholder)
    const initialTransport = new SSEServerTransport('/messages', {} as any)

    return {
      transport: initialTransport,
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

    if (!['stdio', 'streamable-http', 'sse'].includes(config.type)) {
      errors.push(`Invalid transport type: ${config.type}`)
    }

    if (config.type !== 'stdio') {
      if (!config.port || config.port < 1 || config.port > 65535) {
        errors.push('Port must be between 1 and 65535 for HTTP/SSE transports')
      }

      if (!config.host) {
        errors.push('Host is required for HTTP/SSE transports')
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
