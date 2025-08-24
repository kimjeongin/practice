import React, { useState, useEffect } from 'react'
// import { useClientHost } from '../shared/hooks/useClientHost' // Temporarily disabled
import { AgentChat } from '../features/agent/components/AgentChat'
import Versions from '../shared/components/Versions'

function App(): React.JSX.Element {
  // Temporarily disable useClientHost to get app working
  // const {
  //   servers,
  //   error,
  //   clearError
  // } = useClientHost()

  const servers: any[] = [] // Temporary mock
  const error: string | null = null // Temporary mock
  const clearError = () => {} // Temporary mock

  const [isShuttingDown, setIsShuttingDown] = useState(false)

  // Handle app shutdown notifications
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (servers.some((s) => s.status === 'connected')) {
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
          <span>
            Preparing to close application... All MCP servers will be safely disconnected.
          </span>
        </div>
      )}

      <AgentChat />

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-600">
        {!isShuttingDown && <Versions />}
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
