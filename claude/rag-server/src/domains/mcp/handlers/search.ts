import { SearchService } from '@/domains/rag/services/search/search-service.js'
import { SearchOptions } from '@/domains/rag/core/types.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'

// Search tool arguments
export interface SearchArgs {
  query: string
  search_type?: 'semantic' | 'hybrid' | 'keyword'
  limit?: number
}

export class SearchHandler {
  constructor(private searchService: SearchService) {}

  async handleSearch(args: SearchArgs) {
    const { query, search_type = 'semantic', limit = 5 } = args

    if (!query) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'InvalidQuery',
                message: 'Query parameter is required',
                suggestion: 'Provide a search query string to find relevant documents',
              },
              (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
              2
            ),
          },
        ],
        isError: true,
      }
    }

    try {
      // Use SearchService with simplified search options
      const searchOptions: SearchOptions = {
        topK: limit ? Math.max(1, Math.min(limit, 50)) : 5, // Clamp between 1-50
        searchType: search_type,
        semanticWeight: search_type === 'hybrid' ? 0.7 : 1.0,
        scoreThreshold: 0.75,
      }

      const results = await this.searchService.search(query, searchOptions)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                search_type,
                results_count: results.length,
                results: results.map((result, index) => ({
                  rank: index + 1,
                  content: result.content,
                  relevance_score: result.score,
                  semantic_score: result.semanticScore,
                  keyword_score: result.keywordScore,
                  hybrid_score: result.hybridScore,
                  source: {
                    filename: result.metadata?.fileName || result.metadata?.name || 'unknown',
                    filepath: result.metadata?.filePath || result.metadata?.path || 'unknown',
                    file_type: result.metadata?.fileType || 'unknown',
                    chunk_index: result.chunkIndex || 0,
                  },
                  metadata: result.metadata,
                })),
                search_info: {
                  total_results: results.length,
                  search_method: search_type,
                  max_requested: limit,
                },
              },
              (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
              2
            ),
          },
        ],
      }
    } catch (error) {
      logger.error('Search failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'SearchFailed',
                message: error instanceof Error ? error.message : 'Search operation failed',
                suggestion: 'Try a different query or check if documents are indexed properly',
              },
              (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
              2
            ),
          },
        ],
        isError: true,
      }
    }
  }

  getTools(): Tool[] {
    return [
      {
        name: 'search',
        description:
          'Search through indexed documents using natural language queries with multiple search types',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query in natural language',
            },
            search_type: {
              type: 'string',
              enum: ['semantic', 'hybrid', 'keyword'],
              description:
                'Search method: semantic (embeddings), hybrid (semantic+keyword), keyword (keyword only)',
              default: 'semantic',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 5,
              minimum: 1,
              maximum: 50,
            },
          },
          required: ['query'],
        },
      },
    ]
  }
}
