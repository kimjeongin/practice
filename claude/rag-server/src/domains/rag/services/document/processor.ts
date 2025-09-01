/**
 * Document Processor - 간소화 버전
 * GPT Best Practice에 맞는 간단한 문서 처리
 */

import { logger, startTiming } from '@/shared/logger/index.js'
import { StructuredError, ErrorCode } from '@/shared/errors/index.js'
import { IFileProcessingService, VectorDocument } from '../../core/types.js'
import { FileReader } from './reader.js'
import { ChunkingService } from '../chunking.js'
import { extractFileMetadata } from '@/shared/utils/file-metadata.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { errorMonitor } from '@/shared/monitoring/error-monitor.js'
import { LanceDBProvider } from '../../integrations/vectorstores/providers/lancedb/index.js'
import { ModelCompatibilityService } from '../models/index.js'

/**
 * Document Processor - 간소화 버전 (GPT Best Practice)
 * 복잡한 메타데이터 시스템 제거, 기본적인 처리만 수행
 */
export class DocumentProcessor implements IFileProcessingService {
  private processingQueue = new Set<string>()
  private fileReader: FileReader
  private textChunker: ChunkingService

  constructor(
    private vectorStoreProvider: LanceDBProvider,
    private modelCompatibilityService: ModelCompatibilityService,
    private config: ServerConfig
  ) {
    this.fileReader = new FileReader()
    this.textChunker = new ChunkingService(config)
  }

  /**
   * 파일 처리 (간소화 버전)
   */
  async processFile(filePath: string): Promise<void> {
    const endTiming = startTiming('document_processing', {
      file: filePath,
      component: 'DocumentProcessor',
    })

    try {
      // 중복 처리 방지
      if (this.processingQueue.has(filePath)) {
        logger.debug(`File already being processed: ${filePath}`)
        return
      }

      this.processingQueue.add(filePath)

      logger.info(`📄 Processing file (simplified): ${filePath}`, {
        component: 'DocumentProcessor',
      })

      // 1. 파일 메타데이터 추출
      const fileMetadata = await extractFileMetadata(filePath)

      // 2. 파일 내용 읽기
      const content = await this.fileReader.readFile(filePath)
      if (!content || content.trim().length === 0) {
        logger.warn(`Empty file content: ${filePath}`)
        return
      }

      // 3. 청킹 (간단한 설정)
      const chunks = await this.textChunker.chunkText(content, {
        maxChunkSize: 1000,
        overlap: 100,
      })

      // 4. 문서 벡터화 및 저장 (중앙 집중식 스키마 사용)
      // VectorDocument 타입에 맞춰 생성 (내부적으로 RAGDocumentRecord 구조 사용)
      const documents: VectorDocument[] = chunks.map(
        (chunk: any, index: number) =>
          ({
            // RAGDocumentRecord 필드들
            vector: [], // 빈 배열로 초기화, VectorStore에서 임베딩 생성
            text: chunk.text,
            doc_id: fileMetadata.id,
            chunk_id: index,
            metadata: {
              fileName: fileMetadata.name,
              filePath: fileMetadata.path,
              fileType: fileMetadata.fileType,
              fileSize: fileMetadata.size,
              fileHash: fileMetadata.hash,
              chunkIndex: index,
              totalChunks: chunks.length,
              createdAt: fileMetadata.createdAt,
              modifiedAt: fileMetadata.modifiedAt,
              processedAt: new Date().toISOString(),
            },
            // VectorDocument 추가 필드들 (하위 호환성)
            id: `${fileMetadata.id}_chunk_${index}`,
            content: chunk.text,
          } as VectorDocument)
      )

      // 5. Vector Store에 추가
      await this.vectorStoreProvider.addDocuments(documents)

      logger.info(`✅ File processed successfully: ${filePath}`, {
        chunks: chunks.length,
        component: 'DocumentProcessor',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(
        `❌ Failed to process file: ${filePath}`,
        error instanceof Error ? error : new Error(errorMessage),
        {
          component: 'DocumentProcessor',
        }
      )

      errorMonitor.recordError(
        error instanceof StructuredError
          ? error
          : new StructuredError(errorMessage, ErrorCode.DOCUMENT_PROCESSING_ERROR)
      )
      throw error
    } finally {
      this.processingQueue.delete(filePath)
      endTiming()
    }
  }

  /**
   * 파일 제거
   */
  async removeFile(filePath: string): Promise<void> {
    try {
      logger.info(`🗑️ Removing file from vector store: ${filePath}`, {
        component: 'DocumentProcessor',
      })

      // 파일 ID 생성 (extractFileMetadata와 동일한 방식)
      const crypto = require('crypto')
      const fileId = crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 16)

      await this.vectorStoreProvider.removeDocumentsByFileId(fileId)

      logger.info(`✅ File removed successfully: ${filePath}`, {
        component: 'DocumentProcessor',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(
        `❌ Failed to remove file: ${filePath}`,
        error instanceof Error ? error : new Error(errorMessage),
        {
          component: 'DocumentProcessor',
        }
      )
      throw error
    }
  }

  /**
   * 처리 상태 확인
   */
  isProcessing(filePath?: string): boolean {
    return filePath ? this.processingQueue.has(filePath) : this.processingQueue.size > 0
  }

  /**
   * 처리 큐 크기
   */
  getQueueSize(): number {
    return this.processingQueue.size
  }

  /**
   * 모든 문서 제거
   */
  async removeAllDocuments(): Promise<void> {
    try {
      logger.info('🗑️ Removing all documents', {
        component: 'DocumentProcessor',
      })
      await this.vectorStoreProvider.removeAllDocuments()
      logger.info('✅ All documents removed', {
        component: 'DocumentProcessor',
      })
    } catch (error) {
      logger.error(
        '❌ Failed to remove all documents',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'DocumentProcessor',
        }
      )
      throw error
    }
  }
}
