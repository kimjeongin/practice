import chokidar from 'chokidar';
import { join, basename, extname } from 'path';
import { stat, readFile } from 'fs/promises';
import { EventEmitter } from 'events';
import { DatabaseManager } from '../../../infrastructure/database/connection.js';
import { FileMetadata } from '../../../shared/types/index.js';
import { calculateFileHash } from '../../../shared/utils/crypto.js';
import { randomUUID } from 'crypto';

export interface FileChangeEvent {
  type: 'added' | 'changed' | 'removed';
  path: string;
  metadata?: FileMetadata;
}

export class FileWatcher extends EventEmitter {
  private watcher: any | null = null;
  private db: DatabaseManager;
  private dataDir: string;
  private supportedExtensions: Set<string>;

  constructor(db: DatabaseManager, dataDir: string) {
    super();
    this.db = db;
    this.dataDir = dataDir;
    this.supportedExtensions = new Set([
      '.txt', '.md', '.pdf', '.docx', '.doc', '.rtf', '.csv', '.json', '.xml', '.html'
    ]);
  }

  start(): void {
    if (this.watcher) {
      throw new Error('FileWatcher is already started');
    }

    this.watcher = chokidar.watch(this.dataDir, {
      ignored: /(^|[\/\\])\./, // ignore dotfiles
      persistent: true,
      ignoreInitial: false,
    });

    this.watcher
      .on('add', (path: string) => this.handleFileAdded(path))
      .on('change', (path: string) => this.handleFileChanged(path))
      .on('unlink', (path: string) => this.handleFileRemoved(path))
      .on('error', (error: any) => this.emit('error', error));

    console.log(`FileWatcher started, watching: ${this.dataDir}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('FileWatcher stopped');
    }
  }

  private async handleFileAdded(path: string): Promise<void> {
    try {
      if (!this.isSupportedFile(path)) {
        return;
      }

      const metadata = await this.extractFileMetadata(path);
      const existingFile = this.db.getFileByPath(path);

      if (existingFile) {
        // File already exists, check if it changed
        if (existingFile.hash !== metadata.hash) {
          this.db.updateFile(existingFile.id, metadata);
          await this.processFileContent(existingFile.id, path);
          this.emit('change', { type: 'changed', path, metadata: { ...existingFile, ...metadata } });
        }
      } else {
        // New file
        const fileId = this.db.insertFile(metadata);
        await this.processFileContent(fileId, path);
        const fullMetadata = { id: fileId, ...metadata };
        this.emit('change', { type: 'added', path, metadata: fullMetadata });
      }
    } catch (error) {
      console.error(`Error handling file added: ${path}`, error);
      this.emit('error', error);
    }
  }

  private async handleFileChanged(path: string): Promise<void> {
    try {
      if (!this.isSupportedFile(path)) {
        return;
      }

      const metadata = await this.extractFileMetadata(path);
      const existingFile = this.db.getFileByPath(path);

      if (existingFile) {
        if (existingFile.hash !== metadata.hash) {
          this.db.updateFile(existingFile.id, metadata);
          await this.processFileContent(existingFile.id, path);
          this.emit('change', { type: 'changed', path, metadata: { ...existingFile, ...metadata } });
        }
      } else {
        // File doesn't exist in DB, treat as new
        await this.handleFileAdded(path);
      }
    } catch (error) {
      console.error(`Error handling file changed: ${path}`, error);
      this.emit('error', error);
    }
  }

  private handleFileRemoved(path: string): void {
    try {
      const existingFile = this.db.getFileByPath(path);
      if (existingFile) {
        this.db.deleteFile(existingFile.id);
        this.emit('change', { type: 'removed', path, metadata: existingFile });
      }
    } catch (error) {
      console.error(`Error handling file removed: ${path}`, error);
      this.emit('error', error);
    }
  }

  private isSupportedFile(path: string): boolean {
    const ext = extname(path).toLowerCase();
    return this.supportedExtensions.has(ext);
  }

  private async extractFileMetadata(path: string): Promise<Omit<FileMetadata, 'id'>> {
    const stats = await stat(path);
    const hash = calculateFileHash(path);
    const name = basename(path);
    const fileType = extname(path).toLowerCase().substring(1); // Remove the dot

    return {
      path,
      name,
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      fileType,
      hash
    };
  }

  // Method to manually scan and sync the entire directory
  async syncDirectory(): Promise<void> {
    if (!this.watcher) {
      throw new Error('FileWatcher must be started before syncing directory');
    }

    // Get all files currently in database
    const dbFiles = this.db.getAllFiles();
    const dbFilePaths = new Set(dbFiles.map(f => f.path));

    // Use chokidar to get all current files
    const currentFiles = new Set<string>();
    
    return new Promise((resolve, reject) => {
      const watcher = chokidar.watch(this.dataDir, {
        ignored: /(^|[\/\\])\./, // ignore dotfiles
        persistent: false,
      });

      watcher
        .on('add', (path) => {
          if (this.isSupportedFile(path)) {
            currentFiles.add(path);
          }
        })
        .on('ready', async () => {
          try {
            // Remove files that no longer exist
            for (const dbFile of dbFiles) {
              if (!currentFiles.has(dbFile.path)) {
                this.db.deleteFile(dbFile.id);
                this.emit('change', { type: 'removed', path: dbFile.path, metadata: dbFile });
              }
            }

            watcher.close();
            resolve();
          } catch (error) {
            watcher.close();
            reject(error);
          }
        })
        .on('error', (error) => {
          watcher.close();
          reject(error);
        });
    });
  }

  // Get supported file extensions
  getSupportedExtensions(): string[] {
    return Array.from(this.supportedExtensions);
  }

  // Add support for additional file extensions
  addSupportedExtension(ext: string): void {
    this.supportedExtensions.add(ext.toLowerCase());
  }

  // Process file content and store chunks in database
  private async processFileContent(fileId: string, filePath: string): Promise<void> {
    try {
      const content = await this.readFileContent(filePath);
      if (!content) {
        return;
      }

      // Delete existing chunks for this file
      this.db.deleteDocumentChunks(fileId);

      // Simple text chunking
      const chunkSize = 1024; // Default chunk size
      const chunks: string[] = [];
      
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize));
      }

      // Store chunks in database
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk) {
          this.db.insertDocumentChunk({
            fileId,
            chunkIndex: i,
            content: chunk
          });
        }
      }

      console.log(`Processed ${chunks.length} chunks for file: ${basename(filePath)}`);
    } catch (error) {
      console.error(`Error processing file content for ${filePath}:`, error);
    }
  }

  // Read file content based on file type
  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      const ext = extname(filePath).toLowerCase().substring(1);
      
      switch (ext) {
        case 'txt':
        case 'md':
        case 'json':
        case 'xml':
        case 'html':
        case 'csv':
          return await readFile(filePath, 'utf-8');
          
        case 'pdf':
          console.warn(`PDF parsing not implemented for ${filePath}`);
          return null;
          
        default:
          console.warn(`Unsupported file type: ${ext} for ${filePath}`);
          return null;
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }
}