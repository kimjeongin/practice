/**
 * RAG Server HTTP Client Service
 * Connects to independent RAG server running on HTTP
 */

interface RAGServerConfig {
  url: string
  healthCheckInterval: number
  connectTimeout: number
}

interface RAGServerStatus {
  connected: boolean
  url: string
  lastCheck: Date | null
  error: string | null
  tools: string[]
}

export class RAGServerClient {
  private config: RAGServerConfig
  private status: RAGServerStatus
  private healthCheckTimer: NodeJS.Timeout | null = null
  private listeners: ((status: RAGServerStatus) => void)[] = []

  constructor(config: Partial<RAGServerConfig> = {}) {
    this.config = {
      url: config.url || 'http://localhost:3000',
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      connectTimeout: config.connectTimeout || 5000
    }

    this.status = {
      connected: false,
      url: this.config.url,
      lastCheck: null,
      error: null,
      tools: []
    }
  }

  /**
   * Start monitoring RAG server
   */
  async start(): Promise<void> {
    console.log(`🔗 Starting RAG Server client: ${this.config.url}`)
    
    // Initial connection check
    await this.checkConnection()
    
    // Start periodic health checks
    this.startHealthChecks()
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    console.log('🛑 Stopping RAG Server client')
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    
    this.status.connected = false
    this.notifyListeners()
  }

  /**
   * Check if RAG server is available
   */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.connectTimeout)

      const response = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        this.status = {
          connected: true,
          url: this.config.url,
          lastCheck: new Date(),
          error: null,
          tools: data.tools || []
        }
        
        console.log('✅ RAG Server connected successfully')
        this.notifyListeners()
        return true
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      this.status = {
        connected: false,
        url: this.config.url,
        lastCheck: new Date(),
        error: errorMessage,
        tools: []
      }
      
      console.warn('❌ RAG Server connection failed:', errorMessage)
      this.notifyListeners()
      return false
    }
  }

  /**
   * Manually trigger reconnection
   */
  async reconnect(): Promise<boolean> {
    console.log('🔄 Attempting to reconnect to RAG Server...')
    return await this.checkConnection()
  }

  /**
   * Get current connection status
   */
  getStatus(): RAGServerStatus {
    return { ...this.status }
  }

  /**
   * Add status change listener
   */
  onStatusChange(listener: (status: RAGServerStatus) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Remove status change listener
   */
  removeStatusListener(listener: (status: RAGServerStatus) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Check if RAG server tools are available
   */
  hasSearchTools(): boolean {
    return this.status.connected && this.status.tools.includes('search_documents')
  }

  /**
   * Test RAG server search functionality
   */
  async testSearch(query: string): Promise<any> {
    if (!this.status.connected) {
      throw new Error('RAG Server is not connected')
    }

    try {
      const response = await fetch(`${this.config.url}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('RAG Server search test failed:', error)
      throw error
    }
  }

  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.checkConnection()
    }, this.config.healthCheckInterval)
  }

  private notifyListeners(): void {
    const status = this.getStatus()
    this.listeners.forEach(listener => {
      try {
        listener(status)
      } catch (error) {
        console.error('Error in status listener:', error)
      }
    })
  }
}

// Singleton instance
let ragServerClient: RAGServerClient | null = null

export function getRagServerClient(): RAGServerClient {
  if (!ragServerClient) {
    ragServerClient = new RAGServerClient()
  }
  return ragServerClient
}

export async function initializeRagServerClient(): Promise<RAGServerClient> {
  const client = getRagServerClient()
  await client.start()
  return client
}