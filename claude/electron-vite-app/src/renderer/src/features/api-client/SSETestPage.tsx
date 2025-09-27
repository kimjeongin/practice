import React, { useState, useEffect } from 'react'

interface SSEEvent {
  type: string
  message: string
  timestamp: string
  [key: string]: any
}

interface SSEConnection {
  id: string
  status: string
}

export function SSETestPage() {
  const [sseEvents, setSSEEvents] = useState<Array<{ connectionId: string; event: SSEEvent }>>([])
  const [sseConnections, setSSEConnections] = useState<SSEConnection[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [customMessage, setCustomMessage] = useState('Hello from Electron!')
  const [customInterval, setCustomInterval] = useState(2000)

  // Check login status on component mount
  useEffect(() => {
    checkLoginStatus()
    getSSEStatus()

    // Listen for SSE events from main process
    const handleSSEMessage = (_: any, data: { connectionId: string; event: SSEEvent }) => {
      console.log('📨 SSE Message received:', data)
      setSSEEvents(prev => [...prev.slice(-19), data]) // Keep last 20 events
    }

    const handleSSEStatus = (_: any, data: { connectionId: string; status: string }) => {
      console.log('📡 SSE Status update:', data)
      setSSEConnections(prev => {
        const updated = prev.filter(conn => conn.id !== data.connectionId)
        if (data.status !== 'disconnected') {
          updated.push({ id: data.connectionId, status: data.status })
        }
        return updated
      })
    }

    const handleSSEError = (_: any, data: { connectionId: string; error: string }) => {
      console.error('❌ SSE Error:', data)
      alert(`SSE Error (${data.connectionId}): ${data.error}`)
    }

    // Add IPC listeners
    window.electron.ipcRenderer.on('sse-message', handleSSEMessage)
    window.electron.ipcRenderer.on('sse-status', handleSSEStatus)
    window.electron.ipcRenderer.on('sse-error', handleSSEError)

    // Cleanup
    return () => {
      window.electron.ipcRenderer.removeAllListeners('sse-message')
      window.electron.ipcRenderer.removeAllListeners('sse-status')
      window.electron.ipcRenderer.removeAllListeners('sse-error')
    }
  }, [])

  const checkLoginStatus = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:get-login-status')
      setIsLoggedIn(result.success && result.data.isLoggedIn)
    } catch (error) {
      console.error('Failed to check login status:', error)
    }
  }

  const getSSEStatus = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:sse-get-status')
      if (result.success) {
        setSSEConnections(result.connections)
      }
    } catch (error) {
      console.error('Failed to get SSE status:', error)
    }
  }

  const handleLogin = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:login', 'admin', 'password')
      if (result.success) {
        setIsLoggedIn(true)
        alert('Login successful!')
      } else {
        alert(`Login failed: ${result.message}`)
      }
    } catch (error) {
      console.error('Login error:', error)
      alert('Login error occurred')
    }
  }

  const handleLogout = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:logout')
      if (result.success) {
        setIsLoggedIn(false)
        alert('Logout successful!')
      }
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const connectBasicSSE = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:sse-connect-basic', 'basic-test')
      if (result.success) {
        alert(`Basic SSE connected: ${result.message}`)
        getSSEStatus()
      } else {
        alert(`Failed to connect: ${result.message}`)
      }
    } catch (error) {
      console.error('SSE connection error:', error)
      alert('SSE connection error occurred')
    }
  }

  const connectCustomSSE = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'api:sse-connect-custom',
        'custom-test',
        customMessage,
        customInterval
      )
      if (result.success) {
        alert(`Custom SSE connected: ${result.message}`)
        getSSEStatus()
      } else {
        alert(`Failed to connect: ${result.message}`)
      }
    } catch (error) {
      console.error('Custom SSE connection error:', error)
      alert('Custom SSE connection error occurred')
    }
  }

  const connectProtectedSSE = async () => {
    if (!isLoggedIn) {
      alert('Please login first!')
      return
    }

    try {
      const result = await window.electron.ipcRenderer.invoke('api:sse-connect-protected', 'protected-test')
      if (result.success) {
        alert(`Protected SSE connected: ${result.message}`)
        getSSEStatus()
      } else {
        alert(`Failed to connect: ${result.message}`)
      }
    } catch (error) {
      console.error('Protected SSE connection error:', error)
      alert('Protected SSE connection error occurred')
    }
  }

  const disconnectSSE = async (connectionId: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:sse-disconnect', connectionId)
      if (result.success) {
        alert(`Disconnected: ${result.message}`)
        getSSEStatus()
      } else {
        alert(`Failed to disconnect: ${result.message}`)
      }
    } catch (error) {
      console.error('SSE disconnect error:', error)
      alert('SSE disconnect error occurred')
    }
  }

  const disconnectAllSSE = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api:sse-disconnect-all')
      if (result.success) {
        alert(`Disconnected all: ${result.message}`)
        getSSEStatus()
      } else {
        alert(`Failed to disconnect all: ${result.message}`)
      }
    } catch (error) {
      console.error('SSE disconnect all error:', error)
      alert('SSE disconnect all error occurred')
    }
  }

  const clearEvents = () => {
    setSSEEvents([])
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">SSE (Server-Sent Events) Test</h1>

      {/* Authentication Section */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-3">Authentication</h2>
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded ${isLoggedIn ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
            {isLoggedIn ? '✅ Logged In' : '❌ Not Logged In'}
          </span>
          {!isLoggedIn ? (
            <button
              onClick={handleLogin}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Login (admin/password)
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* SSE Controls Section */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-3">SSE Controls</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Basic SSE */}
          <div className="bg-white p-3 rounded border">
            <h3 className="font-medium mb-2">Basic SSE</h3>
            <button
              onClick={connectBasicSSE}
              className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Connect Basic
            </button>
          </div>

          {/* Custom SSE */}
          <div className="bg-white p-3 rounded border">
            <h3 className="font-medium mb-2">Custom SSE</h3>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Custom message"
              className="w-full px-2 py-1 border rounded mb-2 text-sm"
            />
            <input
              type="number"
              value={customInterval}
              onChange={(e) => setCustomInterval(Number(e.target.value))}
              placeholder="Interval (ms)"
              className="w-full px-2 py-1 border rounded mb-2 text-sm"
            />
            <button
              onClick={connectCustomSSE}
              className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Connect Custom
            </button>
          </div>

          {/* Protected SSE */}
          <div className="bg-white p-3 rounded border">
            <h3 className="font-medium mb-2">Protected SSE</h3>
            <p className="text-xs text-gray-600 mb-2">Requires login</p>
            <button
              onClick={connectProtectedSSE}
              disabled={!isLoggedIn}
              className={`w-full px-3 py-2 rounded ${
                isLoggedIn
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Connect Protected
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={getSSEStatus}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Refresh Status
          </button>
          <button
            onClick={disconnectAllSSE}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Disconnect All
          </button>
          <button
            onClick={clearEvents}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Clear Events
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-3">Active Connections</h2>
        {sseConnections.length === 0 ? (
          <p className="text-gray-600">No active connections</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {sseConnections.map((conn) => (
              <div key={conn.id} className="bg-white p-3 rounded border flex justify-between items-center">
                <div>
                  <span className="font-medium">{conn.id}</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    conn.status === 'connected' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
                  }`}>
                    {conn.status}
                  </span>
                </div>
                <button
                  onClick={() => disconnectSSE(conn.id)}
                  className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Events Log */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">SSE Events Log</h2>
        <div className="bg-black text-green-400 p-4 rounded h-96 overflow-y-auto font-mono text-sm">
          {sseEvents.length === 0 ? (
            <p className="text-gray-500">No events received yet...</p>
          ) : (
            sseEvents.map((item, index) => (
              <div key={index} className="mb-2">
                <span className="text-yellow-400">[{item.connectionId}]</span>{' '}
                <span className="text-cyan-400">{item.event.timestamp}</span>{' '}
                <span className="text-white">{item.event.type}:</span>{' '}
                <span className="text-green-400">{item.event.message}</span>
                {item.event.counter && (
                  <span className="text-purple-400"> (#{item.event.counter})</span>
                )}
                {item.event.secretData && (
                  <span className="text-red-400"> [Secret: {item.event.secretData}]</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}