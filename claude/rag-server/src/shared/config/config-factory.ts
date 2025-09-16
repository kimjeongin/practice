import { logger } from '@/shared/logger/index.js'
import { resolve } from 'path'

/**
 * Configuration Factory for RAG MCP Server
 * 환경변수 기반 서버 설정 관리
 */

export interface VectorStoreConfig {
  provider: 'lancedb'
  config: {
    uri: string
  }
}

export interface MCPTransportConfig {
  type: 'stdio' | 'streamable-http'
  port: number
  host: string
  enableCors: boolean
  sessionTimeout: number
  allowedOrigins: string[]
  enableDnsRebindingProtection: boolean
}

export interface ServerConfig {
  // 기본 설정
  nodeEnv: string              // 환경: development|production (기본값: development)
  documentsDir: string         // 문서 디렉토리 경로 (기본값: ./documents)
  dataDir: string              // 데이터 디렉토리 경로 (기본값: ./.data)
  logLevel: string             // 로그 레벨 (기본값: info)

  // 문서 처리 설정
  chunkSize: number                    // 청크 크기 (기본값: 800)
  chunkOverlap: number                 // 청크 중복 크기 (기본값: 100)
  chunkingStrategy: 'contextual' | 'normal'  // 청킹 전략 (기본값: normal)
  contextualChunkingModel: string     // 컨텍스트 청킹용 모델 (기본값: qwen3:1.7b)
  minChunkSize: number                // 최소 청크 크기 (기본값: 500)

  // 파일 감시자 설정
  watcherDebounceDelay: number        // 디바운스 지연시간 ms (기본값: 200)
  watcherMaxScanDepth: number         // 최대 스캔 깊이 (기본값: 5)
  watcherMaxProcessingQueue: number   // 최대 처리 큐 크기 (기본값: 50)

  // 처리 동시성 설정
  maxConcurrentProcessing: number     // 최대 동시 처리 수 (기본값: 2)
  maxErrorHistory: number             // 최대 에러 히스토리 수 (기본값: 1000)
  embeddingConcurrency: number        // 임베딩 동시성 (기본값: 4)

  // 검색 설정
  semanticScoreThreshold: number      // 시맨틱 점수 임계값 (기본값: 0.5)

  // LLM 재랭킹 설정
  enableLLMReranking: boolean         // LLM 재랭킹 활성화 (기본값: true)
  llmRerankingModel: string           // 재랭킹용 모델 (기본값: qwen3:1.7b)
  llmRerankingTimeout: number         // 재랭킹 타임아웃 ms (기본값: 120000)
  hybridSemanticRatio: number         // 하이브리드 시맨틱 비율 (기본값: 0.7)
  hybridKeywordRatio: number          // 하이브리드 키워드 비율 (기본값: 0.3)
  hybridTotalResultsForReranking: number  // 재랭킹할 결과 수 (기본값: 20)

  // Ollama 설정
  embeddingModel: string              // 임베딩 모델 (기본값: bge-m3:567m)
  embeddingBatchSize: number          // 임베딩 배치 크기 (기본값: 12)
  ollamaBaseUrl: string               // Ollama 서버 URL (기본값: http://localhost:11434)

  // 벡터 저장소 설정
  vectorStore: VectorStoreConfig      // LanceDB 설정

  // MCP 전송 설정
  mcp: MCPTransportConfig             // MCP 서버 설정
}

export class ConfigFactory {
  /**
   * 현재 환경에 맞는 설정 반환
   * NODE_ENV에 따라 개발/운영 설정 자동 선택
   */
  static getCurrentConfig(): ServerConfig {
    const nodeEnv = process.env['NODE_ENV'] || 'development'

    if (nodeEnv === 'production') {
      return ConfigFactory.createProductionConfig()
    } else {
      return ConfigFactory.createDevelopmentConfig()
    }
  }

  /**
   * 환경변수 기반 기본 설정 생성
   * .env 파일의 값들을 읽어 설정 객체 생성
   */
  private static createBaseConfig(): ServerConfig {
    return {
      nodeEnv: process.env['NODE_ENV'] || 'development',
      documentsDir: process.env['DOCUMENTS_DIR'] || './documents',
      dataDir: process.env['DATA_DIR'] || './.data',
      logLevel: process.env['LOG_LEVEL'] || 'info',

      // 문서 처리 설정
      chunkSize: parseInt(process.env['CHUNK_SIZE'] || '800'),        // 청크 크기: 800토큰
      chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '100'),   // 청크 중복: 100토큰 (12.5%)
      chunkingStrategy: (process.env['CHUNKING_STRATEGY'] as 'contextual' | 'normal') || 'normal',
      contextualChunkingModel: process.env['CONTEXTUAL_CHUNKING_MODEL'] || 'qwen3:1.7b',
      minChunkSize: parseInt(process.env['MIN_CHUNK_SIZE'] || '500'),  // 최소 청크 크기: 500토큰

      // 파일 감시자 설정
      watcherDebounceDelay: parseInt(process.env['WATCHER_DEBOUNCE_DELAY'] || '200'),     // 디바운스: 200ms
      watcherMaxScanDepth: parseInt(process.env['WATCHER_MAX_SCAN_DEPTH'] || '5'),       // 스캔 깊이: 5단계
      watcherMaxProcessingQueue: parseInt(process.env['WATCHER_MAX_PROCESSING_QUEUE'] || '50'), // 큐 크기: 50개

      // 처리 동시성 설정
      maxConcurrentProcessing: parseInt(process.env['MAX_CONCURRENT_PROCESSING'] || '2'), // 동시 처리: 2개
      maxErrorHistory: parseInt(process.env['MAX_ERROR_HISTORY'] || '1000'),              // 에러 히스토리: 1000개
      embeddingConcurrency: parseInt(process.env['EMBEDDING_CONCURRENCY'] || '4'),        // 임베딩 동시성: 4개

      // 검색 설정
      semanticScoreThreshold: parseFloat(process.env['SEMANTIC_SCORE_THRESHOLD'] || '0.5'), // 시맨틱 임계값: 0.5

      // LLM 재랭킹 설정
      enableLLMReranking: process.env['ENABLE_LLM_RERANKING'] !== 'false',               // 기본 활성화
      llmRerankingModel: process.env['LLM_RERANKING_MODEL'] || 'qwen3:1.7b',             // 재랭킹 모델
      llmRerankingTimeout: parseInt(process.env['LLM_RERANKING_TIMEOUT_MS'] || '120000'), // 타임아웃: 120초
      hybridSemanticRatio: parseFloat(process.env['HYBRID_SEMANTIC_RATIO'] || '0.7'),    // 시맨틱 비율: 70%
      hybridKeywordRatio: parseFloat(process.env['HYBRID_KEYWORD_RATIO'] || '0.3'),      // 키워드 비율: 30%
      hybridTotalResultsForReranking: parseInt(
        process.env['HYBRID_TOTAL_RESULTS_FOR_RERANKING'] || '20'
      ), // 재랭킹 결과 수: 20개

      // Ollama 설정
      embeddingModel: process.env['EMBEDDING_MODEL'] || 'bge-m3:567m',           // 임베딩 모델
      embeddingBatchSize: parseInt(process.env['EMBEDDING_BATCH_SIZE'] || '12'), // 배치 크기: 12개
      ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434', // Ollama URL

      // 벡터 저장소 설정
      vectorStore: {
        provider: 'lancedb',
        config: {
          uri: process.env['LANCEDB_URI'] || resolve('./.data/lancedb'), // LanceDB 경로
        },
      },

      // MCP 전송 설정
      mcp: {
        type: (process.env['MCP_TRANSPORT'] as 'stdio' | 'streamable-http') || 'stdio', // 전송 방식: stdio
        port: parseInt(process.env['MCP_PORT'] || '3000'),                              // 포트: 3000
        host: process.env['MCP_HOST'] || 'localhost',                                   // 호스트: localhost
        enableCors: process.env['MCP_ENABLE_CORS'] !== 'false',                        // CORS: 활성화
        sessionTimeout: parseInt(process.env['MCP_SESSION_TIMEOUT'] || '300000'),      // 세션 타임아웃: 5분
        allowedOrigins: process.env['MCP_ALLOWED_ORIGINS']?.split(',') || ['*'],       // 허용 Origin: 모든 도메인
        enableDnsRebindingProtection: process.env['MCP_DNS_REBINDING_PROTECTION'] === 'true', // DNS 보호: 비활성화
      },
    }
  }

  /**
   * 개발 환경 설정 생성
   * 디버그 로그 레벨 적용
   */
  static createDevelopmentConfig(): ServerConfig {
    const baseConfig = ConfigFactory.createBaseConfig()

    return {
      ...baseConfig,
      nodeEnv: 'development',
      logLevel: 'debug',
    }
  }

  /**
   * 운영 환경 설정 생성
   * HTTP 전송 방식 및 외부 접근 허용
   */
  static createProductionConfig(): ServerConfig {
    const baseConfig = ConfigFactory.createBaseConfig()

    return {
      ...baseConfig,
      nodeEnv: 'production',
      logLevel: 'info',
      vectorStore: {
        provider: 'lancedb',
        config: {
          uri: process.env['LANCEDB_URI'] || `${baseConfig.dataDir}/lancedb`,
        },
      },
      mcp: {
        ...baseConfig.mcp,
        type: (process.env['MCP_TRANSPORT'] as 'stdio' | 'streamable-http') || 'streamable-http',
        host: process.env['MCP_HOST'] || '0.0.0.0',
      },
    }
  }

  /**
   * 설정 유효성 검증
   * 필수 값 및 범위 확인
   */
  static validateConfig(config: ServerConfig): void {
    const errors: string[] = []

    // Basic validation
    if (!config.documentsDir) {
      errors.push('Documents directory is required')
    }

    if (!config.dataDir) {
      errors.push('Data directory is required')
    }

    // Document processing validation
    if (config.chunkSize < 100 || config.chunkSize > 8192) {
      errors.push('Chunk size must be between 100 and 8192')
    }

    if (config.chunkOverlap < 0 || config.chunkOverlap >= config.chunkSize) {
      errors.push('Chunk overlap must be between 0 and chunk size')
    }

    if (!['contextual', 'normal'].includes(config.chunkingStrategy)) {
      errors.push('Chunking strategy must be "contextual" or "normal"')
    }

    if (!config.contextualChunkingModel) {
      errors.push('Contextual chunking model is required')
    }

    // LLM Reranking validation
    if (!config.llmRerankingModel) {
      errors.push('LLM reranking model is required')
    }

    if (config.llmRerankingTimeout < 1000) {
      errors.push('LLM reranking timeout must be at least 1000ms')
    }

    if (config.hybridSemanticRatio < 0 || config.hybridSemanticRatio > 1) {
      errors.push('Hybrid semantic ratio must be between 0 and 1')
    }

    if (config.hybridKeywordRatio < 0 || config.hybridKeywordRatio > 1) {
      errors.push('Hybrid keyword ratio must be between 0 and 1')
    }

    if (Math.abs(config.hybridSemanticRatio + config.hybridKeywordRatio - 1.0) > 0.01) {
      errors.push('Hybrid semantic and keyword ratios must sum to 1.0')
    }

    if (config.hybridTotalResultsForReranking < 1) {
      errors.push('Hybrid total results for reranking must be at least 1')
    }

    // Ollama validation
    if (!config.embeddingModel) {
      errors.push('Embedding model is required')
    }

    if (config.embeddingBatchSize < 1) {
      errors.push('Embedding batch size must be at least 1')
    }

    if (!config.ollamaBaseUrl) {
      errors.push('Ollama base URL is required')
    }

    // Vector store validation
    if (!config.vectorStore.config.uri) {
      errors.push('LanceDB URI is required')
    }

    // MCP validation
    if (!['stdio', 'streamable-http'].includes(config.mcp.type)) {
      errors.push('MCP transport type must be "stdio" or "streamable-http"')
    }

    if (config.mcp.port < 1 || config.mcp.port > 65535) {
      errors.push('MCP port must be between 1 and 65535')
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
    }

    logger.debug('✅ Configuration validation passed', {
      embeddingModel: config.embeddingModel,
      ollamaBaseUrl: config.ollamaBaseUrl,
      vectorStoreProvider: config.vectorStore.provider,
      mcpTransport: config.mcp.type,
    })
  }
}
