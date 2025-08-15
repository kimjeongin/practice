import { IVectorStoreService, VectorDocument, VectorSearchResult, SearchOptions } from '../../../shared/types/interfaces.js';
import { FaissVectorStoreManager } from './faiss/faiss-vector-store.js';

export class VectorStoreAdapter implements IVectorStoreService {
  constructor(private faissVectorStore: FaissVectorStoreManager) {}

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    await this.faissVectorStore.addDocuments(documents);
  }

  async search(query: string, options?: SearchOptions): Promise<VectorSearchResult[]> {
    const searchOptions = {
      topK: options?.topK,
      scoreThreshold: options?.scoreThreshold,
      filter: options?.fileTypes || options?.metadataFilters ? 
        this.createMetadataFilter(options.fileTypes, options.metadataFilters) : undefined,
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

  private createMetadataFilter(fileTypes?: string[], metadataFilters?: Record<string, string>) {
    return (metadata: any) => {
      if (fileTypes && fileTypes.length > 0) {
        if (!fileTypes.includes(metadata.fileType?.toLowerCase())) {
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
}