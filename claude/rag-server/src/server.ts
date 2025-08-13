import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { DatabaseManager } from './database/connection.js';
import { SimpleRAGService } from './services/simple-rag.js';
import { McpProtocol } from './mcp/protocol.js';
import { registerRagTools } from './mcp/tools.js';
import { ServerConfig } from './types/index.js';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

export class RAGServer {
  private fastify: FastifyInstance;
  private db: DatabaseManager;
  private ragService: SimpleRAGService;
  private mcpProtocol: McpProtocol;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.fastify = Fastify({
      logger: {
        level: config.logLevel
      }
    });

    // Initialize database
    this.db = new DatabaseManager(config.databasePath);
    
    // Initialize RAG service
    this.ragService = new SimpleRAGService(this.db, config);
    
    // Initialize MCP protocol
    this.mcpProtocol = new McpProtocol();
    
    // Register RAG tools
    registerRagTools(this.mcpProtocol, this.ragService, this.db);
    
    this.setupRoutes();
  }

  private async setupRoutes(): Promise<void> {
    // Register CORS
    await this.fastify.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    });

    // Health check endpoint
    this.fastify.get('/health', async () => {
      const isRagReady = this.ragService.isReady();
      const isDbHealthy = this.db.isHealthy();
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          database: isDbHealthy ? 'healthy' : 'unhealthy',
          rag: isRagReady ? 'ready' : 'not ready'
        },
        stats: {
          indexedFiles: this.ragService.getIndexedFilesCount(),
          indexedChunks: this.ragService.getIndexedChunksCount()
        }
      };
    });

    // MCP endpoint - main protocol handler
    this.fastify.post('/mcp', async (request) => {
      const mcpRequest = request.body as any;
      
      if (!mcpRequest || typeof mcpRequest !== 'object') {
        return {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error'
          }
        };
      }

      return await this.mcpProtocol.handleRequest(mcpRequest);
    });

    // RESTful API endpoints for direct access (optional)
    
    // Search endpoint
    this.fastify.post('/api/search', async (request) => {
      const { query, topK, fileTypes, metadataFilters } = request.body as any;
      
      if (!query || typeof query !== 'string') {
        throw new Error('Query parameter is required and must be a string');
      }
      
      if (!this.ragService.isReady()) {
        throw new Error('RAG service is not ready. Please wait for initialization.');
      }

      const results = await this.ragService.search(query, {
        topK,
        fileTypes,
        metadataFilters
      });
      
      return {
        query,
        results: results.map(result => ({
          content: result.content,
          score: result.score,
          metadata: result.metadata,
          chunkIndex: result.chunkIndex
        })),
        totalResults: results.length
      };
    });

    // List files endpoint
    this.fastify.get('/api/files', async (request) => {
      const query = request.query as any;
      const { fileType, limit = 100, offset = 0 } = query;
      
      let files = this.db.getAllFiles();
      
      if (fileType) {
        files = files.filter(file => file.fileType.toLowerCase() === fileType.toLowerCase());
      }
      
      const totalFiles = files.length;
      const paginatedFiles = files.slice(Number(offset), Number(offset) + Number(limit));
      
      return {
        files: paginatedFiles.map(file => ({
          id: file.id,
          name: file.name,
          path: file.path,
          fileType: file.fileType,
          size: file.size,
          modifiedAt: file.modifiedAt.toISOString(),
          createdAt: file.createdAt.toISOString(),
          customMetadata: this.db.getFileMetadata(file.id)
        })),
        pagination: {
          total: totalFiles,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < totalFiles
        }
      };
    });

    // Get specific file metadata
    this.fastify.get('/api/files/:id', async (request) => {
      const { id } = request.params as { id: string };
      
      const file = this.db.getFileById(id);
      if (!file) {
        throw new Error('File not found');
      }
      
      const customMetadata = this.db.getFileMetadata(file.id);
      const chunks = this.db.getDocumentChunks(file.id);
      
      return {
        file: {
          id: file.id,
          name: file.name,
          path: file.path,
          fileType: file.fileType,
          size: file.size,
          modifiedAt: file.modifiedAt.toISOString(),
          createdAt: file.createdAt.toISOString(),
          hash: file.hash
        },
        customMetadata,
        chunkCount: chunks.length
      };
    });

    // Update file metadata
    this.fastify.put('/api/files/:id/metadata', async (request) => {
      const { id } = request.params as { id: string };
      const metadata = request.body as Record<string, string>;
      
      const file = this.db.getFileById(id);
      if (!file) {
        throw new Error('File not found');
      }
      
      // Update metadata
      for (const [key, value] of Object.entries(metadata)) {
        this.db.setFileMetadata(file.id, key, String(value));
      }
      
      const updatedMetadata = this.db.getFileMetadata(file.id);
      
      return {
        fileId: file.id,
        updatedMetadata
      };
    });

    // Server info endpoint
    this.fastify.get('/api/info', async () => {
      return {
        name: 'RAG MCP Server',
        version: '1.0.0',
        config: {
          dataDir: this.config.dataDir,
          embeddingModel: this.config.embeddingModel,
          chunkSize: this.config.chunkSize,
          similarityTopK: this.config.similarityTopK
        },
        status: {
          ready: this.ragService.isReady(),
          databaseHealthy: this.db.isHealthy(),
          indexedFiles: this.ragService.getIndexedFilesCount(),
          indexedChunks: this.ragService.getIndexedChunksCount()
        }
      };
    });

    // Error handler
    this.fastify.setErrorHandler((error, request, reply) => {
      this.fastify.log.error(error);
      
      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    try {
      // Ensure data directory and database directory exist
      await mkdir(dirname(this.config.databasePath), { recursive: true });
      await mkdir(this.config.dataDir, { recursive: true });
      
      console.log('Starting RAG MCP Server...');
      console.log(`Config: ${JSON.stringify(this.config, null, 2)}`);
      
      // Initialize RAG service
      await this.ragService.initialize();
      
      // Start Fastify server
      await this.fastify.listen({
        port: this.config.port,
        host: this.config.host
      });
      
      console.log(`🚀 RAG MCP Server started successfully`);
      console.log(`📍 Server running at: http://${this.config.host}:${this.config.port}`);
      console.log(`🔍 Health check: http://${this.config.host}:${this.config.port}/health`);
      console.log(`📁 Data directory: ${this.config.dataDir}`);
      console.log(`💾 Database: ${this.config.databasePath}`);
      console.log(`📊 Indexed files: ${this.ragService.getIndexedFilesCount()}`);
      console.log(`📄 Indexed chunks: ${this.ragService.getIndexedChunksCount()}`);
    } catch (error) {
      console.error('Failed to start server:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down RAG MCP Server...');
    
    try {
      // Close RAG service
      await this.ragService.shutdown();
      
      // Close database
      this.db.close();
      
      // Close Fastify
      await this.fastify.close();
      
      console.log('RAG MCP Server shut down successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}