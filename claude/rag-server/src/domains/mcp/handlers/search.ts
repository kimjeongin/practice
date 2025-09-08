import type { SearchOptions, SearchType } from '@/domains/rag/core/types.js'
import { RAGService } from '@/domains/rag/index.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

// Search tool arguments
export interface SearchArgs {
  query: string
  topK?: number
  searchType?: SearchType
}

export class SearchHandler {
  constructor(private ragService: RAGService, private config?: ServerConfig) {}

  async handleSearch(args: SearchArgs) {
    const { query, topK = 5, searchType = 'semantic' } = args

    if (!query) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'InvalidQuery',
                message: 'Query parameter is required',
                suggestion:
                  'Provide a descriptive natural language search query. Examples: "API authentication methods", "error handling patterns", "configuration settings"',
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
      // Use SearchService with user-configurable options
      const searchOptions: SearchOptions = {
        topK: topK ? Math.max(1, Math.min(topK, 50)) : 5, // Clamp between 1-50
        searchType: searchType,
      }

      const results = await this.ragService.search(query, searchOptions)

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
                  search_type: result.searchType || searchType,
                  vector_score: result.vectorScore,
                  keyword_score: result.keywordScore,
                  source: {
                    filename: result.metadata?.fileName || result.metadata?.name || 'unknown',
                    filepath: result.metadata?.filePath || result.metadata?.path || 'unknown',
                    file_type: result.metadata?.fileType || 'unknown',
                    chunk_index: result.chunkIndex || 0,
                  },
                })),
                search_info: {
                  total_results: results.length,
                  search_type: searchType,
                  topK: topK,
                },
              },
              (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
              2
            ),
          },
        ],
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Handle initialization errors specifically
      if (errorMessage.includes('not initialized')) {
        logger.warn('RAG service not initialized during search request', { error: errorMessage })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'ServiceNotReady',
                  message: 'RAG service is not fully initialized yet',
                  suggestion:
                    'The server is still starting up. Please wait a few seconds and try again, or use get_vectordb_info to check service status.',
                },
                (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
                2
              ),
            },
          ],
          isError: true,
        }
      }

      logger.error('Search failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'SearchFailed',
                message: errorMessage,
                suggestion:
                  'Try these steps: 1) Use get_vectordb_info to verify documents are indexed, 2) Simplify your query or try different keywords, 3) Check if the embedding service is running properly, 4) Ensure documents are placed in the correct directory',
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
          'Advanced document search tool supporting multiple search methods: semantic (vector-based), keyword (full-text), and hybrid (combines both). Use this when users ask questions about document content, need to find specific information, or want to explore available knowledge. Returns ranked results with content, metadata, and confidence scores.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Natural language search query. Use specific, descriptive queries for better results. Examples: "authentication methods in API documentation", "error handling best practices", "database configuration settings"',
            },
            topK: {
              type: 'number',
              description:
                'Maximum number of results to return (1-50). Use 5-10 for general queries, 15-20 for comprehensive searches, 3-5 for focused questions. Higher values provide more context but may include less relevant results.',
              default: 5,
              minimum: 1,
              maximum: 50,
            },
            searchType: {
              type: 'string',
              enum: ['semantic', 'keyword', 'hybrid'],
              description:
                'Search method to use. SEMANTIC: Vector-based similarity search for conceptual understanding (best for questions, concepts). KEYWORD: Full-text search for exact term matching (best for specific terms, names, codes). HYBRID: Combines semantic + keyword search for balanced results (recommended for comprehensive searches). Default is semantic for backward compatibility.',
              default: 'semantic',
            },
          },
          required: ['query'],
        },
      },
    ]
  }
}
