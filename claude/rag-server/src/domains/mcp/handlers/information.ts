import { VectorStoreProvider } from '@/domains/rag/integrations/vectorstores/adapter.js'
import { ServerConfig } from '@/shared/config/config-factory.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'

export interface ListSourcesArgs {
  include_stats?: boolean
  source_type_filter?: string[]
  group_by?: 'source_type' | 'file_type'
  limit?: number
}

export class InformationHandler {
  constructor(private vectorStoreProvider: VectorStoreProvider, private config: ServerConfig) {}

  async handleListSources(args: ListSourcesArgs = {}) {
    const { include_stats = false, source_type_filter, group_by, limit = 100 } = args

    try {
      // Get sources from VectorStore metadata
      const sources = await this.extractSourcesFromVectorStore(source_type_filter, limit)

      let responseData: any
      if (group_by) {
        const groupedSources = this.groupSources(sources, group_by)
        responseData = {
          total_sources: sources.length,
          grouped_sources: groupedSources,
          group_by,
          stats: include_stats ? await this.calculateSourceStats(sources) : undefined,
        }
      } else {
        responseData = {
          total_sources: sources.length,
          sources: sources.slice(0, limit),
          stats: include_stats ? await this.calculateSourceStats(sources) : undefined,
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2),
          },
        ],
      }
    } catch (error) {
      logger.error('List sources failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'ListSourcesFailed',
                message: error instanceof Error ? error.message : 'Failed to list sources',
                suggestion: 'VectorStore-only architecture - use search functionality instead',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      }
    }
  }

  getTools(): Tool[] {
    return [
      {
        name: 'list_sources',
        description:
          'List all available data sources and documents in the RAG system with filtering and grouping options',
        inputSchema: {
          type: 'object',
          properties: {
            include_stats: {
              type: 'boolean',
              description: 'Include detailed statistics about the document collection',
              default: false,
            },
            source_type_filter: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Filter by source types (e.g., ["local_file", "file_upload", "url_crawl"])',
            },
            group_by: {
              type: 'string',
              enum: ['source_type', 'file_type'],
              description: 'Group results by source type or file type',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of sources to return',
              default: 100,
              minimum: 1,
              maximum: 1000,
            },
          },
          required: [],
        },
      },
    ]
  }

  /**
   * Extract sources from VectorStore metadata
   */
  private async extractSourcesFromVectorStore(
    typeFilter?: string[],
    limit: number = 100
  ): Promise<any[]> {
    try {
      // Use getAllFileMetadata if available for efficiency (preferred method)
      if (this.vectorStoreProvider.getAllFileMetadata) {
        logger.debug('Using getAllFileMetadata for efficient source extraction')
        const fileMetadataMap = await this.vectorStoreProvider.getAllFileMetadata()

        const sources: any[] = []
        for (const [, metadata] of fileMetadataMap) {
          const fileType = metadata.fileType || this.guessFileType(metadata.fileName || '')

          // Apply type filter if specified
          if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(fileType)) {
            continue
          }

          sources.push({
            name: metadata.fileName || 'unknown',
            path: metadata.filePath || metadata.fileName || 'unknown',
            file_type: fileType,
            source_type: metadata.sourceType || 'local_file',
            size: metadata.size || 0,
            created_at: metadata.createdAt || new Date().toISOString(),
            updated_at: metadata.processedAt || metadata.updatedAt || new Date().toISOString(),
            chunk_count: 1, // Will be calculated later if needed
            vector_count: 1, // Will be calculated later if needed
          })
        }

        return sources.slice(0, limit)
      }

      // Fallback: Try wildcard search first (original approach)
      logger.debug('Using wildcard search fallback for source extraction')
      try {
        const sampleResults = await this.vectorStoreProvider.search('*', {
          topK: Math.min(limit * 2, 200), // Get more to account for filtering
          scoreThreshold: 0.0, // Get any documents
        })

        const sourceMap = new Map<string, any>()

        for (const result of sampleResults) {
          const metadata = result.metadata || {}
          const fileName = metadata.fileName || metadata.name || 'unknown'
          const filePath = metadata.filePath || metadata.path || fileName
          const fileType = metadata.fileType || this.guessFileType(fileName)

          // Apply type filter if specified
          if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(fileType)) {
            continue
          }

          const sourceKey = filePath
          if (!sourceMap.has(sourceKey)) {
            sourceMap.set(sourceKey, {
              name: fileName,
              path: filePath,
              file_type: fileType,
              source_type: metadata.sourceType || 'local_file',
              size: metadata.size || 0,
              created_at: metadata.createdAt || metadata.addedAt || new Date().toISOString(),
              updated_at: metadata.updatedAt || metadata.lastModified || new Date().toISOString(),
              chunk_count: 1,
              vector_count: 1,
            })
          } else {
            // Increment counts for duplicate sources
            const source = sourceMap.get(sourceKey)!
            source.chunk_count += 1
            source.vector_count += 1
          }
        }

        if (sourceMap.size > 0) {
          logger.debug(`Wildcard search found ${sourceMap.size} unique sources`)
          return Array.from(sourceMap.values()).slice(0, limit)
        }
      } catch (wildcardError) {
        logger.debug('Wildcard search failed, trying alternative sampling', {
          error: wildcardError instanceof Error ? wildcardError.message : String(wildcardError),
        })
      }

      // Final fallback: use multiple sample queries
      logger.debug('Using multiple sample queries as final fallback')
      const sampleQueries = ['document', 'file', 'text', 'content', 'data'] // Common terms
      const sourceMap = new Map<string, any>()

      for (const query of sampleQueries) {
        try {
          const results = await this.vectorStoreProvider.search(query, {
            topK: Math.min(50, limit), // Small sample per query
            scoreThreshold: 0.0,
          })

          for (const result of results) {
            const metadata = result.metadata || {}
            const fileName = metadata.fileName || metadata.name || 'unknown'
            const filePath = metadata.filePath || metadata.path || fileName
            const fileType = metadata.fileType || this.guessFileType(fileName)

            // Apply type filter if specified
            if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(fileType)) {
              continue
            }

            const sourceKey = filePath
            if (!sourceMap.has(sourceKey)) {
              sourceMap.set(sourceKey, {
                name: fileName,
                path: filePath,
                file_type: fileType,
                source_type: metadata.sourceType || 'local_file',
                size: metadata.size || 0,
                created_at: metadata.createdAt || metadata.addedAt || new Date().toISOString(),
                updated_at: metadata.updatedAt || metadata.lastModified || new Date().toISOString(),
                chunk_count: 1,
                vector_count: 1,
              })
            } else {
              // Increment counts for duplicate sources
              const source = sourceMap.get(sourceKey)!
              source.chunk_count += 1
              source.vector_count += 1
            }
          }
        } catch (queryError) {
          logger.debug(`Sample query '${query}' failed, continuing with others`, {
            error: queryError instanceof Error ? queryError.message : String(queryError),
          })
          continue
        }

        // Stop early if we have enough sources
        if (sourceMap.size >= limit) break
      }

      return Array.from(sourceMap.values()).slice(0, limit)
    } catch (error) {
      logger.warn(
        'Failed to extract sources from VectorStore',
        error instanceof Error ? error : new Error(String(error))
      )
      return []
    }
  }

  /**
   * Group sources by specified criteria
   */
  private groupSources(
    sources: any[],
    groupBy: 'source_type' | 'file_type'
  ): Record<string, any[]> {
    const grouped: Record<string, any[]> = {}

    for (const source of sources) {
      const key = groupBy === 'source_type' ? source.source_type : source.file_type
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(source)
    }

    return grouped
  }

  /**
   * Calculate statistics for sources
   */
  private async calculateSourceStats(sources: any[]): Promise<any> {
    const indexInfo = this.vectorStoreProvider.getIndexInfo()

    const stats = {
      total_files: sources.length,
      total_chunks: sources.reduce((sum, s) => sum + (s.chunk_count || 0), 0),
      total_vectors:
        indexInfo.totalVectors || sources.reduce((sum, s) => sum + (s.vector_count || 0), 0),
      file_types: {} as Record<string, number>,
      source_types: {} as Record<string, number>,
      size_distribution: {
        small: 0, // < 10KB
        medium: 0, // 10KB - 100KB
        large: 0, // > 100KB
      },
    }

    for (const source of sources) {
      // Count file types
      const fileType = source.file_type || 'unknown'
      stats.file_types[fileType] = (stats.file_types[fileType] || 0) + 1

      // Count source types
      const sourceType = source.source_type || 'unknown'
      stats.source_types[sourceType] = (stats.source_types[sourceType] || 0) + 1

      // Size distribution
      const size = source.size || 0
      if (size < 10000) stats.size_distribution.small += 1
      else if (size < 100000) stats.size_distribution.medium += 1
      else stats.size_distribution.large += 1
    }

    return stats
  }

  /**
   * Guess file type from filename
   */
  private guessFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || ''

    const typeMap: Record<string, string> = {
      txt: 'text',
      md: 'markdown',
      pdf: 'pdf',
      doc: 'document',
      docx: 'document',
      json: 'json',
      csv: 'csv',
      html: 'html',
      htm: 'html',
      xml: 'xml',
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      go: 'go',
      rs: 'rust',
    }

    return typeMap[ext] || ext || 'unknown'
  }
}
