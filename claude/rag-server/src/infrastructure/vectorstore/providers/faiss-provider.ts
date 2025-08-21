/**
 * FAISS Vector Store Provider
 * Local vector database with fast similarity search
 */

import { 
  VectorStoreProvider, 
  VectorDocument, 
  VectorSearchResult, 
  VectorSearchOptions,
  IndexStats,
  FaissConfig,
  VectorStoreCapabilities
} from '../abstractions/vector-store-interface.js';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { logger, startTiming } from '@/shared/logger/index.js';
import { withTimeout, withRetry } from '@/shared/utils/resilience.js';
import { VectorStoreError, ErrorCode } from '@/shared/errors/index.js';

export class FaissProvider extends VectorStoreProvider {
  readonly name = 'faiss';
  readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsHybridSearch: false,
    supportsReranking: false,
    supportsRealTimeUpdates: false,
    supportsBatchOperations: true,
    supportsScaling: false,
    maxDimensions: 65536,
  };

  private store: FaissStore | null = null;
  private indexPath: string;
  private isInit = false;
  
  // Document tracking for incremental updates
  private documentIdMap = new Map<string, number>();
  private indexDocumentMap = new Map<number, string>();
  private nextIndex = 0;

  constructor(
    private config: FaissConfig,
    private embeddings: Embeddings
  ) {
    super();
    this.indexPath = config.indexPath;
    
    // Ensure index directory exists
    if (!existsSync(this.indexPath)) {
      mkdirSync(this.indexPath, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    const endTiming = startTiming('faiss_initialization', { 
      component: 'FaissProvider',
      indexPath: this.indexPath 
    });

    try {
      logger.info('Initializing FAISS vector store', {
        indexPath: this.indexPath,
        indexType: this.config.indexType || 'flat'
      });

      if (await this.hasExistingIndex()) {
        logger.info('Loading existing FAISS index');
        await this.loadIndex();
      } else {
        logger.info('Creating new FAISS index');
        await this.createEmptyIndex();
      }

      this.isInit = true;
      
      logger.info('FAISS vector store initialized successfully', {
        indexPath: this.indexPath,
        documentCount: this.documentIdMap.size
      });

    } catch (error) {
      const initError = new VectorStoreError(
        `Failed to initialize FAISS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'initialization',
        error instanceof Error ? error : undefined
      );
      
      logger.error('FAISS initialization failed', initError);
      throw initError;
    } finally {
      endTiming();
    }
  }

  isInitialized(): boolean {
    return this.isInit;
  }

  async getStatus(): Promise<'healthy' | 'degraded' | 'unhealthy'> {
    try {
      if (!this.isInit || !this.store) {
        return 'unhealthy';
      }
      
      // Perform a basic health check
      const testVector = new Array(384).fill(0); // Assume 384 dimensions
      await this.store!.similaritySearchVectorWithScore(testVector, 1);
      return 'healthy';
    } catch (error) {
      logger.warn('FAISS health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return 'unhealthy';
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.isInit || !this.store) {
      throw new VectorStoreError('FAISS provider not initialized', 'not_initialized');
    }

    const endTiming = startTiming('faiss_add_documents', { 
      component: 'FaissProvider',
      documentCount: documents.length 
    });

    try {
      logger.debug('Adding documents to FAISS', { 
        count: documents.length,
        indexPath: this.indexPath 
      });

      // Validate all documents first
      documents.forEach(doc => this.validateDocument(doc));

      // Convert to LangChain Document format
      const langchainDocs: Document[] = documents.map(doc => new Document({
        pageContent: doc.content,
        metadata: {
          id: doc.id,
          fileId: doc.metadata.fileId,
          fileName: doc.metadata.fileName,
          filePath: doc.metadata.filePath,
          chunkIndex: doc.metadata.chunkIndex,
          fileType: doc.metadata.fileType,
          createdAt: doc.metadata.createdAt,
          embeddingId: doc.metadata.embeddingId,
          ...Object.fromEntries(
            Object.entries(doc.metadata).filter(([key]) => 
              !['fileId', 'fileName', 'filePath', 'chunkIndex', 'fileType', 'createdAt', 'embeddingId'].includes(key)
            )
          )
        }
      }));

      // Add documents to FAISS store
      const ids = await this.store.addDocuments(langchainDocs);
      
      // Update document mapping
      documents.forEach((doc, index) => {
        const faissIndex = this.nextIndex + index;
        this.documentIdMap.set(doc.id, faissIndex);
        this.indexDocumentMap.set(faissIndex, doc.id);
      });
      
      this.nextIndex += documents.length;

      // Save index to disk
      await this.saveIndex();

      logger.info('Documents added to FAISS successfully', {
        count: documents.length,
        totalDocuments: this.documentIdMap.size
      });

    } catch (error) {
      const addError = new VectorStoreError(
        `Failed to add documents to FAISS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'document_add',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to add documents to FAISS', addError);
      throw addError;
    } finally {
      endTiming();
    }
  }

  async updateDocument(id: string, document: Partial<VectorDocument>): Promise<void> {
    // FAISS doesn't support direct updates, so we need to delete and re-add
    if (this.documentIdMap.has(id)) {
      await this.deleteDocument(id);
    }
    
    if (document.content && document.metadata && document.embedding) {
      const fullDocument: VectorDocument = {
        id,
        content: document.content,
        embedding: document.embedding,
        metadata: document.metadata as any
      };
      await this.addDocuments([fullDocument]);
    }
  }

  async deleteDocument(id: string): Promise<void> {
    // FAISS doesn't support direct deletion in LangChain
    // This would require rebuilding the index, which is expensive
    throw new VectorStoreError(
      'FAISS does not support document deletion without rebuilding the entire index',
      'not_supported'
    );
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 1 && ids[0]) {
      await this.deleteDocument(ids[0]);
    } else {
      throw new VectorStoreError(
        'FAISS does not support batch document deletion',
        'not_supported'
      );
    }
  }

  async search(query: string | number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    if (typeof query === 'string') {
      throw new VectorStoreError(
        'FAISS requires embedding vectors for search. Use similaritySearch instead.',
        'invalid_query'
      );
    }
    
    return this.similaritySearch(query, options);
  }

  async hybridSearch(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    throw new VectorStoreError('FAISS does not support hybrid search', 'not_supported');
  }

  async similaritySearch(embedding: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    if (!this.isInit || !this.store) {
      throw new VectorStoreError('FAISS provider not initialized', 'not_initialized');
    }

    const validatedOptions = this.validateSearchOptions(options);
    const endTiming = startTiming('faiss_similarity_search', { 
      component: 'FaissProvider',
      topK: validatedOptions.topK 
    });

    try {
      const results = await withTimeout(
        this.store.similaritySearchVectorWithScore(embedding, validatedOptions.topK!),
        {
          timeoutMs: 10000,
          operation: 'faiss_search'
        }
      );

      const searchResults: VectorSearchResult[] = results
        .filter(([doc, score]: [any, number]) => {
          // Apply score threshold
          if (validatedOptions.scoreThreshold && score < validatedOptions.scoreThreshold) {
            return false;
          }
          
          // Apply metadata filters
          if (validatedOptions.filter) {
            return this.applyFilter(doc.metadata, validatedOptions.filter);
          }
          
          return true;
        })
        .map(([doc, score]: [any, number]) => ({
          id: doc.metadata.id,
          content: doc.pageContent,
          score,
          metadata: {
            fileId: doc.metadata.fileId,
            fileName: doc.metadata.fileName,
            filePath: doc.metadata.filePath,
            chunkIndex: doc.metadata.chunkIndex,
            fileType: doc.metadata.fileType,
            createdAt: doc.metadata.createdAt,
            embeddingId: doc.metadata.embeddingId,
            ...Object.fromEntries(
              Object.entries(doc.metadata).filter(([key]) => 
                !['id', 'fileId', 'fileName', 'filePath', 'chunkIndex', 'fileType', 'createdAt', 'embeddingId'].includes(key)
              )
            )
          }
        }));

      logger.debug('FAISS similarity search completed', {
        resultCount: searchResults.length,
        topK: validatedOptions.topK
      });

      return searchResults;

    } catch (error) {
      const searchError = new VectorStoreError(
        `FAISS similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'search',
        error instanceof Error ? error : undefined
      );
      
      logger.error('FAISS similarity search failed', searchError);
      throw searchError;
    } finally {
      endTiming();
    }
  }

  async getIndexStats(): Promise<IndexStats> {
    if (!this.isInit) {
      throw new VectorStoreError('FAISS provider not initialized', 'not_initialized');
    }

    try {
      // FAISS doesn't expose detailed stats through LangChain
      // We'll provide basic information from our tracking
      
      const indexFiles = [
        join(this.indexPath, 'faiss.index'),
        join(this.indexPath, 'docstore.json')
      ];
      
      let totalSize = 0;
      let lastModified = new Date(0);
      
      for (const file of indexFiles) {
        if (existsSync(file)) {
          const { promises } = await import('fs');
        const stats = await promises.stat(file);
          totalSize += stats.size;
          if (stats.mtime > lastModified) {
            lastModified = stats.mtime;
          }
        }
      }

      return {
        totalVectors: this.documentIdMap.size,
        dimensions: 384, // Default, would need to be determined from embeddings
        indexSize: totalSize,
        lastUpdated: lastModified
      };

    } catch (error) {
      const statsError = new VectorStoreError(
        `Failed to get FAISS index stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'stats',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to get FAISS index stats', statsError);
      throw statsError;
    }
  }

  async rebuildIndex(): Promise<void> {
    if (!this.isInit) {
      throw new VectorStoreError('FAISS provider not initialized', 'not_initialized');
    }

    logger.info('Rebuilding FAISS index', { indexPath: this.indexPath });
    
    // Clear existing mappings
    this.documentIdMap.clear();
    this.indexDocumentMap.clear();
    this.nextIndex = 0;
    
    // Create new empty index
    await this.createEmptyIndex();
    
    logger.info('FAISS index rebuilt successfully');
  }

  async clearIndex(): Promise<void> {
    await this.rebuildIndex();
  }

  async close(): Promise<void> {
    if (this.store) {
      // Save index one final time
      await this.saveIndex();
    }
    
    this.store = null;
    this.isInit = false;
    this.documentIdMap.clear();
    this.indexDocumentMap.clear();
    this.nextIndex = 0;
    
    logger.info('FAISS provider closed');
  }

  private async hasExistingIndex(): Promise<boolean> {
    const indexFile = join(this.indexPath, 'docstore.json');
    const faissIndexFile = join(this.indexPath, 'faiss.index');
    return existsSync(indexFile) && existsSync(faissIndexFile);
  }

  private async loadIndex(): Promise<void> {
    try {
      this.store = await FaissStore.load(this.indexPath, this.embeddings);
      
      // Rebuild document mappings from the docstore
      // This is a simplified approach - in production you might want to store mappings separately
      const docstore = (this.store as any).docstore;
      if (docstore && docstore.docs) {
        Object.entries(docstore.docs).forEach(([indexStr, doc]: [string, any]) => {
          const index = parseInt(indexStr);
          const id = doc.metadata?.id;
          if (id) {
            this.documentIdMap.set(id, index);
            this.indexDocumentMap.set(index, id);
            this.nextIndex = Math.max(this.nextIndex, index + 1);
          }
        });
      }
      
      logger.debug('FAISS index loaded', {
        documentCount: this.documentIdMap.size,
        nextIndex: this.nextIndex
      });
      
    } catch (error) {
      logger.error('Failed to load FAISS index', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async createEmptyIndex(): Promise<void> {
    try {
      // Create empty index with a dummy document
      const dummyDoc = new Document({
        pageContent: 'dummy',
        metadata: { id: 'dummy' }
      });
      
      this.store = await FaissStore.fromDocuments([dummyDoc], this.embeddings);
      
      // Remove the dummy document (this is a workaround for FAISS requiring at least one document)
      // In practice, you would add real documents immediately after initialization
      
      await this.saveIndex();
      
    } catch (error) {
      logger.error('Failed to create FAISS index', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.store) {
      return;
    }
    
    try {
      await this.store.save(this.indexPath);
      logger.debug('FAISS index saved', { indexPath: this.indexPath });
    } catch (error) {
      logger.error('Failed to save FAISS index', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - saving is not critical for functionality
    }
  }

  private applyFilter(metadata: any, filter: any): boolean {
    if (filter.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (metadata[key] !== value) {
          return false;
        }
      }
    }

    if (filter.fileTypes && filter.fileTypes.length > 0) {
      if (!filter.fileTypes.includes(metadata.fileType)) {
        return false;
      }
    }

    if (filter.dateRange) {
      const dateValue = metadata[filter.dateRange.field];
      if (!dateValue) return false;
      
      const date = new Date(dateValue);
      if (filter.dateRange.from && date < new Date(filter.dateRange.from)) {
        return false;
      }
      if (filter.dateRange.to && date > new Date(filter.dateRange.to)) {
        return false;
      }
    }

    if (filter.custom && typeof filter.custom === 'function') {
      return filter.custom(metadata);
    }

    return true;
  }
}