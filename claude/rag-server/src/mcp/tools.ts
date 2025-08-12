import { SimpleRAGService } from '../services/simple-rag.js';
import { DatabaseManager } from '../database/connection.js';
import { McpTool, McpProtocol } from './protocol.js';

export function registerRagTools(protocol: McpProtocol, ragService: SimpleRAGService, db: DatabaseManager): void {
  
  // Search documents tool
  const searchTool: McpTool = McpProtocol.createTool(
    'search_documents',
    'Search through indexed documents using natural language queries with optional filters',
    {
      query: {
        type: 'string',
        description: 'The search query in natural language'
      },
      topK: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
        minimum: 1,
        maximum: 50
      },
      fileTypes: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Filter by file types (e.g., ["txt", "md", "pdf"])'
      },
      metadataFilters: {
        type: 'object',
        description: 'Filter by custom metadata key-value pairs',
        additionalProperties: {
          type: 'string'
        }
      }
    },
    ['query']
  );

  protocol.registerTool(searchTool, async (params) => {
    const { query, topK, fileTypes, metadataFilters } = params;
    
    if (!ragService.isReady()) {
      throw new Error('RAG service is not ready. Please wait for initialization to complete.');
    }
    
    const results = await ragService.search(query, {
      topK,
      fileTypes,
      metadataFilters
    });
    
    return {
      query,
      results: results.map(result => ({
        content: result.content,
        score: result.score,
        metadata: {
          fileName: result.metadata.name,
          filePath: result.metadata.path,
          chunkIndex: result.chunkIndex,
          ...result.metadata
        }
      })),
      totalResults: results.length
    };
  });

  // List files tool
  const listFilesTool: McpTool = McpProtocol.createTool(
    'list_files',
    'List all indexed files with their metadata',
    {
      fileType: {
        type: 'string',
        description: 'Filter by specific file type (e.g., "txt", "md", "pdf")'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of files to return (default: 100)',
        minimum: 1,
        maximum: 1000
      },
      offset: {
        type: 'number',
        description: 'Number of files to skip (for pagination, default: 0)',
        minimum: 0
      }
    }
  );

  protocol.registerTool(listFilesTool, async (params) => {
    const { fileType, limit = 100, offset = 0 } = params;
    
    let files = db.getAllFiles();
    
    // Filter by file type if specified
    if (fileType) {
      files = files.filter(file => file.fileType.toLowerCase() === fileType.toLowerCase());
    }
    
    // Apply pagination
    const totalFiles = files.length;
    const paginatedFiles = files.slice(offset, offset + limit);
    
    return {
      files: paginatedFiles.map(file => ({
        id: file.id,
        name: file.name,
        path: file.path,
        fileType: file.fileType,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
        createdAt: file.createdAt.toISOString(),
        customMetadata: db.getFileMetadata(file.id)
      })),
      pagination: {
        total: totalFiles,
        limit,
        offset,
        hasMore: offset + limit < totalFiles
      }
    };
  });

  // Get file metadata tool
  const getFileMetadataTool: McpTool = McpProtocol.createTool(
    'get_file_metadata',
    'Get detailed metadata for a specific file by ID or path',
    {
      fileId: {
        type: 'string',
        description: 'The unique file identifier'
      },
      filePath: {
        type: 'string',
        description: 'The file path (alternative to fileId)'
      }
    }
  );

  protocol.registerTool(getFileMetadataTool, async (params) => {
    const { fileId, filePath } = params;
    
    if (!fileId && !filePath) {
      throw new Error('Either fileId or filePath must be provided');
    }
    
    let file = null;
    if (fileId) {
      file = db.getFileById(fileId);
    } else if (filePath) {
      file = db.getFileByPath(filePath);
    }
    
    if (!file) {
      throw new Error('File not found');
    }
    
    const customMetadata = db.getFileMetadata(file.id);
    const chunks = db.getDocumentChunks(file.id);
    
    return {
      file: {
        id: file.id,
        name: file.name,
        path: file.path,
        fileType: file.fileType,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
        createdAt: file.createdAt.toISOString(),
        hash: file.hash
      },
      customMetadata,
      chunkCount: chunks.length,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        contentPreview: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : '')
      }))
    };
  });

  // Update file metadata tool
  const updateFileMetadataTool: McpTool = McpProtocol.createTool(
    'update_file_metadata',
    'Add or update custom metadata for a file',
    {
      fileId: {
        type: 'string',
        description: 'The unique file identifier'
      },
      filePath: {
        type: 'string',
        description: 'The file path (alternative to fileId)'
      },
      metadata: {
        type: 'object',
        description: 'Key-value pairs of metadata to set',
        additionalProperties: {
          type: 'string'
        }
      }
    },
    ['metadata']
  );

  protocol.registerTool(updateFileMetadataTool, async (params) => {
    const { fileId, filePath, metadata } = params;
    
    if (!fileId && !filePath) {
      throw new Error('Either fileId or filePath must be provided');
    }
    
    let file = null;
    if (fileId) {
      file = db.getFileById(fileId);
    } else if (filePath) {
      file = db.getFileByPath(filePath);
    }
    
    if (!file) {
      throw new Error('File not found');
    }
    
    // Update metadata
    for (const [key, value] of Object.entries(metadata)) {
      db.setFileMetadata(file.id, key, String(value));
    }
    
    // Get updated metadata
    const updatedMetadata = db.getFileMetadata(file.id);
    
    return {
      fileId: file.id,
      filePath: file.path,
      updatedMetadata
    };
  });

  // Search files by metadata tool
  const searchFilesByMetadataTool: McpTool = McpProtocol.createTool(
    'search_files_by_metadata',
    'Search files by their custom metadata',
    {
      key: {
        type: 'string',
        description: 'The metadata key to search for'
      },
      value: {
        type: 'string',
        description: 'The metadata value to search for (optional - if not provided, returns all files with the key)'
      }
    },
    ['key']
  );

  protocol.registerTool(searchFilesByMetadataTool, async (params) => {
    const { key, value } = params;
    
    const files = db.searchFilesByMetadata(key, value);
    
    return {
      searchCriteria: { key, value },
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        path: file.path,
        fileType: file.fileType,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
        createdAt: file.createdAt.toISOString(),
        customMetadata: db.getFileMetadata(file.id)
      })),
      totalResults: files.length
    };
  });

  // Get server status tool
  const getServerStatusTool: McpTool = McpProtocol.createTool(
    'get_server_status',
    'Get the current status and statistics of the RAG server',
    {}
  );

  protocol.registerTool(getServerStatusTool, async () => {
    const indexedFiles = ragService.getIndexedFilesCount();
    const indexedChunks = ragService.getIndexedChunksCount();
    const isReady = ragService.isReady();
    const isDbHealthy = db.isHealthy();
    
    return {
      status: {
        ready: isReady,
        databaseHealthy: isDbHealthy,
        indexedFiles,
        indexedChunks
      },
      stats: {
        totalFiles: indexedFiles,
        totalChunks: indexedChunks,
        avgChunksPerFile: indexedFiles > 0 ? Math.round(indexedChunks / indexedFiles) : 0
      }
    };
  });

  // Force reindex tool
  const forceReindexTool: McpTool = McpProtocol.createTool(
    'force_reindex',
    'Force a complete reindexing of all files (use carefully - this can be slow)',
    {
      confirm: {
        type: 'boolean',
        description: 'Must be set to true to confirm the reindexing operation'
      }
    },
    ['confirm']
  );

  protocol.registerTool(forceReindexTool, async (params) => {
    const { confirm } = params;
    
    if (!confirm) {
      throw new Error('Reindexing must be confirmed by setting confirm=true');
    }
    
    const startTime = Date.now();
    await ragService.forceReindex();
    const duration = Date.now() - startTime;
    
    return {
      message: 'Reindexing completed successfully',
      duration: `${duration}ms`,
      indexedFiles: ragService.getIndexedFilesCount(),
      indexedChunks: ragService.getIndexedChunksCount()
    };
  });
}