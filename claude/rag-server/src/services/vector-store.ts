import { ChromaClient, OpenAIEmbeddingFunction, Collection } from 'chromadb';
import { ServerConfig } from '../types/index.js';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    fileId: string;
    fileName: string;
    chunkIndex: number;
    fileType: string;
    createdAt: string;
    sqliteId: string;
    filePath: string;
    [key: string]: any;
  };
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
}

export class ChromaVectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingFunction: OpenAIEmbeddingFunction | null = null;
  private config: ServerConfig;
  private isInitialized = false;

  constructor(config: ServerConfig) {
    this.config = config;
    this.client = new ChromaClient({
      path: config.chromaServerUrl,
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log(`Connecting to ChromaDB at ${this.config.chromaServerUrl}...`);
      
      // Test connection
      const version = await this.client.version();
      console.log(`Connected to ChromaDB version: ${version}`);

      // Initialize embedding function if OpenAI API key is available
      if (this.config.openaiApiKey) {
        console.log('Initializing OpenAI embedding function...');
        this.embeddingFunction = new OpenAIEmbeddingFunction({
          openai_api_key: this.config.openaiApiKey,
          openai_model: this.config.embeddingModel,
        });
      } else {
        console.log('No OpenAI API key found, using default embedding function');
        this.embeddingFunction = new OpenAIEmbeddingFunction({
          openai_api_key: 'placeholder', // ChromaDB requires this field
          openai_model: this.config.embeddingModel,
        });
      }

      // Get or create collection
      try {
        console.log(`Getting collection: ${this.config.chromaCollectionName}`);
        this.collection = await this.client.getCollection({
          name: this.config.chromaCollectionName,
          embeddingFunction: this.embeddingFunction,
        });
        console.log('Existing collection found');
      } catch (error) {
        console.log('Collection not found, creating new collection...');
        this.collection = await this.client.createCollection({
          name: this.config.chromaCollectionName,
          embeddingFunction: this.embeddingFunction,
          metadata: {
            description: 'RAG documents collection',
            created_at: new Date().toISOString(),
          },
        });
        console.log('New collection created');
      }

      this.isInitialized = true;
      console.log('ChromaDB Vector Store initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ChromaDB Vector Store:', error);
      throw error;
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    if (documents.length === 0) {
      return;
    }

    try {
      const ids = documents.map(doc => doc.id);
      const contents = documents.map(doc => doc.content);
      const metadatas = documents.map(doc => doc.metadata);

      await this.collection.add({
        ids,
        documents: contents,
        metadatas,
      });

      console.log(`Added ${documents.length} documents to ChromaDB collection`);
    } catch (error) {
      console.error('Error adding documents to ChromaDB:', error);
      throw error;
    }
  }

  async updateDocument(document: VectorDocument): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    try {
      await this.collection.upsert({
        ids: [document.id],
        documents: [document.content],
        metadatas: [document.metadata],
      });

      console.log(`Updated document ${document.id} in ChromaDB collection`);
    } catch (error) {
      console.error('Error updating document in ChromaDB:', error);
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    if (ids.length === 0) {
      return;
    }

    try {
      await this.collection.delete({
        ids,
      });

      console.log(`Deleted ${ids.length} documents from ChromaDB collection`);
    } catch (error) {
      console.error('Error deleting documents from ChromaDB:', error);
      throw error;
    }
  }

  async deleteDocumentsByFileId(fileId: string): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    try {
      await this.collection.delete({
        where: { fileId },
      });

      console.log(`Deleted all documents for file ${fileId} from ChromaDB collection`);
    } catch (error) {
      console.error('Error deleting documents by fileId from ChromaDB:', error);
      throw error;
    }
  }

  async search(
    query: string,
    options: {
      topK?: number;
      where?: Record<string, any>;
      whereDocument?: Record<string, any>;
    } = {}
  ): Promise<VectorSearchResult[]> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    const { topK = this.config.similarityTopK, where, whereDocument } = options;

    try {
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: topK,
        where,
        whereDocument,
      });

      if (!results.ids || !results.ids[0] || !results.documents || !results.documents[0]) {
        return [];
      }

      const searchResults: VectorSearchResult[] = [];
      const ids = results.ids[0];
      const documents = results.documents[0];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const score = distances[i] !== undefined ? 1 - distances[i] : 0.5; // Convert distance to similarity score

        searchResults.push({
          id: ids[i],
          content: documents[i] || '',
          metadata: metadatas[i] || {},
          score: Math.max(0, Math.min(1, score)), // Ensure score is between 0 and 1
        });
      }

      return searchResults;
    } catch (error) {
      console.error('Error searching ChromaDB collection:', error);
      throw error;
    }
  }

  async getCollectionInfo(): Promise<{
    name: string;
    count: number;
    metadata?: any;
  }> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    try {
      const count = await this.collection.count();
      
      return {
        name: this.config.chromaCollectionName,
        count,
        metadata: { 
          type: 'chromadb',
          server: this.config.chromaServerUrl,
          embeddingModel: this.config.embeddingModel,
        },
      };
    } catch (error) {
      console.error('Error getting collection info from ChromaDB:', error);
      throw error;
    }
  }

  async clearCollection(): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('ChromaDB Vector Store not initialized');
    }

    try {
      // Delete the collection and recreate it
      await this.client.deleteCollection({ name: this.config.chromaCollectionName });
      
      this.collection = await this.client.createCollection({
        name: this.config.chromaCollectionName,
        embeddingFunction: this.embeddingFunction!,
        metadata: {
          description: 'RAG documents collection',
          created_at: new Date().toISOString(),
        },
      });

      console.log('ChromaDB collection cleared and recreated');
    } catch (error) {
      console.error('Error clearing ChromaDB collection:', error);
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.isInitialized || !this.collection) {
        return false;
      }
      
      await this.client.version();
      await this.collection.count();
      return true;
    } catch (error) {
      console.warn('ChromaDB health check failed:', error);
      return false;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.collection !== null;
  }
}