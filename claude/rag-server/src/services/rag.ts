import { DatabaseManager } from '../database/connection.js';
import { FileMetadata, SearchResult, ServerConfig, DocumentChunk } from '../types/index.js';
import { FileWatcher, FileChangeEvent } from './file-watcher.js';
import { ChromaVectorStore, VectorDocument, VectorSearchResult } from './vector-store.js';
import { createEmbeddingService, EmbeddingService, TextProcessor } from './embedding.js';
import { readFileSync } from 'fs';
import { extname } from 'path';
import { createHash } from 'crypto';

export interface RAGSearchOptions {
  topK?: number;
  fileTypes?: string[];
  metadataFilters?: Record<string, string>;
  useSemanticSearch?: boolean;
  useHybridSearch?: boolean;
  semanticWeight?: number; // 0-1, weight for semantic search vs keyword search
}

export interface RAGSearchResult extends SearchResult {
  semanticScore?: number;
  keywordScore?: number;
  hybridScore?: number;
}

export class RAGService {
  private db: DatabaseManager;
  private config: ServerConfig;
  private fileWatcher: FileWatcher;
  private vectorStore: ChromaVectorStore;
  private embeddingService: EmbeddingService | null = null;
  private isInitialized = false;
  private processingQueue = new Set<string>(); // Track files being processed

  constructor(db: DatabaseManager, config: ServerConfig) {
    this.db = db;
    this.config = config;
    this.vectorStore = new ChromaVectorStore(config);

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
      console.log('Initializing RAG Service...');
      
      // Initialize embedding service if OpenAI API key is available
      if (this.config.openaiApiKey && this.config.embeddingService === 'openai') {
        console.log('Initializing OpenAI embedding service...');
        this.embeddingService = createEmbeddingService(this.config);
        console.log('OpenAI embedding service initialized');
      } else {
        console.log('No embedding service configured - using ChromaDB default embeddings');
      }

      // Initialize vector store
      await this.vectorStore.initialize();
      
      // Start file watcher
      this.fileWatcher.start();
      
      // Sync directory with database
      await this.fileWatcher.syncDirectory();

      // Process any unprocessed documents
      await this.processUnvectorizedDocuments();
      
      this.isInitialized = true;
      console.log('RAG Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RAG Service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.fileWatcher.stop();
    this.isInitialized = false;
    console.log('RAG Service shut down');
  }

  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    console.log(`File ${event.type}: ${event.path}`);
    
    try {
      switch (event.type) {
        case 'added':
        case 'changed':
          await this.processFile(event.path);
          break;
        case 'removed':
          await this.removeFile(event.path);
          break;
      }
    } catch (error) {
      console.error(`Error handling file change for ${event.path}:`, error);
    }
  }

  private async processFile(filePath: string): Promise<void> {
    if (this.processingQueue.has(filePath)) {
      console.log(`File ${filePath} is already being processed`);
      return;
    }

    this.processingQueue.add(filePath);

    try {
      console.log(`Processing file: ${filePath}`);
      
      // Get file metadata from database
      let fileMetadata = this.db.getFileByPath(filePath);
      if (!fileMetadata) {
        console.log(`File ${filePath} not found in database, skipping`);
        return;
      }

      // Read file content
      const content = this.readFileContent(filePath);
      if (!content) {
        console.log(`Could not read content from ${filePath}`);
        return;
      }

      // Split content into chunks
      const textChunks = TextProcessor.splitIntoChunks(
        content,
        this.config.chunkSize,
        this.config.chunkOverlap
      );

      console.log(`Split ${filePath} into ${textChunks.length} chunks`);

      // Clear existing chunks for this file
      this.db.deleteDocumentChunks(fileMetadata.id);
      await this.vectorStore.deleteDocumentsByFileId(fileMetadata.id);

      // Process chunks in batches
      const batchSize = this.config.embeddingBatchSize;
      
      for (let i = 0; i < textChunks.length; i += batchSize) {
        const batch = textChunks.slice(i, i + batchSize);
        await this.processBatch(fileMetadata, batch, i);
      }

      console.log(`Successfully processed ${textChunks.length} chunks for ${filePath}`);
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    } finally {
      this.processingQueue.delete(filePath);
    }
  }

  private async processBatch(fileMetadata: FileMetadata, chunks: string[], startIndex: number): Promise<void> {
    try {
      console.log(`Processing batch of ${chunks.length} chunks (starting at index ${startIndex})`);
      
      // Create document chunks for database
      const vectorDocuments: VectorDocument[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkIndex = startIndex + i;
        const chunkId = this.generateChunkId(fileMetadata.id, chunkIndex);
        
        // Store in SQLite
        const dbChunk: Omit<DocumentChunk, 'id'> = {
          fileId: fileMetadata.id,
          chunkIndex,
          content: chunks[i],
          embeddingId: chunkId, // Reference to vector store
        };
        
        const insertedChunkId = this.db.insertDocumentChunk(dbChunk);
        
        // Prepare for vector store
        const vectorDoc: VectorDocument = {
          id: chunkId,
          content: chunks[i],
          metadata: {
            fileId: fileMetadata.id,
            fileName: fileMetadata.name,
            chunkIndex,
            fileType: fileMetadata.fileType,
            createdAt: fileMetadata.createdAt.toISOString(),
            sqliteId: insertedChunkId, // Reference back to SQLite
            filePath: fileMetadata.path,
          },
        };

        vectorDocuments.push(vectorDoc);
      }

      // Add to vector store
      await this.vectorStore.addDocuments(vectorDocuments);
      
      console.log(`Processed batch of ${chunks.length} chunks (starting at index ${startIndex})`);
    } catch (error) {
      console.error(`Error processing batch starting at index ${startIndex}:`, error);
      throw error;
    }
  }

  private generateChunkId(fileId: string, chunkIndex: number): string {
    const hash = createHash('sha256')
      .update(`${fileId}_${chunkIndex}`)
      .digest('hex')
      .substring(0, 16);
    return hash || `chunk_${fileId}_${chunkIndex}`;
  }

  private async removeFile(filePath: string): Promise<void> {
    try {
      const fileMetadata = this.db.getFileByPath(filePath);
      if (fileMetadata) {
        // Remove from vector store
        await this.vectorStore.deleteDocumentsByFileId(fileMetadata.id);
        console.log(`Removed file ${filePath} from vector store`);
      }
    } catch (error) {
      console.error(`Error removing file ${filePath} from vector store:`, error);
    }
  }

  private readFileContent(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf8');
      return TextProcessor.extractTextFromFile(filePath, content);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  async search(query: string, options: RAGSearchOptions = {}): Promise<RAGSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('RAG Service not initialized');
    }

    const {
      topK = this.config.similarityTopK,
      fileTypes,
      metadataFilters,
      useSemanticSearch = true,
      useHybridSearch = false,
      semanticWeight = 0.7,
    } = options;

    try {
      if (!useSemanticSearch) {
        // Fallback to simple keyword search
        return this.keywordSearch(query, { topK, fileTypes, metadataFilters });
      }

      // Build vector search filters
      let vectorFilters: Record<string, any> | undefined = undefined;
      
      if (fileTypes && fileTypes.length > 0) {
        vectorFilters = { fileType: fileTypes[0]?.toLowerCase() || '' }; // Simplified for ChromaDB
      }

      if (metadataFilters) {
        vectorFilters = { ...vectorFilters, ...metadataFilters };
      }

      // Perform semantic search
      const vectorResults = await this.vectorStore.search(query, {
        topK: Math.max(topK, 20), // Get more results for hybrid search
        where: vectorFilters,
      });

      if (!useHybridSearch) {
        // Return semantic search results only
        return this.convertVectorResults(vectorResults, topK);
      }

      // Hybrid search: combine semantic and keyword results
      const keywordResults = await this.keywordSearch(query, { 
        topK: topK * 2, 
        fileTypes: fileTypes || undefined, 
        metadataFilters: metadataFilters || undefined
      });
      
      return this.combineResults(vectorResults, keywordResults, semanticWeight, topK);
      
    } catch (error) {
      console.error('Error during RAG search:', error);
      // Fallback to keyword search
      return this.keywordSearch(query, { 
        topK, 
        fileTypes: fileTypes || undefined, 
        metadataFilters: metadataFilters || undefined
      });
    }
  }

  private async keywordSearch(query: string, options: {
    topK?: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
  }): Promise<RAGSearchResult[]> {
    const { topK = this.config.similarityTopK, fileTypes, metadataFilters } = options;
    
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

    const results: RAGSearchResult[] = [];
    
    for (const file of files.slice(0, topK * 2)) {
      const chunks = this.db.getDocumentChunks(file.id);
      const customMetadata = this.db.getFileMetadata(file.id);
      
      for (const chunk of chunks) {
        const content = chunk.content.toLowerCase();
        const searchQuery = query.toLowerCase();
        
        if (content.includes(searchQuery)) {
          const matches = (content.match(new RegExp(searchQuery, 'g')) || []).length;
          const keywordScore = matches / content.length;
          
          results.push({
            content: chunk.content,
            score: keywordScore,
            keywordScore,
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
    results.sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
    return results.slice(0, topK);
  }

  private convertVectorResults(vectorResults: VectorSearchResult[], topK: number): RAGSearchResult[] {
    return vectorResults.slice(0, topK).map(result => ({
      content: result.content,
      score: result.score,
      semanticScore: result.score,
      metadata: result.metadata,
      chunkIndex: (result.metadata.chunkIndex as number) || 0,
    }));
  }

  private combineResults(
    vectorResults: VectorSearchResult[],
    keywordResults: RAGSearchResult[],
    semanticWeight: number,
    topK: number
  ): RAGSearchResult[] {
    const combined = new Map<string, RAGSearchResult>();
    const keywordWeight = 1 - semanticWeight;

    // Add semantic results
    for (const result of vectorResults) {
      const key = `${result.metadata.fileId}_${result.metadata.chunkIndex}`;
      combined.set(key, {
        content: result.content,
        score: result.score * semanticWeight,
        semanticScore: result.score,
        metadata: result.metadata,
        chunkIndex: (result.metadata.chunkIndex as number) || 0,
      });
    }

    // Merge with keyword results
    for (const result of keywordResults) {
      const key = `${result.metadata.id}_${result.chunkIndex}`;
      const existing = combined.get(key);
      
      if (existing) {
        // Combine scores
        existing.score = (existing.semanticScore || 0) * semanticWeight + 
                        (result.keywordScore || 0) * keywordWeight;
        existing.keywordScore = result.keywordScore;
        existing.hybridScore = existing.score;
      } else {
        // Add keyword-only result
        combined.set(key, {
          ...result,
          score: (result.keywordScore || 0) * keywordWeight,
          hybridScore: (result.keywordScore || 0) * keywordWeight,
        });
      }
    }

    // Sort by combined score and return top results
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async processUnvectorizedDocuments(): Promise<void> {
    try {
      const allFiles = this.db.getAllFiles();
      const vectorInfo = await this.vectorStore.getCollectionInfo();
      
      console.log(`Found ${allFiles.length} files in database, ${vectorInfo.count} documents in vector store`);

      for (const file of allFiles) {
        const chunks = this.db.getDocumentChunks(file.id);
        
        // Check if this file has been vectorized
        const hasVectorData = chunks.some(chunk => chunk.embeddingId);
        
        if (!hasVectorData && chunks.length === 0) {
          console.log(`Processing unvectorized file: ${file.path}`);
          await this.processFile(file.path);
        }
      }
      
      console.log('Finished processing unvectorized documents');
    } catch (error) {
      console.error('Error processing unvectorized documents:', error);
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

  async getVectorStoreInfo(): Promise<{ name: string; count: number; metadata?: any }> {
    return this.vectorStore.getCollectionInfo();
  }

  isReady(): boolean {
    return this.isInitialized && this.vectorStore.isReady();
  }

  async forceReindex(): Promise<void> {
    console.log('Force reindexing all files...');
    
    try {
      // Clear vector store
      await this.vectorStore.clearCollection();
      
      // Clear document chunks from SQLite
      const allFiles = this.db.getAllFiles();
      for (const file of allFiles) {
        this.db.deleteDocumentChunks(file.id);
      }
      
      // Reprocess all files
      for (const file of allFiles) {
        await this.processFile(file.path);
      }
      
      console.log('Force reindexing completed');
    } catch (error) {
      console.error('Error during force reindex:', error);
      throw error;
    }
  }
}