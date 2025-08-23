import { IFileRepository } from '@/domains/rag/repositories/document.js';
import { IFileProcessingService } from '@/shared/types/interfaces.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ListFilesArgs {
  fileType?: string;
  limit?: number;
  offset?: number;
}

export interface GetFileMetadataArgs {
  fileId?: string;
  filePath?: string;
}

export interface UpdateFileMetadataArgs {
  fileId?: string;
  filePath?: string;
  metadata: Record<string, string>;
}

export interface SearchFilesByMetadataArgs {
  key: string;
  value?: string;
}

export interface ForceReindexArgs {
  clearCache?: boolean;
}

export class DocumentHandler {
  constructor(
    private fileRepository: IFileRepository,
    private fileProcessingService: IFileProcessingService
  ) {}

  async handleListFiles(args: ListFilesArgs) {
    const { fileType, limit = 100, offset = 0 } = args;
    
    let files = await this.fileRepository.getAllFiles();

    if (fileType) {
      files = files.filter(file => 
        file.fileType.toLowerCase() === fileType.toLowerCase()
      );
    }

    const totalFiles = files.length;
    const paginatedFiles = files.slice(offset, offset + limit);

    return {
      files: await Promise.all(paginatedFiles.map(async file => ({
        id: file.id,
        name: file.name,
        path: file.path,
        fileType: file.fileType,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
        createdAt: file.createdAt.toISOString(),
        customMetadata: await this.fileRepository.getFileMetadata(file.id),
        chunksCount: 0 // TODO: Get chunk count from chunk repository
      }))),
      pagination: {
        total: totalFiles,
        limit,
        offset,
        hasMore: offset + limit < totalFiles,
      },
    };
  }

  async handleGetFileMetadata(args: GetFileMetadataArgs) {
    const { fileId, filePath } = args;

    if (!fileId && !filePath) {
      throw new Error('Either fileId or filePath must be provided');
    }

    let file = null;
    if (fileId) {
      file = await this.fileRepository.getFileById(fileId);
    } else if (filePath) {
      file = await this.fileRepository.getFileByPath(filePath);
    }

    if (!file) {
      return {
        error: 'FileNotFound', 
        message: fileId ? `File with ID '${fileId}' not found` : `File at path '${filePath}' not found`,
        suggestion: 'Use list_files to see available files or check if the file path is correct'
      };
    }

    const customMetadata = await this.fileRepository.getFileMetadata(file.id);

    return {
      file: {
        id: file.id,
        name: file.name,
        path: file.path,
        fileType: file.fileType,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
        createdAt: file.createdAt.toISOString(),
        hash: file.hash,
      },
      customMetadata,
    };
  }

  async handleUpdateFileMetadata(args: UpdateFileMetadataArgs) {
    const { fileId, filePath, metadata } = args;

    if (!fileId && !filePath) {
      throw new Error('Either fileId or filePath must be provided');
    }

    let file = null;
    if (fileId) {
      file = await this.fileRepository.getFileById(fileId);
    } else if (filePath) {
      file = await this.fileRepository.getFileByPath(filePath);
    }

    if (!file) {
      return {
        error: 'FileNotFound',
        message: fileId ? `File with ID '${fileId}' not found` : `File at path '${filePath}' not found`,
        suggestion: 'Use list_files to see available files or check if the file path is correct'
      };
    }

    // Update metadata
    for (const [key, value] of Object.entries(metadata)) {
      await this.fileRepository.setFileMetadata(file.id, key, String(value));
    }

    const updatedMetadata = await this.fileRepository.getFileMetadata(file.id);

    return {
      fileId: file.id,
      filePath: file.path,
      updatedMetadata,
    };
  }

  async handleSearchFilesByMetadata(args: SearchFilesByMetadataArgs) {
    const { key, value } = args;
    const files = await this.fileRepository.searchFilesByMetadata(key, value);

    return {
      searchCriteria: { key, value },
      files: await Promise.all(files.map(async file => ({
        id: file.id,
        name: file.name,
        path: file.path,
        fileType: file.fileType,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
        createdAt: file.createdAt.toISOString(),
        customMetadata: await this.fileRepository.getFileMetadata(file.id),
      }))),
      totalResults: files.length,
    };
  }

  async handleForceReindex(args: ForceReindexArgs) {
    const { clearCache = false } = args;
    
    if ('forceReindex' in this.fileProcessingService && typeof this.fileProcessingService.forceReindex === 'function') {
      await this.fileProcessingService.forceReindex(clearCache);
    } else {
      return {
        error: 'ServiceUnavailable',
        message: 'forceReindex method not available on file processing service',
        suggestion: 'Check if the file processing service is properly configured and running'
      };
    }

    return {
      success: true,
      message: 'Force reindexing completed successfully',
      clearedCache: clearCache,
    };
  }
  getTools(): Tool[] {
          return [{
            name: 'list_files',
            description: 'List all indexed files with their metadata',
            inputSchema: {
              type: 'object',
              properties: {
                fileType: { type: 'string', description: 'Filter by specific file type' },
                limit: { type: 'number', description: 'Maximum number of files to return (default: 100)', default: 100 },
                offset: { type: 'number', description: 'Number of files to skip (default: 0)', default: 0 },
              },
              required: [],
            },
          },
          {
            name: 'force_reindex',
            description: 'Force complete reindexing of all files',
            inputSchema: {
              type: 'object',
              properties: {
                clearCache: {
                  type: 'boolean',
                  description: 'Whether to clear the vector cache before reindexing (default: false)',
                  default: false,
                },
              },
              required: [],
            },
          }
              ]    
        }
}