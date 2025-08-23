import { RAGWorkflow, RAGSearchOptions } from '@/domains/rag/workflows/workflow.js';
import { IFileRepository } from '@/domains/rag/repositories/document.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface SearchSimilarArgs {
  reference_text: string;
  limit?: number;
  exclude_source?: string;
  similarity_threshold?: number;
}

export class SearchSimilarHandler {
  constructor(
    private ragWorkflow: RAGWorkflow,
    private fileRepository: IFileRepository
  ) {}

  async handleSearchSimilar(args: SearchSimilarArgs) {
    const {
      reference_text,
      limit = 3,
      exclude_source,
      similarity_threshold = 0.1
    } = args;

    if (!reference_text || reference_text.trim().length === 0) {
      return {
        error: 'InvalidReferenceText',
        message: 'reference_text parameter is required and cannot be empty',
        suggestion: 'Provide some reference text to find similar documents'
      };
    }

    try {
      // Use semantic search to find similar content
      const options: RAGSearchOptions = {
        topK: Math.max(1, Math.min(limit * 2, 20)), // Get more results to allow filtering
        useSemanticSearch: true,
        useHybridSearch: false,
        semanticWeight: 1.0, // Pure semantic search
        scoreThreshold: similarity_threshold
      };

      const results = await this.ragWorkflow.search(reference_text, options);

      // Filter out excluded sources if specified
      let filteredResults = results;
      if (exclude_source) {
        filteredResults = results.filter(result => {
          const filename = result.metadata.name || result.metadata.fileName;
          const filepath = result.metadata.path || result.metadata.filePath;
          
          return filename !== exclude_source && 
                 filepath !== exclude_source &&
                 result.metadata.fileId !== exclude_source;
        });
      }

      // Limit to requested number
      const limitedResults = filteredResults.slice(0, limit);

      if (limitedResults.length === 0) {
        return {
          reference_text: reference_text.substring(0, 100) + (reference_text.length > 100 ? '...' : ''),
          similar_documents: [],
          total_found: 0,
          message: 'No similar documents found',
          suggestion: 'Try lowering the similarity threshold or using different reference text'
        };
      }

      return {
        reference_text: reference_text.substring(0, 100) + (reference_text.length > 100 ? '...' : ''),
        similar_documents: limitedResults.map((result, index) => ({
          rank: index + 1,
          similarity_score: result.score,
          content_preview: result.content.substring(0, 200) + 
                          (result.content.length > 200 ? '...' : ''),
          full_content: result.content,
          source: {
            filename: result.metadata.name || result.metadata.fileName || 'unknown',
            filepath: result.metadata.path || result.metadata.filePath || 'unknown',
            file_type: result.metadata.fileType || 'unknown',
            chunk_index: result.chunkIndex,
            file_id: result.metadata.fileId || 'unknown'
          },
          metadata: result.metadata
        })),
        total_found: limitedResults.length,
        search_info: {
          similarity_threshold: similarity_threshold,
          excluded_source: exclude_source,
          search_method: 'semantic_similarity'
        }
      };

    } catch (error) {
      return {
        error: 'SimilaritySearchFailed',
        message: error instanceof Error ? error.message : 'Similarity search operation failed',
        suggestion: 'Try a different reference text or check if documents are properly indexed'
      };
    }
  }

  getTools(): Tool[] {
    return [{
      name: 'search_similar',
      description: 'Find documents similar to provided reference text using semantic similarity',
      inputSchema: {
        type: 'object',
        properties: {
          reference_text: {
            type: 'string',
            description: 'The reference text to find similar content for'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of similar documents to return',
            default: 3,
            minimum: 1,
            maximum: 10
          },
          exclude_source: {
            type: 'string',
            description: 'Exclude a specific source file (filename, filepath, or file_id)'
          },
          similarity_threshold: {
            type: 'number',
            description: 'Minimum similarity score (0.0 to 1.0)',
            default: 0.1,
            minimum: 0.0,
            maximum: 1.0
          }
        },
        required: ['reference_text']
      }
    }];
  }
}