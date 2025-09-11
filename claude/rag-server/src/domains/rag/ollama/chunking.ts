import fetch from 'node-fetch'
import { logger } from '@/shared/logger/index.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

/**
 * Context generation request for chunking
 */
interface ContextRequest {
  model: string
  prompt: string
  maxTokens: number
}

/**
 * Ollama service for contextual chunking
 * Generates context descriptions for text chunks to improve semantic understanding
 */
export class ChunkingService {
  private baseUrl: string
  private model: string

  constructor(config: ServerConfig) {
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    this.model = config.contextualChunkingModel
  }

  /**
   * Generate contextual description for a chunk of text
   * Uses optimized Ollama API call with timeout and error handling
   */
  async generateContext(
    chunk: string,
    fullDocument: string,
    filePath?: string,
    targetContextTokens?: number
  ): Promise<string> {
    const documentSample = fullDocument.substring(0, 500) // Limit document context
    const chunkSample = chunk.substring(0, 150) // Limit chunk preview

    const prompt = `Describe this chunk in one sentence:
Doc: "${documentSample}..."
Chunk: "${chunkSample}..."
Description:`

    const maxTokens = targetContextTokens || 50

    try {
      const response = await this.generateWithOllama({
        model: this.model,
        prompt,
        maxTokens
      })

      return response.trim()
    } catch (error) {
      logger.warn('Context generation failed', {
        error: error instanceof Error ? error.message : String(error),
        filePath,
        component: 'ChunkingService'
      })
      
      // Fallback to simple context
      const fileType = filePath ? this.getFileTypeFromPath(filePath) : 'text'
      return `[Content from ${fileType} file]`
    }
  }

  /**
   * Generate context with Ollama API
   * Optimized with timeout, connection reuse, and early stopping
   */
  private async generateWithOllama(request: ContextRequest): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Connection: 'keep-alive', // Reuse connections
        },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.8,
            num_predict: request.maxTokens,
            stop: ['\n\n', 'Doc:', 'Chunk:'], // Early stopping
            think: false,
          },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { response: string }
      return data.response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Extract file type from path for fallback context
   */
  private getFileTypeFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    
    switch (ext) {
      case 'md':
      case 'markdown':
        return 'markdown'
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
        return 'JavaScript/TypeScript'
      case 'py':
        return 'Python'
      case 'rs':
        return 'Rust'
      case 'go':
        return 'Go'
      case 'java':
        return 'Java'
      case 'cpp':
      case 'c':
      case 'h':
        return 'C/C++'
      case 'html':
      case 'htm':
        return 'HTML'
      case 'css':
        return 'CSS'
      case 'json':
        return 'JSON'
      case 'xml':
        return 'XML'
      case 'txt':
      case 'text':
        return 'text'
      default:
        return ext || 'unknown'
    }
  }

  /**
   * Check if the service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      logger.warn('Ollama chunking service unavailable', {
        error: error instanceof Error ? error.message : String(error),
        component: 'ChunkingService'
      })
      return false
    }
  }
}