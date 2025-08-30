import {
  IVectorStoreService,
  VectorDocument,
  VectorSearchResult,
  SearchOptions,
  IndexInfo,
} from '@/domains/rag/core/types.js'
import { VectorStoreProvider } from './core/interfaces.js'
import { VectorSearchOptions } from './core/types.js'

// Re-export VectorStoreProvider for use in other modules
export type { VectorStoreProvider } from './core/interfaces.js'

/**
 * Universal Vector Store Adapter
 * 다양한 vector store provider들을 통합하여 사용할 수 있는 범용 어댑터
 */
export class VectorStoreAdapter implements IVectorStoreService {
  constructor(private provider: VectorStoreProvider) {}

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    await this.provider.addDocuments(documents)
  }

  async search(query: string, options?: SearchOptions): Promise<VectorSearchResult[]> {
    // SearchOptions -> VectorSearchOptions 변환
    const vectorSearchOptions: VectorSearchOptions = {
      topK: options?.topK,
      scoreThreshold: options?.scoreThreshold,
      fileTypes: options?.fileTypes,
      metadataFilters: options?.metadataFilters,
    }

    return await this.provider.search(query, vectorSearchOptions)
  }

  async removeDocumentsByFileId(fileId: string): Promise<void> {
    await this.provider.removeDocumentsByFileId(fileId)
  }

  getIndexInfo(): IndexInfo {
    const indexStats = this.provider.getIndexInfo()
    return {
      documentCount: indexStats.totalVectors,
      indexPath: `./index.${this.getProviderName()}`,
    }
  }

  isHealthy(): boolean {
    return this.provider.isHealthy()
  }

  // 선택적 메서드들 - provider에서 지원하는 경우에만 호출
  async initialize(): Promise<void> {
    if (this.provider.initialize) {
      await this.provider.initialize()
    }
  }

  async saveIndex(): Promise<void> {
    if (this.provider.saveIndex) {
      await this.provider.saveIndex()
    }
  }

  async rebuildIndex(): Promise<void> {
    if (this.provider.rebuildIndex) {
      await this.provider.rebuildIndex()
    }
  }

  getAllDocumentIds(): string[] {
    if (this.provider.getAllDocumentIds) {
      return this.provider.getAllDocumentIds()
    }
    return []
  }

  getDocumentCount(): number {
    if (this.provider.getDocumentCount) {
      return this.provider.getDocumentCount()
    }
    return 0
  }

  async removeAllDocuments(): Promise<void> {
    await this.provider.removeAllDocuments()
  }

  hasDocumentsForFileId(fileId: string): boolean {
    if (this.provider.hasDocumentsForFileId) {
      return this.provider.hasDocumentsForFileId(fileId)
    }
    return false
  }

  async getDocumentMetadata(docId: string): Promise<any | null> {
    if (this.provider.getDocumentMetadata) {
      return await this.provider.getDocumentMetadata(docId)
    }
    return null
  }

  /**
   * 인덱스 통계 조회 (고급 기능)
   */
  getIndexStats(): {
    total: number
    occupied: number
    sparsity: number
    needsCompaction: boolean
  } | null {
    if (this.provider.getIndexStats) {
      return this.provider.getIndexStats()
    }
    return null
  }

  /**
   * 인덱스 압축 (고급 기능)
   */
  async compactIndex(): Promise<void> {
    if (this.provider.compactIndex) {
      await this.provider.compactIndex()
    }
  }

  /**
   * 자동 압축 (고급 기능)
   */
  async autoCompactIfNeeded(): Promise<boolean> {
    if (this.provider.autoCompactIfNeeded) {
      return await this.provider.autoCompactIfNeeded()
    }
    return false
  }

  /**
   * Provider 정보
   */
  getProviderInfo(): { name: string; capabilities: any } {
    return {
      name: this.getProviderName(),
      capabilities: this.provider.capabilities || {},
    }
  }

  private getProviderName(): string {
    return this.provider.constructor.name.toLowerCase().replace('provider', '')
  }
}
