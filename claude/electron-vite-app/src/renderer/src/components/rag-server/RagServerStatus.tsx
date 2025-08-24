/**
 * RAG Server Connection Status Component
 * Shows connection status and provides reconnect functionality
 */

import React, { useState } from 'react'
import { useRagServerStatus } from '../../hooks/useRagServerStatus'

export const RagServerStatus: React.FC = () => {
  const { 
    status, 
    isLoading, 
    reconnect, 
    testSearch, 
    isConnected, 
    hasSearchTools,
    connectionError 
  } = useRagServerStatus()
  
  const [testResult, setTestResult] = useState<any>(null)
  const [isTestingSearch, setIsTestingSearch] = useState(false)

  const handleReconnect = async () => {
    const success = await reconnect()
    if (success) {
      setTestResult(null) // Clear previous test results
    }
  }

  const handleTestSearch = async () => {
    setIsTestingSearch(true)
    try {
      const result = await testSearch('test query from electron app')
      setTestResult(result)
    } catch (error) {
      setTestResult({ error: error instanceof Error ? error.message : 'Test failed' })
    } finally {
      setIsTestingSearch(false)
    }
  }

  const getStatusColor = () => {
    if (isConnected) return 'text-green-600'
    if (connectionError) return 'text-red-600'
    return 'text-yellow-600'
  }

  const getStatusIcon = () => {
    if (isLoading) return '⏳'
    if (isConnected) return '✅'
    if (connectionError) return '❌'
    return '⚪'
  }

  const getStatusText = () => {
    if (isLoading) return 'Checking connection...'
    if (isConnected) return 'Connected'
    if (connectionError) return `Disconnected: ${connectionError}`
    return 'Unknown status'
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-gray-900">RAG Server Status</h3>
        <div className={`flex items-center space-x-2 ${getStatusColor()}`}>
          <span className="text-lg">{getStatusIcon()}</span>
          <span className="font-medium">{getStatusText()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-600">Server URL:</p>
          <p className="text-sm font-mono">{status.url}</p>
        </div>
        
        {status.lastCheck && (
          <div>
            <p className="text-sm text-gray-600">Last Check:</p>
            <p className="text-sm">{new Date(status.lastCheck).toLocaleTimeString()}</p>
          </div>
        )}
        
        {status.tools.length > 0 && (
          <div className="md:col-span-2">
            <p className="text-sm text-gray-600">Available Tools:</p>
            <p className="text-sm">{status.tools.join(', ')}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={handleReconnect}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
        >
          {isLoading ? 'Reconnecting...' : 'Reconnect'}
        </button>
        
        {hasSearchTools && (
          <button
            onClick={handleTestSearch}
            disabled={isTestingSearch || !isConnected}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
          >
            {isTestingSearch ? 'Testing...' : 'Test Search'}
          </button>
        )}
      </div>

      {testResult && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Test Search Result:</h4>
          {testResult.error ? (
            <p className="text-sm text-red-600">{testResult.error}</p>
          ) : (
            <div className="text-sm">
              <p className="text-gray-600">
                Found {testResult.results?.length || 0} results
                {testResult.totalResults && ` (${testResult.totalResults} total)`}
              </p>
              {testResult.results?.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {testResult.results.slice(0, 2).map((result: any, index: number) => (
                    <div key={index} className="mt-1 p-2 bg-white rounded border">
                      <p className="text-xs text-gray-600">Score: {result.score?.toFixed(3)}</p>
                      <p className="text-xs truncate">{result.content}</p>
                      {result.metadata?.fileName && (
                        <p className="text-xs text-gray-500">File: {result.metadata.fileName}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RagServerStatus