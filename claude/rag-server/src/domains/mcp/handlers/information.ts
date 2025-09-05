import { LanceDBProvider } from '@/domains/rag/lancedb/index.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'

export class InformationHandler {
  constructor(private vectorStoreProvider: LanceDBProvider) {}

  async handleVectorDBInfo() {
    try {
      // Get basic vector db information from VectorStore
      const result = await this.extractVectorDBInfo()

      const responseData = {
        vectordb_info: result[0] || {},
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
      logger.error(
        'Get vector db info failed',
        error instanceof Error ? error : new Error(String(error))
      )
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'VectorDBInfoFailed',
                message: error instanceof Error ? error.message : 'Failed to get vector db info',
                suggestion: 'This usually indicates database initialization issues. Try: 1) Restart the MCP server, 2) Check if the database directory exists and has proper permissions, 3) Verify the LANCEDB_URI environment variable, 4) Run yarn db:setup if using the development setup',
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
        name: 'get_vectordb_info',
        description:
          'Retrieve comprehensive vector database status and statistics. Use this tool to: check if documents are indexed and ready for search, diagnose search issues (empty results may indicate no indexed documents), verify system initialization, understand the knowledge base scope before performing searches, or provide users with information about available content. Returns document count, vector statistics, embedding model info, and database health status. Call this before search operations when troubleshooting or when users ask about available documents.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ]
  }

  /**
   * Extract basic vector db information from VectorStore metadata
   */
  private async extractVectorDBInfo(): Promise<any[]> {
    try {
      // Get basic info about the vector store
      const indexStats = await this.vectorStoreProvider.getIndexStats()
      const documentCount = await this.vectorStoreProvider.getDocumentCount()

      return [
        {
          name: 'Vector Store Documents',
          vectordb: 'lancedb',
          total_files: documentCount || 0,
          total_vectors: indexStats?.totalVectors || 0,
          dimensions: indexStats?.dimensions || 0,
          embedding_odel: indexStats?.embeddingModel || 'unknown',
        },
      ]
    } catch (error) {
      logger.warn(
        'Failed to extract vector db info from VectorStore',
        error instanceof Error ? error : new Error(String(error))
      )
      return []
    }
  }
}
