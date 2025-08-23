import { RAGWorkflow, RAGSearchOptions } from '@/domains/rag/workflows/workflow.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface RagSearchArgs {
  query: string;
  search_type?: 'semantic' | 'hybrid' | 'fulltext';
  limit?: number;
  sources?: string[];
  metadata_filters?: Record<string, string>;
}

export class RagSearchHandler {
  constructor(private ragWorkflow: RAGWorkflow) {}

  async handleRagSearch(args: RagSearchArgs) {
    const {
      query,
      search_type = 'semantic',
      limit = 5,
      sources,
      metadata_filters
    } = args;

    if (!query) {
      return {
        error: 'InvalidQuery',
        message: 'Query parameter is required',
        suggestion: 'Provide a search query string to find relevant documents'
      };
    }

    // Convert search_type to existing workflow options
    const options: RAGSearchOptions = {
      topK: Math.max(1, Math.min(limit, 50)), // Clamp between 1-50
      fileTypes: sources, // Use sources as file type filter for now
      metadataFilters: metadata_filters,
      useSemanticSearch: search_type !== 'fulltext',
      useHybridSearch: search_type === 'hybrid',
      semanticWeight: search_type === 'hybrid' ? 0.7 : 1.0,
    };

    try {
      const results = await this.ragWorkflow.search(query, options);

      return {
        query,
        search_type,
        results_count: results.length,
        results: results.map((result, index) => ({
          rank: index + 1,
          content: result.content,
          relevance_score: result.score,
          source: {
            filename: result.metadata.name || result.metadata.fileName || 'unknown',
            filepath: result.metadata.path || result.metadata.filePath || 'unknown',
            file_type: result.metadata.fileType || 'unknown',
            chunk_index: result.chunkIndex
          },
          metadata: result.metadata
        })),
        search_info: {
          total_results: results.length,
          search_method: search_type,
          max_requested: limit
        }
      };
    } catch (error) {
      return {
        error: 'SearchFailed',
        message: error instanceof Error ? error.message : 'Search operation failed',
        suggestion: 'Try a different query or check if documents are indexed properly'
      };
    }
  }

  getTools(): Tool[] {
    return [{
      name: 'rag_search',
      description: 'Search through indexed documents using natural language queries with multiple search types',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query in natural language'
          },
          search_type: {
            type: 'string',
            enum: ['semantic', 'hybrid', 'fulltext'],
            description: 'Search method: semantic (embeddings), hybrid (semantic+keyword), fulltext (keyword only)',
            default: 'semantic'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 5,
            minimum: 1,
            maximum: 50
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by specific file types or sources'
          },
          metadata_filters: {
            type: 'object',
            description: 'Filter by custom metadata key-value pairs',
            additionalProperties: { type: 'string' }
          }
        },
        required: ['query']
      }
    }];
  }
}