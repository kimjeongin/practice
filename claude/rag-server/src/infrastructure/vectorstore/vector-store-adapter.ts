import { IVectorStoreService, VectorDocument, VectorSearchResult, SearchOptions } from '@/shared/types/interfaces.js'
import { FaissVectorStoreManager } from '@/infrastructure/vectorstore/providers/faiss-vector-store.js'

export class VectorStoreAdapter implements IVectorStoreService {
  constructor(private faissVectorStore: FaissVectorStoreManager) {}

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    await this.faissVectorStore.addDocuments(documents);
  }

  async search(query: string, options?: SearchOptions): Promise<VectorSearchResult[]> {
    const searchOptions: any = {
      ...(options?.topK !== undefined && { topK: options.topK }),
      ...(options?.scoreThreshold !== undefined && { scoreThreshold: options.scoreThreshold }),
      ...(options?.fileTypes || options?.metadataFilters ? {
        filter: this.createMetadataFilter(options.fileTypes, options.metadataFilters)
      } : {})
    };

    return await this.faissVectorStore.search(query, searchOptions);
  }

  async removeDocumentsByFileId(fileId: string): Promise<void> {
    await this.faissVectorStore.removeDocumentsByFileId(fileId);
  }

  getIndexInfo() {
    return this.faissVectorStore.getIndexInfo();
  }

  isHealthy(): boolean {
    return this.faissVectorStore.isHealthy();
  }

  async initialize(): Promise<void> {
    await this.faissVectorStore.initialize();
  }

  async saveIndex(): Promise<void> {
    await this.faissVectorStore.saveIndex();
  }

  async rebuildIndex(): Promise<void> {
    if ('rebuildIndex' in this.faissVectorStore) {
      await (this.faissVectorStore as any).rebuildIndex();
    }
  }

  getAllDocumentIds(): string[] {
    if ('getAllDocumentIds' in this.faissVectorStore) {
      return (this.faissVectorStore as any).getAllDocumentIds();
    }
    return [];
  }

  getDocumentCount(): number {
    if ('getDocumentCount' in this.faissVectorStore) {
      return (this.faissVectorStore as any).getDocumentCount();
    }
    return 0;
  }

  async removeAllDocuments(): Promise<void> {
    if ('removeAllDocuments' in this.faissVectorStore) {
      await (this.faissVectorStore as any).removeAllDocuments();
    }
  }

  hasDocumentsForFileId(fileId: string): boolean {
    if ('hasDocumentsForFileId' in this.faissVectorStore) {
      return (this.faissVectorStore as any).hasDocumentsForFileId(fileId);
    }
    return false;
  }

  async getDocumentMetadata(docId: string): Promise<any | null> {
    if ('getDocumentMetadata' in this.faissVectorStore) {
      return await (this.faissVectorStore as any).getDocumentMetadata(docId);
    }
    return null;
  }

  private createMetadataFilter(fileTypes?: string[], metadataFilters?: Record<string, string>) {
    return (metadata: any) => {
      if (fileTypes && fileTypes.length > 0) {
        const fileType = metadata.fileType?.toLowerCase();
        if (!fileType || !fileTypes.includes(fileType)) {
          return false;
        }
      }

      if (metadataFilters) {
        for (const [key, value] of Object.entries(metadataFilters)) {
          if (metadata[key] !== value) {
            return false;
          }
        }
      }

      return true;
    };
  }

  /**
   * 인덱스 통계 조회
   */
  getIndexStats(): { total: number; occupied: number; sparsity: number; needsCompaction: boolean } | null {
    if ('getIndexStats' in this.faissVectorStore) {
      return (this.faissVectorStore as any).getIndexStats();
    }
    return null;
  }

  /**
   * 인덱스 압축
   */
  async compactIndex(): Promise<void> {
    if ('compactIndex' in this.faissVectorStore) {
      await (this.faissVectorStore as any).compactIndex();
    }
  }

  /**
   * 자동 압축 (필요시에만)
   */
  async autoCompactIfNeeded(): Promise<boolean> {
    if ('autoCompactIfNeeded' in this.faissVectorStore) {
      return await (this.faissVectorStore as any).autoCompactIfNeeded();
    }
    return false;
  }
}