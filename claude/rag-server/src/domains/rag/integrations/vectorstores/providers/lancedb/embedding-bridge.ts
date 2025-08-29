/**
 * LanceDB Embedding Bridge
 * 기존 EmbeddingAdapter를 LanceDB의 EmbeddingFunction 인터페이스와 연결
 */

import { EmbeddingAdapter } from '../../../embeddings/adapter.js'
import type { IEmbeddingService } from '@/shared/types/interfaces.js'

/**
 * LanceDB 호환 임베딩 함수 인터페이스
 * LanceDB의 EmbeddingFunction을 TypeScript로 구현
 */
export interface LanceDBEmbeddingFunction {
  sourceColumn: string
  embed(data: string[]): Promise<number[][]>
  embeddingDataType?: string
  embeddingDimension?: number
  ndims(): number
}

/**
 * 기존 EmbeddingAdapter를 LanceDB EmbeddingFunction으로 변환하는 브릿지
 */
export class LanceDBEmbeddingBridge implements LanceDBEmbeddingFunction {
  public readonly sourceColumn: string
  public readonly embeddingDataType = 'Float32'
  private _embeddingDimension?: number

  constructor(
    private embeddingService: IEmbeddingService,
    sourceColumn: string = 'content'
  ) {
    this.sourceColumn = sourceColumn
  }

  /**
   * 임베딩 차원 수를 반환
   */
  ndims(): number {
    if (this._embeddingDimension) {
      return this._embeddingDimension
    }
    
    // 모델 정보에서 차원 수 가져오기
    const modelInfo = this.embeddingService.getModelInfo()
    this._embeddingDimension = modelInfo.dimensions || 384
    return this._embeddingDimension
  }

  /**
   * embeddingDimension getter (LanceDB 호환성)
   */
  get embeddingDimension(): number {
    return this.ndims()
  }

  /**
   * 배치 임베딩 생성 (LanceDB 인터페이스)
   * @param data 임베딩할 텍스트 배열
   * @returns 임베딩 벡터 배열
   */
  async embed(data: string[]): Promise<number[][]> {
    if (!data || data.length === 0) {
      return []
    }

    try {
      // EmbeddingAdapter의 embedDocuments 메서드 사용
      const embeddings = await this.embeddingService.embedDocuments(data)
      
      // 차원 수 캐싱
      if (embeddings.length > 0 && embeddings[0] && !this._embeddingDimension) {
        this._embeddingDimension = embeddings[0].length
      }

      return embeddings
    } catch (error) {
      console.error('❌ Failed to generate embeddings in LanceDB bridge:', error)
      throw error
    }
  }

  /**
   * 단일 쿼리 임베딩 생성 (편의 메서드)
   * @param query 임베딩할 쿼리 텍스트
   * @returns 임베딩 벡터
   */
  async embedQuery(query: string): Promise<number[]> {
    return await this.embeddingService.embedQuery(query)
  }

  /**
   * 모델 정보 반환
   */
  getModelInfo() {
    return this.embeddingService.getModelInfo()
  }

  /**
   * 헬스 체크 (사용 가능한 경우)
   */
  async healthCheck(): Promise<boolean> {
    try {
      // EmbeddingService에 healthCheck 메서드가 있는지 확인
      if ('healthCheck' in this.embeddingService && 
          typeof (this.embeddingService as any).healthCheck === 'function') {
        return await (this.embeddingService as any).healthCheck()
      }
      
      // fallback: 테스트 임베딩으로 헬스 체크
      const testEmbedding = await this.embedQuery('test')
      return Array.isArray(testEmbedding) && testEmbedding.length > 0
    } catch (error) {
      console.warn('⚠️  Embedding bridge health check failed:', error)
      return false
    }
  }
}

/**
 * EmbeddingAdapter에서 LanceDB 브릿지로 변환하는 팩토리 함수
 * @param embeddingAdapter 기존 EmbeddingAdapter 인스턴스
 * @param sourceColumn 소스 컬럼 명 (기본: 'content')
 * @returns LanceDB 호환 임베딩 함수
 */
export function createLanceDBEmbeddingBridge(
  embeddingAdapter: EmbeddingAdapter,
  sourceColumn: string = 'content'
): LanceDBEmbeddingBridge {
  return new LanceDBEmbeddingBridge(embeddingAdapter, sourceColumn)
}

/**
 * 임베딩 서비스에서 직접 LanceDB 브릿지 생성
 * @param embeddingService IEmbeddingService 구현체
 * @param sourceColumn 소스 컬럼 명 (기본: 'content')
 * @returns LanceDB 호환 임베딩 함수
 */
export function createLanceDBEmbeddingBridgeFromService(
  embeddingService: IEmbeddingService,
  sourceColumn: string = 'content'
): LanceDBEmbeddingBridge {
  return new LanceDBEmbeddingBridge(embeddingService, sourceColumn)
}