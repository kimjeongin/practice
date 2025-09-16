import { RAGService } from '@/domains/rag/index.js'
import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '@/shared/logger/index.js'

export class InformationHandler {
  constructor(private ragService: RAGService) {}

  async handleVectorDBInfo() {
    try {
      // Get comprehensive RAG system information via RAGService
      const ragInfo = await this.ragService.getRagInfo()

      const responseData = {
        rag_system_info: ragInfo,
        vectordb_info: {
          provider: 'lancedb',
          isHealthy: ragInfo.vectorStore.isHealthy,
          documentCount: ragInfo.vectorStore.documentCount,
          info: ragInfo.vectorStore.info,
        },
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
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Handle initialization errors specifically
      if (errorMessage.includes('not initialized')) {
        logger.warn('RAG service not initialized during info request', { error: errorMessage })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'ServiceNotReady',
                  message: 'RAG service is not fully initialized yet',
                  suggestion:
                    'The server is still starting up. This usually takes 5-10 seconds. Please wait a moment and try again.',
                  status: {
                    serverStarted: true,
                    ragServiceReady: false,
                  },
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        }
      }
      
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
                message: errorMessage,
                suggestion:
                  'This usually indicates database initialization issues. Try: 1) Restart the MCP server, 2) Check if the database directory exists and has proper permissions, 3) Verify the LANCEDB_URI environment variable, 4) Run yarn db:setup if using the development setup',
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

}
