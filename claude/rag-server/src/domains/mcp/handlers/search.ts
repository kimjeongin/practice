import { RAGWorkflow, RAGSearchOptions } from '@/domains/rag/workflows/workflow.js';

export interface SearchDocumentsArgs {
  query: string;
  topK?: number;
  fileTypes?: string[];
  metadataFilters?: Record<string, string>;
  useSemanticSearch?: boolean;
  useHybridSearch?: boolean;
  semanticWeight?: number;
}

export class SearchHandler {
  constructor(private ragWorkflow: RAGWorkflow) {}

  async handleSearchDocuments(args: SearchDocumentsArgs) {
    const {
      query,
      topK = 5,
      fileTypes,
      metadataFilters,
      useSemanticSearch = true,
      useHybridSearch = false,
      semanticWeight = 0.7,
    } = args;

    const options: RAGSearchOptions = {
      topK,
      fileTypes,
      metadataFilters,
      useSemanticSearch,
      useHybridSearch,
      semanticWeight,
    };

    const results = await this.ragWorkflow.search(query, options);

    return {
      query,
      searchType: useHybridSearch ? 'hybrid' : (useSemanticSearch ? 'semantic' : 'keyword'),
      results: results.map(result => ({
        content: result.content,
        score: result.score,
        semanticScore: result.semanticScore,
        keywordScore: result.keywordScore,
        hybridScore: result.hybridScore,
        metadata: {
          fileName: result.metadata.name || result.metadata.fileName || 'unknown',
          filePath: result.metadata.path || result.metadata.filePath || 'unknown',
          chunkIndex: result.chunkIndex,
          fileType: result.metadata.fileType || 'unknown',
          ...result.metadata
        }
      })),
      totalResults: results.length,
    };
  }
}