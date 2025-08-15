import { pipeline, env } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { Embeddings } from '@langchain/core/embeddings';
import { ServerConfig } from '../../../shared/types/index.js';

export interface EmbeddingModelConfig {
  modelId: string;
  dimensions: number;
  maxTokens: number;
  description: string;
}

export const AVAILABLE_MODELS: Record<string, EmbeddingModelConfig> = {
  'all-MiniLM-L6-v2': {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    maxTokens: 256,
    description: 'Fast and efficient, good for general use'
  },
  'all-MiniLM-L12-v2': {
    modelId: 'Xenova/all-MiniLM-L12-v2', 
    dimensions: 384,
    maxTokens: 256,
    description: 'Slightly larger and more accurate than L6'
  },
  'bge-small-en': {
    modelId: 'Xenova/bge-small-en',
    dimensions: 384,
    maxTokens: 512,
    description: 'High quality embeddings for English text'
  },
  'bge-base-en': {
    modelId: 'Xenova/bge-base-en',
    dimensions: 768,
    maxTokens: 512,
    description: 'Better quality, slower than small variant'
  }
};

/**
 * LangChain-compatible embedding service using Transformers.js
 * Runs completely locally without any external dependencies
 * Supports lazy loading and model selection
 */
export class TransformersEmbeddings extends Embeddings {
  protected pipeline: FeatureExtractionPipeline | null = null;
  protected modelConfig: EmbeddingModelConfig;
  protected isInitialized = false;
  protected initPromise: Promise<void> | null = null;
  protected downloadProgress: Map<string, {loaded: number, total: number, percentage: number}> = new Map();
  protected isLazyLoading: boolean;

  constructor(private config: ServerConfig) {
    super({});
    
    // Enable lazy loading in production or when explicitly set
    this.isLazyLoading = process.env.TRANSFORMERS_LAZY_LOADING !== 'false' && 
                        (process.env.NODE_ENV === 'production' || 
                         process.env.TRANSFORMERS_LAZY_LOADING === 'true');
    
    // Configure transformers.js environment
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    env.cacheDir = config.transformersCacheDir || './data/.transformers-cache';
    
    // Get model configuration
    const modelName = config.embeddingModel || 'all-MiniLM-L6-v2';
    this.modelConfig = AVAILABLE_MODELS[modelName] || AVAILABLE_MODELS['all-MiniLM-L6-v2'];
    
    console.log(`🤖 Initialized TransformersEmbeddings with model: ${this.modelConfig.modelId}`);
    console.log(`📐 Dimensions: ${this.modelConfig.dimensions}, Max tokens: ${this.modelConfig.maxTokens}`);
    console.log(`⚡ Lazy loading: ${this.isLazyLoading ? 'enabled' : 'disabled'}`);
  }

  /**
   * Initialize the embedding pipeline
   */
  protected async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this._doInitialize();
    await this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      if (this.isLazyLoading && !(await this.isModelCached())) {
        console.log(`⚡ Lazy loading enabled - model will download when first used`);
        console.log(`📦 Model: ${this.modelConfig.modelId}`);
        console.log(`📊 Estimated size: ${this.getEstimatedDownloadSize().formatted}`);
        console.log(`💡 Use 'download_model' MCP tool to pre-download`);
        
        // Don't initialize pipeline yet - will be done on first use
        this.isInitialized = true;
        return;
      }

      await this._downloadAndInitialize();
    } catch (error) {
      console.error('❌ Failed to initialize TransformersEmbeddings:', error);
      throw error;
    }
  }

  private async _downloadAndInitialize(): Promise<void> {
    console.log(`🔄 Loading embedding model: ${this.modelConfig.modelId}...`);
    const downloadInfo = this.getEstimatedDownloadSize();
    console.log(`📦 Estimated download size: ${downloadInfo.formatted}`);
    
    const startTime = Date.now();
    let lastProgress = 0;

    // Create feature extraction pipeline with detailed progress tracking
    this.pipeline = await pipeline('feature-extraction', this.modelConfig.modelId, {
      progress_callback: (progress: any) => {
        if (progress.status === 'downloading') {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          const currentMB = this.formatBytes(progress.loaded);
          const totalMB = this.formatBytes(progress.total);
          
          // Update internal progress tracking
          this.downloadProgress.set(progress.file, {
            loaded: progress.loaded,
            total: progress.total,
            percentage: percent
          });
          
          // Only log every 10% to avoid spam
          if (percent >= lastProgress + 10 || percent === 100) {
            console.log(`📥 Downloading ${progress.file}: ${percent}% (${currentMB}/${totalMB})`);
            lastProgress = percent;
          }
        } else if (progress.status === 'ready') {
          console.log(`✅ ${progress.file} ready`);
        } else if (progress.status === 'loading') {
          console.log(`🔄 Loading ${progress.file}...`);
        }
      }
    });

    const loadTime = Date.now() - startTime;
    console.log(`✅ Model loaded successfully in ${loadTime}ms`);
    console.log(`💾 Model cached in: ${env.cacheDir}`);
    console.log(`🚀 Ready for embeddings (${this.modelConfig.description})`);
    
    this.isInitialized = true;
  }

  /**
   * Generate embedding for a single query
   */
  async embedQuery(query: string): Promise<number[]> {
    await this.initialize();
    
    // Lazy loading: download model if not available
    if (this.isLazyLoading && !this.pipeline) {
      console.log(`🔄 First embedding request - downloading model now...`);
      await this._downloadAndInitialize();
    }
    
    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    try {
      // Truncate query if too long
      const truncatedQuery = this.truncateText(query);
      
      // Generate embedding
      const output = await this.pipeline(truncatedQuery, {
        pooling: 'mean',
        normalize: true
      });

      // Convert tensor to array
      const embedding = Array.from(output.data) as number[];
      
      if (embedding.length !== this.modelConfig.dimensions) {
        console.warn(`⚠️  Expected ${this.modelConfig.dimensions} dimensions, got ${embedding.length}`);
      }

      return embedding;
    } catch (error) {
      console.error('❌ Error generating query embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple documents
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    await this.initialize();
    
    // Lazy loading: download model if not available
    if (this.isLazyLoading && !this.pipeline) {
      console.log(`🔄 First embedding request - downloading model now...`);
      await this._downloadAndInitialize();
    }
    
    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    if (documents.length === 0) return [];

    try {
      console.log(`🔄 Generating embeddings for ${documents.length} documents...`);
      const startTime = Date.now();

      // Process in batches for memory efficiency
      const batchSize = 10;
      const embeddings: number[][] = [];

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const truncatedBatch = batch.map(doc => this.truncateText(doc));
        
        // Generate embeddings for batch
        const batchEmbeddings = await Promise.all(
          truncatedBatch.map(async (doc) => {
            const output = await this.pipeline!(doc, {
              pooling: 'mean',
              normalize: true
            });
            return Array.from(output.data) as number[];
          })
        );

        embeddings.push(...batchEmbeddings);
        
        if (batch.length === batchSize) {
          console.log(`   📊 Processed ${Math.min(i + batchSize, documents.length)}/${documents.length} documents`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Generated ${embeddings.length} embeddings in ${duration}ms`);
      
      return embeddings;
    } catch (error) {
      console.error('❌ Error generating document embeddings:', error);
      throw error;
    }
  }

  /**
   * Truncate text to model's maximum token limit
   */
  private truncateText(text: string): string {
    // Simple approximation: ~4 characters per token
    const maxChars = this.modelConfig.maxTokens * 4;
    
    if (text.length <= maxChars) {
      return text;
    }
    
    console.warn(`⚠️  Truncating text from ${text.length} to ${maxChars} characters`);
    return text.substring(0, maxChars);
  }

  /**
   * Health check for the embedding service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize();
      
      // Test with a simple query
      const testEmbedding = await this.embedQuery('test');
      return Array.isArray(testEmbedding) && testEmbedding.length === this.modelConfig.dimensions;
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return false;
    }
  }

  /**
   * Check if model is available (always true for local models)
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return this.isInitialized;
    } catch {
      return false;
    }
  }

  /**
   * Get embedding dimensions
   */
  async getEmbeddingDimensions(): Promise<number> {
    return this.modelConfig.dimensions;
  }

  /**
   * Get model information
   */
  getModelInfo(): { model: string; service: string; dimensions: number; description: string } {
    return {
      model: this.modelConfig.modelId,
      service: 'transformers.js',
      dimensions: this.modelConfig.dimensions,
      description: this.modelConfig.description
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.pipeline !== null;
  }

  /**
   * Get cache directory information
   */
  getCacheInfo(): { cacheDir: string; isLocal: boolean } {
    return {
      cacheDir: env.cacheDir || './data/.transformers-cache',
      isLocal: true
    };
  }

  /**
   * List available models
   */
  static getAvailableModels(): Record<string, EmbeddingModelConfig> {
    return AVAILABLE_MODELS;
  }

  /**
   * Estimate memory usage for the model
   */
  estimateMemoryUsage(): string {
    const modelSizes: Record<string, string> = {
      'all-MiniLM-L6-v2': '~23MB',
      'all-MiniLM-L12-v2': '~45MB', 
      'bge-small-en': '~67MB',
      'bge-base-en': '~109MB'
    };
    
    const modelName = Object.keys(AVAILABLE_MODELS).find(
      key => AVAILABLE_MODELS[key].modelId === this.modelConfig.modelId
    );
    
    return modelSizes[modelName || 'all-MiniLM-L6-v2'] || '~25MB';
  }

  /**
   * Get estimated download size for current model
   */
  getEstimatedDownloadSize(): { size: number; formatted: string } {
    const modelSizes: Record<string, number> = {
      'all-MiniLM-L6-v2': 23_000_000,    // 23MB
      'all-MiniLM-L12-v2': 45_000_000,   // 45MB
      'bge-small-en': 67_000_000,         // 67MB
      'bge-base-en': 109_000_000          // 109MB
    };

    const modelName = Object.keys(AVAILABLE_MODELS).find(
      key => AVAILABLE_MODELS[key].modelId === this.modelConfig.modelId
    );
    
    const size = modelSizes[modelName || 'all-MiniLM-L6-v2'] || 25_000_000;
    
    return {
      size,
      formatted: this.formatBytes(size)
    };
  }

  /**
   * Check if model is already cached locally
   */
  async isModelCached(): Promise<boolean> {
    const fs = await import('fs');
    const path = await import('path');
    
    const cacheDir = env.cacheDir || './data/.transformers-cache';
    const modelPath = path.join(cacheDir, this.modelConfig.modelId.replace('/', '_'));
    
    try {
      const stats = await fs.promises.stat(modelPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get current download progress
   */
  getDownloadProgress(): Record<string, {loaded: number, total: number, percentage: number}> {
    return Object.fromEntries(this.downloadProgress);
  }

  /**
   * Force download model
   */
  async downloadModel(): Promise<void> {
    if (await this.isModelCached()) {
      console.log('✅ Model already cached, skipping download');
      return;
    }
    
    console.log('🔄 Starting model download...');
    await this._downloadAndInitialize();
  }

  /**
   * Switch to a different model
   */
  async switchModel(modelName: string): Promise<void> {
    if (!(modelName in AVAILABLE_MODELS)) {
      throw new Error(`Unknown model: ${modelName}. Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
    }

    console.log(`🔄 Switching from ${this.modelConfig.modelId} to ${AVAILABLE_MODELS[modelName].modelId}...`);
    
    // Update model configuration
    this.modelConfig = AVAILABLE_MODELS[modelName];
    
    // Reset pipeline
    this.pipeline = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.downloadProgress.clear();
    
    // Initialize new model
    if (!this.isLazyLoading) {
      await this.initialize();
    }
    
    console.log(`✅ Model switched to ${this.modelConfig.modelId}`);
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    isCached: boolean;
    cacheSize?: string;
    cachePath: string;
    modelCount: number;
    availableModels: string[];
  }> {
    const fs = await import('fs');
    const path = await import('path');
    
    const cacheDir = env.cacheDir || './data/.transformers-cache';
    const isCached = await this.isModelCached();
    
    let cacheSize: string | undefined;
    let modelCount = 0;
    let availableModels: string[] = [];
    
    try {
      // Check if cache directory exists
      await fs.promises.access(cacheDir);
      
      // Get cache directory size
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        const { stdout } = await execAsync(`du -sh "${cacheDir}"`);
        cacheSize = stdout.split('\t')[0];
      } catch (error) {
        console.warn('Could not get cache size:', error);
      }
      
      // Count cached models and list them
      const entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
      const modelDirs = entries.filter(entry => entry.isDirectory());
      modelCount = modelDirs.length;
      availableModels = modelDirs.map(dir => dir.name.replace('_', '/'));
      
    } catch (error) {
      // Cache directory doesn't exist yet
    }
    
    return {
      isCached,
      cacheSize,
      cachePath: cacheDir,
      modelCount,
      availableModels
    };
  }
}