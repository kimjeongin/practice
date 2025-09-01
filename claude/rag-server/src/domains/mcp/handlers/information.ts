import { VectorStoreProvider } from '@/domains/rag/integrations/vectorstores/adapter.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'

export interface ListSourcesArgs {
  limit?: number
}

export class InformationHandler {
  constructor(private vectorStoreProvider: VectorStoreProvider) {}

  async handleListSources(args: ListSourcesArgs = {}) {
    const { limit = 100 } = args

    try {
      // Get basic file metadata from VectorStore
      const files = await this.extractBasicFileInfo(limit)

      const responseData = {
        total_files: files.length,
        files: files,
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
                suggestion: 'Check if documents are indexed in the vector store',
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
        description: 'List available files in the RAG system',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of files to return',
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
   * Extract basic file information from VectorStore metadata
   */
  private async extractBasicFileInfo(limit: number = 1000): Promise<any[]> {
    try {
      // Use getAllFileMetadata if available for efficiency (preferred method)
      if (this.vectorStoreProvider.getAllFileMetadata) {
        logger.debug('Using getAllFileMetadata for efficient source extraction')
        const fileMetadataMap = await this.vectorStoreProvider.getAllFileMetadata()

        const files: any[] = []
        for (const [, metadata] of fileMetadataMap) {
          const fileType = metadata.fileType || this.guessFileType(metadata.fileName || '')

          files.push({
            name: metadata.fileName || 'unknown',
            path: metadata.filePath || metadata.fileName || 'unknown',
            file_type: fileType,
            size: metadata.size || 0,
          })
        }

        return files.slice(0, limit)
      } else {
        logger.warn('getAllFileMetadata not found')
        return []
      }
    } catch (error) {
      logger.warn(
        'Failed to extract sources from VectorStore',
        error instanceof Error ? error : new Error(String(error))
      )
      return []
    }
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
