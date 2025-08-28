import React, { useState, useEffect } from 'react'
import { useClientHost } from '../shared/hooks/useClientHost'
import { AgentChat } from '../features/agent/components/AgentChat'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import LoadingSpinner from '../shared/components/LoadingSpinner'

function App(): React.JSX.Element {
  const {
    servers,
    loading: clientHostLoading,
    error: clientHostError,
    clearError,
  } = useClientHost()

  const [isShuttingDown, setIsShuttingDown] = useState(false)

  // Handle app shutdown notifications
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): string | void => {
      const connectedServers = servers?.filter((s) => s.status === 'connected') || []
      if (connectedServers.length > 0) {
        setIsShuttingDown(true)
        const message = `${connectedServers.length} MCP server(s) are still running. They will be automatically disconnected.`
        event.returnValue = message
        return message
      }
      return undefined
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [servers])

  // Show loading spinner during initial client host setup
  if (clientHostLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" text="Initializing MCP Client Host..." />
          <p className="text-sm text-gray-500 mt-4">
            Setting up server connections and discovering tools...
          </p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <div className="p-5 max-w-6xl mx-auto font-sans">
          {/* Global Error Display */}
          {clientHostError && (
            <div className="bg-red-100 text-red-800 border border-red-300 rounded-lg p-3 mx-0 my-2.5 flex justify-between items-center shadow-sm">
              <div className="flex items-center space-x-2">
                <span>❌</span>
                <div>
                  <div className="font-medium">MCP Client Error</div>
                  <div className="text-sm">{clientHostError}</div>
                </div>
              </div>
              <button
                onClick={clearError}
                className="bg-transparent border-none text-red-800 cursor-pointer text-base p-1 rounded hover:bg-red-200 transition-colors duration-200"
                title="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Shutdown Warning */}
          {isShuttingDown && (
            <div className="bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg p-3 mx-0 my-2.5 flex items-center gap-2 shadow-sm">
              <div className="text-xl animate-spin">⏳</div>
              <span>
                Preparing to close application... All MCP servers will be safely disconnected.
              </span>
            </div>
          )}

          {/* Connection Status Summary */}
          {servers && servers.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="text-sm text-blue-800">
                <strong>MCP Status:</strong>{' '}
                {servers.filter((s) => s.status === 'connected').length} of {servers.length} servers
                connected
              </div>
            </div>
          )}

          <AgentChat />

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-600">
            {isShuttingDown && (
              <div className="p-5 text-center text-gray-600">
                <p>Thank you for using MCP Client Host!</p>
                <div className="text-3xl my-2.5">👋</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default App
