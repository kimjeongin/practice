import { join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

interface SearchResult {
  content: string
  score: number
  metadata: {
    filePath: string
    fileName: string
    chunkIndex: number
  }
}

interface FileInfo {
  id: string
  name: string
  path: string
  fileType: string
  size: number
  uploadedAt: string
}

interface ServerStatus {
  status: string
  uptime: number
  documentsCount: number
  modelsLoaded: string[]
}

export class MCPService {
  private client: Client | null = null
  private transport: StdioClientTransport | null = null
  private connected = false

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting MCP Service...')
      
      // Create and connect MCP client (this will start the RAG server process)
      await this.connectMCPClient()
      
      console.log('✅ MCP Service started successfully')
    } catch (error) {
      console.error('❌ Failed to start MCP Service:', error)
      await this.cleanup()
      throw error
    }
  }

  private async connectMCPClient(): Promise<void> {
    console.log('🔗 Connecting MCP client...')

    // Get the path to rag-server relative to electron app
    const appDir = process.cwd()
    const ragServerPath = join(appDir, '..', 'rag-server')
    const ragServerScript = join(ragServerPath, 'dist', 'app', 'index.js')
    
    // Check if the rag-server is built
    try {
      require.resolve(ragServerScript)
    } catch (error) {
      throw new Error(`RAG server not found at ${ragServerScript}. Please build rag-server first.`)
    }

    // Create transport that will start the rag server process
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [ragServerScript],
      cwd: ragServerPath,
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    })

    // Create MCP client
    this.client = new Client({
      name: 'electron-mcp-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    })

    // Connect to the server
    await this.client.connect(this.transport)
    this.connected = true

    console.log('✅ MCP client connected')

    // List available tools for debugging
    try {
      const tools = await this.client.listTools()
      console.log('📋 Available MCP tools:', tools.tools.map(t => t.name).join(', '))
    } catch (error) {
      console.warn('⚠️ Could not list tools:', error)
    }
  }

  async searchDocuments(query: string, options?: {
    topK?: number
    useSemanticSearch?: boolean
    useHybridSearch?: boolean
    semanticWeight?: number
    fileTypes?: string[]
  }): Promise<{ results: SearchResult[], totalResults: number }> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    try {
      const result = await this.client.callTool({
        name: 'search_documents',
        arguments: {
          query,
          topK: options?.topK || 5,
          useSemanticSearch: options?.useSemanticSearch !== false,
          useHybridSearch: options?.useHybridSearch || false,
          semanticWeight: options?.semanticWeight || 0.7,
          ...(options?.fileTypes && { fileTypes: options.fileTypes })
        }
      })

      const response = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : { results: [], totalResults: 0 }
      return response
    } catch (error) {
      console.error('Search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async listFiles(options?: { 
    fileType?: string
    limit?: number
    offset?: number 
  }): Promise<FileInfo[]> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    try {
      const result = await this.client.callTool({
        name: 'list_files',
        arguments: {
          ...(options?.fileType && { fileType: options.fileType }),
          limit: options?.limit || 100,
          offset: options?.offset || 0
        }
      })

      const files = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : []
      return files
    } catch (error) {
      console.error('List files failed:', error)
      throw new Error(`List files failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async getServerStatus(): Promise<ServerStatus> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    try {
      const result = await this.client.callTool({
        name: 'get_server_status',
        arguments: {}
      })

      const status = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {}
      return status
    } catch (error) {
      console.error('Get server status failed:', error)
      throw new Error(`Get server status failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async uploadDocument(content: string, fileName: string): Promise<{ success: boolean, message: string }> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    try {
      const result = await this.client.callTool({
        name: 'upload_file',
        arguments: {
          content,
          fileName
        }
      })

      const response = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : { success: false, message: 'Unknown error' }
      return response
    } catch (error) {
      console.error('Upload document failed:', error)
      throw new Error(`Upload document failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async forceReindex(clearCache = false): Promise<{ success: boolean, message: string }> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    try {
      const result = await this.client.callTool({
        name: 'force_reindex',
        arguments: { clearCache }
      })

      const response = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : { success: false, message: 'Unknown error' }
      return response
    } catch (error) {
      console.error('Force reindex failed:', error)
      throw new Error(`Force reindex failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP Service...')
    
    this.connected = false

    // Close MCP client (this will also terminate the RAG server process)
    if (this.client) {
      try {
        await this.client.close()
      } catch (error) {
        console.warn('Warning: Error closing MCP client:', error)
      }
      this.client = null
    }

    // Close transport
    this.transport = null

    console.log('✅ MCP Service cleanup completed')
  }
}

// Singleton instance
let mcpService: MCPService | null = null

export function getMCPService(): MCPService {
  if (!mcpService) {
    mcpService = new MCPService()
  }
  return mcpService
}

export async function startMCPService(): Promise<MCPService> {
  const service = getMCPService()
  await service.start()
  return service
}

export async function stopMCPService(): Promise<void> {
  if (mcpService) {
    await mcpService.cleanup()
    mcpService = null
  }
}