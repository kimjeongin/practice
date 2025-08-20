// React component for displaying RAG server status

interface ServerStatus {
  status: string
  uptime: number
  documentsCount: number
  modelsLoaded: string[]
}

interface RagStatusProps {
  connected: boolean
  loading: boolean
  error: string | null
  serverStatus: ServerStatus | null
  onRefresh: () => void
}

export default function RagStatus({ 
  connected, 
  loading, 
  error, 
  serverStatus, 
  onRefresh 
}: RagStatusProps) {
  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'ready':
      case 'connected':
        return '#28a745'
      case 'starting':
      case 'loading':
        return '#ffc107'
      case 'error':
      case 'disconnected':
      case 'failed':
        return '#dc3545'
      default:
        return '#6c757d'
    }
  }

  const getConnectionStatus = () => {
    if (loading) return { text: 'Connecting...', color: '#ffc107', icon: '⏳' }
    if (error) return { text: 'Error', color: '#dc3545', icon: '❌' }
    if (connected) return { text: 'Connected', color: '#28a745', icon: '✅' }
    return { text: 'Disconnected', color: '#dc3545', icon: '🔌' }
  }

  const connectionStatus = getConnectionStatus()

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>🏥 RAG Server Status</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#ccc' : '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* Connection Status */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px',
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: connectionStatus.color + '20',
        border: `2px solid ${connectionStatus.color}`,
        borderRadius: '8px'
      }}>
        <span style={{ fontSize: '24px' }}>{connectionStatus.icon}</span>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: connectionStatus.color }}>
            Connection: {connectionStatus.text}
          </div>
          {error && (
            <div style={{ fontSize: '14px', color: '#721c24', marginTop: '5px' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Server Status Details */}
      {connected && serverStatus && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
          {/* Server Status */}
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>📊 Server Status</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span 
                style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  backgroundColor: getStatusColor(serverStatus.status),
                  display: 'inline-block'
                }}
              />
              <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                {serverStatus.status}
              </span>
            </div>
          </div>

          {/* Uptime */}
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>⏰ Uptime</h4>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
              {formatUptime(serverStatus.uptime)}
            </div>
          </div>

          {/* Documents Count */}
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>📄 Documents</h4>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007acc' }}>
              {serverStatus.documentsCount}
            </div>
          </div>

          {/* Models Loaded */}
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>🤖 Models Loaded</h4>
            {serverStatus.modelsLoaded && serverStatus.modelsLoaded.length > 0 ? (
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745', marginBottom: '5px' }}>
                  {serverStatus.modelsLoaded.length}
                </div>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>
                  {serverStatus.modelsLoaded.map((model, index) => (
                    <div key={index} style={{ 
                      backgroundColor: '#e9ecef',
                      padding: '2px 6px',
                      margin: '2px 0',
                      borderRadius: '10px',
                      display: 'inline-block',
                      marginRight: '5px'
                    }}>
                      {model}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: '#6c757d', fontStyle: 'italic' }}>
                No models loaded
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !serverStatus && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: '#6c757d',
          fontStyle: 'italic'
        }}>
          ⏳ Loading server status...
        </div>
      )}

      {/* Not Connected State */}
      {!loading && !connected && !serverStatus && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: '#6c757d',
          fontStyle: 'italic'
        }}>
          🔌 Not connected to RAG server
        </div>
      )}
    </div>
  )
}