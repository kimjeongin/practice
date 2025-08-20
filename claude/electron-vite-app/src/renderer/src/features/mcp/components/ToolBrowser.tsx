import { useState, useEffect } from 'react'
import { useClientHost } from '../../../shared/hooks/useClientHost'
import { MCPTool, ToolFilter } from '../../../../../shared/types/mcp.types'

interface ToolExecutionForm {
  parameters: Record<string, any>
  showForm: boolean
  tool: MCPTool | null
}

export function ToolBrowser() {
  const { 
    tools, 
    servers, 
    loading, 
    error, 
    loadTools, 
    searchTools, 
    getToolDetails, 
    executeTool,
    addToFavorites,
    removeFromFavorites,
    getFavorites,
    getCategories,
    getTags,
    clearError 
  } = useClientHost()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [favorites, setFavorites] = useState<MCPTool[]>([])
  const [executionForm, setExecutionForm] = useState<ToolExecutionForm>({
    parameters: {},
    showForm: false,
    tool: null
  })
  const [executionResult, setExecutionResult] = useState<any>(null)

  // Load categories, tags, and favorites on mount
  useEffect(() => {
    const loadMetadata = async () => {
      const [categoriesData, tagsData, favoritesData] = await Promise.all([
        getCategories(),
        getTags(),
        getFavorites()
      ])
      setCategories(categoriesData)
      setTags(tagsData)
      setFavorites(favoritesData)
    }
    loadMetadata()
  }, [getCategories, getTags, getFavorites])

  // Filter tools based on search criteria
  useEffect(() => {
    const applyFilters = async () => {
      if (showFavoritesOnly) {
        const favoritesData = await getFavorites()
        setFavorites(favoritesData)
        return
      }

      const filter: ToolFilter = {}
      
      if (searchQuery) {
        filter.search = searchQuery
      }
      
      if (selectedServerId) {
        filter.serverIds = [selectedServerId]
      }
      
      if (selectedCategory) {
        filter.categories = [selectedCategory]
      }
      
      if (selectedTags.length > 0) {
        filter.tags = selectedTags
      }

      if (Object.keys(filter).length > 0) {
        await searchTools(filter)
      } else {
        await loadTools()
      }
    }

    applyFilters()
  }, [searchQuery, selectedServerId, selectedCategory, selectedTags, showFavoritesOnly, searchTools, loadTools, getFavorites])

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleFavoriteToggle = async (tool: MCPTool) => {
    const isFavorite = favorites.some(fav => fav.serverId === tool.serverId && fav.name === tool.name)
    
    if (isFavorite) {
      await removeFromFavorites(tool.serverId, tool.name)
    } else {
      await addToFavorites(tool.serverId, tool.name)
    }
    
    // Refresh favorites
    const updatedFavorites = await getFavorites()
    setFavorites(updatedFavorites)
  }

  const handleExecuteTool = async (tool: MCPTool) => {
    try {
      // Get tool details first to understand parameters
      const details = await getToolDetails(tool.serverId, tool.name)
      
      // Initialize form with empty parameters based on schema
      const initialParameters: Record<string, any> = {}
      if (details?.inputSchema?.properties) {
        Object.keys(details.inputSchema.properties).forEach(key => {
          initialParameters[key] = ''
        })
      }

      setExecutionForm({
        parameters: initialParameters,
        showForm: true,
        tool
      })
    } catch (error) {
      console.error('Failed to get tool details:', error)
    }
  }

  const handleParameterChange = (key: string, value: any) => {
    setExecutionForm(prev => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [key]: value
      }
    }))
  }

  const handleExecuteSubmit = async () => {
    if (!executionForm.tool) return

    try {
      const result = await executeTool(
        executionForm.tool.serverId,
        executionForm.tool.name,
        executionForm.parameters
      )
      
      setExecutionResult(result)
      setExecutionForm({
        parameters: {},
        showForm: false,
        tool: null
      })
    } catch (error) {
      console.error('Tool execution failed:', error)
    }
  }

  const displayTools = showFavoritesOnly ? favorites : tools
  const connectedServers = servers.filter(s => s.status === 'connected')

  const isFavorite = (tool: MCPTool) => 
    favorites.some(fav => fav.serverId === tool.serverId && fav.name === tool.name)

  const renderParameterInput = (key: string, schema: any) => {
    const value = executionForm.parameters[key] || ''
    
    if (schema.type === 'boolean') {
      return (
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => handleParameterChange(key, e.target.checked)}
            className="sr-only"
          />
          <div className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
            value ? 'bg-green-500' : 'bg-gray-300'
          }`}>
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
              value ? 'translate-x-6' : 'translate-x-0'
            }`}></div>
          </div>
          <span className="ml-3 text-sm text-gray-600">{value ? 'Enabled' : 'Disabled'}</span>
        </label>
      )
    } else if (schema.type === 'number' || schema.type === 'integer') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handleParameterChange(key, parseFloat(e.target.value) || 0)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
          placeholder={`Enter ${schema.type} value`}
        />
      )
    } else if (schema.enum) {
      return (
        <select
          value={value}
          onChange={(e) => handleParameterChange(key, e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
        >
          <option value="">Select an option...</option>
          {schema.enum.map((option: any) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      )
    } else {
      return (
        <textarea
          value={value}
          onChange={(e) => handleParameterChange(key, e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200 resize-vertical"
          rows={schema.type === 'object' || schema.type === 'array' ? 4 : 2}
          placeholder={schema.description || `Enter ${key} value`}
        />
      )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-100 p-6">
      {/* Header Section */}
      <div className="bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/20 p-6 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Tool Explorer
            </h1>
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <span className="text-indigo-500">🔍</span>
              Discover and execute MCP tools across all servers
            </p>
          </div>
          <div className="bg-white/50 rounded-2xl px-6 py-3 border border-white/30">
            <div className="text-sm text-gray-500">Available Tools</div>
            <div className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {displayTools.length}
            </div>
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

      {/* Advanced Filters */}
      <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">🎛️</span>
          Search & Filter Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <span>🔍</span>
              Search Tools
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or description..."
                className="w-full px-4 py-3 pl-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                🔍
              </div>
            </div>
          </div>

          {/* Server Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <span>🖥️</span>
              Server Filter
            </label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
            >
              <option value="">🌐 All Servers ({connectedServers.length})</option>
              {connectedServers.map((server) => (
                <option key={server.config.id} value={server.config.id}>
                  {server.config.name} ({server.tools.length} tools)
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <span>📁</span>
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white/70 backdrop-blur-sm transition-all duration-200"
            >
              <option value="">🏷️ All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {/* Favorites Toggle */}
          <div className="flex items-end">
            <label className="flex items-center cursor-pointer group">
              <input
                type="checkbox"
                checked={showFavoritesOnly}
                onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                showFavoritesOnly ? 'bg-yellow-400' : 'bg-gray-300'
              }`}>
                <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform duration-200 flex items-center justify-center ${
                  showFavoritesOnly ? 'translate-x-7' : 'translate-x-0'
                }`}>
                  <span className="text-xs">{showFavoritesOnly ? '⭐' : '🔲'}</span>
                </div>
              </div>
              <span className="ml-3 text-sm font-semibold text-gray-700 group-hover:text-gray-900">
                ⭐ Favorites Only
              </span>
            </label>
          </div>
        </div>

        {/* Tag Filters */}
        {tags.length > 0 && (
          <div className="col-span-full bg-white/50 rounded-xl p-4 border border-white/30">
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span>🏷️</span>
              Filter by Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-4 py-2 text-sm rounded-full font-medium transition-all duration-200 hover:scale-105 ${
                    selectedTags.includes(tag)
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  {selectedTags.includes(tag) ? '✓ ' : ''}{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200"></div>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent absolute inset-0"></div>
          </div>
        </div>
      )}

      {/* Tool Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayTools.map((tool) => (
          <div key={`${tool.serverId}-${tool.name}`} className="group relative bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/5 to-purple-600/5 opacity-50"></div>
            
            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-gray-800 group-hover:text-indigo-700 transition-colors">
                      {tool.name}
                    </h3>
                    <button
                      onClick={() => handleFavoriteToggle(tool)}
                      className={`text-xl transition-all duration-200 hover:scale-125 ${
                        isFavorite(tool) 
                          ? 'text-yellow-500 hover:text-yellow-600 drop-shadow-sm' 
                          : 'text-gray-300 hover:text-yellow-400'
                      }`}
                    >
                      ⭐
                    </button>
                  </div>
                  
                  {tool.category && (
                    <span className="px-3 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 text-indigo-700 text-xs rounded-full font-semibold">
                      {tool.category}
                    </span>
                  )}
                </div>
                
                <button
                  onClick={() => handleExecuteTool(tool)}
                  className="group/btn px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:transform-none text-sm font-semibold"
                  disabled={loading}
                >
                  <span className="flex items-center gap-1">
                    <span className="group-hover/btn:rotate-12 transition-transform duration-200">▶️</span>
                    Execute
                  </span>
                </button>
              </div>

              {/* Description */}
              <p className="text-gray-600 mb-4 text-sm line-clamp-3 leading-relaxed">
                {tool.description}
              </p>
              
              {/* Server Info */}
              <div className="bg-white/50 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-blue-500">🖥️</span>
                  <span className="font-medium text-gray-600">Server:</span>
                  <span className="text-gray-800 font-semibold">{tool.serverName}</span>
                </div>
              </div>

              {/* Tags */}
              {tool.tags && tool.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tool.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                  {tool.tags.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                      +{tool.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {displayTools.length === 0 && !loading && (
          <div className="col-span-full">
            <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/30 p-12 text-center shadow-xl">
              <div className="text-6xl mb-4">
                {showFavoritesOnly ? '⭐' : '🔍'}
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {showFavoritesOnly ? 'No Favorites Yet' : 'No Tools Found'}
              </h3>
              <p className="text-gray-600 mb-6">
                {showFavoritesOnly 
                  ? 'Star some tools to add them to your favorites collection'
                  : 'Try adjusting your search criteria or make sure you have connected servers'
                }
              </p>
              {!showFavoritesOnly && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedServerId('')
                    setSelectedCategory('')
                    setSelectedTags([])
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tool Execution Form */}
      {executionForm.showForm && executionForm.tool && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl border border-white/30 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent flex items-center gap-2">
                  <span>▶️</span>
                  Execute Tool
                </h3>
                <p className="text-lg font-semibold text-gray-800 mt-1">{executionForm.tool?.name}</p>
              </div>
              <button
                onClick={() => setExecutionForm({ parameters: {}, showForm: false, tool: null })}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-2 transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="bg-gray-50/50 rounded-xl p-4 mb-6">
              <p className="text-gray-700 font-medium">{executionForm.tool?.description}</p>
            </div>

            <div className="space-y-5">
              {executionForm.tool?.inputSchema?.properties && 
                Object.entries(executionForm.tool.inputSchema.properties).map(([key, schema]: [string, any]) => (
                  <div key={key} className="bg-white/50 rounded-xl p-4 border border-white/30">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {key}
                      {executionForm.tool?.inputSchema?.required?.includes(key) && (
                        <span className="text-red-500 ml-1 text-base">*</span>
                      )}
                    </label>
                    {schema.description && (
                      <div className="text-sm text-gray-600 mb-3 italic">
                        {schema.description}
                      </div>
                    )}
                    {renderParameterInput(key, schema)}
                  </div>
                ))
              }
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200/50">
              <button
                onClick={() => setExecutionForm({ parameters: {}, showForm: false, tool: null })}
                className="px-6 py-3 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSubmit}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50 disabled:transform-none"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Executing...</span>
                  </div>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>▶️</span>
                    Execute Tool
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Result */}
      {executionResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl border border-white/30 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent flex items-center gap-2">
                <span>✅</span>
                Execution Result
              </h3>
              <button
                onClick={() => setExecutionResult(null)}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-2 transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto border border-gray-200">
              <pre className="text-sm text-green-400 whitespace-pre-wrap font-mono">
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(executionResult, null, 2))
                }}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium"
              >
                📋 Copy Result
              </button>
              <button
                onClick={() => setExecutionResult(null)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}