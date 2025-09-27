// example-client.ts
import { BaseApiClient } from './client'
import { TokenManager } from './token-manager'
import { ApiResponse } from './types'

export interface User {
  id: number
  name: string
  email: string
  createdAt?: string
}

export interface CreateUserRequest {
  name: string
  email: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: number
    username: string
  }
}

export interface UploadResponse {
  message: string
  file: {
    filename: string
    originalname: string
    size: number
    mimetype: string
  }
  metadata: {
    title: string
    description: string
  }
}

export interface MultiUploadResponse {
  message: string
  files: Array<{
    filename: string
    originalname: string
    size: number
    mimetype: string
  }>
  metadata: {
    category: string
    uploadedAt: string
  }
}

export interface ProtectedData {
  message: string
  data: string
  user: {
    id: number
    username: string
  }
}

export interface SSEEvent {
  type: string
  message: string
  timestamp: string
  [key: string]: any
}

export interface SSEConnection {
  close: () => void
  readyState: number
  url: string
}

export interface SSEOptions {
  onMessage?: (event: SSEEvent) => void
  onError?: (error: Event) => void
  onOpen?: (event: Event) => void
  onClose?: (event: Event) => void
  headers?: Record<string, string>
}

export class ExampleApiClient extends BaseApiClient {
  constructor(baseURL: string = 'http://localhost:3001', tokenManager?: TokenManager) {
    super(baseURL, tokenManager || new TokenManager())
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.request({
      method: 'GET',
      url: '/health'
    })
  }

  // Authentication
  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>({
      method: 'POST',
      url: '/auth/login',
      data: credentials
    })

    // Store tokens if login successful
    if (response.success) {
      this.tokenManager.updateTokens({
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken
      })
    }

    return response
  }

  // User management - JSON API
  async getUsers(): Promise<ApiResponse<User[]>> {
    return this.request({
      method: 'GET',
      url: '/api/users'
    })
  }

  async createUser(userData: CreateUserRequest): Promise<ApiResponse<User>> {
    return this.request({
      method: 'POST',
      url: '/api/users',
      data: userData
    })
  }

  // Protected endpoint
  async getProtectedData(): Promise<ApiResponse<ProtectedData>> {
    return this.request({
      method: 'GET',
      url: '/api/protected'
    })
  }

  // File upload - Form data API
  async uploadFile(
    file: File,
    title?: string,
    description?: string
  ): Promise<ApiResponse<UploadResponse>> {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    if (description) formData.append('description', description)

    return this.formRequest('/api/upload', formData)
  }

  // Multiple file upload
  async uploadMultipleFiles(
    files: File[],
    category?: string
  ): Promise<ApiResponse<MultiUploadResponse>> {
    const formData = new FormData()
    files.forEach(file => {
      formData.append('files', file)
    })
    if (category) formData.append('category', category)

    return this.formRequest('/api/upload-multiple', formData)
  }

  // SSE (Server-Sent Events) methods

  /**
   * Connect to SSE endpoint for basic events
   */
  async connectToEvents(options: SSEOptions = {}): Promise<SSEConnection | null> {
    try {
      let isClosed = false
      let buffer = ''

      // Call onOpen callback
      options.onOpen?.(new Event('open'))
      console.log('SSE connection opened')

      const response = await this.request({
        method: 'GET',
        url: '/api/events',
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.success) {
        throw new Error(response.message)
      }

      const stream = response.data as any

      // Start reading stream
      stream.on('data', (chunk: Buffer) => {
        if (isClosed) return

        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              console.log('SSE message received:', data)
              options.onMessage?.(data)
            } catch (parseError) {
              console.error('Failed to parse SSE message:', parseError)
            }
          }
        }
      })

      stream.on('error', (error: Error) => {
        if (!isClosed) {
          console.error('SSE error:', error)
          options.onError?.(new Event('error'))
        }
      })

      stream.on('end', () => {
        if (!isClosed) {
          console.log('SSE connection closed')
          options.onClose?.(new Event('close'))
        }
      })

      // Return control object
      return {
        close: () => {
          isClosed = true
          stream.destroy()
          options.onClose?.(new Event('close'))
        },
        readyState: 1,
        url: '/api/events'
      }

    } catch (error) {
      console.error('Failed to connect to SSE:', error)
      options.onError?.(new Event('error'))
      return null
    }
  }

  /**
   * Connect to SSE endpoint with custom parameters
   */
  async connectToCustomEvents(
    message?: string,
    interval?: number,
    options: SSEOptions = {}
  ): Promise<SSEConnection | null> {
    try {
      let isClosed = false
      let buffer = ''

      const params = new URLSearchParams()
      if (message) params.append('message', message)
      if (interval) params.append('interval', interval.toString())

      const url = `/api/events/custom?${params.toString()}`

      // Call onOpen callback
      options.onOpen?.(new Event('open'))
      console.log('Custom SSE connection opened')

      const response = await this.request({
        method: 'GET',
        url: url,
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.success) {
        throw new Error(response.message)
      }

      const stream = response.data as any

      // Start reading stream
      stream.on('data', (chunk: Buffer) => {
        if (isClosed) return

        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              console.log('Custom SSE message received:', data)
              options.onMessage?.(data)
            } catch (parseError) {
              console.error('Failed to parse SSE message:', parseError)
            }
          }
        }
      })

      stream.on('error', (error: Error) => {
        if (!isClosed) {
          console.error('Custom SSE error:', error)
          options.onError?.(new Event('error'))
        }
      })

      stream.on('end', () => {
        if (!isClosed) {
          console.log('Custom SSE connection closed')
          options.onClose?.(new Event('close'))
        }
      })

      // Return control object
      return {
        close: () => {
          isClosed = true
          stream.destroy()
          options.onClose?.(new Event('close'))
        },
        readyState: 1,
        url: url
      }

    } catch (error) {
      console.error('Failed to connect to custom SSE:', error)
      options.onError?.(new Event('error'))
      return null
    }
  }

  /**
   * Connect to protected SSE endpoint (requires authentication)
   */
  async connectToProtectedEvents(options: SSEOptions = {}): Promise<SSEConnection | null> {
    const token = this.tokenManager.getAccessToken()
    if (!token) {
      console.error('No access token available for protected SSE')
      return null
    }

    try {
      let isClosed = false
      let buffer = ''

      // Call onOpen callback
      options.onOpen?.(new Event('open'))
      console.log('Protected SSE connection opened')

      const response = await this.request({
        method: 'GET',
        url: '/api/events/protected',
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.success) {
        throw new Error(response.message)
      }

      const stream = response.data as any

      // Start reading stream
      stream.on('data', (chunk: Buffer) => {
        if (isClosed) return

        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              console.log('Protected SSE message received:', data)
              options.onMessage?.(data)
            } catch (parseError) {
              console.error('Failed to parse SSE message:', parseError)
            }
          }
        }
      })

      stream.on('error', (error: Error) => {
        if (!isClosed) {
          console.error('Protected SSE error:', error)
          options.onError?.(new Event('error'))
        }
      })

      stream.on('end', () => {
        if (!isClosed) {
          console.log('Protected SSE connection closed')
          options.onClose?.(new Event('close'))
        }
      })

      // Return control object
      return {
        close: () => {
          isClosed = true
          stream.destroy()
          options.onClose?.(new Event('close'))
        },
        readyState: 1,
        url: '/api/events/protected'
      }

    } catch (error) {
      console.error('Failed to connect to protected SSE:', error)
      options.onError?.(new Event('error'))
      return null
    }
  }

  /**
   * Utility method to close SSE connection
   */
  static closeSSEConnection(sseConnection: SSEConnection | null): void {
    if (sseConnection) {
      sseConnection.close()
      console.log('SSE connection closed')
    }
  }

  // Convenience method to create a test file
  static createTestFile(name: string = 'test.txt', content: string = 'Hello World'): File {
    return new File([content], name, { type: 'text/plain' })
  }
}