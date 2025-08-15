import { Embeddings } from '@langchain/core/embeddings';
import fetch from 'node-fetch';
import { ServerConfig } from '../../../../shared/types/index.js';

/**
 * LangChain 호환 Ollama 임베딩 클래스
 * 로컬 Ollama 서버와 통신하여 임베딩을 생성합니다.
 */
export class OllamaEmbeddings extends Embeddings {
  private baseUrl: string;
  private model: string;
  private requestOptions: Record<string, any>;

  constructor(config: ServerConfig) {
    super({});
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434';
    this.model = config.embeddingModel;
    this.requestOptions = {
      temperature: 0, // 임베딩에는 deterministic 결과 필요
      keep_alive: '1m', // 모델을 1분간 메모리에 유지
    };
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
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { embedding: number[] };
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding data received from Ollama');
      }

      return data.embedding;
    } catch (error) {
      console.error('Error generating Ollama embedding for query:', error);
      throw error;
    }
  }

  /**
   * 여러 문서에 대한 임베딩 생성 (배치 처리)
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) {
      return [];
    }

    try {
      console.log(`Generating embeddings for ${documents.length} documents...`);
      const embeddings: number[][] = [];
      
      // Ollama는 배치 임베딩을 지원하지 않으므로 순차 처리
      // 성능 향상을 위해 병렬 처리 옵션 추가 (동시 연결 제한)
      const concurrency = 3; // 동시 처리 수 제한
      
      for (let i = 0; i < documents.length; i += concurrency) {
        const batch = documents.slice(i, i + concurrency);
        const batchPromises = batch.map(doc => this.embedQuery(doc));
        
        try {
          const batchEmbeddings = await Promise.all(batchPromises);
          embeddings.push(...batchEmbeddings);
          
          // 진행상황 로깅
          if (i % (concurrency * 5) === 0) {
            console.log(`Progress: ${Math.min(i + concurrency, documents.length)}/${documents.length} embeddings generated`);
          }
        } catch (error) {
          console.error(`Error in batch ${i}-${i + concurrency}:`, error);
          throw error;
        }
      }

      console.log(`Successfully generated ${embeddings.length} embeddings`);
      return embeddings;
    } catch (error) {
      console.error('Error generating Ollama embeddings for documents:', error);
      throw error;
    }
  }

  /**
   * Ollama 서버 상태 확인
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('Ollama health check failed:', error);
      return false;
    }
  }

  /**
   * 지정된 모델이 사용 가능한지 확인
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.some(model => 
        model.name === this.model || model.name.startsWith(this.model + ':')
      );
    } catch (error) {
      console.warn('Error checking Ollama model availability:', error);
      return false;
    }
  }

  /**
   * 모델 정보 및 설정 반환
   */
  getModelInfo(): { model: string; baseUrl: string; options: Record<string, any> } {
    return {
      model: this.model,
      baseUrl: this.baseUrl,
      options: this.requestOptions,
    };
  }

  /**
   * 임베딩 차원 수 추정 (실제로는 모델에 따라 다름)
   */
  async getEmbeddingDimensions(): Promise<number> {
    try {
      // 테스트 텍스트로 임베딩 생성하여 차원 수 확인
      const testEmbedding = await this.embedQuery('test');
      return testEmbedding.length;
    } catch (error) {
      console.warn('Could not determine embedding dimensions, using default');
      // 기본값 반환 (nomic-embed-text는 768차원)
      return 768;
    }
  }
}