import { RAGWorkflow, RAGSearchOptions } from '@/domains/rag/workflows/workflow.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

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
  getTools(): Tool[] {
        return [{
            name: 'search_documents',
            description: 'Search through indexed documents using natural language queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query in natural language',
                },
                topK: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 5)',
                  default: 5,
                  minimum: 1,
                  maximum: 50,
                },
                fileTypes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by file types (e.g., ["txt", "md", "pdf"])',
                },
                metadataFilters: {
                  type: 'object',
                  description: 'Filter by custom metadata key-value pairs',
                  additionalProperties: { type: 'string' },
                },
                useSemanticSearch: {
                  type: 'boolean',
                  description: 'Use semantic search with embeddings (default: true)',
                  default: true,
                },
                useHybridSearch: {
                  type: 'boolean',
                  description: 'Combine semantic and keyword search (default: false)',
                  default: false,
                },
                semanticWeight: {
                  type: 'number',
                  description: 'Weight for semantic search vs keyword search (0-1, default: 0.7)',
                  default: 0.7,
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['query'],
            },
          }
            ]    
      }
}