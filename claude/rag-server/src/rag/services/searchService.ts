import { ISearchService, SearchOptions, SearchResult, IVectorStoreService } from '../../shared/types/interfaces.js';
import { IFileRepository } from '../repositories/documentRepository.js';
import { IChunkRepository } from '../repositories/chunkRepository.js';
import { ServerConfig } from '../../shared/types/index.js';

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

    try {
      if (!useSemanticSearch) {
        return this.keywordSearch(query, { topK, fileTypes, metadataFilters });
      }

      // Create metadata filter
      const metadataFilter = this.createMetadataFilter(fileTypes, metadataFilters);

      // Semantic search using vector store
      const vectorResults = await this.vectorStoreService.search(query, {
        topK: Math.max(topK, 20),
        fileTypes,
        metadataFilters,
        scoreThreshold,
      });

      if (!useHybridSearch) {
        return this.convertVectorResults(vectorResults, topK);
      }

      // Hybrid search: combine semantic and keyword results
      const keywordResults = await this.keywordSearch(query, { 
        topK: topK * 2, 
        fileTypes, 
        metadataFilters
      });
      
      return this.combineResults(vectorResults, keywordResults, semanticWeight, topK);
      
    } catch (error) {
      console.error('❌ Error during search:', error);
      
      // Fallback to keyword search
      console.log('🔄 Falling back to keyword search...');
      return this.keywordSearch(query, { topK, fileTypes, metadataFilters });
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
    
    for (const file of files.slice(0, topK * 2)) {
      const chunks = this.chunkRepository.getDocumentChunks(file.id);
      const customMetadata = this.fileRepository.getFileMetadata(file.id);
      
      for (const chunk of chunks) {
        const content = chunk.content.toLowerCase();
        const searchQuery = query.toLowerCase();
        
        if (content.includes(searchQuery)) {
          const matches = (content.match(new RegExp(searchQuery, 'g')) || []).length;
          const keywordScore = matches / content.length;
          
          results.push({
            content: chunk.content,
            score: keywordScore,
            keywordScore,
            metadata: {
              ...file,
              ...customMetadata
            },
            chunkIndex: chunk.chunkIndex
          });
        }
      }
    }
    
    results.sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
    return results.slice(0, topK);
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

    // Add semantic results
    for (const result of vectorResults) {
      const key = `${result.metadata.fileId}_${result.metadata.chunkIndex}`;
      combined.set(key, {
        content: result.content,
        score: result.score * semanticWeight,
        semanticScore: result.score,
        metadata: result.metadata,
        chunkIndex: (result.metadata.chunkIndex as number) || 0,
      });
    }

    // Merge with keyword results
    for (const result of keywordResults) {
      const key = `${result.metadata.id}_${result.chunkIndex}`;
      const existing = combined.get(key);
      
      if (existing) {
        existing.score = (existing.semanticScore || 0) * semanticWeight + 
                        (result.keywordScore || 0) * keywordWeight;
        existing.keywordScore = result.keywordScore;
        existing.hybridScore = existing.score;
      } else {
        combined.set(key, {
          ...result,
          score: (result.keywordScore || 0) * keywordWeight,
          hybridScore: (result.keywordScore || 0) * keywordWeight,
        });
      }
    }

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}