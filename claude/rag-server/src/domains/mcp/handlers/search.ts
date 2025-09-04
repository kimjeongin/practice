import { SearchService } from '@/domains/rag/services/search.js'
import type { SearchOptions } from '@/domains/rag/core/types.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

// Search tool arguments
export interface SearchArgs {
  query: string
  topK?: number
}

export class SearchHandler {
  constructor(private searchService: SearchService, private config?: ServerConfig) {}

  async handleSearch(args: SearchArgs) {
    const { query, topK = 5 } = args

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
        topK: topK ? Math.max(1, Math.min(topK, 50)) : 5, // Clamp between 1-50
        scoreThreshold: 0.75,
      }

      const results = await this.searchService.search(query, searchOptions)

      // Detect if reranking was used by checking if any result has rerank scores
      const rerankingUsed = results.some((result) => result.rerankingScore !== undefined)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                results_count: results.length,
                results: results.map((result, index) => ({
                  rank: index + 1,
                  content: result.content,
                  vector_score: result.vectorScore,
                  reranking_score: result.rerankingScore,
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
                  search_method: rerankingUsed ? '2-stage (vector + rerank)' : 'vector search',
                  max_requested: topK,
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
          'Search through indexed documents using semantic search with natural language queries',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query in natural language',
            },
            topK: {
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
