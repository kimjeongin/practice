import { basename } from 'path'
import { stat } from 'fs/promises'
import { createHash } from 'crypto'
import { calculateFileHash } from './crypto.js'
import { FileMetadata } from '@/domains/rag/core/models.js'
import { logger } from '@/shared/logger/index.js'

/**
 * Extract comprehensive file metadata with consistent ID and hash generation
 * Used by both DocumentProcessor and FileWatcher for consistency
 */
export async function extractFileMetadata(filePath: string): Promise<FileMetadata> {
  try {
    const stats = await stat(filePath)
    const fileName = basename(filePath)
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || ''

    // Generate consistent file ID based on path (deterministic)
    const fileId = createHash('sha256').update(filePath).digest('hex').substring(0, 16)

    // Calculate actual file hash for content-based change detection
    let fileHash: string
    try {
      fileHash = calculateFileHash(filePath).substring(0, 16)
    } catch (error) {
      logger.warn(`Failed to calculate file hash for ${filePath}, using fallback`, { filePath, error: error instanceof Error ? error : new Error(String(error)) })
      // Use path + size + mtime as fallback hash for consistency
      const fallback = `${filePath}_${stats.size}_${stats.mtime.getTime()}`
      fileHash = createHash('sha256').update(fallback).digest('hex').substring(0, 16)
    }

    return {
      id: fileId,
      name: fileName,
      path: filePath,
      size: stats.size,
      fileType: guessFileType(fileExtension),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      hash: fileHash,
    }
  } catch (error) {
    throw new Error(`Failed to extract file metadata: ${error}`)
  }
}

/**
 * Guess file type from extension
 */
function guessFileType(extension: string): string {
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

  return typeMap[extension] || extension || 'text'
}