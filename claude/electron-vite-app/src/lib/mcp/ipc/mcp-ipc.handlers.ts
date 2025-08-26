import { ipcMain, IpcMainInvokeEvent } from 'electron'
// import { getMCPService } from '../services/mcp-service' // TODO: Fix MCP service import

// Temporary mock service
const getMCPService = () => ({
  isConnected: () => false,
  searchDocuments: async () => ({ results: [] }),
  uploadDocument: async () => ({ success: false, error: 'Not implemented' }),
  listFiles: async () => ({ files: [] }),
  getServerStatus: async () => ({ status: 'disconnected' }),
  forceReindex: async () => ({ success: false, error: 'Not implemented' }),
  getServerInfo: async () => ({ info: 'Mock service' }),
  testConnection: async () => ({ success: false, error: 'Not implemented' }),
})

// IPC Channel names
export const MCP_CHANNELS = {
  SEARCH_DOCUMENTS: 'mcp:search-documents',
  LIST_FILES: 'mcp:list-files',
  UPLOAD_DOCUMENT: 'mcp:upload-document',
  GET_SERVER_STATUS: 'mcp:get-server-status',
  FORCE_REINDEX: 'mcp:force-reindex',
  CHECK_CONNECTION: 'mcp:check-connection',
} as const

// Request/Response types
interface SearchDocumentsRequest {
  query: string
  options?: {
    topK?: number
    useSemanticSearch?: boolean
    useHybridSearch?: boolean
    semanticWeight?: number
    fileTypes?: string[]
  }
}

interface ListFilesRequest {
  options?: {
    fileType?: string
    limit?: number
    offset?: number
  }
}

interface UploadDocumentRequest {
  content: string
  fileName: string
}

interface ForceReindexRequest {
  clearCache?: boolean
}

// Error handling wrapper
async function handleMCPRequest<T>(
  operation: string,
  handler: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const service = getMCPService() as any

    if (!service.isConnected()) {
      return {
        success: false,
        error: 'MCP service is not connected. Please wait for the service to start.',
      }
    }

    const data = await handler()
    return { success: true, data }
  } catch (error) {
    console.error(`${operation} failed:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

// IPC Handlers
async function handleSearchDocuments(_event: IpcMainInvokeEvent, request: SearchDocumentsRequest) {
  return handleMCPRequest('Search documents', async () => {
    const service = getMCPService() as any
    return await service.searchDocuments(request.query, request.options)
  })
}

async function handleListFiles(_event: IpcMainInvokeEvent, request: ListFilesRequest) {
  return handleMCPRequest('List files', async () => {
    const service = getMCPService() as any
    return await service.listFiles(request.options)
  })
}

async function handleUploadDocument(_event: IpcMainInvokeEvent, request: UploadDocumentRequest) {
  return handleMCPRequest('Upload document', async () => {
    const service = getMCPService() as any
    return await service.uploadDocument(request.content, request.fileName)
  })
}

async function handleGetServerStatus(_event: IpcMainInvokeEvent) {
  return handleMCPRequest('Get server status', async () => {
    const service = getMCPService() as any
    return await service.getServerStatus()
  })
}

async function handleForceReindex(_event: IpcMainInvokeEvent, request: ForceReindexRequest) {
  return handleMCPRequest('Force reindex', async () => {
    const service = getMCPService() as any
    return await service.forceReindex(request.clearCache)
  })
}

async function handleCheckConnection(_event: IpcMainInvokeEvent) {
  try {
    const service = getMCPService() as any
    return {
      success: true,
      data: {
        connected: service.isConnected(),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Register all IPC handlers
export function registerMCPHandlers(): void {
  console.log('📡 Registering MCP IPC handlers...')

  // Remove existing handlers to avoid conflicts
  try {
    ipcMain.removeHandler(MCP_CHANNELS.SEARCH_DOCUMENTS)
    ipcMain.removeHandler(MCP_CHANNELS.LIST_FILES)
    ipcMain.removeHandler(MCP_CHANNELS.UPLOAD_DOCUMENT)
    ipcMain.removeHandler(MCP_CHANNELS.GET_SERVER_STATUS)
    ipcMain.removeHandler(MCP_CHANNELS.FORCE_REINDEX)
    ipcMain.removeHandler(MCP_CHANNELS.CHECK_CONNECTION)
  } catch (error) {
    // Handlers might not exist yet, ignore errors
  }

  // Register handlers
  ipcMain.handle(MCP_CHANNELS.SEARCH_DOCUMENTS, handleSearchDocuments)
  ipcMain.handle(MCP_CHANNELS.LIST_FILES, handleListFiles)
  ipcMain.handle(MCP_CHANNELS.UPLOAD_DOCUMENT, handleUploadDocument)
  ipcMain.handle(MCP_CHANNELS.GET_SERVER_STATUS, handleGetServerStatus)
  ipcMain.handle(MCP_CHANNELS.FORCE_REINDEX, handleForceReindex)
  ipcMain.handle(MCP_CHANNELS.CHECK_CONNECTION, handleCheckConnection)

  console.log('✅ MCP IPC handlers registered successfully')
}

// Unregister all IPC handlers
export function unregisterMCPHandlers(): void {
  console.log('🔌 Unregistering MCP IPC handlers...')

  try {
    ipcMain.removeHandler(MCP_CHANNELS.SEARCH_DOCUMENTS)
    ipcMain.removeHandler(MCP_CHANNELS.LIST_FILES)
    ipcMain.removeHandler(MCP_CHANNELS.UPLOAD_DOCUMENT)
    ipcMain.removeHandler(MCP_CHANNELS.GET_SERVER_STATUS)
    ipcMain.removeHandler(MCP_CHANNELS.FORCE_REINDEX)
    ipcMain.removeHandler(MCP_CHANNELS.CHECK_CONNECTION)

    console.log('✅ MCP IPC handlers unregistered successfully')
  } catch (error) {
    console.warn('Warning: Error unregistering MCP IPC handlers:', error)
  }
}

// Export types for use in renderer process
export type { SearchDocumentsRequest, ListFilesRequest, UploadDocumentRequest, ForceReindexRequest }
