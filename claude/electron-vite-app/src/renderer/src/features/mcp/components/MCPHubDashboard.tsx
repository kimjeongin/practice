import { useEffect, useState } from 'react'
import { useClientHost } from '../../../shared/hooks/useClientHost'

export function MCPHubDashboard() {
  const { 
    servers, 
    loading, 
    error, 
    loadStatus,
    clearError,
    addRagServer
  } = useClientHost()

  const [currentTab, setCurrentTab] = useState<'dashboard' | 'servers' | 'groups' | 'market' | 'settings'>('dashboard')

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const connectedServers = servers.filter(s => s.status === 'connected')
  const offlineServers = servers.filter(s => s.status === 'disconnected' || s.status === 'error')
  const connectingServers = servers.filter(s => s.status === 'connecting' || s.status === 'reconnecting')
  
  const ragServers = servers.filter(s => s.config.name.toLowerCase().includes('rag'))
  const ragServer = ragServers.length > 0 ? ragServers[0] : null
  const isRagConnected = ragServer?.status === 'connected'

  const recentServers = [
    { name: 'playwright', status: 'Online', tools: 21, enabled: true },
    { name: 'time-mcp', status: 'Online', tools: 6, enabled: true },
    { name: 'sequential-thinking', status: 'Online', tools: 1, enabled: true },
    { name: ragServer ? ragServer.config.name : 'rag-server', status: isRagConnected ? 'Online' : 'Offline', tools: ragServer ? ragServer.tools.length : 12, enabled: ragServer ? true : false }
  ]

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', active: currentTab === 'dashboard' },
    { id: 'servers', label: 'Servers', icon: '🖥️', active: currentTab === 'servers' },
    { id: 'groups', label: 'Groups', icon: '👥', active: currentTab === 'groups' },
    { id: 'market', label: 'Market', icon: '🛒', active: currentTab === 'market' },
    { id: 'settings', label: 'Settings', icon: '⚙️', active: currentTab === 'settings' }
  ]

  return (
    <div className="flex h-screen bg-gray-50" style={{ margin: 0, padding: 0, minHeight: '600px' }}>
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-sm border-r border-gray-200">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="text-xl">≡</div>
            <h1 className="text-lg font-semibold text-gray-800">MCP Hub Dashboard</h1>
          </div>
          
          <nav className="space-y-1">
            {sidebarItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.active 
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">Dashboard</h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">Welcome, admin</span>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
              <div className="flex justify-between items-center">
                <span>⚠️ {error}</span>
                <button onClick={clearError} className="text-red-600 hover:text-red-800">✕</button>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {/* Total Servers */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Servers</p>
                  <p className="text-3xl font-bold text-gray-800">{servers.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl text-blue-600">🖥️</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>

            {/* Online Servers */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Online Servers</p>
                  <p className="text-3xl font-bold text-gray-800">{connectedServers.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl text-green-600">✅</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: servers.length > 0 ? `${(connectedServers.length / servers.length) * 100}%` : '0%' }}></div>
              </div>
            </div>

            {/* Offline Servers */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Offline Servers</p>
                  <p className="text-3xl font-bold text-gray-800">{offlineServers.length}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl text-red-600">❌</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full" style={{ width: servers.length > 0 ? `${(offlineServers.length / servers.length) * 100}%` : '0%' }}></div>
              </div>
            </div>

            {/* Connecting Servers */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Connecting Servers</p>
                  <p className="text-3xl font-bold text-gray-800">{connectingServers.length}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl text-yellow-600">🕐</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full" style={{ width: servers.length > 0 ? `${(connectingServers.length / servers.length) * 100}%` : '0%' }}></div>
              </div>
            </div>
          </div>

          {/* Recent Servers Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Recent Servers</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-6 text-sm font-medium text-gray-500 uppercase tracking-wider">Server Name</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-gray-500 uppercase tracking-wider">Tools</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-gray-500 uppercase tracking-wider">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentServers.map((server, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <span className="font-medium text-gray-800">{server.name}</span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          server.status === 'Online' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {server.status}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-sm text-gray-600">{server.tools}</span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-green-600">
                          {server.enabled ? '✓' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Server Controls */}
          {!ragServer && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-blue-800">Setup RAG Server</h4>
                  <p className="text-blue-600 mt-1">Get started by adding a RAG server to enable document search capabilities.</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await addRagServer()
                      loadStatus()
                    } catch (error) {
                      console.error('Failed to add RAG server:', error)
                    }
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  disabled={loading}
                >
                  {loading ? 'Setting up...' : 'Add RAG Server'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}