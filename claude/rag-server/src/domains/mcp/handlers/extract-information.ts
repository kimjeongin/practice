import { RAGWorkflow, RAGSearchOptions } from '@/domains/rag/workflows/workflow.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ExtractInformationArgs {
  question: string;
  context_limit?: number;
  sources?: string[];
  search_method?: 'semantic' | 'hybrid';
}

export class ExtractInformationHandler {
  constructor(private ragWorkflow: RAGWorkflow) {}

  async handleExtractInformation(args: ExtractInformationArgs) {
    const {
      question,
      context_limit = 5,
      sources,
      search_method = 'semantic'
    } = args;

    if (!question || question.trim().length === 0) {
      return {
        error: 'InvalidQuestion',
        message: 'question parameter is required and cannot be empty',
        suggestion: 'Provide a clear question or information request'
      };
    }

    try {
      // Search for relevant context
      const searchOptions: RAGSearchOptions = {
        topK: Math.max(1, Math.min(context_limit, 20)),
        fileTypes: sources, // Use sources as file type filter
        useSemanticSearch: search_method === 'semantic' || search_method === 'hybrid',
        useHybridSearch: search_method === 'hybrid',
        semanticWeight: search_method === 'hybrid' ? 0.7 : 1.0,
        scoreThreshold: 0.1 // Lower threshold for information extraction
      };

      const searchResults = await this.ragWorkflow.search(question, searchOptions);

      if (searchResults.length === 0) {
        return {
          question,
          answer: null,
          confidence: 0,
          context_found: false,
          message: 'No relevant context found for the question',
          suggestion: 'Try rephrasing the question or adding more documents to the system'
        };
      }

      // Extract and combine relevant information
      const contextChunks = searchResults.map((result, index) => ({
        rank: index + 1,
        content: result.content,
        relevance_score: result.score,
        source: {
          filename: result.metadata.name || result.metadata.fileName || 'unknown',
          filepath: result.metadata.path || result.metadata.filePath || 'unknown',
          chunk_index: result.chunkIndex
        }
      }));

      // Create a combined context for analysis
      const combinedContext = searchResults
        .map(result => result.content)
        .join('\n\n---\n\n');

      // Calculate overall confidence based on top results
      const topScores = searchResults.slice(0, 3).map(r => r.score);
      const avgTopScore = topScores.length > 0 ? 
        topScores.reduce((sum, score) => sum + score, 0) / topScores.length : 0;
      
      const confidence = Math.min(avgTopScore * 100, 100);

      // Attempt to extract specific information (this could be enhanced with NLP)
      const extractedInfo = this.extractKeyInformation(question, combinedContext);

      return {
        question,
        extracted_information: extractedInfo,
        confidence: Math.round(confidence),
        context_chunks: contextChunks,
        search_info: {
          total_context_chunks: searchResults.length,
          search_method: search_method,
          sources_searched: sources ? sources.join(', ') : 'all',
          context_limit: context_limit
        },
        context_found: true,
        raw_context: combinedContext // Include full context for advanced users
      };

    } catch (error) {
      return {
        error: 'InformationExtractionFailed',
        message: error instanceof Error ? error.message : 'Information extraction failed',
        suggestion: 'Try a simpler question or check if relevant documents are indexed'
      };
    }
  }

  private extractKeyInformation(question: string, context: string): any {
    // Simple keyword-based extraction (this could be enhanced with proper NLP)
    const questionLower = question.toLowerCase();
    const contextLines = context.split('\n').filter(line => line.trim().length > 0);
    
    // Look for direct answers
    const relevantLines = contextLines.filter(line => {
      const lineLower = line.toLowerCase();
      return questionLower.split(' ').some(word => 
        word.length > 3 && lineLower.includes(word)
      );
    });

    // Extract potential answers based on question type
    let extractedData: any = {
      type: this.detectQuestionType(question),
      relevant_excerpts: relevantLines.slice(0, 3)
    };

    // Add specific extraction based on question type
    if (questionLower.includes('what is') || questionLower.includes('define')) {
      extractedData.definition_candidates = this.extractDefinitions(context);
    }
    
    if (questionLower.includes('how') || questionLower.includes('steps')) {
      extractedData.process_steps = this.extractSteps(context);
    }
    
    if (questionLower.includes('when') || questionLower.includes('date')) {
      extractedData.temporal_references = this.extractDates(context);
    }
    
    if (questionLower.includes('who') || questionLower.includes('person')) {
      extractedData.entity_mentions = this.extractEntities(context);
    }

    return extractedData;
  }

  private detectQuestionType(question: string): string {
    const q = question.toLowerCase();
    if (q.startsWith('what')) return 'definition_or_fact';
    if (q.startsWith('how')) return 'process_or_method';
    if (q.startsWith('when')) return 'temporal';
    if (q.startsWith('where')) return 'location';
    if (q.startsWith('who')) return 'person_or_entity';
    if (q.startsWith('why')) return 'explanation_or_reason';
    return 'general_inquiry';
  }

  private extractDefinitions(context: string): string[] {
    const definitions = [];
    const sentences = context.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      if (sentence.includes(' is ') || sentence.includes(' are ') || 
          sentence.includes(' means ') || sentence.includes(' refers to ')) {
        definitions.push(sentence.trim());
      }
    }
    
    return definitions.slice(0, 3);
  }

  private extractSteps(context: string): string[] {
    const steps = [];
    const lines = context.split('\n');
    
    for (const line of lines) {
      if (/^\d+\./.test(line.trim()) || 
          /^step \d+/i.test(line.trim()) ||
          line.includes('first') || line.includes('then') || line.includes('next')) {
        steps.push(line.trim());
      }
    }
    
    return steps.slice(0, 5);
  }

  private extractDates(context: string): string[] {
    const datePattern = /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
    const matches = context.match(datePattern) || [];
    return [...new Set(matches)].slice(0, 5);
  }

  private extractEntities(context: string): string[] {
    // Simple capitalized word extraction (could be improved with proper NER)
    const entityPattern = /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g;
    const matches = context.match(entityPattern) || [];
    return [...new Set(matches)].slice(0, 10);
  }

  getTools(): Tool[] {
    return [{
      name: 'extract_information',
      description: 'Extract specific information or answers from indexed documents using question-based retrieval',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question or information request in natural language'
          },
          context_limit: {
            type: 'number',
            description: 'Maximum number of context chunks to analyze',
            default: 5,
            minimum: 1,
            maximum: 20
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by specific file types or sources'
          },
          search_method: {
            type: 'string',
            enum: ['semantic', 'hybrid'],
            description: 'Search method for finding relevant context',
            default: 'semantic'
          }
        },
        required: ['question']
      }
    }];
  }
}