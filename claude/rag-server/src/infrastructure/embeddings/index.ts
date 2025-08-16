import { Embeddings } from '@langchain/core/embeddings';
import { ServerConfig } from '../../shared/types/index.js';
import { OllamaEmbeddings } from './providers/ollama.js';
import { TransformersEmbeddings } from './providers/transformers.js';

export type EmbeddingServiceType = 'transformers' | 'ollama';

/**
 * Factory for creating embedding services
 * Supports multiple embedding backends with automatic fallback
 */
export class EmbeddingFactory {
  /**
   * Create an embedding service based on configuration
   */
  static async createEmbeddingService(config: ServerConfig): Promise<Embeddings> {
    const service = (config.embeddingService || 'transformers') as EmbeddingServiceType;
    
    console.log(`🏭 Creating embedding service: ${service}`);
    
    switch (service) {
      case 'transformers':
        return new TransformersEmbeddings(config);
        
      case 'ollama':
        return new OllamaEmbeddings(config);
        
      default:
        console.warn(`⚠️  Unknown embedding service: ${service}, falling back to transformers`);
        return new TransformersEmbeddings(config);
    }
  }

  /**
   * Create embedding service with automatic fallback
   * Tries the configured service first, falls back to transformers if it fails
   */
  static async createWithFallback(config: ServerConfig): Promise<{
    embeddings: Embeddings;
    actualService: EmbeddingServiceType;
  }> {
    const requestedService = (config.embeddingService || 'transformers') as EmbeddingServiceType;
    
    try {
      console.log(`🔍 Attempting to create ${requestedService} embedding service...`);
      const embeddings = await this.createEmbeddingService(config);
      
      // Test the service
      const isHealthy = await this.testEmbeddingService(embeddings);
      
      if (isHealthy) {
        console.log(`✅ Successfully created ${requestedService} embedding service`);
        return { embeddings, actualService: requestedService };
      } else {
        throw new Error(`${requestedService} service health check failed`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to create ${requestedService} service:`, error);
      
      if (requestedService !== 'transformers') {
        console.log(`🔄 Falling back to transformers embedding service...`);
        try {
          const fallbackEmbeddings = new TransformersEmbeddings(config);
          const isHealthy = await this.testEmbeddingService(fallbackEmbeddings);
          
          if (isHealthy) {
            console.log(`✅ Successfully created fallback transformers service`);
            return { embeddings: fallbackEmbeddings, actualService: 'transformers' };
          }
        } catch (fallbackError) {
          console.error(`❌ Fallback to transformers also failed:`, fallbackError);
        }
      }
      
      throw new Error(`Failed to create any embedding service`);
    }
  }

  /**
   * Test if an embedding service is working
   */
  private static async testEmbeddingService(embeddings: Embeddings): Promise<boolean> {
    try {
      console.log(`🧪 Testing embedding service...`);
      const testText = 'This is a test sentence for embedding generation.';
      const result = await embeddings.embedQuery(testText);
      
      const isValid = Array.isArray(result) && result.length > 0 && result.every(x => typeof x === 'number');
      console.log(`📊 Test result: ${isValid ? 'PASS' : 'FAIL'} (${result.length} dimensions)`);
      
      return isValid;
    } catch (error) {
      console.error(`❌ Embedding service test failed:`, error);
      return false;
    }
  }

  /**
   * Get information about available embedding services
   */
  static getServiceInfo(): Record<EmbeddingServiceType, { 
    name: string; 
    description: string; 
    requirements: string[];
    advantages: string[];
  }> {
    return {
      transformers: {
        name: 'Transformers.js (Built-in)',
        description: 'Local embedding models running directly in Node.js',
        requirements: ['None - included with server'],
        advantages: [
          'No external dependencies',
          'Fast startup',
          'Multiple model options',
          'Completely offline',
          'Memory efficient'
        ]
      },
      ollama: {
        name: 'Ollama (External)',
        description: 'Local embedding server with larger models',
        requirements: ['Ollama server running', 'Model downloaded'],
        advantages: [
          'Larger model options',
          'Better quality embeddings',
          'GPU acceleration support',
          'Model sharing across applications'
        ]
      },
    };
  }

  /**
   * Validate embedding service configuration
   */
  static validateConfig(config: ServerConfig): { 
    isValid: boolean; 
    errors: string[]; 
    warnings: string[] 
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const service = config.embeddingService as EmbeddingServiceType;

    switch (service) {
      case 'transformers':
        // Always valid - no external dependencies
        break;
        
      case 'ollama':
        if (!config.ollamaBaseUrl) {
          errors.push('OLLAMA_BASE_URL is required for ollama service');
        }
        if (!config.embeddingModel) {
          warnings.push('EMBEDDING_MODEL not specified, will use default');
        }
        break;
        
        
      default:
        warnings.push(`Unknown embedding service: ${service}, will fall back to transformers`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}