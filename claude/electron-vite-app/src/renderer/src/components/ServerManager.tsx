import { useState } from 'react'
import { useClientHost } from '../hooks/useClientHost'
import { ServerConfig } from '../../../shared/types/mcp-types'

interface ServerFormData {
  name: string
  description: string
  transport: 'stdio' | 'http' | 'sse'
  command: string
  args: string
  cwd: string
  enabled: boolean
  autoReconnect: boolean
  reconnectDelay: number
  maxReconnectAttempts: number
  tags: string
}

export function ServerManager() {
  const { 
    servers, 
    loading, 
    error, 
    addServer, 
    removeServer, 
    updateServer, 
    connectServer, 
    disconnectServer,
    addRagServer,
    clearError 
  } = useClientHost()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingServerId, setEditingServerId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    args: '',
    cwd: '',
    enabled: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 5,
    tags: ''
  })

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      transport: 'stdio',
      command: '',
      args: '',
      cwd: '',
      enabled: true,
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 5,
      tags: ''
    })
    setShowAddForm(false)
    setEditingServerId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const serverConfig: Omit<ServerConfig, 'id'> = {
      name: formData.name,
      description: formData.description || undefined,
      transport: formData.transport,
      command: formData.transport === 'stdio' ? formData.command : undefined,
      args: formData.transport === 'stdio' && formData.args ? formData.args.split(' ').filter(Boolean) : undefined,
      cwd: formData.cwd || undefined,
      enabled: formData.enabled,
      autoReconnect: formData.autoReconnect,
      reconnectDelay: formData.reconnectDelay,
      maxReconnectAttempts: formData.maxReconnectAttempts,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined
    }

    let success = false
    if (editingServerId) {
      success = await updateServer(editingServerId, serverConfig)
    } else {
      const result = await addServer(serverConfig)
      success = !!result
    }

    if (success) {
      resetForm()
    }
  }

  const handleEdit = (server: any) => {
    setFormData({
      name: server.config.name,
      description: server.config.description || '',
      transport: server.config.transport,
      command: server.config.command || '',
      args: server.config.args ? server.config.args.join(' ') : '',
      cwd: server.config.cwd || '',
      enabled: server.config.enabled,
      autoReconnect: server.config.autoReconnect,
      reconnectDelay: server.config.reconnectDelay,
      maxReconnectAttempts: server.config.maxReconnectAttempts,
      tags: server.config.tags ? server.config.tags.join(', ') : ''
    })
    setEditingServerId(server.config.id)
    setShowAddForm(true)
  }

  const handleDelete = async (serverId: string) => {
    if (confirm('Are you sure you want to remove this server?')) {
      await removeServer(serverId)
    }
  }

  const handleToggleConnection = async (server: any) => {
    if (server.status === 'connected') {
      await disconnectServer(server.config.id)
    } else {
      await connectServer(server.config.id)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600'
      case 'connecting': case 'reconnecting': return 'text-yellow-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '🟢'
      case 'connecting': case 'reconnecting': return '🟡'
      case 'error': return '🔴'
      default: return '⚪'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-100 p-6">
      {/* Header Section */}
      <div className="bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/20 p-6 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              MCP Server Management
            </h1>
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <span className="text-blue-500">⚙️</span>
              Configure and manage your MCP servers
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={addRagServer}
              className="group px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center gap-2"
              disabled={loading}
            >
              <span className="text-lg">🏥</span>
              <span className="font-semibold">Add RAG Server</span>
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="group px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
            >
              <span className="text-lg group-hover:rotate-180 transition-transform duration-500">➕</span>
              <span className="font-semibold">Add Server</span>
            </button>
          </div>
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

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200"></div>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent absolute inset-0"></div>
          </div>
        </div>
      )}

      {/* Server Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {servers.map((server) => (
          <div key={server.config.id} className="group relative bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] overflow-hidden">
            {/* Background gradient based on status */}
            <div className={`absolute inset-0 opacity-5 ${
              server.status === 'connected' ? 'bg-gradient-to-br from-green-400 to-emerald-600' :
              server.status === 'error' ? 'bg-gradient-to-br from-red-400 to-pink-600' :
              server.status === 'connecting' || server.status === 'reconnecting' ? 'bg-gradient-to-br from-yellow-400 to-orange-600' :
              'bg-gradient-to-br from-gray-400 to-slate-600'
            }`}></div>
            
            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="text-2xl group-hover:scale-110 transition-transform duration-300">
                      {getStatusIcon(server.status)}
                    </span>
                    {(server.status === 'connecting' || server.status === 'reconnecting') && (
                      <div className="absolute inset-0 border-2 border-yellow-500 rounded-full animate-ping"></div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{server.config.name}</h3>
                    <span className={`text-sm font-medium capitalize px-2 py-1 rounded-full ${
                      server.status === 'connected' ? 'bg-green-100 text-green-700' :
                      server.status === 'error' ? 'bg-red-100 text-red-700' :
                      server.status === 'connecting' || server.status === 'reconnecting' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {server.status}
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleConnection(server)}
                    className={`p-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 ${
                      server.status === 'connected'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                    disabled={loading || server.status === 'connecting' || server.status === 'reconnecting'}
                    title={server.status === 'connected' ? 'Disconnect' : 'Connect'}
                  >
                    {server.status === 'connected' ? '⏹️' : '▶️'}
                  </button>
                  <button
                    onClick={() => handleEdit(server)}
                    className="p-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-all duration-300 hover:scale-105"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(server.config.id)}
                    className="p-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-all duration-300 hover:scale-105"
                    disabled={loading}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Description */}
              {server.config.description && (
                <p className="text-gray-600 mb-4 text-sm line-clamp-2">{server.config.description}</p>
              )}
              
              {/* Server Info Grid */}
              <div className="bg-white/50 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Transport:</span>
                    <span className="ml-2 text-gray-800 font-medium capitalize">{server.config.transport}</span>
                  </div>
                  {server.connectedAt && (
                    <div>
                      <span className="font-medium text-gray-600">Connected:</span>
                      <span className="ml-2 text-gray-800">{new Date(server.connectedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                
                {server.config.command && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 font-mono">
                    {server.config.command} {server.config.args?.join(' ')}
                  </div>
                )}
                
                {server.lastError && (
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">
                    <span className="font-medium">Error:</span> {server.lastError}
                  </div>
                )}
              </div>

              {/* Tools Preview */}
              <div className="bg-white/50 rounded-xl p-4 mb-4">
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span>🔧</span>
                  Available Resources
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-blue-600">{server.tools.length}</div>
                    <div className="text-xs text-gray-500">Tools</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-600">{server.resources.length}</div>
                    <div className="text-xs text-gray-500">Resources</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-purple-600">{server.prompts.length}</div>
                    <div className="text-xs text-gray-500">Prompts</div>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {server.config.tags && server.config.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {server.config.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 text-xs rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {servers.length === 0 && !loading && (
          <div className="col-span-full">
            <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-12 text-center shadow-xl">
              <div className="text-6xl mb-4">🏥</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No Servers Configured</h3>
              <p className="text-gray-600 mb-6">Get started by adding your first MCP server</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={addRagServer}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
                >
                  Quick Start with RAG
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
                >
                  Add Custom Server
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Server Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl border border-white/30 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {editingServerId ? '✏️ Edit Server' : '➕ Add New Server'}
              </h3>
              <button
                onClick={resetForm}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-1 transition-all"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Server Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                  placeholder="Enter server name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Transport Type *
                </label>
                <select
                  value={formData.transport}
                  onChange={(e) => setFormData({ ...formData, transport: e.target.value as any })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                >
                  <option value="stdio">💻 STDIO (Local Process)</option>
                  <option value="http">🌍 HTTP (Web API)</option>
                  <option value="sse">⚡ SSE (Server-Sent Events)</option>
                </select>
              </div>

              {formData.transport === 'stdio' && (
                <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-200/50 space-y-4">
                  <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                    <span>⚙️</span>
                    STDIO Configuration
                  </h4>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Command *
                    </label>
                    <input
                      type="text"
                      value={formData.command}
                      onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                      placeholder="node, python, npx, etc."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Arguments
                    </label>
                    <input
                      type="text"
                      value={formData.args}
                      onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                      placeholder="script.js --option value"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Working Directory
                    </label>
                    <input
                      type="text"
                      value={formData.cwd}
                      onChange={(e) => setFormData({ ...formData, cwd: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                      placeholder="/path/to/working/directory"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                  placeholder="rag, search, documents, api"
                />
              </div>

              <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200/50">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>⚡</span>
                  Connection Settings
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Reconnect Delay (ms)
                    </label>
                    <input
                      type="number"
                      value={formData.reconnectDelay}
                      onChange={(e) => setFormData({ ...formData, reconnectDelay: parseInt(e.target.value) || 5000 })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                      min="1000"
                      max="60000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Max Attempts
                    </label>
                    <input
                      type="number"
                      value={formData.maxReconnectAttempts}
                      onChange={(e) => setFormData({ ...formData, maxReconnectAttempts: parseInt(e.target.value) || 5 })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
                      min="1"
                      max="20"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center space-x-6 py-2">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                    formData.enabled ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                      formData.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}></div>
                  </div>
                  <span className="ml-3 font-medium text-gray-700 group-hover:text-gray-900">Server Enabled</span>
                </label>

                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.autoReconnect}
                    onChange={(e) => setFormData({ ...formData, autoReconnect: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                    formData.autoReconnect ? 'bg-blue-500' : 'bg-gray-300'
                  }`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                      formData.autoReconnect ? 'translate-x-6' : 'translate-x-0'
                    }`}></div>
                  </div>
                  <span className="ml-3 font-medium text-gray-700 group-hover:text-gray-900">Auto Reconnect</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200/50">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl hover:from-purple-600 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50 disabled:transform-none"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <span>{editingServerId ? '✏️ Update' : '➕ Add Server'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}