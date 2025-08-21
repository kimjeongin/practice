/**
 * Qdrant Vector Store Provider
 * High-performance vector database with advanced filtering capabilities
 */

import { 
  VectorStoreProvider, 
  VectorDocument, 
  VectorSearchResult, 
  VectorSearchOptions,
  IndexStats,
  QdrantConfig,
  VectorStoreCapabilities
} from '../abstractions/vector-store-interface.js';
import { logger, startTiming } from '@/shared/logger/index.js';
import { withTimeout, withRetry } from '@/shared/utils/resilience.js';
import { VectorStoreError, ErrorCode } from '@/shared/errors/index.js';

// Qdrant client interfaces (we'll implement a basic HTTP client)
interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: Record<string, any>;
}

interface QdrantSearchRequest {
  vector: number[];
  limit: number;
  score_threshold?: number;
  filter?: QdrantFilter;
  with_payload?: boolean;
  with_vector?: boolean;
}

interface QdrantFilter {
  must?: Array<{
    key: string;
    match?: { value: any };
    range?: { gte?: any; lte?: any; gt?: any; lt?: any };
  }>;
  should?: Array<any>;
  must_not?: Array<any>;
}

interface QdrantSearchResponse {
  result: Array<{
    id: string | number;
    version: number;
    score: number;
    payload: Record<string, any>;
    vector?: number[];
  }>;
}

interface QdrantCollectionInfo {
  status: string;
  vectors_count: number;
  indexed_vectors_count: number;
  config: {
    params: {
      vectors: {
        size: number;
        distance: string;
      };
    };
  };
}

export class QdrantProvider extends VectorStoreProvider {
  readonly name = 'qdrant';
  readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsHybridSearch: true,
    supportsReranking: true,
    supportsRealTimeUpdates: true,
    supportsBatchOperations: true,
    supportsScaling: true,
    maxDimensions: 65536,
  };

  private baseUrl: string;
  private apiKey?: string;
  private collectionName: string;
  private vectorSize: number;
  private distance: string;
  private isInit = false;
  private httpHeaders: Record<string, string>;

  constructor(private config: QdrantConfig) {
    super();
    this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.collectionName = config.collectionName;
    this.vectorSize = config.vectorSize;
    this.distance = config.distance || 'cosine';
    
    this.httpHeaders = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      this.httpHeaders['api-key'] = this.apiKey;
    }
  }

  async initialize(): Promise<void> {
    const endTiming = startTiming('qdrant_initialization', { 
      component: 'QdrantProvider',
      collection: this.collectionName 
    });

    try {
      logger.info('Initializing Qdrant vector store', {
        url: this.baseUrl,
        collection: this.collectionName,
        vectorSize: this.vectorSize,
        distance: this.distance
      });

      // Check if Qdrant server is accessible
      await this.checkConnection();

      // Check if collection exists, create if not
      await this.ensureCollection();

      this.isInit = true;
      
      logger.info('Qdrant vector store initialized successfully', {
        collection: this.collectionName,
        status: await this.getStatus()
      });

    } catch (error) {
      const initError = new VectorStoreError(
        `Failed to initialize Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'initialization',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Qdrant initialization failed', initError);
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
      const response = await this.makeRequest('GET', '/');
      if (response.ok) {
        return 'healthy';
      } else if (response.status >= 500) {
        return 'unhealthy';
      } else {
        return 'degraded';
      }
    } catch (error) {
      logger.warn('Qdrant health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return 'unhealthy';
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.isInit) {
      throw new VectorStoreError('Qdrant provider not initialized', 'not_initialized');
    }

    const endTiming = startTiming('qdrant_add_documents', { 
      component: 'QdrantProvider',
      documentCount: documents.length 
    });

    try {
      logger.debug('Adding documents to Qdrant', { 
        count: documents.length,
        collection: this.collectionName 
      });

      // Validate all documents first
      documents.forEach(doc => this.validateDocument(doc));

      // Convert to Qdrant format
      const points: QdrantPoint[] = documents.map(doc => ({
        id: doc.id,
        vector: doc.embedding || [],
        payload: {
          content: doc.content,
          ...doc.metadata
        }
      }));

      // Batch upsert
      const batchSize = 100;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        
        await withRetry(
          async () => {
            const response = await this.makeRequest(
              'PUT', 
              `/collections/${this.collectionName}/points`,
              { points: batch }
            );
            
            if (!response.ok) {
              throw new Error(`Qdrant batch upsert failed: ${response.statusText}`);
            }
          },
          'qdrant_batch_upsert',
          { retries: 2, minTimeout: 1000 }
        );
        
        logger.debug(`Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(points.length / batchSize)}`);
      }

      logger.info('Documents added to Qdrant successfully', {
        count: documents.length,
        collection: this.collectionName
      });

    } catch (error) {
      const addError = new VectorStoreError(
        `Failed to add documents to Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'document_add',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to add documents to Qdrant', addError);
      throw addError;
    } finally {
      endTiming();
    }
  }

  async updateDocument(id: string, document: Partial<VectorDocument>): Promise<void> {
    if (!this.isInit) {
      throw new VectorStoreError('Qdrant provider not initialized', 'not_initialized');
    }

    try {
      const point: Partial<QdrantPoint> = { id };
      
      if (document.embedding) {
        point.vector = document.embedding;
      }
      
      if (document.content || document.metadata) {
        point.payload = {};
        if (document.content) {
          point.payload.content = document.content;
        }
        if (document.metadata) {
          Object.assign(point.payload, document.metadata);
        }
      }

      const response = await this.makeRequest(
        'PUT',
        `/collections/${this.collectionName}/points`,
        { points: [point] }
      );

      if (!response.ok) {
        throw new Error(`Qdrant update failed: ${response.statusText}`);
      }

      logger.debug('Document updated in Qdrant', { id, collection: this.collectionName });

    } catch (error) {
      const updateError = new VectorStoreError(
        `Failed to update document in Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'document_update',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to update document in Qdrant', updateError);
      throw updateError;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    await this.deleteDocuments([id]);
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (!this.isInit) {
      throw new VectorStoreError('Qdrant provider not initialized', 'not_initialized');
    }

    try {
      const response = await this.makeRequest(
        'POST',
        `/collections/${this.collectionName}/points/delete`,
        { points: ids }
      );

      if (!response.ok) {
        throw new Error(`Qdrant delete failed: ${response.statusText}`);
      }

      logger.debug('Documents deleted from Qdrant', { 
        count: ids.length, 
        collection: this.collectionName 
      });

    } catch (error) {
      const deleteError = new VectorStoreError(
        `Failed to delete documents from Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'document_delete',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to delete documents from Qdrant', deleteError);
      throw deleteError;
    }
  }

  async search(query: string | number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    if (typeof query === 'string') {
      throw new VectorStoreError(
        'Qdrant requires embedding vectors for search. Use similaritySearch instead.',
        'invalid_query'
      );
    }
    
    return this.similaritySearch(query, options);
  }

  async similaritySearch(embedding: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    if (!this.isInit) {
      throw new VectorStoreError('Qdrant provider not initialized', 'not_initialized');
    }

    const validatedOptions = this.validateSearchOptions(options);
    const endTiming = startTiming('qdrant_similarity_search', { 
      component: 'QdrantProvider',
      topK: validatedOptions.topK 
    });

    try {
      const searchRequest: QdrantSearchRequest = {
        vector: embedding,
        limit: validatedOptions.topK!,
        with_payload: true,
        with_vector: false
      };

      if (validatedOptions.scoreThreshold && validatedOptions.scoreThreshold > 0) {
        searchRequest.score_threshold = validatedOptions.scoreThreshold;
      }

      if (validatedOptions.filter) {
        searchRequest.filter = this.buildQdrantFilter(validatedOptions.filter);
      }

      const response = await withTimeout(
        this.makeRequest(
          'POST',
          `/collections/${this.collectionName}/points/search`,
          searchRequest
        ),
        {
          timeoutMs: 10000,
          operation: 'qdrant_search'
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant search failed: ${response.statusText}`);
      }

      const searchResponse = await response.json() as QdrantSearchResponse;
      
      const results: VectorSearchResult[] = searchResponse.result.map(hit => ({
        id: String(hit.id),
        content: hit.payload.content || '',
        score: hit.score,
        metadata: {
          fileId: hit.payload.fileId,
          fileName: hit.payload.fileName,
          filePath: hit.payload.filePath,
          chunkIndex: hit.payload.chunkIndex,
          fileType: hit.payload.fileType,
          createdAt: hit.payload.createdAt,
          embeddingId: hit.payload.embeddingId,
          ...Object.fromEntries(
            Object.entries(hit.payload).filter(([key]) => 
              !['content', 'fileId', 'fileName', 'filePath', 'chunkIndex', 'fileType', 'createdAt', 'embeddingId'].includes(key)
            )
          )
        }
      }));

      logger.debug('Qdrant similarity search completed', {
        resultCount: results.length,
        topK: validatedOptions.topK
      });

      return results;

    } catch (error) {
      const searchError = new VectorStoreError(
        `Qdrant similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'search',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Qdrant similarity search failed', searchError);
      throw searchError;
    } finally {
      endTiming();
    }
  }

  async hybridSearch(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    // TODO: Implement hybrid search using Qdrant's sparse vector support
    throw new VectorStoreError('Hybrid search not yet implemented for Qdrant', 'not_implemented');
  }

  async getIndexStats(): Promise<IndexStats> {
    if (!this.isInit) {
      throw new VectorStoreError('Qdrant provider not initialized', 'not_initialized');
    }

    try {
      const response = await this.makeRequest('GET', `/collections/${this.collectionName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get collection info: ${response.statusText}`);
      }

      const info = await response.json() as QdrantCollectionInfo;

      return {
        totalVectors: info.vectors_count,
        dimensions: info.config.params.vectors.size,
        indexSize: 0, // Qdrant doesn't provide this directly
        lastUpdated: new Date()
      };

    } catch (error) {
      const statsError = new VectorStoreError(
        `Failed to get Qdrant index stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'stats',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to get Qdrant index stats', statsError);
      throw statsError;
    }
  }

  async rebuildIndex(): Promise<void> {
    // Qdrant doesn't require manual index rebuilding
    logger.info('Qdrant index rebuild requested, but not required for this provider');
  }

  async clearIndex(): Promise<void> {
    if (!this.isInit) {
      throw new VectorStoreError('Qdrant provider not initialized', 'not_initialized');
    }

    try {
      // Delete all points in the collection
      const response = await this.makeRequest(
        'POST',
        `/collections/${this.collectionName}/points/delete`,
        { filter: {} } // Empty filter matches all points
      );

      if (!response.ok) {
        throw new Error(`Failed to clear collection: ${response.statusText}`);
      }

      logger.info('Qdrant collection cleared', { collection: this.collectionName });

    } catch (error) {
      const clearError = new VectorStoreError(
        `Failed to clear Qdrant index: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'clear_index',
        error instanceof Error ? error : undefined
      );
      
      logger.error('Failed to clear Qdrant index', clearError);
      throw clearError;
    }
  }

  async close(): Promise<void> {
    this.isInit = false;
    logger.info('Qdrant provider closed');
  }

  private async checkConnection(): Promise<void> {
    const response = await this.makeRequest('GET', '/');
    if (!response.ok) {
      throw new Error(`Cannot connect to Qdrant server: ${response.statusText}`);
    }
  }

  private async ensureCollection(): Promise<void> {
    // Check if collection exists
    const checkResponse = await this.makeRequest('GET', `/collections/${this.collectionName}`);
    
    if (checkResponse.ok) {
      logger.debug('Qdrant collection already exists', { collection: this.collectionName });
      return;
    }

    if (checkResponse.status !== 404) {
      throw new Error(`Failed to check collection existence: ${checkResponse.statusText}`);
    }

    // Create collection
    logger.info('Creating Qdrant collection', { 
      collection: this.collectionName,
      vectorSize: this.vectorSize,
      distance: this.distance 
    });

    const createResponse = await this.makeRequest(
      'PUT',
      `/collections/${this.collectionName}`,
      {
        vectors: {
          size: this.vectorSize,
          distance: this.distance.charAt(0).toUpperCase() + this.distance.slice(1) // Capitalize
        },
        optimizers_config: this.config.optimizersConfig || {
          deleted_threshold: 0.2,
          vacuum_min_vector_number: 1000,
          default_segment_number: 0
        },
        on_disk_payload: this.config.onDiskPayload || true
      }
    );

    if (!createResponse.ok) {
      throw new Error(`Failed to create collection: ${createResponse.statusText}`);
    }

    logger.info('Qdrant collection created successfully', { collection: this.collectionName });
  }

  private buildQdrantFilter(filter: any): QdrantFilter {
    const qdrantFilter: QdrantFilter = { must: [] };

    if (filter.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        qdrantFilter.must!.push({
          key,
          match: { value }
        });
      }
    }

    if (filter.fileTypes && filter.fileTypes.length > 0) {
      qdrantFilter.must!.push({
        key: 'fileType',
        match: { value: filter.fileTypes }
      });
    }

    if (filter.dateRange) {
      const rangeFilter: any = { key: filter.dateRange.field, range: {} };
      
      if (filter.dateRange.from) {
        rangeFilter.range.gte = filter.dateRange.from;
      }
      if (filter.dateRange.to) {
        rangeFilter.range.lte = filter.dateRange.to;
      }
      
      qdrantFilter.must!.push(rangeFilter);
    }

    return qdrantFilter;
  }

  private async makeRequest(method: string, path: string, body?: any): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.httpHeaders
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    return response;
  }
}