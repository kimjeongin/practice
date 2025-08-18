import React, { useState, useEffect } from 'react'
import { useClientHost } from './hooks/useClientHost'
import { StatusDashboard } from './components/StatusDashboard'
import { ServerManager } from './components/ServerManager'
import { ToolBrowser } from './components/ToolBrowser'
import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App(): React.JSX.Element {
  const {
    servers,
    error,
    clearError
  } = useClientHost()

  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'tools'>('dashboard')
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
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [servers])


  const tabStyle = (isActive: boolean) => ({
    padding: '10px 20px',
    backgroundColor: isActive ? '#007acc' : '#f8f9fa',
    color: isActive ? 'white' : '#495057',
    border: '1px solid #dee2e6',
    borderBottom: isActive ? '1px solid #007acc' : '1px solid #dee2e6',
    cursor: 'pointer',
    borderRadius: '8px 8px 0 0',
    fontWeight: isActive ? 'bold' : 'normal'
  })

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '1200px', 
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img alt="logo" className="logo" src={electronLogo} style={{ 
            width: '64px', 
            height: '64px',
            filter: isShuttingDown ? 'grayscale(100%)' : 'none',
            transition: 'filter 0.3s ease'
          }} />
          {isShuttingDown && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '24px'
            }}>
              🔄
            </div>
          )}
        </div>
        <h1 style={{ margin: '10px 0', color: isShuttingDown ? '#95a5a6' : '#2c3e50', transition: 'color 0.3s ease' }}>
          🔗 MCP Client Host {isShuttingDown && '- Shutting Down'}
        </h1>
        <p style={{ color: '#6c757d', margin: '0 0 10px 0' }}>
          {isShuttingDown ? (
            <span style={{ color: '#e74c3c' }}>Disconnecting all servers and cleaning up resources...</span>
          ) : (
            <>
              Electron app with <span style={{ color: '#61dafb' }}>React</span> and{' '}
              <span style={{ color: '#3178c6' }}>TypeScript</span> + Generic MCP Server Support
            </>
          )}
        </p>
        
        {/* Global Error Display */}
        {error && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: '8px',
            padding: '12px',
            margin: '10px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <span>❌ {error}</span>
            <button
              onClick={clearError}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#721c24',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
                borderRadius: '4px',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5c6cb'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              ✕
            </button>
          </div>
        )}
        
        {/* Shutdown Warning */}
        {isShuttingDown && (
          <div style={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            border: '1px solid #ffeaa7',
            borderRadius: '8px',
            padding: '12px',
            margin: '10px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '20px', animation: 'spin 2s linear infinite' }}>⏳</div>
            <span>Preparing to close application... All MCP servers will be safely disconnected.</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '2px', 
        marginBottom: '0',
        borderBottom: '1px solid #dee2e6'
      }}>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={tabStyle(activeTab === 'dashboard')}
        >
          📊 Dashboard
        </button>
        <button
          onClick={() => setActiveTab('servers')}
          style={tabStyle(activeTab === 'servers')}
        >
          🖥️ Servers
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          style={tabStyle(activeTab === 'tools')}
        >
          🔧 Tools
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ 
        border: '1px solid #dee2e6',
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        padding: '20px',
        backgroundColor: 'white',
        minHeight: '400px'
      }}>
        {activeTab === 'dashboard' && <StatusDashboard />}
        {activeTab === 'servers' && <ServerManager />}
        {activeTab === 'tools' && <ToolBrowser />}
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '30px', 
        textAlign: 'center',
        fontSize: '14px',
        color: '#6c757d'
      }}>
        {!isShuttingDown && (
          <>
            <p>
              Press <code style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '2px 6px', 
                borderRadius: '4px',
                border: '1px solid #dee2e6'
              }}>F12</code> to open DevTools
            </p>
            <Versions />
          </>
        )}
        {isShuttingDown && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
            <p>Thank you for using MCP Client Host!</p>
            <div style={{ fontSize: '32px', margin: '10px 0' }}>👋</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
