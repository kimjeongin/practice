import type { SearchOptions, SearchType } from '@/domains/rag/core/types.js'
import { RAGService } from '@/domains/rag/index.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'
import type { ServerConfig } from '@/shared/config/config-factory.js'

// Search tool arguments
export interface SearchArgs {
  query: string
  topK?: number
  enableReranking?: boolean
  scoreThreshold?: number
  searchType?: SearchType
}

export class SearchHandler {
  constructor(private ragService: RAGService, private config?: ServerConfig) {}

  async handleSearch(args: SearchArgs) {
    const { query, topK = 5, enableReranking = false, scoreThreshold, searchType = 'semantic' } = args

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
        scoreThreshold:
          scoreThreshold !== undefined
            ? Math.max(0.0, Math.min(1.0, scoreThreshold)) // Clamp between 0.0-1.0
            : 0.5, // Default threshold
        enableReranking,
        searchType: searchType,
      }

      const results = await this.ragService.search(query, searchOptions)

      // Detect if reranking was used by checking if any result has rerank scores
      const rerankingUsed = results.some((result) => result.rerankingScore !== undefined)
      
      // Determine the actual search method description for display
      let actualSearchMethodDescription: string = searchType
      if (searchType === 'hybrid') {
        actualSearchMethodDescription = 'hybrid (semantic + keyword + reranking)'
      } else if (rerankingUsed) {
        actualSearchMethodDescription = `${searchType} + reranking`
      }

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
                  search_type: searchType,
                  search_method: actualSearchMethodDescription,
                  max_requested: topK,
                  score_threshold: searchOptions.scoreThreshold,
                  reranking_enabled: enableReranking,
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
          'Advanced document search tool supporting multiple search methods: semantic (vector-based), keyword (full-text), and hybrid (combines both with reranking). Use this when users ask questions about document content, need to find specific information, or want to explore available knowledge. Returns ranked results with content, metadata, and confidence scores.',
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
            enableReranking: {
              type: 'boolean',
              description:
                'Enable 2-stage search (vector + rerank) for improved accuracy. Use TRUE for critical queries where precision matters more than speed (adds ~2-3s latency). Use FALSE for exploratory searches or when speed is priority. Reranking significantly improves result quality by re-scoring matches with a cross-encoder model.',
              default: false,
            },
            scoreThreshold: {
              type: 'number',
              description:
                'Minimum similarity score threshold (0.0-1.0) for filtering results. Higher values = more relevant but fewer results. Lower values = more results but may include less relevant matches. Guidelines: 0.8+ = Very similar content only, 0.6-0.8 = Moderately similar content, 0.3-0.6 = Broadly related content, 0.1-0.3 = Loosely related content. Use higher thresholds (0.7+) for precise searches, lower thresholds (0.3-0.5) for exploratory searches. When reranking is enabled, you can use lower vector thresholds (0.1-0.3) as reranking will improve final quality.',
              default: 0.5,
              minimum: 0.0,
              maximum: 1.0,
            },
            searchType: {
              type: 'string',
              enum: ['semantic', 'keyword', 'hybrid'],
              description:
                'Search method to use. SEMANTIC: Vector-based similarity search for conceptual understanding (best for questions, concepts). KEYWORD: Full-text search for exact term matching (best for specific terms, names, codes). HYBRID: Combines semantic + keyword with built-in reranking for best accuracy (recommended for comprehensive searches). Default is semantic for backward compatibility.',
              default: 'semantic',
            },
          },
          required: ['query'],
        },
      },
    ]
  }
}
