import { IFileRepository } from '@/domains/rag/repositories/document.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ListSourcesArgs {
  include_stats?: boolean;
  source_type_filter?: string[];
  group_by?: 'source_type' | 'file_type';
  limit?: number;
}

export class InformationHandler {
  constructor(private fileRepository: IFileRepository) {}

  async handleListSources(args: ListSourcesArgs = {}) {
    const { 
      include_stats = false, 
      source_type_filter, 
      group_by,
      limit = 100 
    } = args;

    try {
      const allFiles = await this.fileRepository.getAllFiles();

      if (allFiles.length === 0) {
        return {
          total_sources: 0,
          sources: [],
          message: 'No indexed documents found',
          suggestion: 'Add documents to the system using file watching or upload tools'
        };
      }

      // Get metadata for all files to enable filtering and grouping
      const sourcesWithMetadata = await Promise.all(
        allFiles.map(async (file) => {
          const metadata = await this.fileRepository.getFileMetadata(file.id);
          return {
            id: file.id,
            name: file.name,
            path: file.path,
            file_type: file.fileType,
            size: file.size,
            created_at: file.createdAt.toISOString(),
            modified_at: file.modifiedAt.toISOString(),
            indexed_at: file.indexedAt?.toISOString(),
            source_type: metadata.source_type || 'local_file',
            source_method: metadata.source_method || 'file_watcher',
            source_origin: metadata.source_origin || file.path,
            custom_metadata: metadata
          };
        })
      );

      // Apply source_type filtering
      let filteredSources = sourcesWithMetadata;
      if (source_type_filter && source_type_filter.length > 0) {
        filteredSources = sourcesWithMetadata.filter(source => 
          source_type_filter.includes(source.source_type)
        );
      }

      // Apply limit
      const limitedSources = filteredSources.slice(0, limit);

      // Prepare base response
      let response: any = {
        total_sources: filteredSources.length,
        returned_sources: limitedSources.length,
        sources: limitedSources.map(source => ({
          id: source.id,
          name: source.name,
          path: source.path,
          file_type: source.file_type,
          size: source.size,
          source_type: source.source_type,
          source_method: source.source_method,
          created_at: source.created_at,
          indexed_at: source.indexed_at
        }))
      };

      // Add grouping if requested
      if (group_by) {
        const groups: Record<string, any[]> = {};
        filteredSources.forEach(source => {
          const groupKey = group_by === 'source_type' ? source.source_type : source.file_type;
          if (!groups[groupKey]) {
            groups[groupKey] = [];
          }
          groups[groupKey].push(source);
        });

        response.grouped_sources = Object.entries(groups).map(([key, sources]) => ({
          group: key,
          count: sources.length,
          sources: sources.slice(0, limit)
        }));
      }

      // Add statistics if requested
      if (include_stats) {
        const stats = this.calculateStats(filteredSources);
        response.statistics = stats;
      }

      return response;

    } catch (error) {
      return {
        error: 'ListSourcesFailed',
        message: error instanceof Error ? error.message : 'Failed to list sources',
        suggestion: 'Check if the database is properly connected and files are indexed'
      };
    }
  }

  private calculateStats(sources: any[]) {
    const totalSize = sources.reduce((sum, source) => sum + source.size, 0);
    
    const fileTypeStats: Record<string, number> = {};
    const sourceTypeStats: Record<string, number> = {};
    const sourceMethodStats: Record<string, number> = {};

    sources.forEach(source => {
      fileTypeStats[source.file_type] = (fileTypeStats[source.file_type] || 0) + 1;
      sourceTypeStats[source.source_type] = (sourceTypeStats[source.source_type] || 0) + 1;
      sourceMethodStats[source.source_method] = (sourceMethodStats[source.source_method] || 0) + 1;
    });

    return {
      total_documents: sources.length,
      total_size_bytes: totalSize,
      total_size_mb: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      file_types: fileTypeStats,
      source_types: sourceTypeStats,
      source_methods: sourceMethodStats,
      oldest_document: sources.length > 0 ? 
        Math.min(...sources.map(s => new Date(s.created_at).getTime())) : null,
      newest_document: sources.length > 0 ? 
        Math.max(...sources.map(s => new Date(s.created_at).getTime())) : null
    };
  }

  getTools(): Tool[] {
    return [{
      name: 'list_sources',
      description: 'List all available data sources and documents in the RAG system with filtering and grouping options',
      inputSchema: {
        type: 'object',
        properties: {
          include_stats: {
            type: 'boolean',
            description: 'Include detailed statistics about the document collection',
            default: false
          },
          source_type_filter: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by source types (e.g., ["local_file", "file_upload", "url_crawl"])'
          },
          group_by: {
            type: 'string',
            enum: ['source_type', 'file_type'],
            description: 'Group results by source type or file type'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of sources to return',
            default: 100,
            minimum: 1,
            maximum: 1000
          }
        },
        required: []
      }
    }];
  }
}