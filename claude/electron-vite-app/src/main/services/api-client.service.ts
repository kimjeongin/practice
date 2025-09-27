// api-client.service.ts
import { ExampleApiClient, SSEEvent, SSEOptions, SSEConnection } from '../../shared/http'
import { BrowserWindow } from 'electron'

export class ApiClientService extends ExampleApiClient {
  private isLoggedIn: boolean = false
  private sseConnections: Map<string, SSEConnection | null> = new Map()
  private mainWindow: BrowserWindow | null = null

  constructor(mainWindow?: BrowserWindow) {
    super()
    this.mainWindow = mainWindow || null
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  // Health check
  override async healthCheck() {
    try {
      const result = await super.healthCheck()
      return result
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Authentication
  override async login(credentials: { username: string; password: string }) {
    try {
      const result = await super.login(credentials)
      if (result.success) {
        this.isLoggedIn = true
      }
      return result
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'AUTH_ERROR',
        message: error instanceof Error ? error.message : 'Login failed'
      }
    }
  }

  async logout() {
    this.tokenManager.clearTokens()
    this.isLoggedIn = false
    return { success: true, message: 'Logged out successfully' }
  }

  // User management
  override async getUsers() {
    try {
      return await super.getUsers()
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get users'
      }
    }
  }

  override async createUser(userData: { name: string; email: string }) {
    try {
      return await super.createUser(userData)
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create user'
      }
    }
  }

  // Protected data
  override async getProtectedData() {
    try {
      if (!this.isLoggedIn) {
        return {
          success: false as const,
          errorCode: 'AUTH_REQUIRED',
          message: 'Please login first'
        }
      }
      return await super.getProtectedData()
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get protected data'
      }
    }
  }

  // File upload
  override async uploadFile(file: File, title?: string, description?: string) {
    try {
      return await super.uploadFile(file, title, description)
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload file'
      }
    }
  }

  // File upload with string content
  async uploadFileFromString(fileName: string, content: string, title?: string, description?: string) {
    try {
      const file = new File([content], fileName, { type: 'text/plain' })
      return await this.uploadFile(file, title, description)
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload file'
      }
    }
  }

  // Multiple file upload
  override async uploadMultipleFiles(files: File[], category?: string) {
    try {
      return await super.uploadMultipleFiles(files, category)
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload files'
      }
    }
  }

  // Multiple file upload with string content
  async uploadMultipleFilesFromStrings(files: Array<{ name: string; content: string }>, category?: string) {
    try {
      const fileObjects = files.map(f => new File([f.content], f.name, { type: 'text/plain' }))
      return await this.uploadMultipleFiles(fileObjects, category)
    } catch (error) {
      return {
        success: false as const,
        errorCode: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload files'
      }
    }
  }

  // Get login status
  getLoginStatus() {
    return {
      success: true,
      data: {
        isLoggedIn: this.isLoggedIn,
        hasToken: !!this.tokenManager.getAccessToken()
      }
    }
  }

  // SSE Methods for Electron

  /**
   * Connect to basic SSE events and forward to renderer via IPC
   */
  async connectToSSEEvents(connectionId: string = 'basic'): Promise<{ success: boolean; message: string }> {
    try {
      // Close existing connection if any
      this.disconnectSSE(connectionId)

      const eventSource = await this.connectToEvents({
        onMessage: (event: SSEEvent) => {
          console.log(`[SSE-${connectionId}] Received:`, event)
          this.sendToRenderer('sse-message', { connectionId, event })
        },
        onOpen: () => {
          console.log(`[SSE-${connectionId}] Connection opened`)
          this.sendToRenderer('sse-status', { connectionId, status: 'connected' })
        },
        onError: (error) => {
          console.error(`[SSE-${connectionId}] Error:`, error)
          this.sendToRenderer('sse-error', { connectionId, error: 'Connection error' })
        },
        onClose: () => {
          console.log(`[SSE-${connectionId}] Connection closed`)
          this.sendToRenderer('sse-status', { connectionId, status: 'disconnected' })
          this.sseConnections.delete(connectionId)
        }
      })

      if (eventSource) {
        this.sseConnections.set(connectionId, eventSource)
        return { success: true, message: 'SSE connection established' }
      } else {
        return { success: false, message: 'Failed to establish SSE connection' }
      }

    } catch (error) {
      console.error(`[SSE-${connectionId}] Failed to connect:`, error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Connect to custom SSE events
   */
  async connectToSSECustomEvents(
    connectionId: string = 'custom',
    message?: string,
    interval?: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Close existing connection if any
      this.disconnectSSE(connectionId)

      const eventSource = await this.connectToCustomEvents(message, interval, {
        onMessage: (event: SSEEvent) => {
          console.log(`[SSE-${connectionId}] Received:`, event)
          this.sendToRenderer('sse-message', { connectionId, event })
        },
        onOpen: () => {
          console.log(`[SSE-${connectionId}] Custom connection opened`)
          this.sendToRenderer('sse-status', { connectionId, status: 'connected' })
        },
        onError: (error) => {
          console.error(`[SSE-${connectionId}] Error:`, error)
          this.sendToRenderer('sse-error', { connectionId, error: 'Connection error' })
        },
        onClose: () => {
          console.log(`[SSE-${connectionId}] Custom connection closed`)
          this.sendToRenderer('sse-status', { connectionId, status: 'disconnected' })
          this.sseConnections.delete(connectionId)
        }
      })

      if (eventSource) {
        this.sseConnections.set(connectionId, eventSource)
        return { success: true, message: 'Custom SSE connection established' }
      } else {
        return { success: false, message: 'Failed to establish custom SSE connection' }
      }

    } catch (error) {
      console.error(`[SSE-${connectionId}] Failed to connect to custom SSE:`, error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Connect to protected SSE events (requires authentication)
   */
  async connectToSSEProtectedEvents(connectionId: string = 'protected'): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isLoggedIn) {
        return { success: false, message: 'Please login first' }
      }

      // Close existing connection if any
      this.disconnectSSE(connectionId)

      const eventSource = await this.connectToProtectedEvents({
        onMessage: (event: SSEEvent) => {
          console.log(`[SSE-${connectionId}] Received:`, event)
          this.sendToRenderer('sse-message', { connectionId, event })
        },
        onOpen: () => {
          console.log(`[SSE-${connectionId}] Protected connection opened`)
          this.sendToRenderer('sse-status', { connectionId, status: 'connected' })
        },
        onError: (error) => {
          console.error(`[SSE-${connectionId}] Error:`, error)
          this.sendToRenderer('sse-error', { connectionId, error: 'Connection error' })
        },
        onClose: () => {
          console.log(`[SSE-${connectionId}] Protected connection closed`)
          this.sendToRenderer('sse-status', { connectionId, status: 'disconnected' })
          this.sseConnections.delete(connectionId)
        }
      })

      if (eventSource) {
        this.sseConnections.set(connectionId, eventSource)
        return { success: true, message: 'Protected SSE connection established' }
      } else {
        return { success: false, message: 'Failed to establish protected SSE connection' }
      }

    } catch (error) {
      console.error(`[SSE-${connectionId}] Failed to connect to protected SSE:`, error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Disconnect a specific SSE connection
   */
  disconnectSSE(connectionId: string): { success: boolean; message: string } {
    try {
      const connection = this.sseConnections.get(connectionId)
      if (connection) {
        ExampleApiClient.closeSSEConnection(connection)
        this.sseConnections.delete(connectionId)
        this.sendToRenderer('sse-status', { connectionId, status: 'disconnected' })
        return { success: true, message: `SSE connection ${connectionId} closed` }
      }
      return { success: false, message: `No SSE connection found for ${connectionId}` }
    } catch (error) {
      console.error(`Failed to disconnect SSE ${connectionId}:`, error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Disconnect all SSE connections
   */
  disconnectAllSSE(): { success: boolean; message: string; closed: string[] } {
    const closedConnections: string[] = []

    try {
      for (const [connectionId, connection] of this.sseConnections.entries()) {
        if (connection) {
          ExampleApiClient.closeSSEConnection(connection)
          closedConnections.push(connectionId)
          this.sendToRenderer('sse-status', { connectionId, status: 'disconnected' })
        }
      }

      this.sseConnections.clear()

      return {
        success: true,
        message: `Closed ${closedConnections.length} SSE connections`,
        closed: closedConnections
      }
    } catch (error) {
      console.error('Failed to disconnect all SSE connections:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        closed: closedConnections
      }
    }
  }

  /**
   * Get status of all SSE connections
   */
  getSSEStatus(): { success: boolean; connections: Array<{ id: string; status: string }> } {
    const connections: Array<{ id: string; status: string }> = []

    for (const [connectionId, connection] of this.sseConnections.entries()) {
      connections.push({
        id: connectionId,
        status: connection ? (connection.readyState === 1 ? 'connected' : 'connecting') : 'disconnected'
      })
    }

    return { success: true, connections }
  }

  /**
   * Send message to renderer process via IPC
   */
  private sendToRenderer(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}

// Singleton instance
let apiClientService: ApiClientService | null = null

export function getApiClientService(mainWindow?: BrowserWindow): ApiClientService {
  if (!apiClientService) {
    apiClientService = new ApiClientService(mainWindow)
  } else if (mainWindow) {
    apiClientService.setMainWindow(mainWindow)
  }
  return apiClientService
}