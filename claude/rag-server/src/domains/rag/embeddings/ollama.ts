import { Embeddings } from '@langchain/core/embeddings'
import fetch from 'node-fetch'
import { BaseServerConfig } from '@/shared/config/config-factory.js'
import { ModelInfo } from '@/domains/rag/core/types.js'
import { logger } from '@/shared/logger/index.js'

export interface OllamaModelConfig {
  modelId: string
  dimensions: number
  maxTokens: number
  description: string
  recommendedBatchSize?: number
}

export const AVAILABLE_OLLAMA_MODELS: Record<string, OllamaModelConfig> = {
  'nomic-embed-text': {
    modelId: 'nomic-embed-text',
    dimensions: 768,
    maxTokens: 2048,  // 토큰 단위: 2048 tokens (≈ 7168 characters with 3.5x ratio)
    description: 'Nomic Embed - Recommended general-purpose embedding model',
    recommendedBatchSize: 8,
  },
}

/**
 * LangChain 호환 Ollama 임베딩 클래스
 * 로컬 Ollama 서버와 통신하여 임베딩을 생성합니다.
 */
export class OllamaEmbeddings extends Embeddings {
  private baseUrl: string
  private model: string
  private requestOptions: Record<string, any>
  private cachedDimensions: number | null = null

  constructor(config: BaseServerConfig) {
    super({})
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'
    this.model = config.embeddingModel
    this.requestOptions = {
      temperature: 0, // 임베딩에는 deterministic 결과 필요
      keep_alive: '1m', // 모델을 1분간 메모리에 유지
    }
  }

  /**
   * 단일 텍스트에 대한 임베딩 생성
   */
  async embedQuery(query: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: query,
          ...this.requestOptions,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { embedding: number[] }

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding data received from Ollama')
      }

      // 차원 수 캐싱 (첫 번째 임베딩 생성 시)
      if (this.cachedDimensions === null) {
        this.cachedDimensions = data.embedding.length
        logger.info(`📊 Ollama model dimensions detected: ${this.cachedDimensions}`)
      }

      return data.embedding
    } catch (error) {
      logger.error('Error generating Ollama embedding for query:', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * 여러 문서에 대한 임베딩 생성 (배치 처리)
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) {
      return []
    }

    try {
      logger.info(`Generating embeddings for ${documents.length} documents...`)
      const embeddings: number[][] = []

      // Ollama는 배치 임베딩을 지원하지 않으므로 순차 처리
      // 성능 향상을 위해 병렬 처리 옵션 추가 (동시 연결 제한)
      const concurrency = 3 // 동시 처리 수 제한

      for (let i = 0; i < documents.length; i += concurrency) {
        const batch = documents.slice(i, i + concurrency)
        const batchPromises = batch.map((doc) => this.embedQuery(doc))

        try {
          const batchEmbeddings = await Promise.all(batchPromises)
          embeddings.push(...batchEmbeddings)

          // 진행상황 로깅
          if (i % (concurrency * 5) === 0) {
            logger.debug(
              `Progress: ${Math.min(i + concurrency, documents.length)}/${
                documents.length
              } embeddings generated`
            )
          }
        } catch (error) {
          logger.error(`Error in batch ${i}-${i + concurrency}:`, error instanceof Error ? error : new Error(String(error)))
          throw error
        }
      }

      logger.info(`Successfully generated ${embeddings.length} embeddings`)
      return embeddings
    } catch (error) {
      logger.error('Error generating Ollama embeddings for documents:', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Ollama 서버 상태 확인
   */
  async healthCheck(): Promise<boolean> {
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
      logger.warn('Ollama health check failed:', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * 지정된 모델이 사용 가능한지 확인
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      })

      if (!response.ok) {
        return false
      }

      const data = (await response.json()) as { models: Array<{ name: string }> }
      return data.models.some(
        (model) => model.name === this.model || model.name.startsWith(this.model + ':')
      )
    } catch (error) {
      logger.warn('Error checking Ollama model availability:', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * 모델 정보 및 설정 반환 (ModelInfo 인터페이스 호환)
   */
  getModelInfo(): ModelInfo {
    try {
      return {
        name: this.model,
        service: 'ollama',
        dimensions: this.cachedDimensions || 768, // 캐시된 차원 수 또는 기본값
        model: this.model,
      }
    } catch (error) {
      logger.warn('Error getting model info:', error instanceof Error ? error : new Error(String(error)))
      return {
        name: this.model || 'unknown',
        service: 'ollama',
        dimensions: this.cachedDimensions || 768,
        model: this.model,
      }
    }
  }

  /**
   * 임베딩 차원 수 반환 (동적 감지 또는 캐시된 값)
   */
  async getEmbeddingDimensions(): Promise<number> {
    // 이미 캐시된 차원 수가 있으면 반환
    if (this.cachedDimensions !== null) {
      return this.cachedDimensions
    }

    try {
      // 테스트 텍스트로 임베딩 생성하여 차원 수 확인
      const testEmbedding = await this.embedQuery('test')
      // embedQuery에서 이미 캐싱되므로 길이만 반환
      return testEmbedding.length
    } catch (error) {
      logger.warn('Could not determine embedding dimensions, using default')
      // 기본값 설정 및 캐싱
      this.cachedDimensions = 768
      return 768
    }
  }

  /**
   * Ollama에서 사용 가능한 모델 목록 조회
   */
  async getAvailableModels(): Promise<Record<string, any>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`)
      }

      const data = (await response.json()) as {
        models: Array<{ name: string; size: number; modified_at: string }>
      }

      const modelMap: Record<string, any> = {}
      for (const model of data.models) {
        modelMap[model.name] = {
          name: model.name,
          size: model.size,
          modified_at: model.modified_at,
          description: `Ollama model: ${model.name}`,
        }
      }

      return modelMap
    } catch (error) {
      logger.warn('Could not fetch available models from Ollama:', error instanceof Error ? error : new Error(String(error)))
      // 기본값 반환
      return {
        [this.model]: {
          name: this.model,
          description: `Current model: ${this.model}`,
        },
      }
    }
  }

  /**
   * 모델 전환 (Ollama는 단일 모델 인스턴스이므로 제한적)
   */
  async switchModel(modelName: string): Promise<void> {
    if (modelName === this.model) {
      logger.info(`Already using model: ${modelName}`)
      return
    }

    // Ollama에서 모델이 사용 가능한지 확인
    const availableModels = await this.getAvailableModels()
    if (!availableModels[modelName]) {
      throw new Error(
        `Model ${modelName} is not available in Ollama. Available models: ${Object.keys(
          availableModels
        ).join(', ')}`
      )
    }

    throw new Error(
      `Model switching not supported in current Ollama configuration. Current model: ${this.model}. To switch models, restart Ollama with the desired model.`
    )
  }

  /**
   * 모델 다운로드 (Ollama에서는 `ollama pull` 명령으로 관리)
   */
  async downloadModel(): Promise<void> {
    throw new Error(
      'Model downloading should be done directly through Ollama CLI using `ollama pull <model-name>`'
    )
  }

  /**
   * 캐시 통계 (Ollama 서버가 자체 관리)
   */
  async getCacheStats(): Promise<any> {
    return {
      message: 'Cache statistics are managed by Ollama server directly',
      note: 'Use `ollama ps` command to see running models',
    }
  }

  /**
   * 다운로드 진행률 (Ollama 서버가 자체 관리)
   */
  getDownloadProgress(): any {
    return {
      message: 'Download progress is managed by Ollama server directly',
      note: 'Use `ollama pull <model-name>` command to download models',
    }
  }

  /**
   * List available models with configuration
   */
  static getAvailableModels(): Record<string, OllamaModelConfig> {
    return AVAILABLE_OLLAMA_MODELS
  }

  /**
   * Get model configuration by name
   */
  static getModelConfig(modelName: string): OllamaModelConfig | null {
    // Try exact match first
    if (AVAILABLE_OLLAMA_MODELS[modelName]) {
      return AVAILABLE_OLLAMA_MODELS[modelName]
    }

    // Try partial matches for versioned models
    for (const [key, config] of Object.entries(AVAILABLE_OLLAMA_MODELS)) {
      const keyParts = key.split(':')
      const slashParts = key.split('/')
      
      if (keyParts[0] && modelName.includes(keyParts[0])) {
        return config
      }
      if (slashParts.length > 1 && slashParts[1] && modelName.includes(slashParts[1])) {
        return config
      }
    }

    return null
  }

  /**
   * Get dimensions for a specific model
   */
  static getModelDimensions(modelName: string): number {
    const config = OllamaEmbeddings.getModelConfig(modelName)
    return config?.dimensions || 768 // fallback to default
  }

  /**
   * Get recommended batch size for a specific model
   */
  static getModelBatchSize(modelName: string): number {
    const config = OllamaEmbeddings.getModelConfig(modelName)
    return config?.recommendedBatchSize || 8 // fallback to default
  }
}
