import { ISearchService, SearchOptions, SearchResult, IVectorStoreService } from '../../shared/types/interfaces.js';
import { IFileRepository } from '../repositories/documentRepository.js';
import { IChunkRepository } from '../repositories/chunkRepository.js';
import { ServerConfig } from '../../shared/types/index.js';
import { SearchError, VectorStoreError, ErrorCode } from '../../shared/errors/index.js';
import { logger, startTiming } from '../../shared/logger/index.js';
import { withTimeout, withRetry, CircuitBreakerManager } from '../../shared/utils/resilience.js';
import { errorMonitor } from '../../shared/monitoring/errorMonitor.js';

export class SearchService implements ISearchService {
  constructor(
    private vectorStoreService: IVectorStoreService,
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private config: ServerConfig
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      topK = this.config.similarityTopK,
      fileTypes,
      metadataFilters,
      useSemanticSearch = true,
      useHybridSearch = false,
      semanticWeight = 0.7,
      scoreThreshold = this.config.similarityThreshold,
    } = options;

    const searchType = useHybridSearch ? 'hybrid' : (useSemanticSearch ? 'semantic' : 'keyword');
    const endTiming = startTiming('search_operation', { 
      query: query.substring(0, 50), 
      searchType, 
      topK,
      component: 'SearchService'
    });

    try {
      logger.debug('Starting search operation', { 
        query: query.substring(0, 100),
        searchType,
        topK,
        fileTypes,
        useSemanticSearch,
        useHybridSearch
      });

      if (!useSemanticSearch) {
        const results = await this.keywordSearch(query, { topK, fileTypes, metadataFilters });
        logger.debug('Keyword search completed', { resultCount: results.length });
        return results;
      }

      // Create metadata filter
      const metadataFilter = this.createMetadataFilter(fileTypes, metadataFilters);

      // Semantic search using vector store with circuit breaker
      const vectorSearchBreaker = CircuitBreakerManager.getBreaker(
        'vector_search',
        () => this.vectorStoreService.search(query, {
          topK: Math.max(topK, 20),
          fileTypes,
          metadataFilters,
          scoreThreshold,
        }),
        {
          timeout: 30000, // 30초
          errorThresholdPercentage: 60,
          resetTimeout: 60000 // 1분
        }
      );

      const vectorResults = await withRetry(
        async () => {
          return await withTimeout(
            vectorSearchBreaker.fire() as Promise<any[]>,
            {
              timeoutMs: 45000, // 45초
              operation: 'vector_search'
            }
          );
        },
        'vector_search_with_retry',
        { retries: 2, minTimeout: 1000 }
      ) as any[];

      if (!useHybridSearch) {
        const results = this.convertVectorResults(vectorResults || [], topK);
        logger.debug('Semantic search completed', { resultCount: results.length });
        return results;
      }

      // Hybrid search: combine semantic and keyword results
      const keywordResults = await this.keywordSearch(query, { 
        topK: topK * 2, 
        fileTypes, 
        metadataFilters
      });
      
      const results = this.combineResults(vectorResults || [], keywordResults, semanticWeight, topK);
      logger.debug('Hybrid search completed', { 
        vectorResultsCount: (vectorResults || []).length,
        keywordResultsCount: keywordResults.length,
        finalResultCount: results.length
      });
      
      return results;
      
    } catch (error) {
      const searchError = new SearchError(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query,
        searchType,
        error instanceof Error ? error : undefined
      );
      
      errorMonitor.recordError(searchError);
      logger.error('Search operation failed, attempting fallback', searchError, {
        query: query.substring(0, 100),
        searchType
      });
      
      // Only fallback to keyword search if we were doing semantic search
      if (useSemanticSearch) {
        try {
          logger.info('Falling back to keyword search');
          const fallbackResults = await this.keywordSearch(query, { topK, fileTypes, metadataFilters });
          logger.info('Fallback search successful', { resultCount: fallbackResults.length });
          return fallbackResults;
        } catch (fallbackError) {
          const fallbackSearchError = new SearchError(
            `Both primary and fallback search failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
            query,
            'keyword',
            fallbackError instanceof Error ? fallbackError : undefined
          );
          
          errorMonitor.recordError(fallbackSearchError);
          logger.error('Fallback search also failed', fallbackSearchError);
          throw fallbackSearchError;
        }
      } else {
        // If keyword search itself failed, throw the error
        throw searchError;
      }
    } finally {
      endTiming();
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

  private async keywordSearch(query: string, options: {
    topK?: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
  }): Promise<SearchResult[]> {
    const { topK = this.config.similarityTopK, fileTypes, metadataFilters } = options;
    const endTiming = startTiming('keyword_search', {
      query: query.substring(0, 50),
      topK,
      component: 'SearchService'
    });
    
    try {
      let files = this.fileRepository.getAllFiles();
      
      if (fileTypes && fileTypes.length > 0) {
        files = files.filter(file => fileTypes.includes(file.fileType.toLowerCase()));
      }
      
      if (metadataFilters) {
        files = files.filter(file => {
          const metadata = this.fileRepository.getFileMetadata(file.id);
          return Object.entries(metadataFilters).every(([key, value]) => 
            metadata[key] === value
          );
        });
      }

      const results: SearchResult[] = [];
      const searchQuery = query.toLowerCase();
      
      // 배치 처리로 성능 개선
      const filesToProcess = files.slice(0, topK * 3);
      
      for (const file of filesToProcess) {
        try {
          // Use synchronized chunks from SQLite (same as Vector DB chunking)
          const chunks = this.chunkRepository.getDocumentChunks(file.id);
          const customMetadata = this.fileRepository.getFileMetadata(file.id);
          
          for (const chunk of chunks) {
            const content = chunk.content.toLowerCase();
            
            if (content.includes(searchQuery)) {
              // Improved keyword scoring
              const matches = (content.match(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
              const totalWords = content.split(/\s+/).length;
              const keywordScore = Math.min(matches / Math.max(totalWords, 1), 1.0);
              
              results.push({
                content: chunk.content,
                score: keywordScore,
                keywordScore,
                metadata: {
                  fileId: file.id,
                  fileName: file.name,
                  filePath: file.path,
                  fileType: file.fileType,
                  createdAt: file.createdAt.toISOString(),
                  embeddingId: chunk.embeddingId, // Cross-reference with Vector DB
                  ...customMetadata
                },
                chunkIndex: chunk.chunkIndex
              });
            }
          }
        } catch (error) {
          logger.warn('Error processing file in keyword search', {
            fileId: file.id,
            fileName: file.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // 개별 파일 오류는 전체 검색을 중단하지 않음
        }
      }
      
      results.sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
      const finalResults = results.slice(0, topK);
      
      logger.debug('Keyword search completed', {
        processedFiles: filesToProcess.length,
        totalMatches: results.length,
        finalResults: finalResults.length
      });
      
      return finalResults;
    } catch (error) {
      const keywordError = new SearchError(
        `Keyword search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query,
        'keyword',
        error instanceof Error ? error : undefined
      );
      
      errorMonitor.recordError(keywordError);
      logger.error('Keyword search failed', keywordError);
      throw keywordError;
    } finally {
      endTiming();
    }
  }

  private convertVectorResults(vectorResults: any[], topK: number): SearchResult[] {
    return vectorResults.slice(0, topK).map(result => ({
      content: result.content,
      score: result.score,
      semanticScore: result.score,
      metadata: result.metadata,
      chunkIndex: (result.metadata.chunkIndex as number) || 0,
    }));
  }

  private combineResults(
    vectorResults: any[],
    keywordResults: SearchResult[],
    semanticWeight: number,
    topK: number
  ): SearchResult[] {
    const combined = new Map<string, SearchResult>();
    const keywordWeight = 1 - semanticWeight;

    // Add semantic results - use embeddingId as the key for consistency
    for (const result of vectorResults) {
      const key = result.id || `${result.metadata.fileId}_${result.metadata.chunkIndex}`;
      combined.set(key, {
        content: result.content,
        score: result.score * semanticWeight,
        semanticScore: result.score,
        metadata: result.metadata,
        chunkIndex: (result.metadata.chunkIndex as number) || 0,
      });
    }

    // Merge with keyword results - use embeddingId for exact matching
    for (const result of keywordResults) {
      const key = result.metadata.embeddingId || `${result.metadata.fileId}_${result.chunkIndex}`;
      const existing = combined.get(key);
      
      if (existing) {
        // Found matching chunk - combine scores
        existing.score = (existing.semanticScore || 0) * semanticWeight + 
                        (result.keywordScore || 0) * keywordWeight;
        existing.keywordScore = result.keywordScore;
        existing.hybridScore = existing.score;
        console.log(`🔗 Combined scores for chunk ${key}: semantic=${existing.semanticScore?.toFixed(3)}, keyword=${result.keywordScore?.toFixed(3)}, hybrid=${existing.score.toFixed(3)}`);
      } else {
        // Keyword-only result
        combined.set(key, {
          ...result,
          score: (result.keywordScore || 0) * keywordWeight,
          semanticScore: 0, // No semantic score for keyword-only results
          hybridScore: (result.keywordScore || 0) * keywordWeight,
        });
      }
    }

    const results = Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
      
    console.log(`🔄 Hybrid search combined ${vectorResults.length} semantic + ${keywordResults.length} keyword → ${results.length} final results`);
    
    return results;
  }
}