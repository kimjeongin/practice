import { DatabaseManager } from '../database/connection.js';
import { FileMetadata, SearchResult, ServerConfig, DocumentChunk } from '../types/index.js';
import { FileWatcher, FileChangeEvent } from './file-watcher.js';
import { OllamaEmbeddings } from './langchain-ollama-embedding.js';
import { FaissVectorStoreManager, VectorDocument, VectorSearchResult } from './faiss-vector-store.js';
import { readFileSync } from 'fs';
import { extname, basename } from 'path';
import { createHash } from 'crypto';

export interface RAGSearchOptions {
  topK?: number;
  fileTypes?: string[];
  metadataFilters?: Record<string, string>;
  useSemanticSearch?: boolean;
  useHybridSearch?: boolean;
  semanticWeight?: number; // 0-1, weight for semantic search vs keyword search
  scoreThreshold?: number;
}

export interface RAGSearchResult extends SearchResult {
  semanticScore?: number;
  keywordScore?: number;
  hybridScore?: number;
}

/**
 * LangChain 기반 RAG 서비스
 * Ollama 임베딩과 FAISS 벡터 스토어를 사용한 완전 로컬 RAG 구현
 */
export class LangChainRAGService {
  private db: DatabaseManager;
  private config: ServerConfig;
  private fileWatcher: FileWatcher;
  private embeddings: OllamaEmbeddings;
  private vectorStore: FaissVectorStoreManager;
  private isInitialized = false;
  private processingQueue = new Set<string>(); // Track files being processed

  constructor(db: DatabaseManager, config: ServerConfig) {
    this.db = db;
    this.config = config;
    
    // Ollama 임베딩 초기화
    this.embeddings = new OllamaEmbeddings(config);
    
    // FAISS 벡터 스토어 초기화
    this.vectorStore = new FaissVectorStoreManager(this.embeddings, config);

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
      console.log('Initializing LangChain RAG Service...');
      
      // Ollama 서버 상태 확인 및 진단
      console.log('🔍 Checking Ollama server status...');
      const isHealthy = await this.embeddings.healthCheck();
      
      if (!isHealthy) {
        console.warn('⚠️  Ollama server is not accessible at ' + this.config.ollamaBaseUrl);
        console.log('📋 To fix this:');
        console.log('   1. Install Ollama: https://ollama.com');
        console.log('   2. Start Ollama: ollama serve');
        console.log('   3. Verify it\'s running: curl http://localhost:11434/api/tags');
        console.log('');
        console.log('⚡ The server will continue in offline mode. Some features may be limited.');
      } else {
        console.log('✅ Ollama server is accessible');
        
        const isModelAvailable = await this.embeddings.isModelAvailable();
        if (!isModelAvailable) {
          console.warn(`⚠️  Ollama model '${this.config.embeddingModel}' is not available.`);
          console.log('📋 To fix this:');
          console.log(`   Run: ollama pull ${this.config.embeddingModel}`);
          console.log('');
          console.log('💡 Alternative models:');
          console.log('   - ollama pull all-minilm (faster, smaller)');
          console.log('   - ollama pull mxbai-embed-large (better quality)');
          console.log('');
          console.log('⚡ The server will continue in offline mode.');
        } else {
          console.log(`✅ Model '${this.config.embeddingModel}' is available`);
          
          // 임베딩 차원 수 확인
          try {
            const dimensions = await this.embeddings.getEmbeddingDimensions();
            console.log(`📐 Embedding dimensions: ${dimensions}`);
          } catch (error) {
            console.warn('⚠️  Could not determine embedding dimensions, using default');
          }
        }
      }

      // FAISS 벡터 스토어 초기화
      await this.vectorStore.initialize();
      
      // Start file watcher
      this.fileWatcher.start();
      
      // Sync directory with database
      await this.fileWatcher.syncDirectory();

      // Process any unprocessed documents
      await this.processUnvectorizedDocuments();
      
      this.isInitialized = true;
      
      const indexInfo = this.vectorStore.getIndexInfo();
      console.log('✅ LangChain RAG Service initialized successfully');
      console.log(`📊 Vector index: ${indexInfo.documentCount} documents`);
    } catch (error) {
      console.error('❌ Failed to initialize LangChain RAG Service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.fileWatcher.stop();
    await this.vectorStore.saveIndex();
    this.isInitialized = false;
    console.log('🔄 LangChain RAG Service shut down');
  }

  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    console.log(`📁 File ${event.type}: ${event.path}`);
    
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
      console.error(`❌ Error handling file change for ${event.path}:`, error);
    }
  }

  private async processFile(filePath: string): Promise<void> {
    if (this.processingQueue.has(filePath)) {
      console.log(`⏳ File ${filePath} is already being processed`);
      return;
    }

    this.processingQueue.add(filePath);

    try {
      console.log(`🔄 Processing file: ${basename(filePath)}`);
      
      // Get file metadata from database
      let fileMetadata = this.db.getFileByPath(filePath);
      if (!fileMetadata) {
        console.log(`❌ File ${filePath} not found in database, skipping`);
        return;
      }

      // Read file content
      const content = this.readFileContent(filePath);
      if (!content) {
        console.log(`❌ Could not read content from ${filePath}`);
        return;
      }

      // Split content into chunks using smart chunking
      const textChunks = await this.smartChunkText(content, fileMetadata.fileType);
      console.log(`📄 Split ${basename(filePath)} into ${textChunks.length} chunks`);

      // Clear existing chunks for this file
      this.db.deleteDocumentChunks(fileMetadata.id);
      await this.vectorStore.removeDocumentsByFileId(fileMetadata.id);

      // Process chunks in batches for memory efficiency
      const batchSize = this.config.embeddingBatchSize || 10;
      
      for (let i = 0; i < textChunks.length; i += batchSize) {
        const batch = textChunks.slice(i, i + batchSize);
        await this.processBatch(fileMetadata, batch, i);
      }

      console.log(`✅ Successfully processed ${textChunks.length} chunks for ${basename(filePath)}`);
    } catch (error) {
      console.error(`❌ Error processing file ${filePath}:`, error);
    } finally {
      this.processingQueue.delete(filePath);
    }
  }

  private async processBatch(fileMetadata: FileMetadata, chunks: string[], startIndex: number): Promise<void> {
    try {
      console.log(`⚙️  Processing batch of ${chunks.length} chunks (starting at index ${startIndex})`);
      
      // Create vector documents
      const vectorDocuments: VectorDocument[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkIndex = startIndex + i;
        const chunkId = this.generateChunkId(fileMetadata.id, chunkIndex);
        
        // Store in SQLite for metadata
        const dbChunk: Omit<DocumentChunk, 'id'> = {
          fileId: fileMetadata.id,
          chunkIndex,
          content: chunks[i],
          embeddingId: chunkId,
        };
        
        const insertedChunkId = this.db.insertDocumentChunk(dbChunk);
        
        // Prepare for vector store
        const vectorDoc: VectorDocument = {
          id: chunkId,
          content: chunks[i],
          metadata: {
            fileId: fileMetadata.id,
            fileName: fileMetadata.name,
            filePath: fileMetadata.path,
            chunkIndex,
            fileType: fileMetadata.fileType,
            createdAt: fileMetadata.createdAt.toISOString(),
            sqliteId: insertedChunkId,
          },
        };

        vectorDocuments.push(vectorDoc);
      }

      // Add to vector store with embeddings
      await this.vectorStore.addDocuments(vectorDocuments);
      
      console.log(`✅ Processed batch of ${chunks.length} chunks`);
    } catch (error) {
      console.error(`❌ Error processing batch starting at index ${startIndex}:`, error);
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
        await this.vectorStore.removeDocumentsByFileId(fileMetadata.id);
        console.log(`🗑️  Removed file ${basename(filePath)} from vector store`);
      }
    } catch (error) {
      console.error(`❌ Error removing file ${filePath} from vector store:`, error);
    }
  }

  private readFileContent(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf8');
      return this.extractTextFromFile(filePath, content);
    } catch (error) {
      console.error(`❌ Error reading file ${filePath}:`, error);
      return null;
    }
  }

  private extractTextFromFile(filePath: string, content: string): string {
    const ext = extname(filePath).toLowerCase().substring(1);
    
    switch (ext) {
      case 'txt':
      case 'md':
        return content;
      case 'json':
        try {
          const jsonData = JSON.parse(content);
          return JSON.stringify(jsonData, null, 2);
        } catch {
          return content;
        }
      case 'csv':
        return content.split('\n')
          .map(line => line.split(',').join(' | '))
          .join('\n');
      case 'html':
      case 'xml':
        return content.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
      default:
        return content;
    }
  }

  /**
   * 스마트 청킹: 파일 타입에 따른 적응적 청킹
   */
  private async smartChunkText(text: string, fileType: string): Promise<string[]> {
    const chunkSize = this.config.chunkSize;
    const overlap = this.config.chunkOverlap;

    if (!text || text.length === 0) return [];

    switch (fileType.toLowerCase()) {
      case 'md':
        return this.chunkMarkdown(text, chunkSize, overlap);
      case 'json':
        return this.chunkJson(text, chunkSize, overlap);
      default:
        return this.chunkText(text, chunkSize, overlap);
    }
  }

  private chunkMarkdown(text: string, chunkSize: number, overlap: number): string[] {
    // Markdown 헤더 기반 청킹
    const sections = text.split(/\\n(?=#{1,6}\\s)/);
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= chunkSize) {
        chunks.push(section.trim());
      } else {
        // 큰 섹션은 일반 청킹으로 처리
        chunks.push(...this.chunkText(section, chunkSize, overlap));
      }
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private chunkJson(text: string, chunkSize: number, overlap: number): string[] {
    try {
      const jsonData = JSON.parse(text);
      if (Array.isArray(jsonData)) {
        // 배열인 경우 각 아이템을 청크로 처리
        return jsonData.map((item, index) => 
          `Item ${index}: ${JSON.stringify(item, null, 2)}`
        ).filter(chunk => chunk.length <= chunkSize * 2); // JSON은 좀 더 여유롭게
      } else {
        // 객체인 경우 키별로 청킹
        const chunks: string[] = [];
        for (const [key, value] of Object.entries(jsonData)) {
          const chunk = `${key}: ${JSON.stringify(value, null, 2)}`;
          if (chunk.length <= chunkSize * 2) {
            chunks.push(chunk);
          }
        }
        return chunks;
      }
    } catch {
      // JSON 파싱 실패 시 일반 텍스트로 처리
      return this.chunkText(text, chunkSize, overlap);
    }
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);
      
      const cleanedChunk = chunk
        .replace(/\\s+/g, ' ')
        .replace(/[\\x00-\\x1F\\x7F-\\x9F]/g, '')
        .trim();
      
      if (cleanedChunk.length > 0) {
        chunks.push(cleanedChunk);
      }
      
      start = end - overlap;
      if (start <= (chunks.length > 1 ? (start + overlap) : 0)) {
        start = end;
      }
    }
    
    return chunks;
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
      scoreThreshold = this.config.similarityThreshold,
    } = options;

    try {
      if (!useSemanticSearch) {
        // Fallback to simple keyword search
        return this.keywordSearch(query, { topK, fileTypes, metadataFilters });
      }

      // 메타데이터 필터 함수 생성
      const metadataFilter = this.createMetadataFilter(fileTypes, metadataFilters);

      // Semantic search using FAISS
      const vectorResults = await this.vectorStore.search(query, {
        topK: Math.max(topK, 20),
        filter: metadataFilter,
        scoreThreshold,
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
      console.error('❌ Error during RAG search:', error);
      
      // Ollama 연결 오류인 경우 친화적인 메시지
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('request to http://localhost:11434')) {
        console.log('💡 Ollama server appears to be offline. Falling back to keyword search.');
        console.log('   To enable semantic search, start Ollama: ollama serve');
      }
      
      // Fallback to keyword search
      console.log('🔄 Falling back to keyword search...');
      return this.keywordSearch(query, { 
        topK, 
        fileTypes: fileTypes || undefined, 
        metadataFilters: metadataFilters || undefined
      });
    }
  }

  private createMetadataFilter(fileTypes?: string[], metadataFilters?: Record<string, string>) {
    return (metadata: any) => {
      // File type filter
      if (fileTypes && fileTypes.length > 0) {
        if (!fileTypes.includes(metadata.fileType?.toLowerCase())) {
          return false;
        }
      }

      // Custom metadata filters
      if (metadataFilters) {
        for (const [key, value] of Object.entries(metadataFilters)) {
          if (metadata[key] !== value) {
            return false;
          }
        }
      }

      return true;
    };
  }

  private async keywordSearch(query: string, options: {
    topK?: number;
    fileTypes?: string[];
    metadataFilters?: Record<string, string>;
  }): Promise<RAGSearchResult[]> {
    const { topK = this.config.similarityTopK, fileTypes, metadataFilters } = options;
    
    let files = this.db.getAllFiles();
    
    if (fileTypes && fileTypes.length > 0) {
      files = files.filter(file => fileTypes.includes(file.fileType.toLowerCase()));
    }
    
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
        existing.score = (existing.semanticScore || 0) * semanticWeight + 
                        (result.keywordScore || 0) * keywordWeight;
        existing.keywordScore = result.keywordScore;
        existing.hybridScore = existing.score;
      } else {
        combined.set(key, {
          ...result,
          score: (result.keywordScore || 0) * keywordWeight,
          hybridScore: (result.keywordScore || 0) * keywordWeight,
        });
      }
    }

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async processUnvectorizedDocuments(): Promise<void> {
    try {
      const allFiles = this.db.getAllFiles();
      const indexInfo = this.vectorStore.getIndexInfo();
      
      console.log(`📊 Found ${allFiles.length} files in database, ${indexInfo.documentCount} documents in vector store`);

      for (const file of allFiles) {
        const chunks = this.db.getDocumentChunks(file.id);
        
        if (chunks.length === 0) {
          console.log(`🔄 Processing unvectorized file: ${basename(file.path)}`);
          await this.processFile(file.path);
        }
      }
      
      console.log('✅ Finished processing unvectorized documents');
    } catch (error) {
      console.error('❌ Error processing unvectorized documents:', error);
    }
  }

  // Utility methods for MCP compatibility
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
    const indexInfo = this.vectorStore.getIndexInfo();
    const embeddingInfo = this.embeddings.getModelInfo();
    
    return {
      name: 'FAISS Local Index',
      count: indexInfo.documentCount,
      metadata: {
        type: 'faiss',
        indexPath: indexInfo.indexPath,
        embeddingModel: embeddingInfo.model,
        embeddingService: 'ollama',
        isHealthy: this.vectorStore.isHealthy(),
      },
    };
  }

  isReady(): boolean {
    return this.isInitialized && this.vectorStore.isHealthy();
  }

  async forceReindex(): Promise<void> {
    console.log('🔄 Force reindexing all files...');
    
    try {
      // Rebuild vector index
      await this.vectorStore.rebuildIndex();
      
      // Clear document chunks from SQLite
      const allFiles = this.db.getAllFiles();
      for (const file of allFiles) {
        this.db.deleteDocumentChunks(file.id);
      }
      
      // Reprocess all files
      for (const file of allFiles) {
        await this.processFile(file.path);
      }
      
      console.log('✅ Force reindexing completed');
    } catch (error) {
      console.error('❌ Error during force reindex:', error);
      throw error;
    }
  }
}