import chokidar from 'chokidar';
import { basename, extname } from 'path';
import { stat } from 'fs/promises';
import { EventEmitter } from 'events';
import { DatabaseConnection } from '@/infrastructure/database/database-connection.js';
import { FileMetadata } from '@/shared/types/index.js';
import { calculateFileHash } from '@/shared/utils/crypto.js';

export interface FileChangeEvent {
  type: 'added' | 'changed' | 'removed';
  path: string;
  metadata?: FileMetadata;
}

export class FileWatcher extends EventEmitter {
  private watcher: any | null = null;
  private db: DatabaseConnection;
  private dataDir: string;
  private supportedExtensions: Set<string>;
  private processingFiles: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_DELAY = 300; // 300ms debounce

  constructor(db: DatabaseConnection, dataDir: string) {
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
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles and directories
        '**/node_modules/**', // ignore node_modules
        '**/faiss_index/**', // ignore faiss index files to prevent loops
        '**/.transformers-cache/**', // ignore model cache
        '**/logs/**', // ignore log files
      ],
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      },
      depth: 10, // limit recursion depth
    });

    this.watcher
      .on('add', (path: string) => this.debounceFileEvent(path, 'add'))
      .on('change', (path: string) => this.debounceFileEvent(path, 'change'))
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
    
    // Clear all pending timeouts
    for (const timeout of this.processingFiles.values()) {
      clearTimeout(timeout);
    }
    this.processingFiles.clear();
  }

  /**
   * Debounce file events to prevent duplicate processing
   */
  private debounceFileEvent(path: string, eventType: 'add' | 'change'): void {
    // Clear existing timeout for this file
    const existingTimeout = this.processingFiles.get(path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new debounced timeout
    const timeout = setTimeout(() => {
      this.processingFiles.delete(path);
      
      if (eventType === 'add') {
        this.handleFileAdded(path);
      } else {
        this.handleFileChanged(path);
      }
    }, this.DEBOUNCE_DELAY);

    this.processingFiles.set(path, timeout);
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
          this.emit('change', { type: 'changed', path, metadata: { ...existingFile, ...metadata } });
        }
      } else {
        // New file
        const fileId = this.db.insertFile(metadata);
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
    const dbFilePaths = new Set(dbFiles.map((f: FileMetadata) => f.path));

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

}