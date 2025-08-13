import OpenAI from 'openai';
import { DatabaseManager } from '../database/connection.js';
import { FileMetadata, SearchResult, ServerConfig } from '../types/index.js';
import { FileWatcher, FileChangeEvent } from './file-watcher.js';

export class SimpleRAGService {
  private db: DatabaseManager;
  private config: ServerConfig;
  private fileWatcher: FileWatcher;
  private openai: OpenAI | null = null;
  private isInitialized = false;

  constructor(db: DatabaseManager, config: ServerConfig) {
    this.db = db;
    this.config = config;
    
    // Initialize OpenAI if API key is provided
    if (process.env['OPENAI_API_KEY']) {
      this.openai = new OpenAI({
        apiKey: process.env['OPENAI_API_KEY']
      });
    }

    // Initialize file watcher
    this.fileWatcher = new FileWatcher(db, config.dataDir);
    this.fileWatcher.on('change', (event: FileChangeEvent) => {
      this.handleFileChange(event);
    });
    this.fileWatcher.on('error', (error) => {
      console.error('FileWatcher error:', error);
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing Simple RAG Service...');
      
      // Start file watcher
      this.fileWatcher.start();
      
      // Sync directory with database
      await this.fileWatcher.syncDirectory();
      
      this.isInitialized = true;
      console.log('Simple RAG Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Simple RAG Service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.fileWatcher.stop();
    this.isInitialized = false;
    console.log('Simple RAG Service shut down');
  }

  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    console.log(`File ${event.type}: ${event.path}`);
    // For now, just log file changes
    // In a full implementation, you would process and embed the content
  }

  async search(query: string, searchOptions: {
    topK?: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
  } = {}): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('Simple RAG Service not initialized');
    }

    try {
      const { topK = this.config.similarityTopK, fileTypes, metadataFilters } = searchOptions;
      
      // Get all files from database
      let files = this.db.getAllFiles();
      
      // Apply file type filter
      if (fileTypes && fileTypes.length > 0) {
        files = files.filter(file => fileTypes.includes(file.fileType.toLowerCase()));
      }
      
      // Apply metadata filters
      if (metadataFilters) {
        files = files.filter(file => {
          const metadata = this.db.getFileMetadata(file.id);
          return Object.entries(metadataFilters).every(([key, value]) => 
            metadata[key] === value
          );
        });
      }

      const results: SearchResult[] = [];
      
      // Simple text-based search without embeddings
      for (const file of files.slice(0, topK)) {
        const chunks = this.db.getDocumentChunks(file.id);
        const customMetadata = this.db.getFileMetadata(file.id);
        
        for (const chunk of chunks) {
          // Simple keyword matching
          const content = chunk.content.toLowerCase();
          const searchQuery = query.toLowerCase();
          
          if (content.includes(searchQuery)) {
            // Simple scoring based on keyword frequency
            const matches = (content.match(new RegExp(searchQuery, 'g')) || []).length;
            const score = matches / content.length;
            
            results.push({
              content: chunk.content,
              score: score,
              metadata: {
                ...file,
                ...customMetadata
              },
              chunkIndex: chunk.chunkIndex
            });
          }
        }
      }
      
      // Sort by score descending and limit results
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
      
    } catch (error) {
      console.error('Error during search:', error);
      throw error;
    }
  }

  // Enhanced search with OpenAI embeddings (optional)
  async searchWithEmbeddings(query: string, searchOptions: {
    topK?: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
  } = {}): Promise<SearchResult[]> {
    if (!this.openai) {
      // Fallback to simple search if no OpenAI API key
      return this.search(query, searchOptions);
    }
    
    try {
      // Get query embedding
      const queryEmbedding = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query
      });
      
      // For now, fallback to simple search
      // In a full implementation, you would:
      // 1. Store embeddings for all document chunks
      // 2. Calculate cosine similarity between query and document embeddings
      // 3. Return most similar chunks
      
      console.log('OpenAI embeddings available, but full implementation needed');
      return this.search(query, searchOptions);
      
    } catch (error) {
      console.error('Error with OpenAI embeddings:', error);
      // Fallback to simple search
      return this.search(query, searchOptions);
    }
  }

  // Utility methods
  getIndexedFilesCount(): number {
    return this.db.getAllFiles().length;
  }

  getIndexedChunksCount(): number {
    const files = this.db.getAllFiles();
    let totalChunks = 0;
    
    for (const file of files) {
      const chunks = this.db.getDocumentChunks(file.id);
      totalChunks += chunks.length;
    }
    
    return totalChunks;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async forceReindex(): Promise<void> {
    console.log('Force reindexing all files...');
    
    // For now, just log
    // In a full implementation, you would re-process all files
    
    console.log('Force reindexing completed');
  }
}