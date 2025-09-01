/**
 * Vector Store Core Types
 * 순수한 core 타입 정의 (provider 독립적)
 */

/**
 * 벡터 문서 - 모든 provider가 사용하는 공통 문서 형식
 */
export interface VectorDocument {
  // 고유 식별자
  id: string              // chunk 레벨의 고유 ID
  doc_id: string          // 문서(파일) 레벨 ID
  chunk_id: number        // 청크 인덱스
  
  // 콘텐츠
  content: string         // 실제 텍스트 내용
  vector?: number[]       // 임베딩 벡터 (선택적, provider에서 생성)
  
  // 메타데이터
  metadata: VectorDocumentMetadata
}

/**
 * 벡터 문서 메타데이터 - 공통 메타데이터 구조
 */
export interface VectorDocumentMetadata {
  // 파일 기본 정보
  fileName: string
  filePath: string
  fileType: string
  fileSize?: number
  fileHash?: string
  
  // 타임스탬프
  createdAt?: string
  modifiedAt?: string
  processedAt?: string
  
  // 청크 정보
  chunkIndex: number
  
  // 선택적 확장 필드들
  tags?: string[]
  category?: string
  language?: string
  
  // 사용자 정의 필드
  [key: string]: any
}

/**
 * 벡터 검색 결과 - 모든 provider가 반환하는 공통 검색 결과 형식
 */
export interface VectorSearchResult {
  // 문서 정보
  id: string              // chunk 레벨의 고유 ID
  content: string         // 텍스트 내용
  
  // 검색 점수
  score: number           // 유사도 점수 (0-1, 높을수록 유사)
  
  // 메타데이터
  metadata: VectorDocumentMetadata
  chunkIndex: number      // 청크 인덱스 (호환성)
}

/**
 * 벡터 검색 옵션 - provider 독립적인 공통 검색 옵션 (간소화)
 */
export interface VectorSearchOptions {
  topK?: number                                           // 최대 결과 수
  scoreThreshold?: number                                 // 최소 점수 임계값
}

/**
 * 인덱스 통계 정보
 */
export interface IndexStats {
  totalVectors: number      // 전체 벡터 수
  dimensions: number        // 벡터 차원 수
  indexSize?: number        // 인덱스 크기 (바이트)
  lastUpdated?: Date        // 마지막 업데이트 시간
}
