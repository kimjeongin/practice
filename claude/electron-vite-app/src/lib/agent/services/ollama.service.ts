import { EventEmitter } from 'events'
import { 
  OllamaModel, 
  OllamaGenerateRequest, 
  OllamaGenerateResponse, 
  OllamaModelInfo 
} from '../types/agent.types'

/**
 * Service for interacting with local Ollama API
 * Supports both streaming and non-streaming requests
 */
export class OllamaService extends EventEmitter {
  private baseUrl: string
  private defaultTimeout: number
  private availableModels: OllamaModelInfo[] = []
  private modelsCache: Map<string, OllamaModelInfo> = new Map()
  
  constructor(baseUrl = 'http://localhost:11434', timeout = 120000) {
    super()
    this.baseUrl = baseUrl
    this.defaultTimeout = timeout
  }

  /**
   * Check if Ollama server is running and accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch (error) {
      console.error('Ollama health check failed:', error)
      return false
    }
  }

  /**
   * Get list of available models from Ollama
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }

      const data = await response.json()
      this.availableModels = data.models || []
      
      // Update cache
      this.modelsCache.clear()
      this.availableModels.forEach(model => {
        this.modelsCache.set(model.name, model)
      })

      console.log(`📋 Found ${this.availableModels.length} Ollama models:`, 
        this.availableModels.map(m => m.name))
      
      return this.availableModels
    } catch (error) {
      console.error('Failed to list Ollama models:', error)
      throw error
    }
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    if (this.availableModels.length === 0) {
      await this.listModels()
    }
    return this.modelsCache.has(modelName)
  }

  /**
   * Generate text using Ollama model (non-streaming)
   */
  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    try {
      // Ensure model is available
      if (!(await this.isModelAvailable(request.model))) {
        throw new Error(`Model ${request.model} is not available`)
      }

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...request,
          stream: false
        }),
        signal: AbortSignal.timeout(this.defaultTimeout)
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
      }

      const result = await response.json() as OllamaGenerateResponse
      
      this.emit('generation-completed', {
        model: request.model,
        prompt: request.prompt.substring(0, 100) + '...',
        response: result.response.substring(0, 100) + '...',
        duration: result.total_duration
      })

      return result
    } catch (error) {
      console.error('Ollama generation failed:', error)
      this.emit('generation-error', { model: request.model, error })
      throw error
    }
  }

  /**
   * Generate text with streaming (for real-time responses)
   */
  async* generateStream(request: OllamaGenerateRequest): AsyncGenerator<string, void, unknown> {
    try {
      // Ensure model is available
      if (!(await this.isModelAvailable(request.model))) {
        throw new Error(`Model ${request.model} is not available`)
      }

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...request,
          stream: true
        }),
        signal: AbortSignal.timeout(this.defaultTimeout)
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim()) {
              try {
                const chunk = JSON.parse(line) as OllamaGenerateResponse
                if (chunk.response) {
                  yield chunk.response
                }
                if (chunk.done) {
                  return
                }
              } catch (parseError) {
                console.warn('Failed to parse streaming chunk:', parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      console.error('Ollama streaming generation failed:', error)
      this.emit('generation-error', { model: request.model, error })
      throw error
    }
  }

  /**
   * Generate JSON response with structured output
   */
  async generateJSON<T = any>(
    model: OllamaModel,
    prompt: string,
    systemPrompt?: string,
    options?: Partial<OllamaGenerateRequest['options']>
  ): Promise<T> {
    try {
      const response = await this.generate({
        model,
        prompt,
        system: systemPrompt,
        format: 'json',
        options: {
          temperature: 0.3, // Lower temperature for more consistent JSON
          ...options
        }
      })

      const jsonResponse = JSON.parse(response.response) as T
      return jsonResponse
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON response from model: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Get optimal model for specific task type
   */
  getOptimalModel(taskType: 'reasoning' | 'fast' | 'general'): OllamaModel {
    switch (taskType) {
      case 'reasoning':
        return 'deepseek-r1:8b'
      case 'fast':
        return 'mistral:7b'
      case 'general':
      default:
        return 'llama3.1:8b'
    }
  }

  /**
   * Get model information
   */
  getModelInfo(modelName: string): OllamaModelInfo | undefined {
    return this.modelsCache.get(modelName)
  }

  /**
   * Pull/download a model if not available
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: modelName,
          stream: false
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to pull model ${modelName}: ${response.statusText}`)
      }

      console.log(`✅ Successfully pulled model: ${modelName}`)
      
      // Refresh model list
      await this.listModels()
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error)
      throw error
    }
  }

  /**
   * Get default configuration for agent type
   */
  getDefaultConfig(agentType: 'main' | 'reasoning' | 'fast') {
    switch (agentType) {
      case 'reasoning':
        return {
          model: 'deepseek-r1:8b' as OllamaModel,
          temperature: 0.1,
          maxTokens: 2048,
          timeout: 180000 // 3 minutes for complex reasoning
        }
      case 'fast':
        return {
          model: 'mistral:7b' as OllamaModel,
          temperature: 0.5,
          maxTokens: 512,
          timeout: 30000 // 30 seconds for quick responses
        }
      case 'main':
      default:
        return {
          model: 'llama3.1:8b' as OllamaModel,
          temperature: 0.7,
          maxTokens: 1024,
          timeout: 60000 // 1 minute for general tasks
        }
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    this.removeAllListeners()
    this.modelsCache.clear()
    this.availableModels = []
  }
}

// Singleton instance
let ollamaService: OllamaService | null = null

export function getOllamaService(): OllamaService {
  if (!ollamaService) {
    ollamaService = new OllamaService()
  }
  return ollamaService
}

export async function initializeOllamaService(): Promise<OllamaService> {
  const service = getOllamaService()
  
  try {
    console.log('🤖 Initializing Ollama service...')
    
    const isHealthy = await service.healthCheck()
    if (!isHealthy) {
      throw new Error('Ollama server is not running or not accessible')
    }
    
    await service.listModels()
    console.log('✅ Ollama service initialized successfully')
    
    return service
  } catch (error) {
    console.error('❌ Failed to initialize Ollama service:', error)
    throw error
  }
}