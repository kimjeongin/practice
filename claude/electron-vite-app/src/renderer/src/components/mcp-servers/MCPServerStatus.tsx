import { useMCPServers } from '../../hooks/useMCPServers'

interface MCPServerStatusProps {
  compact?: boolean
}

export function MCPServerStatus({ compact = false }: MCPServerStatusProps) {
  const { servers, isLoading, error, refresh } = useMCPServers()

  if (isLoading && servers.servers.length === 0) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm">
        <span>⚠️ MCP Status Error</span>
        {!compact && (
          <button
            onClick={refresh}
            className="ml-2 text-blue-600 hover:text-blue-800 underline"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  const formatConnectionTime = (date?: Date) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting'
      case 'reconnecting':
        return 'Reconnecting'
      case 'error':
        return 'Error'
      default:
        return 'Disconnected'
    }
  }

  if (compact) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <span className={`w-2 h-2 rounded-full ${servers.connectedServers > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span>
          MCP Servers: {servers.connectedServers}/{servers.totalServers}
        </span>
        <span className="text-gray-400">•</span>
        <span>{servers.totalTools} tools</span>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800">🔧 MCP Servers</h3>
        <button
          onClick={refresh}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="bg-white p-3 rounded-lg border">
          <div className="text-sm text-gray-600">Total Servers</div>
          <div className="text-xl font-bold text-gray-800">{servers.totalServers}</div>
        </div>
        <div className="bg-white p-3 rounded-lg border">
          <div className="text-sm text-gray-600">Connected</div>
          <div className="text-xl font-bold text-green-600">{servers.connectedServers}</div>
        </div>
        <div className="bg-white p-3 rounded-lg border">
          <div className="text-sm text-gray-600">Available Tools</div>
          <div className="text-xl font-bold text-blue-600">{servers.totalTools}</div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium text-gray-700">Server Details:</h4>
        {servers.servers.length === 0 ? (
          <div className="text-gray-500 text-sm italic">No MCP servers configured</div>
        ) : (
          servers.servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between bg-white p-3 rounded-lg border"
            >
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(server.status)}`}></div>
                <div>
                  <div className="font-medium text-gray-800">{server.name}</div>
                  <div className="text-sm text-gray-500">
                    {getStatusText(server.status)}
                    {server.connectedAt && server.status === 'connected' && 
                      ` • Connected at ${formatConnectionTime(server.connectedAt)}`
                    }
                  </div>
                  {server.lastError && (
                    <div className="text-xs text-red-600 mt-1">
                      Error: {server.lastError}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-800">
                  {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}
                </div>
                <div className="text-xs text-gray-500">{server.id}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}