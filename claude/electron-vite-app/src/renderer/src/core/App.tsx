import React, { useState, useEffect } from 'react'
import { useClientHost } from '../shared/hooks/useClientHost'
import { StatusDashboard } from '../features/dashboard/components/StatusDashboard'
import { ServerManager } from '../features/mcp/components/ServerManager'
import { ToolBrowser } from '../features/mcp/components/ToolBrowser'
import { MCPHubDashboard } from '../features/mcp/components/MCPHubDashboard'
import { MCPTester } from '../features/mcp/components/MCPTester'
import Versions from '../shared/components/Versions'
import electronLogo from '../assets/electron.svg'

function App(): React.JSX.Element {
  const {
    servers,
    error,
    clearError
  } = useClientHost()

  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'tools' | 'mcp-hub' | 'test'>('test')
  const [isShuttingDown, setIsShuttingDown] = useState(false)
  
  // Handle app shutdown notifications
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (servers.some(s => s.status === 'connected')) {
        setIsShuttingDown(true)
        const message = 'MCP servers are still running. They will be automatically disconnected.'
        event.returnValue = message
        return message
      }
      return
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [servers])

  const getTabClasses = (isActive: boolean) => 
    `px-5 py-2.5 cursor-pointer rounded-t-lg border border-gray-300 transition-all duration-200 font-medium ${
      isActive 
        ? 'bg-blue-600 text-white border-blue-600 font-bold' 
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`

  return (
    <div className="p-5 max-w-6xl mx-auto font-sans">
      {/* Global Error Display */}
      {error && (
        <div className="bg-red-100 text-red-800 border border-red-300 rounded-lg p-3 mx-0 my-2.5 flex justify-between items-center shadow-sm">
          <span>❌ {error}</span>
          <button
            onClick={clearError}
            className="bg-transparent border-none text-red-800 cursor-pointer text-base p-1 rounded hover:bg-red-200 transition-colors duration-200"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Shutdown Warning */}
      {isShuttingDown && (
        <div className="bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg p-3 mx-0 my-2.5 flex items-center gap-2 shadow-sm">
          <div className="text-xl animate-spin">⏳</div>
          <span>Preparing to close application... All MCP servers will be safely disconnected.</span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <div className="relative inline-block">
          <img 
            alt="logo" 
            className={`w-16 h-16 transition-all duration-300 ${isShuttingDown ? 'grayscale' : ''}`}
            src={electronLogo} 
          />
          {isShuttingDown && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl">
              🔄
            </div>
          )}
        </div>
        <h1 className={`my-2.5 transition-colors duration-300 text-2xl font-bold ${
          isShuttingDown ? 'text-gray-500' : 'text-gray-800'
        }`}>
          🔗 MCP Client Host {isShuttingDown && '- Shutting Down'}
        </h1>
        <p className="text-gray-600 m-0 mb-2.5">
          {isShuttingDown ? (
            <span className="text-red-600">Disconnecting all servers and cleaning up resources...</span>
          ) : (
            <>
              Electron app with <span className="text-blue-500">React</span> and{' '}
              <span className="text-blue-700">TypeScript</span> + Generic MCP Server Support
            </>
          )}
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-0.5 mb-0 border-b border-gray-300">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={getTabClasses(activeTab === 'dashboard')}
        >
          📊 Dashboard
        </button>
        <button
          onClick={() => setActiveTab('servers')}
          className={getTabClasses(activeTab === 'servers')}
        >
          🖥️ Servers
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={getTabClasses(activeTab === 'tools')}
        >
          🔧 Tools
        </button>
        <button
          onClick={() => setActiveTab('mcp-hub')}
          className={getTabClasses(activeTab === 'mcp-hub')}
        >
          🏢 MCP Hub
        </button>
        <button
          onClick={() => setActiveTab('test')}
          className={getTabClasses(activeTab === 'test')}
        >
          🧪 Test
        </button>
      </div>

      {/* Tab Content */}
      <div className="border border-gray-300 border-t-0 rounded-b-lg p-5 bg-white min-h-96">
        {activeTab === 'dashboard' && <StatusDashboard />}
        {activeTab === 'servers' && <ServerManager />}
        {activeTab === 'tools' && <ToolBrowser />}
        {activeTab === 'mcp-hub' && (
          <div className="p-0 m-0 h-full overflow-hidden">
            <MCPHubDashboard />
          </div>
        )}
        {activeTab === 'test' && <MCPTester />}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-600">
        {!isShuttingDown && (
          <>
            <p>
              Press <code className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300">F12</code> to open DevTools
            </p>
            <Versions />
          </>
        )}
        {isShuttingDown && (
          <div className="p-5 text-center text-gray-600">
            <p>Thank you for using MCP Client Host!</p>
            <div className="text-3xl my-2.5">👋</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App