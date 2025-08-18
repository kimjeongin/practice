import { useEffect, useState } from 'react'
import { useClientHost } from '../hooks/useClientHost'

export function StatusDashboard() {
  const { 
    servers, 
    tools, 
    executionHistory, 
    status, 
    loading, 
    error, 
    loadStatus,
    clearError,
    addRagServer,
    connectServer,
    disconnectServer,
    removeServer
  } = useClientHost()

  useEffect(() => {
    // Set up auto-refresh every 10 seconds
    const interval = setInterval(() => {
      loadStatus()
    }, 10000)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [loadStatus])

  const connectedServers = servers.filter(s => s.status === 'connected')
  const disconnectedServers = servers.filter(s => s.status === 'disconnected')
  const errorServers = servers.filter(s => s.status === 'error')
  const ragServers = servers.filter(s => s.config.name.toLowerCase().includes('rag'))
  const ragServer = ragServers.length > 0 ? ragServers[0] : null
  const isRagConnected = ragServer?.status === 'connected'

  const recentExecutions = executionHistory.slice(0, 5)

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hours}h ${minutes}m ${secs}s`
  }

  const formatTimestamp = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleString()
  }

  const getExecutionStatusColor = (success: boolean, hasError: boolean) => {
    if (hasError) return 'text-red-600'
    if (success) return 'text-green-600'
    return 'text-gray-600'
  }

  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      {/* Header Section */}
      <div className="bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/20 p-6 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              MCP Client Host Dashboard
            </h1>
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <span className="text-green-500">●</span>
              Live monitoring • {currentTime.toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={loadStatus}
            className="group relative px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            ) : (
              <span className="text-lg group-hover:rotate-180 transition-transform duration-500">🔄</span>
            )}
            <span className="font-semibold">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-200/50 text-red-800 rounded-2xl shadow-lg">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-lg">⚠️</span>
              <span className="font-medium">{error}</span>
            </div>
            <button 
              onClick={clearError} 
              className="text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full p-1 transition-all"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* RAG Server Control Panel */}
      <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl mb-8">
        <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4 flex items-center gap-2">
          <span className="text-2xl">🏥</span>
          RAG Service Control
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* RAG Status */}
          <div className="bg-white/50 rounded-xl p-4 border border-white/30">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-4 h-4 rounded-full ${isRagConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'} shadow-lg`}></div>
              <h3 className="font-semibold text-gray-800">Service Status</h3>
            </div>
            <p className={`text-lg font-bold ${isRagConnected ? 'text-green-600' : 'text-red-600'}`}>
              {ragServer ? (isRagConnected ? 'Running' : 'Stopped') : 'Not Configured'}
            </p>
            {ragServer && (
              <p className="text-sm text-gray-500 mt-1">
                Server: {ragServer.config.name}
              </p>
            )}
          </div>

          {/* RAG Tools */}
          <div className="bg-white/50 rounded-xl p-4 border border-white/30">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🔧</span>
              Available Tools
            </h3>
            <p className="text-2xl font-bold text-blue-600">
              {ragServer ? ragServer.tools.length : 0}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              RAG tools ready
            </p>
          </div>

          {/* RAG Controls */}
          <div className="bg-white/50 rounded-xl p-4 border border-white/30">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>⚡</span>
              Quick Actions
            </h3>
            <div className="space-y-2">
              {!ragServer ? (
                <button
                  onClick={async () => {
                    try {
                      await addRagServer()
                    } catch (error) {
                      console.error('Failed to add RAG server:', error)
                    }
                  }}
                  className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-300 text-sm font-medium disabled:opacity-50"
                  disabled={loading}
                >
                  Setup RAG Server
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (isRagConnected) {
                        await disconnectServer(ragServer.config.id)
                      } else {
                        await connectServer(ragServer.config.id)
                      }
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      isRagConnected
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                    disabled={loading}
                  >
                    {isRagConnected ? 'Stop' : 'Start'}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Are you sure you want to remove the RAG server?')) {
                        await removeServer(ragServer.config.id)
                      }
                    }}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all duration-300 text-sm"
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* System Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Connected Servers */}
        <div className="group relative bg-white/60 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 to-emerald-600/10 opacity-50"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Connected Servers</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent">
                  {connectedServers.length}
                </p>
              </div>
              <div className="text-4xl group-hover:scale-110 transition-transform duration-300">🟢</div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {servers.length} total servers
              </p>
              <div className="h-2 w-12 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${servers.length > 0 ? (connectedServers.length / servers.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Tools */}
        <div className="group relative bg-white/60 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-cyan-600/10 opacity-50"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Available Tools</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-cyan-600 bg-clip-text text-transparent">
                  {tools.length}
                </p>
              </div>
              <div className="text-4xl group-hover:scale-110 transition-transform duration-300">🔧</div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              From {connectedServers.length} connected servers
            </p>
          </div>
        </div>

        {/* Recent Executions */}
        <div className="group relative bg-white/60 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-400/10 to-pink-600/10 opacity-50"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Recent Executions</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-600 bg-clip-text text-transparent">
                  {executionHistory.length}
                </p>
              </div>
              <div className="text-4xl group-hover:scale-110 transition-transform duration-300">📊</div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Total execution history
            </p>
          </div>
        </div>

        {/* System Uptime */}
        <div className="group relative bg-white/60 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/10 to-blue-600/10 opacity-50"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">System Uptime</p>
                <p className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-blue-600 bg-clip-text text-transparent">
                  {status?.uptime ? formatUptime(status.uptime) : 'N/A'}
                </p>
              </div>
              <div className="text-4xl group-hover:scale-110 transition-transform duration-300">⏱️</div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              System running time
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Status */}
        <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl">
          <h3 className="text-xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent mb-6 flex items-center gap-2">
            <span className="text-2xl">🖥️</span>
            Server Status
          </h3>
          
          {servers.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No servers configured</p>
          ) : (
            <div className="space-y-4">
              {servers.map((server) => (
                <div key={server.config.id} className="group relative bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-4 h-4 rounded-full transition-all duration-200 ${
                          server.status === 'connected' ? 'bg-green-500 shadow-green-500/50' :
                          server.status === 'error' ? 'bg-red-500 shadow-red-500/50' :
                          server.status === 'connecting' || server.status === 'reconnecting' ? 'bg-yellow-500 shadow-yellow-500/50' :
                          'bg-gray-400'
                        } shadow-lg`}></div>
                        {(server.status === 'connecting' || server.status === 'reconnecting') && (
                          <div className="absolute inset-0 w-4 h-4 rounded-full border-2 border-yellow-500 animate-ping"></div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{server.config.name}</p>
                        <p className={`text-sm capitalize font-medium ${
                          server.status === 'connected' ? 'text-green-600' :
                          server.status === 'error' ? 'text-red-600' :
                          server.status === 'connecting' || server.status === 'reconnecting' ? 'text-yellow-600' :
                          'text-gray-500'
                        }`}>{server.status}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-600">{server.tools.length} tools</p>
                      <p className="text-xs text-gray-500">
                        {server.connectedAt ? formatTimestamp(server.connectedAt) : 'Never connected'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Executions */}
        <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl">
          <h3 className="text-xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent mb-6 flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            Recent Tool Executions
          </h3>
          
          {recentExecutions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent executions</p>
          ) : (
            <div className="space-y-4">
              {recentExecutions.map((execution, index) => (
                <div key={index} className="relative bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {execution.result.success ? '✅' : '❌'}
                      </span>
                      <p className="font-semibold text-gray-800">{execution.context.toolName}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      execution.result.success 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {execution.result.success ? 'Success' : 'Error'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                    <div>
                      <p><span className="font-medium">Server:</span> {execution.context.serverId}</p>
                      <p><span className="font-medium">Duration:</span> {execution.result.executionTime}ms</p>
                    </div>
                    <div>
                      <p><span className="font-medium">Time:</span> {formatTimestamp(execution.result.timestamp)}</p>
                    </div>
                  </div>
                  {execution.result.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-700 font-medium">
                        Error: {execution.result.error}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error Servers Alert */}
      {errorServers.length > 0 && (
        <div className="mt-6 p-6 bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-2xl shadow-lg">
          <h4 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
            <span className="text-2xl animate-pulse">⚠️</span>
            Servers with Errors
          </h4>
          <div className="space-y-3">
            {errorServers.map((server) => (
              <div key={server.config.id} className="bg-white/50 rounded-xl p-3 border border-red-200">
                <span className="font-semibold text-red-700 block mb-1">{server.config.name}</span>
                {server.lastError && (
                  <span className="text-red-600 text-sm">{server.lastError}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disconnected Servers Info */}
      {disconnectedServers.length > 0 && (
        <div className="mt-4 p-6 bg-yellow-50/80 backdrop-blur-sm border border-yellow-200/50 rounded-2xl shadow-lg">
          <h4 className="text-lg font-bold text-yellow-800 mb-3 flex items-center gap-2">
            <span className="text-2xl">📴</span>
            Disconnected Servers
          </h4>
          <div className="text-sm text-yellow-700 bg-white/50 rounded-xl p-3">
            {disconnectedServers.map(s => s.config.name).join(', ')} 
            {disconnectedServers.length === 1 ? ' is' : ' are'} currently disconnected.
          </div>
        </div>
      )}

      {/* System Information */}
      {status && (
        <div className="mt-6 bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl">
          <h3 className="text-xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent mb-6 flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            System Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                <span className="font-medium text-gray-600">Initialized:</span>
                <span className={`font-bold ${status.initialized ? 'text-green-600' : 'text-red-600'}`}>
                  {status.initialized ? 'Yes ✅' : 'No ❌'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                <span className="font-medium text-gray-600">Total Servers:</span>
                <span className="font-bold text-blue-600">{status.totalServers || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                <span className="font-medium text-gray-600">Connected Servers:</span>
                <span className="font-bold text-green-600">{status.connectedServers || 0}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                <span className="font-medium text-gray-600">Total Tools:</span>
                <span className="font-bold text-purple-600">{status.totalTools || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                <span className="font-medium text-gray-600">Recent Executions:</span>
                <span className="font-bold text-indigo-600">{status.recentExecutions || 0}</span>
              </div>
              {status.configPath && (
                <div className="p-3 bg-white/50 rounded-xl">
                  <span className="font-medium text-gray-600 block mb-1">Config Path:</span>
                  <span className="text-xs text-gray-500 break-all">{status.configPath}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}