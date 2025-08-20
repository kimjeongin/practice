import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getClientHostService } from '../services/mcp-client-host.service'
import { 
  ServerConfig, 
  ToolFilter, 
  IPC_CHANNELS,
  IPCResponse 
} from '../types/mcp-server.types'

// Error handling wrapper for IPC calls
async function handleIPCRequest<T>(
  operation: string,
  handler: () => Promise<T>
): Promise<IPCResponse<T>> {
  try {
    const data = await handler()
    return { 
      success: true, 
      data, 
      timestamp: new Date() 
    }
  } catch (error) {
    console.error(`${operation} failed:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date()
    }
  }
}

// ============================
// Server Management Handlers
// ============================

async function handleAddServer(
  _event: IpcMainInvokeEvent,
  serverConfig: Omit<ServerConfig, 'id'>
) {
  return handleIPCRequest('Add server', async () => {
    const service = getClientHostService()
    return await service.addServer(serverConfig)
  })
}

async function handleRemoveServer(
  _event: IpcMainInvokeEvent,
  serverId: string
) {
  return handleIPCRequest('Remove server', async () => {
    const service = getClientHostService()
    await service.removeServer(serverId)
    return { serverId }
  })
}

async function handleUpdateServer(
  _event: IpcMainInvokeEvent,
  serverId: string,
  updates: Partial<ServerConfig>
) {
  return handleIPCRequest('Update server', async () => {
    const service = getClientHostService()
    await service.updateServer(serverId, updates)
    return { serverId, updates }
  })
}

async function handleListServers(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('List servers', async () => {
    const service = getClientHostService()
    return service.getServerConnections()
  })
}

async function handleConnectServer(
  _event: IpcMainInvokeEvent,
  serverId: string
) {
  return handleIPCRequest('Connect server', async () => {
    const service = getClientHostService()
    await service.connectServer(serverId)
    return { serverId, connected: true }
  })
}

async function handleDisconnectServer(
  _event: IpcMainInvokeEvent,
  serverId: string
) {
  return handleIPCRequest('Disconnect server', async () => {
    const service = getClientHostService()
    await service.disconnectServer(serverId)
    return { serverId, connected: false }
  })
}

// ============================
// Tool Discovery Handlers
// ============================

async function handleListTools(
  _event: IpcMainInvokeEvent,
  serverId?: string
) {
  return handleIPCRequest('List tools', async () => {
    const service = getClientHostService()
    if (serverId) {
      return service.getServerTools(serverId)
    } else {
      return service.getAllTools()
    }
  })
}

async function handleSearchTools(
  _event: IpcMainInvokeEvent,
  filter: ToolFilter
) {
  return handleIPCRequest('Search tools', async () => {
    const service = getClientHostService()
    return service.searchTools(filter)
  })
}

async function handleGetToolDetails(
  _event: IpcMainInvokeEvent,
  serverId: string,
  toolName: string
) {
  return handleIPCRequest('Get tool details', async () => {
    const service = getClientHostService()
    return service.getToolDetails(serverId, toolName)
  })
}

// ============================
// Tool Execution Handlers
// ============================

async function handleExecuteTool(
  _event: IpcMainInvokeEvent,
  serverId: string,
  toolName: string,
  parameters: Record<string, any>,
  userId?: string
) {
  return handleIPCRequest('Execute tool', async () => {
    const service = getClientHostService()
    return await service.executeTool(serverId, toolName, parameters, userId)
  })
}

async function handleGetExecutionHistory(
  _event: IpcMainInvokeEvent,
  limit?: number
) {
  return handleIPCRequest('Get execution history', async () => {
    const service = getClientHostService()
    return service.getExecutionHistory(limit)
  })
}

async function handleClearHistory(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Clear history', async () => {
    const service = getClientHostService()
    service.clearExecutionHistory()
    return { cleared: true }
  })
}

// ============================
// Resource and Prompt Handlers
// ============================

async function handleListResources(
  _event: IpcMainInvokeEvent,
  serverId?: string
) {
  return handleIPCRequest('List resources', async () => {
    const service = getClientHostService()
    if (serverId) {
      const connection = service.getServerConnection(serverId)
      return connection?.resources || []
    } else {
      const connections = service.getServerConnections()
      return connections.flatMap(c => c.resources)
    }
  })
}

async function handleReadResource(
  _event: IpcMainInvokeEvent,
  serverId: string,
  uri: string
) {
  return handleIPCRequest('Read resource', async () => {
    const service = getClientHostService()
    const connection = service.getServerConnection(serverId)
    if (!connection?.client) {
      throw new Error(`Server ${serverId} is not connected`)
    }
    
    return await connection.client.readResource({ uri })
  })
}

async function handleListPrompts(
  _event: IpcMainInvokeEvent,
  serverId?: string
) {
  return handleIPCRequest('List prompts', async () => {
    const service = getClientHostService()
    if (serverId) {
      const connection = service.getServerConnection(serverId)
      return connection?.prompts || []
    } else {
      const connections = service.getServerConnections()
      return connections.flatMap(c => c.prompts)
    }
  })
}

async function handleGetPrompt(
  _event: IpcMainInvokeEvent,
  serverId: string,
  name: string,
  args?: Record<string, any>
) {
  return handleIPCRequest('Get prompt', async () => {
    const service = getClientHostService()
    const connection = service.getServerConnection(serverId)
    if (!connection?.client) {
      throw new Error(`Server ${serverId} is not connected`)
    }
    
    return await connection.client.getPrompt({ name, arguments: args })
  })
}

// ============================
// Configuration Handlers
// ============================

async function handleGetConfig(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Get config', async () => {
    const service = getClientHostService()
    return service.getConfiguration()
  })
}

async function handleUpdateConfig(
  _event: IpcMainInvokeEvent,
  updates: any
) {
  return handleIPCRequest('Update config', async () => {
    const service = getClientHostService()
    await service.updateConfiguration(updates)
    return service.getConfiguration()
  })
}

// ============================
// Status and Monitoring Handlers
// ============================

async function handleGetStatus(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Get status', async () => {
    const service = getClientHostService()
    return service.getStatus()
  })
}

// Event subscription handling
const eventSubscriptions = new Set<IpcMainInvokeEvent['sender']>()

async function handleSubscribeEvents(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Subscribe events', async () => {
    eventSubscriptions.add(_event.sender)
    return { subscribed: true }
  })
}

async function handleUnsubscribeEvents(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Unsubscribe events', async () => {
    eventSubscriptions.delete(_event.sender)
    return { unsubscribed: true }
  })
}

// ============================
// Additional Utility Handlers
// ============================

async function handleGetCategories(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Get categories', async () => {
    const service = getClientHostService()
    return service.getCategories()
  })
}

async function handleGetTags(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Get tags', async () => {
    const service = getClientHostService()
    return service.getTags()
  })
}

async function handleAddToFavorites(
  _event: IpcMainInvokeEvent,
  serverId: string,
  toolName: string
) {
  return handleIPCRequest('Add to favorites', async () => {
    const service = getClientHostService()
    service.addToFavorites(serverId, toolName)
    return { serverId, toolName, favorited: true }
  })
}

async function handleRemoveFromFavorites(
  _event: IpcMainInvokeEvent,
  serverId: string,
  toolName: string
) {
  return handleIPCRequest('Remove from favorites', async () => {
    const service = getClientHostService()
    service.removeFromFavorites(serverId, toolName)
    return { serverId, toolName, favorited: false }
  })
}

async function handleGetFavorites(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Get favorites', async () => {
    const service = getClientHostService()
    return service.getFavoriteTools()
  })
}

async function handleGetMostUsedTools(
  _event: IpcMainInvokeEvent,
  limit = 10
) {
  return handleIPCRequest('Get most used tools', async () => {
    const service = getClientHostService()
    return service.getMostUsedTools(limit)
  })
}

async function handleAddRagServer(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Add RAG server', async () => {
    const service = getClientHostService()
    return await service.addRagServer()
  })
}

async function handleExportData(_event: IpcMainInvokeEvent) {
  return handleIPCRequest('Export data', async () => {
    const service = getClientHostService()
    const data = await service.exportData()
    return { data }
  })
}

async function handleImportData(
  _event: IpcMainInvokeEvent,
  jsonData: string
) {
  return handleIPCRequest('Import data', async () => {
    const service = getClientHostService()
    await service.importData(jsonData)
    return { imported: true }
  })
}

// ============================
// Registration and Cleanup
// ============================

export function registerClientHostHandlers(): void {
  console.log('📡 Registering MCP Client Host IPC handlers...')

  // Remove existing handlers to avoid conflicts
  try {
    Object.values(IPC_CHANNELS).forEach(channel => {
      ipcMain.removeHandler(channel)
    })
  } catch (error) {
    // Handlers might not exist yet, ignore errors
  }

  // Server management
  ipcMain.handle(IPC_CHANNELS.ADD_SERVER, handleAddServer)
  ipcMain.handle(IPC_CHANNELS.REMOVE_SERVER, handleRemoveServer)
  ipcMain.handle(IPC_CHANNELS.UPDATE_SERVER, handleUpdateServer)
  ipcMain.handle(IPC_CHANNELS.LIST_SERVERS, handleListServers)
  ipcMain.handle(IPC_CHANNELS.CONNECT_SERVER, handleConnectServer)
  ipcMain.handle(IPC_CHANNELS.DISCONNECT_SERVER, handleDisconnectServer)

  // Tool discovery and management
  ipcMain.handle(IPC_CHANNELS.LIST_TOOLS, handleListTools)
  ipcMain.handle(IPC_CHANNELS.SEARCH_TOOLS, handleSearchTools)
  ipcMain.handle(IPC_CHANNELS.GET_TOOL_DETAILS, handleGetToolDetails)

  // Tool execution
  ipcMain.handle(IPC_CHANNELS.EXECUTE_TOOL, handleExecuteTool)
  ipcMain.handle(IPC_CHANNELS.GET_EXECUTION_HISTORY, handleGetExecutionHistory)
  ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, handleClearHistory)

  // Resources and prompts
  ipcMain.handle(IPC_CHANNELS.LIST_RESOURCES, handleListResources)
  ipcMain.handle(IPC_CHANNELS.READ_RESOURCE, handleReadResource)
  ipcMain.handle(IPC_CHANNELS.LIST_PROMPTS, handleListPrompts)
  ipcMain.handle(IPC_CHANNELS.GET_PROMPT, handleGetPrompt)

  // Configuration
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, handleGetConfig)
  ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG, handleUpdateConfig)

  // Status and monitoring
  ipcMain.handle(IPC_CHANNELS.GET_STATUS, handleGetStatus)
  ipcMain.handle(IPC_CHANNELS.SUBSCRIBE_EVENTS, handleSubscribeEvents)
  ipcMain.handle(IPC_CHANNELS.UNSUBSCRIBE_EVENTS, handleUnsubscribeEvents)

  // Additional utility handlers
  ipcMain.handle('client-host:get-categories', handleGetCategories)
  ipcMain.handle('client-host:get-tags', handleGetTags)
  ipcMain.handle('client-host:add-to-favorites', handleAddToFavorites)
  ipcMain.handle('client-host:remove-from-favorites', handleRemoveFromFavorites)
  ipcMain.handle('client-host:get-favorites', handleGetFavorites)
  ipcMain.handle('client-host:get-most-used-tools', handleGetMostUsedTools)
  ipcMain.handle('client-host:add-rag-server', handleAddRagServer)
  ipcMain.handle('client-host:export-data', handleExportData)
  ipcMain.handle('client-host:import-data', handleImportData)

  console.log('✅ MCP Client Host IPC handlers registered successfully')

  // Setup event forwarding
  setupEventForwarding()
}

export function unregisterClientHostHandlers(): void {
  console.log('🔌 Unregistering MCP Client Host IPC handlers...')

  try {
    Object.values(IPC_CHANNELS).forEach(channel => {
      ipcMain.removeHandler(channel)
    })

    // Remove additional handlers
    const additionalChannels = [
      'client-host:get-categories',
      'client-host:get-tags', 
      'client-host:add-to-favorites',
      'client-host:remove-from-favorites',
      'client-host:get-favorites',
      'client-host:get-most-used-tools',
      'client-host:add-rag-server',
      'client-host:export-data',
      'client-host:import-data'
    ]

    additionalChannels.forEach(channel => {
      ipcMain.removeHandler(channel)
    })

    console.log('✅ MCP Client Host IPC handlers unregistered successfully')
  } catch (error) {
    console.warn('Warning: Error unregistering MCP Client Host IPC handlers:', error)
  }
}

function setupEventForwarding(): void {
  const service = getClientHostService()

  // Forward service events to subscribed renderers
  const forwardEvent = (eventName: string, data: any) => {
    eventSubscriptions.forEach(sender => {
      if (!sender.isDestroyed()) {
        sender.send('client-host-event', { eventName, data })
      }
    })
  }

  service.on('server-connected', (data) => forwardEvent('server-connected', data))
  service.on('server-disconnected', (data) => forwardEvent('server-disconnected', data))
  service.on('server-error', (data) => forwardEvent('server-error', data))
  service.on('tool-executed', (data) => forwardEvent('tool-executed', data))
  service.on('tools-updated', (data) => forwardEvent('tools-updated', data))
}