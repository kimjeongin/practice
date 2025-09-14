import React, { useState, useEffect } from 'react'

export interface InitializationStage {
  NOT_STARTED: 'not_started'
  DATABASE: 'database'
  MCP_LOADER: 'mcp_loader'
  AGENT_SERVICES: 'agent_services'
  SYSTEM_READY: 'system_ready'
  FAILED: 'failed'
}

export interface InitializationProgress {
  stage: keyof InitializationStage
  progress: number
  message: string
  error?: string
  timestamp: Date
}

interface InitializationProgressProps {
  onComplete?: () => void
}

const STAGE_LABELS: Record<string, string> = {
  not_started: 'Preparing to initialize...',
  database: 'Setting up database connections...',
  mcp_loader: 'Connecting to MCP servers...',
  agent_services: 'Initializing AI agent services...',
  system_ready: 'System ready!',
  failed: 'Initialization failed',
}

const STAGE_ICONS: Record<string, string> = {
  not_started: '⏳',
  database: '🗄️',
  mcp_loader: '🔌',
  agent_services: '🤖',
  system_ready: '✅',
  failed: '❌',
}

export function InitializationProgress({ onComplete }: InitializationProgressProps): React.JSX.Element {
  const [progress, setProgress] = useState<InitializationProgress>({
    stage: 'NOT_STARTED',
    progress: 0,
    message: 'Preparing to initialize...',
    timestamp: new Date(),
  })
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let mounted = true

    const handleProgressUpdate = (_event: unknown, progressData: InitializationProgress) => {
      if (!mounted) return

      console.log('🔄 Initialization progress update:', progressData)
      setProgress(progressData)

      if (progressData.error) {
        setHasError(true)
      }
    }

    const handleInitCompleted = (_event: unknown, status: InitializationProgress) => {
      if (!mounted) return

      console.log('✅ Initialization completed:', status)
      setProgress(status)
      setIsComplete(true)
      setHasError(false)

      setTimeout(() => {
        onComplete?.()
      }, 1500)
    }

    const handleInitFailed = (_event: unknown, failureInfo: { stage: string; error: string; timestamp: Date }) => {
      if (!mounted) return

      console.error('❌ Initialization failed:', failureInfo)
      setProgress({
        stage: 'FAILED',
        progress: 0,
        message: 'Initialization failed',
        error: failureInfo.error,
        timestamp: failureInfo.timestamp,
      })
      setHasError(true)
      setIsComplete(false)
    }

    // Set up IPC event listeners
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on('agent:init-progress', handleProgressUpdate)
      window.electron.ipcRenderer.on('agent:init-completed', handleInitCompleted)
      window.electron.ipcRenderer.on('agent:init-failed', handleInitFailed)
    }

    // Initial status check
    const checkInitialStatus = async () => {
      try {
        if (window.api?.agent?.isSystemReady) {
          const result = await window.api.agent.isSystemReady()
          if (result?.success && result.data?.isReady) {
            setIsComplete(true)
            onComplete?.()
          }
        }
      } catch (error) {
        console.warn('Could not check initial system status:', error)
      }
    }

    checkInitialStatus()

    return () => {
      mounted = false
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('agent:init-progress')
        window.electron.ipcRenderer.removeAllListeners('agent:init-completed')
        window.electron.ipcRenderer.removeAllListeners('agent:init-failed')
      }
    }
  }, [onComplete])

  if (isComplete && !hasError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center animate-fade-out">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">System Ready!</h2>
          <p className="text-gray-600">Loading application...</p>
        </div>
      </div>
    )
  }

  const currentIcon = STAGE_ICONS[progress.stage.toLowerCase()] || '⏳'
  const currentLabel = STAGE_LABELS[progress.stage.toLowerCase()] || progress.message

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3 animate-pulse">{currentIcon}</div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">
              {hasError ? 'Initialization Failed' : 'Starting System...'}
            </h2>
            <p className="text-gray-600 text-sm">
              {hasError ? 'An error occurred during startup' : 'Please wait while we set everything up'}
            </p>
          </div>

          {/* Progress Bar */}
          {!hasError && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{progress.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Current Stage */}
          <div className="mb-4">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-xl">{currentIcon}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-800">{currentLabel}</div>
                {progress.stage !== 'NOT_STARTED' && (
                  <div className="text-xs text-gray-500 mt-1">
                    Stage: {progress.stage.replace('_', ' ').toLowerCase()}
                  </div>
                )}
              </div>
              {!hasError && progress.progress < 100 && (
                <div className="animate-spin text-blue-500">⟳</div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {hasError && progress.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-red-800 text-sm">{progress.error}</div>
            </div>
          )}

          {/* Retry Button for Errors */}
          {hasError && (
            <div className="text-center">
              <button
                onClick={() => {
                  window.location.reload()
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading Animation */}
          {!hasError && (
            <div className="text-center">
              <div className="inline-flex space-x-1">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}