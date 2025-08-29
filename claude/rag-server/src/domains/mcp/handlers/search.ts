import { SearchService } from '@/domains/rag/services/search/search-service.js'
import { SearchOptions } from '@/shared/types/interfaces.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'

// Search tool arguments
export interface SearchArgs {
  query: string
  search_type?: 'semantic' | 'hybrid' | 'fulltext'
  limit?: number
  sources?: string[]
  metadata_filters?: Record<string, string>
}

export interface SearchSimilarArgs {
  reference_text: string
  limit?: number
  exclude_source?: string
  similarity_threshold?: number
}

export interface SearchByQuestionArgs {
  question: string
  context_limit?: number
  sources?: string[]
  search_method?: 'semantic' | 'hybrid'
}

export class SearchHandler {
  constructor(
    private searchService: SearchService,
    private config: ServerConfig
  ) {}

  async handleSearch(args: SearchArgs) {
    const { query, search_type = 'semantic', limit = 5, sources, metadata_filters } = args

    if (!query) {
      return {
        error: 'InvalidQuery',
        message: 'Query parameter is required',
        suggestion: 'Provide a search query string to find relevant documents',
      }
    }

    try {
      // Use SearchService with advanced search options
      const searchOptions: SearchOptions = {
        topK: Math.max(1, Math.min(limit, 50)), // Clamp between 1-50
        useSemanticSearch: search_type === 'semantic' || search_type === 'hybrid',
        useHybridSearch: search_type === 'hybrid',
        semanticWeight: search_type === 'hybrid' ? 0.7 : 1.0,
        fileTypes: sources,
        metadataFilters: metadata_filters,
        scoreThreshold: 0.1,
      }

      const results = await this.searchService.search(query, searchOptions)

      return {
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
      }
    } catch (error) {
      logger.error('Search failed', error instanceof Error ? error : new Error(String(error)))
      return {
        error: 'SearchFailed',
        message: error instanceof Error ? error.message : 'Search operation failed',
        suggestion: 'Try a different query or check if documents are indexed properly',
      }
    }
  }

  async handleSearchSimilar(args: SearchSimilarArgs) {
    const { reference_text, limit = 3, exclude_source, similarity_threshold = 0.1 } = args

    if (!reference_text || reference_text.trim().length === 0) {
      return {
        error: 'InvalidReferenceText',
        message: 'reference_text parameter is required and cannot be empty',
        suggestion: 'Provide some reference text to find similar documents',
      }
    }

    try {
      // Use SearchService for semantic similarity search
      const searchOptions: SearchOptions = {
        topK: Math.max(1, Math.min(limit * 2, 20)), // Get more results to allow filtering
        scoreThreshold: similarity_threshold,
        useSemanticSearch: true,
        useHybridSearch: false,
      }

      const results = await this.searchService.search(reference_text, searchOptions)

      // Filter out excluded sources if specified
      let filteredResults = results
      if (exclude_source) {
        filteredResults = results.filter((result) => {
          const filename = result.metadata?.name || result.metadata?.fileName
          const filepath = result.metadata?.path || result.metadata?.filePath

          return (
            filename !== exclude_source &&
            filepath !== exclude_source &&
            result.metadata?.fileId !== exclude_source
          )
        })
      }

      // Limit to requested number
      const limitedResults = filteredResults.slice(0, limit)

      if (limitedResults.length === 0) {
        return {
          reference_text:
            reference_text.substring(0, 100) + (reference_text.length > 100 ? '...' : ''),
          similar_documents: [],
          total_found: 0,
          message: 'No similar documents found',
          suggestion: 'Try lowering the similarity threshold or using different reference text',
        }
      }

      return {
        reference_text:
          reference_text.substring(0, 100) + (reference_text.length > 100 ? '...' : ''),
        similar_documents: limitedResults.map((result, index) => ({
          rank: index + 1,
          similarity_score: result.score,
          content_preview:
            result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''),
          full_content: result.content,
          source: {
            filename: result.metadata?.name || result.metadata?.fileName || 'unknown',
            filepath: result.metadata?.path || result.metadata?.filePath || 'unknown',
            file_type: result.metadata?.fileType || 'unknown',
            chunk_index: result.chunkIndex || 0,
            file_id: result.metadata?.fileId || 'unknown',
          },
          metadata: result.metadata,
        })),
        total_found: limitedResults.length,
        search_info: {
          similarity_threshold: similarity_threshold,
          excluded_source: exclude_source,
          search_method: 'semantic_similarity',
        },
      }
    } catch (error) {
      return {
        error: 'SimilaritySearchFailed',
        message: error instanceof Error ? error.message : 'Similarity search operation failed',
        suggestion: 'Try a different reference text or check if documents are properly indexed',
      }
    }
  }

  async handleSearchByQuestion(args: SearchByQuestionArgs) {
    const { question, context_limit = 5, sources, search_method = 'semantic' } = args

    if (!question || question.trim().length === 0) {
      return {
        error: 'InvalidQuestion',
        message: 'question parameter is required and cannot be empty',
        suggestion: 'Provide a clear question or information request',
      }
    }

    try {
      // Search for relevant context using SearchService
      const searchOptions: SearchOptions = {
        topK: Math.max(1, Math.min(context_limit, 20)),
        scoreThreshold: 0.1, // Lower threshold for information extraction
        useSemanticSearch: search_method === 'semantic' || search_method === 'hybrid',
        useHybridSearch: search_method === 'hybrid',
        semanticWeight: search_method === 'hybrid' ? 0.7 : 1.0,
        fileTypes: sources,
      }

      const searchResults = await this.searchService.search(question, searchOptions)

      if (searchResults.length === 0) {
        return {
          question,
          answer: null,
          confidence: 0,
          context_found: false,
          message: 'No relevant context found for the question',
          suggestion: 'Try rephrasing the question or adding more documents to the system',
        }
      }

      // Extract and combine relevant information
      const contextChunks = searchResults.map((result, index) => ({
        rank: index + 1,
        content: result.content,
        relevance_score: result.score,
        source: {
          filename: result.metadata?.fileName || result.metadata?.name || 'unknown',
          filepath: result.metadata?.filePath || result.metadata?.path || 'unknown',
          chunk_index: result.chunkIndex || 0,
        },
      }))

      // Create a combined context for analysis
      const combinedContext = searchResults.map((result) => result.content).join('\n\n---\n\n')

      // Calculate overall confidence based on top results
      const topScores = searchResults.slice(0, 3).map((r) => r.score)
      const avgTopScore =
        topScores.length > 0
          ? topScores.reduce((sum, score) => sum + score, 0) / topScores.length
          : 0

      const confidence = Math.min(avgTopScore * 100, 100)

      // Attempt to extract specific information
      const extractedInfo = this.extractKeyInformation(question, combinedContext)

      return {
        question,
        extracted_information: extractedInfo,
        confidence: Math.round(confidence),
        context_chunks: contextChunks,
        search_info: {
          total_context_chunks: searchResults.length,
          search_method: search_method,
          sources_searched: sources ? sources.join(', ') : 'all',
          context_limit: context_limit,
        },
        context_found: true,
        raw_context: combinedContext, // Include full context for advanced users
      }
    } catch (error) {
      return {
        error: 'QuestionSearchFailed',
        message: error instanceof Error ? error.message : 'Question-based search failed',
        suggestion: 'Try a simpler question or check if relevant documents are indexed',
      }
    }
  }

  private extractKeyInformation(question: string, context: string): any {
    // Simple keyword-based extraction (this could be enhanced with proper NLP)
    const questionLower = question.toLowerCase()
    const contextLines = context.split('\n').filter((line) => line.trim().length > 0)

    // Look for direct answers
    const relevantLines = contextLines.filter((line) => {
      const lineLower = line.toLowerCase()
      return questionLower.split(' ').some((word) => word.length > 3 && lineLower.includes(word))
    })

    // Extract potential answers based on question type
    let extractedData: any = {
      type: this.detectQuestionType(question),
      relevant_excerpts: relevantLines.slice(0, 3),
    }

    // Add specific extraction based on question type
    if (questionLower.includes('what is') || questionLower.includes('define')) {
      extractedData.definition_candidates = this.extractDefinitions(context)
    }

    if (questionLower.includes('how') || questionLower.includes('steps')) {
      extractedData.process_steps = this.extractSteps(context)
    }

    if (questionLower.includes('when') || questionLower.includes('date')) {
      extractedData.temporal_references = this.extractDates(context)
    }

    if (questionLower.includes('who') || questionLower.includes('person')) {
      extractedData.entity_mentions = this.extractEntities(context)
    }

    return extractedData
  }

  private detectQuestionType(question: string): string {
    const q = question.toLowerCase()
    if (q.startsWith('what')) return 'definition_or_fact'
    if (q.startsWith('how')) return 'process_or_method'
    if (q.startsWith('when')) return 'temporal'
    if (q.startsWith('where')) return 'location'
    if (q.startsWith('who')) return 'person_or_entity'
    if (q.startsWith('why')) return 'explanation_or_reason'
    return 'general_inquiry'
  }

  private extractDefinitions(context: string): string[] {
    const definitions = []
    const sentences = context.split(/[.!?]+/)

    for (const sentence of sentences) {
      if (
        sentence.includes(' is ') ||
        sentence.includes(' are ') ||
        sentence.includes(' means ') ||
        sentence.includes(' refers to ')
      ) {
        definitions.push(sentence.trim())
      }
    }

    return definitions.slice(0, 3)
  }

  private extractSteps(context: string): string[] {
    const steps = []
    const lines = context.split('\n')

    for (const line of lines) {
      if (
        /^\d+\./.test(line.trim()) ||
        /^step \d+/i.test(line.trim()) ||
        line.includes('first') ||
        line.includes('then') ||
        line.includes('next')
      ) {
        steps.push(line.trim())
      }
    }

    return steps.slice(0, 5)
  }

  private extractDates(context: string): string[] {
    const datePattern =
      /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi
    const matches = context.match(datePattern) || []
    return [...new Set(matches)].slice(0, 5)
  }

  private extractEntities(context: string): string[] {
    // Simple capitalized word extraction (could be improved with proper NER)
    const entityPattern = /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g
    const matches = context.match(entityPattern) || []
    return [...new Set(matches)].slice(0, 10)
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
              enum: ['semantic', 'hybrid', 'fulltext'],
              description:
                'Search method: semantic (embeddings), hybrid (semantic+keyword), fulltext (keyword only)',
              default: 'semantic',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 5,
              minimum: 1,
              maximum: 50,
            },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific file types or sources',
            },
            metadata_filters: {
              type: 'object',
              description: 'Filter by custom metadata key-value pairs',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_similar',
        description: 'Find documents similar to provided reference text using semantic similarity',
        inputSchema: {
          type: 'object',
          properties: {
            reference_text: {
              type: 'string',
              description: 'The reference text to find similar content for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of similar documents to return',
              default: 3,
              minimum: 1,
              maximum: 10,
            },
            exclude_source: {
              type: 'string',
              description: 'Exclude a specific source file (filename, filepath, or file_id)',
            },
            similarity_threshold: {
              type: 'number',
              description: 'Minimum similarity score (0.0 to 1.0)',
              default: 0.1,
              minimum: 0.0,
              maximum: 1.0,
            },
          },
          required: ['reference_text'],
        },
      },
      {
        name: 'search_by_question',
        description:
          'Search for information using a natural language question and extract relevant answers',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question or information request in natural language',
            },
            context_limit: {
              type: 'number',
              description: 'Maximum number of context chunks to analyze',
              default: 5,
              minimum: 1,
              maximum: 20,
            },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific file types or sources',
            },
            search_method: {
              type: 'string',
              enum: ['semantic', 'hybrid'],
              description: 'Search method for finding relevant context',
              default: 'semantic',
            },
          },
          required: ['question'],
        },
      },
    ]
  }
}
