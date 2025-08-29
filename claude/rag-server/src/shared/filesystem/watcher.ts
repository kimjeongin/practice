import chokidar from 'chokidar'
import { basename, extname } from 'path'
import { stat, lstatSync, realpathSync } from 'fs'
import { stat as statAsync } from 'fs/promises'
import { EventEmitter } from 'events'
import { FileMetadata } from '@/shared/types/index.js'
import { calculateFileHash } from '@/shared/utils/crypto.js'

export interface FileChangeEvent {
  type: 'added' | 'changed' | 'deleted'
  path: string
  metadata?: Omit<FileMetadata, 'id'>
}

export class FileWatcher extends EventEmitter {
  private watcher: any | null = null
  private documentsDir: string
  private supportedExtensions: Set<string>
  private processingFiles: Map<string, NodeJS.Timeout> = new Map()
  private readonly DEBOUNCE_DELAY = 300 // 300ms debounce
  private readonly MAX_SCAN_DEPTH = 5
  private readonly MAX_SCAN_TIME_MS = 30000
  private readonly MAX_PROCESSING_QUEUE = 100
  private visitedPaths: Set<string> = new Set()
  private scanAbortController: AbortController | null = null

  constructor(documentsDir: string) {
    super()
    this.documentsDir = documentsDir
    this.supportedExtensions = new Set([
      '.txt',
      '.md',
      '.pdf',
      '.docx',
      '.doc',
      '.rtf',
      '.csv',
      '.json',
      '.xml',
      '.html',
    ])
  }

  start(): void {
    if (this.watcher) {
      throw new Error('FileWatcher is already started')
    }

    this.watcher = chokidar.watch(this.documentsDir, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles and directories
        '**/node_modules/**', // ignore node_modules
        '**/vectors/**', // ignore vector store files to prevent loops
        '**/.transformers-cache/**', // ignore model cache
        '**/logs/**', // ignore log files
        '**/dist/**', // ignore build output
        (path: string) => {
          // Additional filtering for vector store and system files
          // Also check for symbolic links to prevent infinite loops
          try {
            const stats = lstatSync(path)
            if (stats.isSymbolicLink()) {
              console.warn(`Skipping symbolic link: ${path}`)
              return true
            }
          } catch (err) {
            // If we can't stat the file, skip it for safety
            return true
          }
          return (
            path.includes('vectors') ||
            path.includes('storage') ||
            path.includes('docstore.json') ||
            path.includes('.lance') ||
            path.includes('.pkl') ||
            path.includes('database')
          )
        },
      ],
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
      depth: this.MAX_SCAN_DEPTH, // Reduced depth limit
    })

    this.watcher
      .on('add', (path: string) => this.debounceFileEvent(path, 'add'))
      .on('change', (path: string) => this.debounceFileEvent(path, 'change'))
      .on('unlink', (path: string) =>
        this.handleFileRemoved(path).catch((error) => this.emit('error', error))
      )
      .on('error', (error: any) => this.emit('error', error))

    console.log(`FileWatcher started, watching: ${this.documentsDir}`)
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      console.log('FileWatcher stopped')
    }

    // Abort any ongoing directory scan
    if (this.scanAbortController) {
      this.scanAbortController.abort()
      this.scanAbortController = null
    }

    // Clear all pending timeouts
    for (const timeout of this.processingFiles.values()) {
      clearTimeout(timeout)
    }
    this.processingFiles.clear()
    this.visitedPaths.clear()
  }

  /**
   * Debounce file events to prevent duplicate processing
   */
  private debounceFileEvent(path: string, eventType: 'add' | 'change'): void {
    // Check if processing queue is full to prevent memory issues
    if (this.processingFiles.size >= this.MAX_PROCESSING_QUEUE) {
      console.warn(`Processing queue full (${this.MAX_PROCESSING_QUEUE}), skipping file: ${path}`)
      return
    }

    // Clear existing timeout for this file
    const existingTimeout = this.processingFiles.get(path)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new debounced timeout with error handling
    const timeout = setTimeout(async () => {
      this.processingFiles.delete(path)

      try {
        if (eventType === 'add') {
          await this.handleFileAdded(path)
        } else {
          await this.handleFileChanged(path)
        }
      } catch (error) {
        console.error(`Error processing file ${path}:`, error)
        this.emit('error', error)
      }
    }, this.DEBOUNCE_DELAY)

    this.processingFiles.set(path, timeout)
  }

  private async handleFileAdded(path: string): Promise<void> {
    try {
      if (!this.isSupportedFile(path)) {
        return
      }

      const metadata = await this.extractFileMetadata(path)
      this.emit('change', { type: 'added', path, metadata })
    } catch (error) {
      console.error(`Error handling file added: ${path}`, error)
      this.emit('error', error)
    }
  }

  private async handleFileChanged(path: string): Promise<void> {
    try {
      if (!this.isSupportedFile(path)) {
        return
      }

      const metadata = await this.extractFileMetadata(path)
      this.emit('change', { type: 'changed', path, metadata })
    } catch (error) {
      console.error(`Error handling file changed: ${path}`, error)
      this.emit('error', error)
    }
  }

  private async handleFileRemoved(path: string): Promise<void> {
    try {
      this.emit('change', { type: 'deleted', path })
    } catch (error) {
      console.error(`Error handling file removed: ${path}`, error)
      this.emit('error', error)
    }
  }

  private isSupportedFile(path: string): boolean {
    const ext = extname(path).toLowerCase()

    // Explicitly ignore vector store and system files
    if (
      path.includes('vectors') ||
      path.includes('storage') ||
      path.includes('docstore.json') ||
      path.includes('.lance') ||
      path.includes('.pkl') ||
      path.includes('database') ||
      path.includes('.transformers-cache')
    ) {
      return false
    }

    return this.supportedExtensions.has(ext)
  }

  private async extractFileMetadata(path: string): Promise<Omit<FileMetadata, 'id'>> {
    const stats = await statAsync(path)
    const hash = calculateFileHash(path)
    const name = basename(path)
    const fileType = extname(path).toLowerCase().substring(1) // Remove the dot

    return {
      path,
      name,
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      fileType,
      hash,
    }
  }

  // Method to manually scan the entire directory and emit events for all files
  async syncDirectory(): Promise<void> {
    if (!this.watcher) {
      throw new Error('FileWatcher must be started before syncing directory')
    }

    // Clear visited paths for fresh scan
    this.visitedPaths.clear()
    this.scanAbortController = new AbortController()

    return new Promise((resolve, reject) => {
      // Set maximum scan time
      const scanTimeout = setTimeout(() => {
        console.warn('Directory scan timed out, aborting...')
        if (this.scanAbortController) {
          this.scanAbortController.abort()
        }
        watcher.close()
        reject(new Error('Directory scan timed out'))
      }, this.MAX_SCAN_TIME_MS)

      const watcher = chokidar.watch(this.documentsDir, {
        ignored: [
          /(^|[\/\\])\../, // ignore dotfiles
          '**/node_modules/**',
          '**/vectors/**',
          '**/.transformers-cache/**',
          '**/logs/**',
          '**/dist/**',
        ],
        persistent: false,
        depth: this.MAX_SCAN_DEPTH,
      })

      watcher
        .on('add', async (path) => {
          if (this.scanAbortController?.signal.aborted) {
            return
          }

          // Check for potential cycles
          try {
            const realPath = realpathSync(path)
            if (this.visitedPaths.has(realPath)) {
              console.warn(`Potential cycle detected, skipping: ${path}`)
              return
            }
            this.visitedPaths.add(realPath)

            if (this.isSupportedFile(path)) {
              // Emit event for each discovered file
              const metadata = await this.extractFileMetadata(path)
              this.emit('change', { type: 'added', path, metadata })
            }
          } catch (error) {
            console.warn(`Error processing file ${path}:`, error)
          }
        })
        .on('ready', () => {
          clearTimeout(scanTimeout)
          watcher.close()
          this.visitedPaths.clear()
          this.scanAbortController = null
          resolve()
        })
        .on('error', (error) => {
          clearTimeout(scanTimeout)
          watcher.close()
          this.visitedPaths.clear()
          this.scanAbortController = null
          reject(error)
        })
    })
  }

  // Get supported file extensions
  getSupportedExtensions(): string[] {
    return Array.from(this.supportedExtensions)
  }

  // Add support for additional file extensions
  addSupportedExtension(ext: string): void {
    this.supportedExtensions.add(ext.toLowerCase())
  }
}
