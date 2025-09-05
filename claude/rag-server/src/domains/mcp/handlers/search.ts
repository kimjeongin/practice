import { SearchService } from '@/domains/rag/services/search.js'
import type { SearchOptions } from '@/domains/rag/core/types.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

// Search tool arguments
export interface SearchArgs {
  query: string
  topK?: number
  enableReranking?: boolean
}

export class SearchHandler {
  constructor(private searchService: SearchService, private config?: ServerConfig) {}

  async handleSearch(args: SearchArgs) {
    const { query, topK = 5, enableReranking = false } = args

    if (!query) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'InvalidQuery',
                message: 'Query parameter is required',
                suggestion: 'Provide a descriptive natural language search query. Examples: "API authentication methods", "error handling patterns", "configuration settings"',
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
        enableReranking,
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
                suggestion: 'Try these steps: 1) Use get_vectordb_info to verify documents are indexed, 2) Simplify your query or try different keywords, 3) Check if the embedding service is running properly, 4) Ensure documents are placed in the correct directory',
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
          'Semantic document search tool for finding relevant content from indexed documents. Use this when users ask questions about document content, need to find specific information, or want to explore available knowledge. The tool performs vector-based similarity search and can optionally use reranking for higher precision. Returns ranked results with content, metadata, and confidence scores.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query. Use specific, descriptive queries for better results. Examples: "authentication methods in API documentation", "error handling best practices", "database configuration settings"',
            },
            topK: {
              type: 'number',
              description: 'Maximum number of results to return (1-50). Use 5-10 for general queries, 15-20 for comprehensive searches, 3-5 for focused questions. Higher values provide more context but may include less relevant results.',
              default: 5,
              minimum: 1,
              maximum: 50,
            },
            enableReranking: {
              type: 'boolean',
              description: 'Enable 2-stage search (vector + rerank) for improved accuracy. Use TRUE for critical queries where precision matters more than speed (adds ~2-3s latency). Use FALSE for exploratory searches or when speed is priority. Reranking significantly improves result quality by re-scoring matches with a cross-encoder model.',
              default: false,
            },
          },
          required: ['query'],
        },
      },
    ]
  }
}
