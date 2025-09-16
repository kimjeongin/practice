import { getAppModelInfo } from '@shared/config/app.config'

interface LoadingStatesProps {
  isInitialized: boolean
  isLoading: boolean
  error: string | null
  onRetryInitialization: () => void
}

export function LoadingStates({
  isInitialized,
  isLoading,
  error,
  onRetryInitialization,
}: LoadingStatesProps): React.JSX.Element | null {
  if (!isInitialized && isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing Agent System...</p>
          <p className="text-sm text-gray-500 mt-2">
            Starting Ollama connection and loading models
          </p>
        </div>
      </div>
    )
  }

  if (!isInitialized && error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Initialization Failed</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <div className="text-sm text-gray-600 bg-gray-100 p-3 rounded-lg">
            <p className="font-semibold mb-2">Troubleshooting:</p>
            <ul className="text-left space-y-1">
              <li>
                • Ensure Ollama is running:{' '}
                <code className="bg-gray-200 px-1 rounded">ollama serve</code>
              </li>
              <li>
                • Check if models are available:{' '}
                <code className="bg-gray-200 px-1 rounded">ollama list</code>
              </li>
              <li>
                • Pull required models if missing:{' '}
                <code className="bg-gray-200 px-1 rounded">ollama pull {getAppModelInfo().name}</code>
              </li>
            </ul>
          </div>
          <button
            onClick={onRetryInitialization}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry Initialization
          </button>
        </div>
      </div>
    )
  }

  return null
}