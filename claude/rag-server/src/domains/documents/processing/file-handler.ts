import { IFileRepository } from '../storage/file-repository.js';

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

export class FileHandler {
  constructor(private fileRepository: IFileRepository) {}

  async handleListFiles(args: ListFilesArgs) {
    const { fileType, limit = 100, offset = 0 } = args;
    
    let files = this.fileRepository.getAllFiles();

    if (fileType) {
      files = files.filter(file => 
        file.fileType.toLowerCase() === fileType.toLowerCase()
      );
    }

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
        customMetadata: this.fileRepository.getFileMetadata(file.id),
      })),
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
      file = this.fileRepository.getFileById(fileId);
    } else if (filePath) {
      file = this.fileRepository.getFileByPath(filePath);
    }

    if (!file) {
      throw new Error('File not found');
    }

    const customMetadata = this.fileRepository.getFileMetadata(file.id);

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
      file = this.fileRepository.getFileById(fileId);
    } else if (filePath) {
      file = this.fileRepository.getFileByPath(filePath);
    }

    if (!file) {
      throw new Error('File not found');
    }

    // Update metadata
    for (const [key, value] of Object.entries(metadata)) {
      this.fileRepository.setFileMetadata(file.id, key, String(value));
    }

    const updatedMetadata = this.fileRepository.getFileMetadata(file.id);

    return {
      fileId: file.id,
      filePath: file.path,
      updatedMetadata,
    };
  }

  async handleSearchFilesByMetadata(args: SearchFilesByMetadataArgs) {
    const { key, value } = args;
    const files = this.fileRepository.searchFilesByMetadata(key, value);

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
        customMetadata: this.fileRepository.getFileMetadata(file.id),
      })),
      totalResults: files.length,
    };
  }
}