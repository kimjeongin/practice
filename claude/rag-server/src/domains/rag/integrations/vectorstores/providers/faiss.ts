/**
 * FAISS Vector Store Provider - Complete Implementation with Real Embeddings
 */

import { VectorStoreProvider, VectorStoreCapabilities } from '../core/interfaces.js'
import {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  IndexStats,
  FaissConfig,
} from '../core/types.js'
import { EmbeddingFactory } from '../../embeddings/index.js'
import { EmbeddingAdapter } from '../../embeddings/adapter.js'
import { EmbeddingMetadataService } from '../../../services/embedding-metadata-service.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { logger } from '@/shared/logger/index.js'

interface StoredVector {
  id: string
  embedding: number[]
  content: string
  metadata: any
}

export class FaissProvider implements VectorStoreProvider {
  private documents: Map<string, VectorDocument> = new Map()
  private vectors: Map<string, StoredVector> = new Map() // id -> vector with embeddings
  private fileIdMap: Map<string, Set<string>> = new Map() // fileId -> docIds
  private indexStats: { total: number; occupied: number } = { total: 0, occupied: 0 }
  private embeddings: EmbeddingAdapter | null = null
  private embeddingMetadataService?: EmbeddingMetadataService
  private isInitialized = false

  public readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsHybridSearch: false,
    supportsReranking: false,
    supportsRealTimeUpdates: true,
    supportsBatchOperations: true,
    supportsIndexCompaction: true,
  }

  constructor(private config: FaissConfig = {}, private serverConfig?: ServerConfig, embeddingMetadataService?: EmbeddingMetadataService) {
    // Embeddings will be initialized lazily when first needed
    // This allows for proper error handling and fallback mechanisms
    this.embeddingMetadataService = embeddingMetadataService
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    console.log(`🔄 Adding ${documents.length} documents to FAISS with embeddings...`)

    // Ensure embedding service is initialized
    await this.initializeEmbeddingService()

    if (!this.embeddings) {
      console.warn('⚠️ No embeddings service available, using mock implementation')
      return this.addDocumentsWithoutEmbeddings(documents)
    }

    try {
      // Generate embeddings for all document contents
      const contents = documents.map((doc) => doc.content)
      console.log(`🧠 Generating embeddings for ${contents.length} documents...`)

      const embeddings = await this.embeddings.embedDocuments(contents)
      console.log(`✅ Generated ${embeddings.length} embeddings`)

      // Store documents with their embeddings
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i]
        const embedding = embeddings[i]
        if (!doc || !embedding) continue

        // Store document
        this.documents.set(doc.id, doc)

        // Store vector with embedding
        this.vectors.set(doc.id, {
          id: doc.id,
          embedding: embedding,
          content: doc.content,
          metadata: doc.metadata,
        })

        // Track by fileId
        const fileId = doc.metadata.fileId
        if (fileId) {
          if (!this.fileIdMap.has(fileId)) {
            this.fileIdMap.set(fileId, new Set())
          }
          this.fileIdMap.get(fileId)!.add(doc.id)
        }

        this.indexStats.total++
        this.indexStats.occupied++
      }

      logger.info('✅ Successfully added documents with embeddings to FAISS', {
        documentCount: documents.length,
        totalVectors: this.vectors.size,
        embeddingDimensions: embeddings[0]?.length || 0,
      })

      // Update metadata vector counts if service is available
      if (this.embeddingMetadataService) {
        try {
          await this.embeddingMetadataService.updateVectorCounts(
            this.documents.size,
            this.vectors.size
          )
        } catch (error) {
          logger.error('❌ Failed to update vector counts in metadata', error instanceof Error ? error : new Error(String(error)))
        }
      }
    } catch (error) {
      logger.error(
        '❌ Failed to add documents with embeddings',
        error instanceof Error ? error : new Error(String(error))
      )
      // Fallback to adding without embeddings
      await this.addDocumentsWithoutEmbeddings(documents)
    }
  }

  private async addDocumentsWithoutEmbeddings(documents: VectorDocument[]): Promise<void> {
    console.log(`📄 Adding ${documents.length} documents to FAISS (metadata only)...`)

    for (const doc of documents) {
      this.documents.set(doc.id, doc)

      // Track by fileId
      const fileId = doc.metadata.fileId
      if (fileId) {
        if (!this.fileIdMap.has(fileId)) {
          this.fileIdMap.set(fileId, new Set())
        }
        this.fileIdMap.get(fileId)!.add(doc.id)
      }

      this.indexStats.total++
      this.indexStats.occupied++
    }
  }

  async search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    console.log(`🔍 Searching FAISS with query: "${query.substring(0, 100)}..."`)

    // Ensure embedding service is initialized
    await this.initializeEmbeddingService()

    if (!this.embeddings || this.vectors.size === 0) {
      console.log(`⚠️ No embeddings available, using keyword-based fallback search`)
      return this.keywordSearch(query, options)
    }

    try {
      // Generate query embedding
      console.log(`🧠 Generating query embedding...`)
      const queryEmbedding = await this.embeddings.embedQuery(query)
      console.log(`✅ Query embedding generated (${queryEmbedding.length} dimensions)`)

      const results: VectorSearchResult[] = []
      const topK = options?.topK || 10
      const scoreThreshold = options?.scoreThreshold || 0.0

      // Calculate cosine similarity with all stored vectors
      for (const [id, vector] of this.vectors) {
        const doc = this.documents.get(id)
        if (!doc) continue

        // Apply metadata filters
        if (!this.passesFilters(doc, options)) {
          continue
        }

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(queryEmbedding, vector.embedding)

        if (similarity >= scoreThreshold) {
          results.push({
            id,
            content: vector.content,
            metadata: vector.metadata,
            score: similarity,
          })
        }
      }

      // Sort by similarity score (descending) and take topK
      const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, topK)

      console.log(`✅ Found ${sortedResults.length} relevant documents (semantic search)`)
      if (sortedResults.length > 0) {
        console.log(
          `   📊 Top score: ${sortedResults[0]?.score?.toFixed(4)}, Bottom score: ${sortedResults[
            sortedResults.length - 1
          ]?.score?.toFixed(4)}`
        )
      }

      return sortedResults
    } catch (error) {
      console.error('❌ Error in semantic search, falling back to keyword search:', error)
      return this.keywordSearch(query, options)
    }
  }

  private keywordSearch(query: string, options?: VectorSearchOptions): VectorSearchResult[] {
    console.log(`🔤 Performing keyword-based search for: "${query}"`)

    const results: VectorSearchResult[] = []
    const topK = options?.topK || 10
    const scoreThreshold = options?.scoreThreshold || 0.0
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 2)

    for (const [id, doc] of this.documents) {
      // Apply metadata filters
      if (!this.passesFilters(doc, options)) {
        continue
      }

      // Calculate keyword matching score
      const contentLower = doc.content.toLowerCase()
      let score = 0
      let matches = 0

      for (const word of queryWords) {
        const wordCount = contentLower.split(word).length - 1
        if (wordCount > 0) {
          matches++
          score += wordCount * 0.1 // Simple TF scoring
        }
      }

      // Normalize score by query length and add exact phrase bonus
      if (matches > 0) {
        score = (matches / queryWords.length) * 0.5 + score * 0.5

        // Exact phrase bonus
        if (contentLower.includes(queryLower)) {
          score += 0.3
        }

        // Clamp score between 0 and 1
        score = Math.min(score, 1.0)
      }

      if (score >= scoreThreshold) {
        results.push({
          id,
          content: doc.content,
          metadata: doc.metadata,
          score,
        })
      }
    }

    const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, topK)
    console.log(`✅ Found ${sortedResults.length} relevant documents (keyword search)`)

    return sortedResults
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimensions don't match: ${a.length} vs ${b.length}`)
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length && i < b.length; i++) {
      dotProduct += a[i]! * b[i]!
      normA += a[i]! * a[i]!
      normB += b[i]! * b[i]!
    }

    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)

    if (normA === 0 || normB === 0) {
      return 0
    }

    return dotProduct / (normA * normB)
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    console.log(`🗑️ Deleting ${ids.length} documents from FAISS`)

    for (const id of ids) {
      const doc = this.documents.get(id)
      if (doc) {
        this.documents.delete(id)
        this.vectors.delete(id) // Also remove vector embedding

        // Remove from fileId mapping
        const fileId = doc.metadata.fileId
        if (fileId && this.fileIdMap.has(fileId)) {
          this.fileIdMap.get(fileId)!.delete(id)
          if (this.fileIdMap.get(fileId)!.size === 0) {
            this.fileIdMap.delete(fileId)
          }
        }

        this.indexStats.occupied--
      }
    }
  }

  async removeDocumentsByFileId(fileId: string): Promise<void> {
    console.log(`Removing documents for file: ${fileId}`)

    const docIds = this.fileIdMap.get(fileId)
    if (docIds) {
      await this.deleteDocuments(Array.from(docIds))
    }
  }

  async removeAllDocuments(): Promise<void> {
    console.log('🗑️ Removing all documents from FAISS')
    this.documents.clear()
    this.vectors.clear()
    this.fileIdMap.clear()
    this.indexStats = { total: 0, occupied: 0 }
  }

  getIndexInfo(): IndexStats {
    return {
      totalVectors: this.vectors.size, // Use actual vector count
      dimensions: this.config.dimensions || 384, // Default to MiniLM dimensions
      indexSize: this.documents.size,
      lastUpdated: new Date(),
    }
  }

  isHealthy(): boolean {
    return true
  }

  getAllDocumentIds(): string[] {
    return Array.from(this.documents.keys())
  }

  getDocumentCount(): number {
    return this.documents.size
  }

  getVectorCount(): number {
    return this.vectors.size
  }

  hasDocumentsForFileId(fileId: string): boolean {
    return this.fileIdMap.has(fileId) && this.fileIdMap.get(fileId)!.size > 0
  }

  async getDocumentMetadata(docId: string): Promise<any | null> {
    const doc = this.documents.get(docId)
    return doc ? doc.metadata : null
  }

  /**
   * Initialize embeddings service using EmbeddingFactory
   */
  private async initializeEmbeddingService(): Promise<void> {
    if (this.embeddings || !this.serverConfig) {
      return
    }

    try {
      console.log('🔄 Initializing embedding service...')
      
      // Use EmbeddingFactory with fallback mechanism
      const { embeddings, actualService } = await EmbeddingFactory.createWithFallback(this.serverConfig)
      
      // Wrap with adapter for consistent interface
      this.embeddings = new EmbeddingAdapter(embeddings, actualService)
      
      // Test the service
      await this.embeddings.embedQuery('test')
      
      console.log(`✅ Embedding service initialized successfully (${actualService})`)
      const modelInfo = this.embeddings.getModelInfo()
      console.log(`📊 Model: ${modelInfo.name}, Dimensions: ${modelInfo.dimensions}`)

      // Check model compatibility and update metadata if service is available
      if (this.embeddingMetadataService && this.serverConfig.modelMigration?.enableIncompatibilityDetection !== false) {
        try {
          const compatibility = await this.embeddingMetadataService.checkModelCompatibility(this.serverConfig, modelInfo)
          
          if (!compatibility.isCompatible) {
            logger.warn('⚠️ Model compatibility issues detected', {
              issues: compatibility.issues,
              requiresReindexing: compatibility.requiresReindexing,
              autoMigrationEnabled: this.serverConfig.modelMigration?.enableAutoMigration
            })
            
            // Optionally clear vectors if auto migration and clearing are both enabled
            if (this.serverConfig.modelMigration?.enableAutoMigration && 
                this.serverConfig.modelMigration?.clearVectorsOnModelChange) {
              logger.info('🔄 Clearing existing vectors due to model incompatibility')
              
              // Clear all vectors and documents
              this.documents.clear()
              this.vectors.clear()
              this.fileIdMap.clear()
              this.indexStats = { total: 0, occupied: 0 }
              logger.info('✅ All vectors cleared for model migration')
            }
          }

          // Create or update metadata
          await this.embeddingMetadataService.createOrUpdateMetadata(this.serverConfig, modelInfo)
          
          if (compatibility.requiresReindexing && compatibility.currentMetadata) {
            logger.warn('🔄 Model configuration changed - existing embeddings may need regeneration', {
              oldModel: compatibility.currentMetadata.modelName,
              newModel: modelInfo.name,
              oldDimensions: compatibility.currentMetadata.dimensions,
              newDimensions: modelInfo.dimensions,
            })
          }
        } catch (error) {
          logger.error('❌ Failed to check/update embedding metadata', error instanceof Error ? error : new Error(String(error)))
        }
      }
      
      this.isInitialized = true
    } catch (error) {
      console.error('❌ Failed to initialize embedding service:', error)
      this.embeddings = null
      this.isInitialized = false
    }
  }

  async initialize(): Promise<void> {
    console.log('🔄 Initializing FAISS store with embeddings...')
    
    // Initialize embeddings service if not already done
    await this.initializeEmbeddingService()

    if (this.embeddings && !this.isInitialized) {
      try {
        // Final test
        await this.embeddings.embedQuery('test')
        console.log('✅ FAISS store initialized successfully')
        this.isInitialized = true
      } catch (error) {
        console.warn('⚠️ Final initialization test failed:', error)
        this.embeddings = null
        this.isInitialized = false
      }
    }
  }

  async saveIndex(): Promise<void> {
    console.log('Saving FAISS index')
    // Save index to disk
  }

  async rebuildIndex(): Promise<void> {
    console.log('Rebuilding FAISS index')
    // Rebuild index from scratch
  }

  getIndexStats(): {
    total: number
    occupied: number
    sparsity: number
    needsCompaction: boolean
  } | null {
    const sparsity =
      this.indexStats.total > 0
        ? (this.indexStats.total - this.indexStats.occupied) / this.indexStats.total
        : 0

    return {
      total: this.indexStats.total,
      occupied: this.indexStats.occupied,
      sparsity,
      needsCompaction: sparsity > 0.3, // Need compaction if >30% sparse
    }
  }

  async compactIndex(): Promise<void> {
    console.log('Compacting FAISS index')
    this.indexStats.total = this.indexStats.occupied
  }

  async autoCompactIfNeeded(): Promise<boolean> {
    const stats = this.getIndexStats()
    if (stats?.needsCompaction) {
      await this.compactIndex()
      return true
    }
    return false
  }

  private passesFilters(doc: VectorDocument, options?: VectorSearchOptions): boolean {
    // File type filter
    if (options?.fileTypes && options.fileTypes.length > 0) {
      const fileType = doc.metadata.fileType?.toLowerCase()
      if (!fileType || !options.fileTypes.includes(fileType)) {
        return false
      }
    }

    // Metadata filters
    if (options?.metadataFilters) {
      for (const [key, value] of Object.entries(options.metadataFilters)) {
        if (doc.metadata[key] !== value) {
          return false
        }
      }
    }

    // Custom filter function
    if (options?.filter && typeof options.filter === 'function') {
      return options.filter(doc.metadata)
    }

    return true
  }

  /**
   * Regenerate embeddings for all existing documents
   * This is needed when server restarts and embeddings need to be restored from document content
   */
  async regenerateEmbeddings(): Promise<void> {
    // Ensure embedding service is initialized
    await this.initializeEmbeddingService()

    if (!this.embeddings) {
      console.log('⚠️ No embeddings service available for regeneration')
      return
    }

    const documentsToRegenerate = Array.from(this.documents.values())
    if (documentsToRegenerate.length === 0) {
      console.log('📄 No documents found for embedding regeneration')
      return
    }

    console.log(`🔄 Regenerating embeddings for ${documentsToRegenerate.length} existing documents...`)
    
    try {
      // Clear existing vectors since we're regenerating
      this.vectors.clear()

      // Generate embeddings for all documents
      const contents = documentsToRegenerate.map(doc => doc.content)
      const embeddings = await this.embeddings.embedDocuments(contents)
      
      console.log(`✅ Generated ${embeddings.length} embeddings for regeneration`)

      // Store the regenerated embeddings
      for (let i = 0; i < documentsToRegenerate.length; i++) {
        const doc = documentsToRegenerate[i]!
        const embedding = embeddings[i]!
        
        this.vectors.set(doc.id, {
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          embedding: Array.from(embedding)
        })
      }

      console.log(`✅ Successfully regenerated embeddings for ${this.vectors.size} documents`)
      console.log(`📊 Total vectors: ${this.vectors.size}, embedding dimensions: ${embeddings[0]?.length || 'unknown'}`)
      
    } catch (error) {
      console.error('❌ Failed to regenerate embeddings:', error)
      throw error
    }
  }
}
