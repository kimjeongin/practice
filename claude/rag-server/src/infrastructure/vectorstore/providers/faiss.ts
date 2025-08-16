import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { ServerConfig } from '@/shared/types';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    fileId: string
    fileName: string;
    filePath: string;
    chunkIndex: number;
    fileType: string;
    createdAt: string;
    [key: string]: any;
  };
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
}

export interface SearchOptions {
  topK?: number;
  filter?: (metadata: any) => boolean;
  scoreThreshold?: number;
}

/**
 * FAISS 기반 로컬 벡터 스토어 매니저
 * 파일 모니터링과 통합된 증분 업데이트 지원
 */
export class FaissVectorStoreManager {
  private store: FaissStore | null = null;
  private embeddings: Embeddings;
  private config: ServerConfig;
  private indexPath: string;
  private isInitialized = false;

  // 문서 ID와 벡터 인덱스 매핑 관리
  private documentIdMap = new Map<string, number>();
  private indexDocumentMap = new Map<number, string>();
  private nextIndex = 0;

  constructor(embeddings: Embeddings, config: ServerConfig) {
    this.embeddings = embeddings;
    this.config = config;
    this.indexPath = join(dirname(config.databasePath), 'faiss_index');
    
    // 인덱스 디렉토리 생성
    if (!existsSync(this.indexPath)) {
      mkdirSync(this.indexPath, { recursive: true });
    }
  }

  /**
   * 벡터 스토어 초기화
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing FAISS vector store...');
      
      // 기존 인덱스가 있으면 로드, 없으면 새로 생성
      if (await this.hasExistingIndex()) {
        console.log('Loading existing FAISS index...');
        await this.loadIndex();
      } else {
        console.log('Creating new FAISS index...');
        await this.createEmptyIndex();
      }

      this.isInitialized = true;
      console.log('FAISS vector store initialized successfully');
    } catch (error) {
      console.error('Failed to initialize FAISS vector store:', error);
      throw error;
    }
  }

  /**
   * 기존 인덱스 파일이 존재하는지 확인
   */
  private async hasExistingIndex(): Promise<boolean> {
    const indexFile = join(this.indexPath, 'docstore.json');
    const faissIndexFile = join(this.indexPath, 'faiss.index');
    return existsSync(indexFile) && existsSync(faissIndexFile);
  }

  /**
   * 기존 인덱스 로드
   */
  private async loadIndex(): Promise<void> {
    try {
      this.store = await FaissStore.load(this.indexPath, this.embeddings);
      
      // 문서 ID 매핑 재구성
      await this.rebuildDocumentMappings();
      
      const docCount = this.store.index?.ntotal() || 0;
      console.log(`Loaded FAISS index with ${docCount} documents`);
    } catch (error) {
      console.warn('Failed to load existing index, creating new one:', error);
      await this.createEmptyIndex();
    }
  }

  /**
   * 빈 인덱스 생성 (성능 최적화)
   */
  private async createEmptyIndex(): Promise<void> {
    try {
      console.log('Creating FAISS index...');
      
      // Ollama가 사용 불가능한 경우 지연 초기화
      try {
        // 더미 문서로 초기화 (FAISS 인덱스 생성을 위해 필요)
        const dummyDoc = new Document({
          pageContent: 'initialization document for FAISS index setup',
          metadata: { isDummy: true, id: 'faiss-init-doc', __isTemporary: true },
        });

        console.log('Creating FAISS index with optimized settings...');
        this.store = await FaissStore.fromDocuments([dummyDoc], this.embeddings);
        
        // 더미 문서 즉시 제거
        await this.removeDocumentsByFilter(metadata => metadata.__isTemporary === true);
        
        console.log('✅ Created optimized FAISS index');
      } catch (embeddingError) {
        // 임베딩 서비스 오류 시 지연 초기화로 처리
        console.warn('⚠️  Cannot create FAISS index now (embedding service unavailable)');
        console.log('📋 Index will be created when first document is added');
        this.store = null; // 지연 초기화를 위해 null로 설정
      }
    } catch (error) {
      console.error('❌ Failed to create FAISS index:', error);
      throw error;
    }
  }

  /**
   * 문서 ID 매핑 재구성 (기존 인덱스 로드 후)
   */
  private async rebuildDocumentMappings(): Promise<void> {
    this.documentIdMap.clear();
    this.indexDocumentMap.clear();
    this.nextIndex = 0;

    if (!this.store) return;

    // docstore에서 모든 문서를 순회하면서 매핑 재구성
    for (let i = 0; i < (this.store.index?.ntotal() || 0); i++) {
      try {
        const doc = this.store.docstore.search(i.toString());
        if (doc && doc.metadata.id) {
          this.documentIdMap.set(doc.metadata.id, i);
          this.indexDocumentMap.set(i, doc.metadata.id);
          this.nextIndex = Math.max(this.nextIndex, i + 1);
        }
      } catch (error) {
        // Document not found at this index, skip
        console.warn(`Document not found at index ${i}, skipping`);
      }
    }

    console.log(`Rebuilt document mappings: ${this.documentIdMap.size} documents`);
  }

  /**
   * 지연 초기화: 첫 문서 추가 시 인덱스 생성
   */
  private async ensureStoreInitialized(): Promise<void> {
    if (!this.store) {
      try {
        console.log('🔄 Lazy initializing FAISS index...');
        const dummyDoc = new Document({
          pageContent: 'initialization document for FAISS index setup',
          metadata: { isDummy: true, id: 'faiss-init-doc', __isTemporary: true },
        });

        this.store = await FaissStore.fromDocuments([dummyDoc], this.embeddings);
        await this.removeDocumentsByFilter(metadata => metadata.__isTemporary === true);
        
        console.log('✅ FAISS index initialized successfully');
      } catch (error) {
        console.error('❌ Failed to lazy initialize FAISS index:', error);
        throw error;
      }
    }
  }

  /**
   * 문서 추가 (최적화된 배치 처리)
   */
  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FAISS vector store not initialized');
    }

    // 지연 초기화 수행
    await this.ensureStoreInitialized();

    if (documents.length === 0) {
      return;
    }

    try {
      console.log(`📥 Adding ${documents.length} documents to FAISS index...`);
      const startTime = Date.now();

      // VectorDocument를 LangChain Document로 변환 (메모리 효율적)
      const langchainDocs = documents.map(doc => new Document({
        pageContent: doc.content,
        metadata: { ...doc.metadata, id: doc.id },
      }));

      // 대용량 배치의 경우 청크 단위로 처리
      const chunkSize = 50; // 메모리 사용량 제한
      if (!this.store) {
        throw new Error('Vector store not initialized. Call initialize() first.');
      }

      if (documents.length > chunkSize) {
        for (let i = 0; i < langchainDocs.length; i += chunkSize) {
          const chunk = langchainDocs.slice(i, i + chunkSize);
          await this.store.addDocuments(chunk);
          console.log(`   📊 Processed ${Math.min(i + chunkSize, langchainDocs.length)}/${langchainDocs.length} documents`);
        }
      } else {
        await this.store.addDocuments(langchainDocs);
      }

      // 문서 ID 매핑 업데이트 (배치로 처리)
      const mappingUpdates = new Map<string, number>();
      documents.forEach((doc, index) => {
        const faissIndex = this.nextIndex + index;
        mappingUpdates.set(doc.id, faissIndex);
        this.indexDocumentMap.set(faissIndex, doc.id);
      });
      
      // 매핑을 한번에 업데이트
      for (const [docId, faissIndex] of mappingUpdates) {
        this.documentIdMap.set(docId, faissIndex);
      }
      this.nextIndex += documents.length;

      // 인덱스 저장 (비동기로 처리하여 성능 향상)
      await this.saveIndex();

      const duration = Date.now() - startTime;
      console.log(`✅ Successfully added ${documents.length} documents in ${duration}ms`);
    } catch (error) {
      console.error('❌ Error adding documents to FAISS index:', error);
      throw error;
    }
  }

  /**
   * 파일 ID로 문서들 제거
   */
  async removeDocumentsByFileId(fileId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FAISS vector store not initialized');
    }

    // 스토어가 아직 생성되지 않은 경우 제거할 것이 없음
    if (!this.store) {
      console.log(`📋 No vector store exists yet, skipping removal for file ${fileId}`);
      return;
    }

    try {
      const removedCount = await this.removeDocumentsByFilter(
        metadata => metadata.fileId === fileId
      );
      
      if (removedCount > 0) {
        await this.saveIndex();
        console.log(`Removed ${removedCount} documents for file ${fileId}`);
      }
    } catch (error) {
      console.error(`Error removing documents for file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * 필터 조건으로 문서들 제거
   */
  private async removeDocumentsByFilter(filter: (metadata: any) => boolean): Promise<number> {
    if (!this.store) return 0;

    const documentsToRemove: string[] = [];
    
    // 제거할 문서들 찾기
    for (const [docId, faissIndex] of this.documentIdMap.entries()) {
      try {
        const doc = this.store.docstore.search(faissIndex.toString());
        if (doc && filter(doc.metadata)) {
          documentsToRemove.push(docId);
        }
      } catch (error) {
        // Document not found at this index, skip
        console.warn(`Document not found at index ${faissIndex} for docId ${docId}, skipping`);
        // Remove the invalid mapping
        this.documentIdMap.delete(docId);
        this.indexDocumentMap.delete(faissIndex);
      }
    }

    // 실제 제거는 새 인덱스를 만들어서 처리 (FAISS는 직접 삭제 지원 안함)
    if (documentsToRemove.length > 0) {
      await this.rebuildIndexWithoutDocuments(documentsToRemove);
    }

    return documentsToRemove.length;
  }

  /**
   * 특정 문서들을 제외하고 인덱스 재구성
   */
  private async rebuildIndexWithoutDocuments(documentsToRemove: string[]): Promise<void> {
    if (!this.store) return;

    const removeSet = new Set(documentsToRemove);
    const keepDocuments: Document[] = [];

    // 유지할 문서들 수집
    for (const [docId, faissIndex] of this.documentIdMap.entries()) {
      if (!removeSet.has(docId)) {
        try {
          const doc = this.store.docstore.search(faissIndex.toString());
          if (doc) {
            keepDocuments.push(doc);
          }
        } catch (error) {
          // Document not found at this index, skip
          console.warn(`Document not found at index ${faissIndex} for docId ${docId}, skipping`);
        }
      }
    }

    // 새 인덱스 생성
    if (keepDocuments.length > 0) {
      this.store = await FaissStore.fromDocuments(keepDocuments, this.embeddings);
    } else {
      await this.createEmptyIndex();
    }

    // 매핑 재구성
    await this.rebuildDocumentMappings();
  }

  /**
   * 유사도 검색
   */
  async search(query: string, options: SearchOptions = {}): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('FAISS vector store not initialized');
    }

    // 지연 초기화 확인 (검색 시에는 스토어가 없으면 빈 결과 반환)
    if (!this.store) {
      console.log('📋 No documents indexed yet, returning empty results');
      return [];
    }

    const { topK = this.config.similarityTopK, filter, scoreThreshold } = options;

    try {
      const results = await this.store.similaritySearchWithScore(query, topK);

      let searchResults: VectorSearchResult[] = results.map(([doc, score], index) => {
        // FAISS는 거리를 반환 (낮을수록 유사) -> 유사도로 변환
        // cosine distance는 보통 0-2 범위, L2 distance는 더 클 수 있음
        let similarity;
        if (score <= 1) {
          // cosine distance의 경우
          similarity = 1 - score;
        } else {
          // L2 distance 등의 경우 정규화
          similarity = 1 / (1 + score);
        }
        
        return {
          id: doc.metadata.id || `result-${index}`,
          content: doc.pageContent,
          metadata: doc.metadata,
          score: Math.max(0, Math.min(1, similarity)), // 0-1 범위로 클램핑
        };
      });

      // 더미/초기화 문서 필터링
      searchResults = searchResults.filter(result => 
        !result.metadata.isDummy && 
        !result.metadata.__isTemporary &&
        !result.content.includes('initialization document for FAISS index setup')
      );

      // 필터 적용
      if (filter) {
        searchResults = searchResults.filter(result => filter(result.metadata));
      }

      // 스코어 임계값 적용 (임계값이 너무 높으면 경고)
      if (scoreThreshold !== undefined) {
        const beforeCount = searchResults.length;
        searchResults = searchResults.filter(result => result.score >= scoreThreshold);
        const afterCount = searchResults.length;
        
        if (beforeCount > 0 && afterCount === 0 && scoreThreshold > 0.5) {
          console.warn(`⚠️  Score threshold ${scoreThreshold} filtered out all ${beforeCount} results. Consider lowering it.`);
          console.log(`   📊 Score range: ${Math.min(...results.map(([, s]) => s)).toFixed(4)} - ${Math.max(...results.map(([, s]) => s)).toFixed(4)}`);
        }
      }

      // 스코어 순으로 정렬
      searchResults.sort((a, b) => b.score - a.score);

      return searchResults.slice(0, topK);
    } catch (error) {
      console.error('Error during FAISS search:', error);
      throw error;
    }
  }

  /**
   * 인덱스 저장
   */
  async saveIndex(): Promise<void> {
    if (!this.store) return;

    try {
      await this.store.save(this.indexPath);
    } catch (error) {
      console.error('Error saving FAISS index:', error);
      throw error;
    }
  }

  /**
   * 인덱스 정보 반환
   */
  getIndexInfo(): { documentCount: number; indexPath: string; isInitialized: boolean } {
    return {
      documentCount: this.store?.index?.ntotal() || 0,
      indexPath: this.indexPath,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * 헬스 체크
   */
  isHealthy(): boolean {
    return this.isInitialized && this.store !== null;
  }

  /**
   * 전체 인덱스 재구성
   */
  async rebuildIndex(): Promise<void> {
    console.log('Rebuilding FAISS index...');
    
    // 기존 인덱스 초기화
    this.store = null;
    this.documentIdMap.clear();
    this.indexDocumentMap.clear();
    this.nextIndex = 0;
    this.isInitialized = false;

    // 새로 초기화
    await this.initialize();
    
    console.log('FAISS index rebuilt successfully');
  }
}