import { ISearchService, SearchOptions, SearchResult } from '../../shared/types/interfaces.js';
import { IFileRepository } from '../documents/storage/file-repository.js';
import { IChunkRepository } from '../documents/storage/chunk-repository.js';
import { ServerConfig } from '../../shared/types/index.js';

export interface RAGSearchOptions extends SearchOptions {
  useSemanticSearch?: boolean;
  useHybridSearch?: boolean;
  semanticWeight?: number; // 0-1, weight for semantic search vs keyword search
  scoreThreshold?: number;
}

export interface RAGSearchResult extends SearchResult {
  semanticScore?: number;
  keywordScore?: number;
  hybridScore?: number;
}

/**
 * RAG 워크플로우 서비스
 * 검색과 생성을 연결하는 고수준 서비스
 */
export class RAGWorkflowService {
  constructor(
    private searchService: ISearchService,
    private fileRepository: IFileRepository,
    private chunkRepository: IChunkRepository,
    private config: ServerConfig
  ) {}

  async search(query: string, options: RAGSearchOptions = {}): Promise<RAGSearchResult[]> {
    const {
      topK = this.config.similarityTopK,
      fileTypes,
      metadataFilters,
      useSemanticSearch = true,
      useHybridSearch = false,
      semanticWeight = 0.7,
      scoreThreshold = this.config.similarityThreshold
    } = options;

    console.log(`🔍 RAG Search: "${query}" (${useHybridSearch ? 'hybrid' : 'semantic'})`);

    try {
      if (useHybridSearch) {
        return await this.hybridSearch(query, {
          topK,
          fileTypes,
          metadataFilters,
          semanticWeight,
          scoreThreshold
        });
      } else if (useSemanticSearch) {
        return await this.semanticSearch(query, {
          topK,
          fileTypes,
          metadataFilters,
          scoreThreshold
        });
      } else {
        return await this.keywordSearch(query, {
          topK,
          fileTypes,
          metadataFilters
        });
      }
    } catch (error) {
      console.error('❌ RAG search error:', error);
      throw error;
    }
  }

  private async semanticSearch(query: string, options: {
    topK: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
    scoreThreshold: number;
  }): Promise<RAGSearchResult[]> {
    const results = await this.searchService.search(query, {
      topK: options.topK,
      fileTypes: options.fileTypes,
      metadataFilters: options.metadataFilters
    });

    return results
      .filter(result => result.score >= options.scoreThreshold)
      .map(result => ({
        ...result,
        semanticScore: result.score,
      }));
  }

  private async keywordSearch(query: string, options: {
    topK: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
  }): Promise<RAGSearchResult[]> {
    // 키워드 검색 구현 (현재는 단순 매칭)
    const allFiles = this.fileRepository.getAllFiles();
    const filteredFiles = this.filterFilesByType(allFiles, options.fileTypes);
    
    const results: RAGSearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const file of filteredFiles) {
      const chunks = this.chunkRepository.getDocumentChunks(file.id);
      
      for (const chunk of chunks) {
        const contentLower = chunk.content.toLowerCase();
        const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
        
        if (matches > 0) {
          const score = Math.min(matches / 10, 1); // Simple scoring
          results.push({
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            metadata: {
              fileName: file.name,
              filePath: file.path,
              fileType: file.fileType,
              ...options.metadataFilters
            },
            score,
            keywordScore: score
          });
        }
      }
    }

    return results
      .sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0))
      .slice(0, options.topK);
  }

  private async hybridSearch(query: string, options: {
    topK: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
    semanticWeight: number;
    scoreThreshold: number;
  }): Promise<RAGSearchResult[]> {
    // 의미론적 검색과 키워드 검색을 결합
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, {
        topK: options.topK * 2, // 더 많이 가져와서 나중에 결합
        fileTypes: options.fileTypes,
        metadataFilters: options.metadataFilters,
        scoreThreshold: 0 // 하이브리드에서는 임계값을 나중에 적용
      }),
      this.keywordSearch(query, {
        topK: options.topK * 2,
        fileTypes: options.fileTypes,
        metadataFilters: options.metadataFilters
      })
    ]);

    // 결과를 문서 ID로 그룹화하고 점수를 결합
    const combinedResults = new Map<string, RAGSearchResult>();

    // 의미론적 결과 추가
    for (const result of semanticResults) {
      const key = `${result.metadata.fileName}-${result.chunkIndex}`;
      combinedResults.set(key, {
        ...result,
        semanticScore: result.score,
        keywordScore: 0
      });
    }

    // 키워드 결과 추가/병합
    for (const result of keywordResults) {
      const key = `${result.metadata.fileName}-${result.chunkIndex}`;
      const existing = combinedResults.get(key);
      
      if (existing) {
        existing.keywordScore = result.keywordScore || 0;
      } else {
        combinedResults.set(key, {
          ...result,
          semanticScore: 0,
          keywordScore: result.keywordScore || 0
        });
      }
    }

    // 하이브리드 점수 계산
    const hybridResults = Array.from(combinedResults.values()).map(result => {
      const semanticScore = result.semanticScore || 0;
      const keywordScore = result.keywordScore || 0;
      const hybridScore = (semanticScore * options.semanticWeight) + 
                         (keywordScore * (1 - options.semanticWeight));
      
      return {
        ...result,
        score: hybridScore,
        hybridScore
      };
    });

    return hybridResults
      .filter(result => result.hybridScore >= options.scoreThreshold)
      .sort((a, b) => (b.hybridScore || 0) - (a.hybridScore || 0))
      .slice(0, options.topK);
  }

  private filterFilesByType(files: any[], fileTypes?: string[]): any[] {
    if (!fileTypes || fileTypes.length === 0) {
      return files;
    }
    return files.filter(file => fileTypes.includes(file.fileType));
  }
}