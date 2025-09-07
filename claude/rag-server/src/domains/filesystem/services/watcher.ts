import chokidar from 'chokidar'
import { basename, extname } from 'path'
import { stat, lstatSync, realpathSync } from 'fs'
import { stat as statAsync } from 'fs/promises'
import { EventEmitter } from 'events'
import { extractFileMetadata } from '@/shared/utils/file-metadata.js'
import { logger, startTiming } from '@/shared/logger/index.js'
import { glob } from 'glob'
import { DocumentProcessor } from '@/domains/rag/services/processor.js'
import { FileMetadata } from '../../rag/core/types.js'
import { ConfigFactory } from '@/shared/config/config-factory.js'

export class FileWatcher extends EventEmitter {
  private watcher: any | null = null
  private documentsDir: string
  private supportedExtensions: Set<string>
  private processingFiles: Map<string, NodeJS.Timeout> = new Map()
  private config = ConfigFactory.getCurrentConfig()
  private visitedPaths: Set<string> = new Set()
  private scanAbortController: AbortController | null = null
  private documentProcessor: DocumentProcessor | null = null

  constructor(documentsDir: string, documentProcessor?: DocumentProcessor) {
    super()
    this.documentsDir = documentsDir
    this.documentProcessor = documentProcessor || null
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

  async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('FileWatcher is already started')
    }

    // First, perform initial sync before starting file watching
    if (this.documentProcessor) {
      await this.syncDirectoryWithVectorStore()
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
              logger.warn(`Skipping symbolic link: ${path}`)
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
      ignoreInitial: true, // Prevent initial events since we handle sync manually
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
      depth: this.config.watcherMaxScanDepth, // Reduced depth limit
    })

    this.watcher
      .on('add', (path: string) => this.debounceFileEvent(path, 'add'))
      .on('change', (path: string) => this.debounceFileEvent(path, 'change'))
      .on('unlink', (path: string) =>
        this.handleFileRemoved(path).catch((error) => this.emit('error', error))
      )
      .on('error', (error: any) => this.emit('error', error))

    logger.info(`FileWatcher started, watching: ${this.documentsDir}`)
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      logger.info('FileWatcher stopped')
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
    if (this.processingFiles.size >= this.config.watcherMaxProcessingQueue) {
      logger.warn(`Processing queue full (${this.config.watcherMaxProcessingQueue}), skipping file: ${path}`)
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
        logger.error(
          'Error processing file ${path}:',
          error instanceof Error ? error : new Error(String(error))
        )
        this.emit('error', error)
      }
    }, this.config.watcherDebounceDelay)

    this.processingFiles.set(path, timeout)
  }

  private async handleFileAdded(path: string): Promise<void> {
    try {
      if (!this.isSupportedFile(path)) {
        return
      }

      const metadata = await this.getFileMetadata(path)
      this.emit('change', { type: 'added', path, metadata })
    } catch (error) {
      logger.error(
        'Error handling file added: ${path}',
        error instanceof Error ? error : new Error(String(error))
      )
      this.emit('error', error)
    }
  }

  private async handleFileChanged(path: string): Promise<void> {
    try {
      if (!this.isSupportedFile(path)) {
        return
      }

      const metadata = await this.getFileMetadata(path)
      this.emit('change', { type: 'changed', path, metadata })
    } catch (error) {
      logger.error(
        'Error handling file changed: ${path}',
        error instanceof Error ? error : new Error(String(error))
      )
      this.emit('error', error)
    }
  }

  private async handleFileRemoved(path: string): Promise<void> {
    try {
      this.emit('change', { type: 'deleted', path })
    } catch (error) {
      logger.error(
        'Error handling file removed: ${path}',
        error instanceof Error ? error : new Error(String(error))
      )
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

  private async getFileMetadata(path: string): Promise<Omit<FileMetadata, 'id'>> {
    const metadata = await extractFileMetadata(path)
    // Return without id for backward compatibility with existing event handlers
    const { id, ...metadataWithoutId } = metadata
    return metadataWithoutId
  }

  /**
   * Perform smart directory synchronization with VectorStore
   * Only processes changed files and removes deleted files
   */
  async syncDirectoryWithVectorStore(): Promise<void> {
    if (!this.documentProcessor) {
      throw new Error('DocumentProcessor not provided to FileWatcher')
    }

    try {
      logger.info('🔄 Starting smart directory synchronization...', {
        documentsDir: this.documentsDir,
        component: 'FileWatcher',
      })

      // Get vector store provider from document processor
      const vectorStoreProvider = (this.documentProcessor as any).vectorStoreProvider

      if (!vectorStoreProvider || !vectorStoreProvider.getAllFileMetadata) {
        logger.warn(
          'getAllFileMetadata not supported by vector store provider, performing full sync instead'
        )
        // Fallback to basic directory processing
        const pattern = `${this.documentsDir}/**/*.{txt,md,pdf,doc,docx,csv,json,html,xml}`
        const currentFilePaths = await glob(pattern)

        let processedCount = 0
        for (const filePath of currentFilePaths) {
          try {
            await this.documentProcessor.processFile(filePath)
            processedCount++
          } catch (error) {
            logger.error(
              'Failed to process file during fallback sync',
              error instanceof Error ? error : new Error(String(error)),
              {
                filePath,
              }
            )
          }
        }
        logger.info('✅ Fallback sync completed', { processedFiles: processedCount })
        return
      }

      const existingFiles = await vectorStoreProvider.getAllFileMetadata()
      logger.info(`📊 Found ${existingFiles.size} files in vector store`)

      // Get all current files in directory
      const pattern = `${this.documentsDir}/**/*.{txt,md,pdf,doc,docx,csv,json,html,xml}`
      const currentFilePaths = await glob(pattern)

      logger.info(`📁 Found ${currentFilePaths.length} files in directory`)

      // Build mapping of current files by path and by file ID
      const currentFilesByPath = new Map<string, FileMetadata>()
      const currentFilesById = new Map<string, FileMetadata>()

      // Extract metadata for all current files first
      for (const filePath of currentFilePaths) {
        try {
          const fileMetadata = await extractFileMetadata(filePath)
          currentFilesByPath.set(filePath, fileMetadata)
          currentFilesById.set(fileMetadata.id, fileMetadata)
        } catch (error) {
          logger.error(
            'Failed to extract metadata for file during sync',
            error instanceof Error ? error : new Error(String(error)),
            {
              filePath,
            }
          )
        }
      }

      let newFiles = 0
      let updatedFiles = 0
      let skippedFiles = 0

      // Process current files
      for (const [filePath, fileMetadata] of currentFilesByPath) {
        try {
          const shouldProcess = await this.shouldProcessFile(fileMetadata, vectorStoreProvider)
          if (shouldProcess) {
            const isNew = !existingFiles.has(fileMetadata.id)
            logger.info(`${isNew ? '🆕 New file' : '🔄 Updated file'} detected`, {
              fileName: fileMetadata.name,
              filePath: fileMetadata.path,
            })

            await this.documentProcessor.processFile(filePath)

            if (isNew) {
              newFiles++
            } else {
              updatedFiles++
            }
          } else {
            skippedFiles++
            logger.debug('⏭️ Skipping unchanged file', {
              fileName: fileMetadata.name,
              filePath: fileMetadata.path,
            })
          }
        } catch (error) {
          logger.error(
            'Failed to process file during sync',
            error instanceof Error ? error : new Error(String(error)),
            {
              filePath,
              fileName: fileMetadata.name,
            }
          )
        }
      }

      // Remove files that no longer exist in the filesystem
      let deletedFiles = 0
      for (const [fileId, storedMetadata] of existingFiles) {
        // Check if file still exists by ID and verify path still exists
        const currentFile = currentFilesById.get(fileId)
        let shouldDelete = false

        if (!currentFile) {
          // File ID not found in current files - might be deleted
          shouldDelete = true
          logger.debug('🔍 File ID not found in current directory scan', {
            fileId,
            storedPath: storedMetadata.filePath,
            storedName: storedMetadata.fileName,
          })
        } else {
          // Double check: verify the file path actually exists
          try {
            await statAsync(currentFile.path)
            logger.debug('✅ File exists and matches stored metadata', {
              fileId,
              filePath: currentFile.path,
            })
          } catch (error) {
            shouldDelete = true
            logger.debug('💀 File path no longer accessible', {
              fileId,
              filePath: currentFile.path,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        if (shouldDelete) {
          logger.info('🗑️ File no longer exists, removing from vector store', {
            fileName: storedMetadata.fileName,
            filePath: storedMetadata.filePath,
            fileId,
          })

          try {
            await vectorStoreProvider.removeDocumentsByFileId(fileId)
            deletedFiles++
          } catch (error) {
            logger.error(
              'Failed to remove deleted file from vector store',
              error instanceof Error ? error : new Error(String(error)),
              {
                fileId,
                fileName: storedMetadata.fileName,
              }
            )
          }
        }
      }

      const resultsFils = await vectorStoreProvider.getAllFileMetadata()

      logger.info('✅ Smart directory synchronization completed', {
        totalFiles: resultsFils.length,
        newFiles,
        updatedFiles,
        skippedFiles,
        deletedFiles,
        vectorStoreFiles: resultsFils.size,
        component: 'FileWatcher',
      })
    } catch (error) {
      logger.error(
        'Smart directory synchronization failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          documentsDir: this.documentsDir,
          component: 'FileWatcher',
        }
      )
      throw error
    }
  }

  /**
   * Check if file should be processed based on changes
   * Returns true if file needs processing, false if unchanged
   */
  private async shouldProcessFile(
    currentMetadata: FileMetadata,
    vectorStoreProvider: any
  ): Promise<boolean> {
    try {
      // Get existing metadata from vector store
      if (!vectorStoreProvider.getFileMetadata) {
        logger.debug(
          'getFileMetadata not supported by vector store provider, assuming processing needed'
        )
        return true // Default to processing if check not supported
      }
      const existingMetadata = await vectorStoreProvider.getFileMetadata(currentMetadata.id)

      if (!existingMetadata) {
        logger.info('📄 New file detected, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name,
          filePath: currentMetadata.path,
        })
        return true // New file
      }

      logger.debug('📋 Comparing file metadata for change detection', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        current: {
          size: currentMetadata.size,
          modTime: currentMetadata.modifiedAt,
          hash: currentMetadata.hash,
        },
        existing: {
          size: existingMetadata.size || existingMetadata.fileSize,
          modTime: existingMetadata.fileModifiedAt || existingMetadata.modifiedAt,
          hash: existingMetadata.fileHash || existingMetadata.hash,
          processedAt: existingMetadata.processedAt,
        },
      })

      // Primary check: Compare file hash (most reliable)
      const existingHash = existingMetadata.fileHash || existingMetadata.hash
      if (currentMetadata.hash && existingHash) {
        if (currentMetadata.hash !== existingHash) {
          logger.info('🔄 File content changed (hash mismatch), needs processing', {
            fileId: currentMetadata.id,
            fileName: currentMetadata.name,
            oldHash: existingHash.substring(0, 8) + '...',
            newHash: currentMetadata.hash.substring(0, 8) + '...',
          })
          return true
        }
      }

      // Secondary check: Compare file size
      const existingSize = existingMetadata.size || existingMetadata.fileSize
      if (existingSize && currentMetadata.size !== existingSize) {
        logger.info('📏 File size changed, needs processing', {
          fileId: currentMetadata.id,
          fileName: currentMetadata.name,
          oldSize: existingSize,
          newSize: currentMetadata.size,
        })
        return true
      }

      // Tertiary check: Compare modification time
      const existingModTime = existingMetadata.fileModifiedAt || existingMetadata.modifiedAt
      if (existingModTime) {
        const currentModTime = new Date(currentMetadata.modifiedAt).getTime()
        const storedModTime = new Date(existingModTime).getTime()

        if (currentModTime > storedModTime) {
          logger.info('⏰ File modification time newer, needs processing', {
            fileId: currentMetadata.id,
            fileName: currentMetadata.name,
            storedModTime: new Date(storedModTime).toISOString(),
            currentModTime: currentMetadata.modifiedAt,
          })
          return true
        }
      }

      logger.info('✅ File unchanged, skipping processing', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        size: currentMetadata.size,
        modTime: currentMetadata.modifiedAt,
        hash: currentMetadata.hash.substring(0, 8) + '...',
      })

      return false // File unchanged
    } catch (error) {
      logger.warn('⚠️ Failed to check file changes, defaulting to process', {
        fileId: currentMetadata.id,
        fileName: currentMetadata.name,
        error: error instanceof Error ? error.message : String(error),
      })
      return true // Default to processing if check fails
    }
  }

  // Get supported file extensions
  getSupportedExtensions(): string[] {
    return Array.from(this.supportedExtensions)
  }

  // Add support for additional file extensions
  addSupportedExtension(ext: string): void {
    this.supportedExtensions.add(ext.toLowerCase())
  }

  // Set document processor for file processing
  setDocumentProcessor(documentProcessor: DocumentProcessor): void {
    this.documentProcessor = documentProcessor
  }
}
