import { useEffect, useState } from 'react'
import { useClientHost } from '../../../shared/hooks/useClientHost'

export function StatusDashboard() {
  const { 
    servers, 
    tools, 
    executionHistory, 
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

  const ragServers = servers.filter(s => s.config.name.toLowerCase().includes('rag'))
  const ragServer = ragServers.length > 0 ? ragServers[0] : null
  const isRagConnected = ragServer?.status === 'connected'
  const isRagConnecting = ragServer?.status === 'connecting' || ragServer?.status === 'reconnecting'

  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getConnectionStatusColor = () => {
    if (isRagConnected) return 'bg-green-500'
    if (isRagConnecting) return 'bg-yellow-500 animate-pulse'
    return 'bg-red-500'
  }

  const getConnectionStatusText = () => {
    if (isRagConnected) return 'Connected'
    if (isRagConnecting) return 'Connecting...'
    return ragServer ? 'Disconnected' : 'Not Configured'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              MCP Dashboard
            </h1>
            <p className="text-gray-600 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Live monitoring • {currentTime.toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={loadStatus}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-sm disabled:opacity-50 flex items-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-sm">🔄</span>
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-red-500">⚠️</span>
              <span className="text-red-800 font-medium">{error}</span>
            </div>
            <button 
              onClick={clearError} 
              className="text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full p-1 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* RAG Server Status Card */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          RAG Server Status
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Connection Status */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-3 h-3 rounded-full ${getConnectionStatusColor()}`}></div>
              <h3 className="font-semibold text-gray-800">Connection</h3>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-1">
              {getConnectionStatusText()}
            </p>
            {ragServer && (
              <p className="text-sm text-gray-500">
                {ragServer.config.name}
              </p>
            )}
          </div>

          {/* Available Tools */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🔧</span>
              Tools
            </h3>
            <p className="text-2xl font-bold text-blue-600 mb-1">
              {ragServer ? ragServer.tools.length : 0}
            </p>
            <p className="text-sm text-gray-500">
              Available tools
            </p>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>⚡</span>
              Actions
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
                  className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
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
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      isRagConnected
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                    disabled={loading || isRagConnecting}
                  >
                    {isRagConnected ? 'Stop' : 'Start'}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Are you sure you want to remove the RAG server?')) {
                        await removeServer(ragServer.config.id)
                      }
                    }}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200 text-sm"
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

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Servers */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Servers</p>
              <p className="text-2xl font-bold text-gray-900">{servers.length}</p>
            </div>
            <div className="text-3xl">🖥️</div>
          </div>
        </div>

        {/* Connected Servers */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Connected</p>
              <p className="text-2xl font-bold text-green-600">
                {servers.filter(s => s.status === 'connected').length}
              </p>
            </div>
            <div className="text-3xl">🟢</div>
          </div>
        </div>

        {/* Available Tools */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Tools</p>
              <p className="text-2xl font-bold text-blue-600">{tools.length}</p>
            </div>
            <div className="text-3xl">🔧</div>
          </div>
        </div>

        {/* Executions */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Executions</p>
              <p className="text-2xl font-bold text-purple-600">{executionHistory.length}</p>
            </div>
            <div className="text-3xl">📊</div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {executionHistory.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            Recent Activity
          </h3>
          <div className="space-y-3">
            {executionHistory.slice(0, 5).map((execution, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {execution.result.success ? '✅' : '❌'}
                    </span>
                    <span className="font-medium text-gray-800">{execution.context.toolName}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(execution.result.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}