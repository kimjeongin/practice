import React, { useState } from 'react'
import { useClientHost } from '../../../shared/hooks/useClientHost'

interface TestResult {
  test: string
  status: 'pending' | 'running' | 'success' | 'error'
  result?: any
  error?: string
  duration?: number
}

export function MCPTester() {
  const { servers, addRagServer, connectServer, executeTool, loadTools } = useClientHost()
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [ragServerId, setRagServerId] = useState<string | null>(null)

  const updateTestResult = (testName: string, updates: Partial<TestResult>) => {
    setTestResults(prev => 
      prev.map(result => 
        result.test === testName 
          ? { ...result, ...updates }
          : result
      )
    )
  }

  const runAllTests = async () => {
    if (isRunningTests) return

    setIsRunningTests(true)
    setTestResults([
      { test: 'Add RAG Server', status: 'pending' },
      { test: 'Connect to Server', status: 'pending' },
      { test: 'Discover Tools', status: 'pending' },
      { test: 'Test get_server_status', status: 'pending' },
      { test: 'Test list_files', status: 'pending' },
      { test: 'Test search_documents', status: 'pending' },
      { test: 'Test list_available_models', status: 'pending' },
      { test: 'Test get_current_model_info', status: 'pending' }
    ])

    try {
      // Test 1: Add RAG Server
      updateTestResult('Add RAG Server', { status: 'running' })
      const startTime1 = Date.now()
      
      const addResult = await addRagServer()
      const duration1 = Date.now() - startTime1
      
      if (addResult) {
        updateTestResult('Add RAG Server', { 
          status: 'success', 
          result: `Server added with ID: ${addResult.id}`,
          duration: duration1
        })
        setRagServerId(addResult.id)
        
        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Test 2: Connect to Server
        updateTestResult('Connect to Server', { status: 'running' })
        const startTime2 = Date.now()
        
        const connectResult = await connectServer(addResult.id)
        const duration2 = Date.now() - startTime2
        
        if (connectResult) {
          updateTestResult('Connect to Server', { 
            status: 'success', 
            result: 'Successfully connected',
            duration: duration2
          })
          
          // Wait for connection to stabilize
          await new Promise(resolve => setTimeout(resolve, 3000))
          
          // Test 3: Discover Tools
          updateTestResult('Discover Tools', { status: 'running' })
          const startTime3 = Date.now()
          
          const tools = await loadTools(addResult.id)
          const duration3 = Date.now() - startTime3
          
          if (tools && tools.length > 0) {
            updateTestResult('Discover Tools', { 
              status: 'success', 
              result: `Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`,
              duration: duration3
            })
            
            // Test individual tools
            const toolTests = [
              { name: 'get_server_status', params: {} },
              { name: 'list_files', params: { limit: 5 } },
              { name: 'search_documents', params: { query: 'test', topK: 3 } },
              { name: 'list_available_models', params: {} },
              { name: 'get_current_model_info', params: {} }
            ]
            
            for (const toolTest of toolTests) {
              const testName = `Test ${toolTest.name}`
              updateTestResult(testName, { status: 'running' })
              const startTime = Date.now()
              
              try {
                const result = await executeTool(addResult.id, toolTest.name, toolTest.params)
                const duration = Date.now() - startTime
                
                if (result) {
                  updateTestResult(testName, { 
                    status: 'success',
                    result: `Tool executed successfully. Response: ${JSON.stringify(result).substring(0, 100)}...`,
                    duration
                  })
                } else {
                  updateTestResult(testName, { 
                    status: 'error',
                    error: 'Tool execution returned null',
                    duration
                  })
                }
              } catch (error) {
                const duration = Date.now() - startTime
                updateTestResult(testName, { 
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Unknown error',
                  duration
                })
              }
              
              // Small delay between tool tests
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } else {
            updateTestResult('Discover Tools', { 
              status: 'error', 
              error: 'No tools found',
              duration: duration3
            })
          }
        } else {
          updateTestResult('Connect to Server', { 
            status: 'error', 
            error: 'Failed to connect',
            duration: duration2
          })
        }
      } else {
        updateTestResult('Add RAG Server', { 
          status: 'error', 
          error: 'Failed to add server',
          duration: duration1
        })
      }
    } catch (error) {
      console.error('Test suite failed:', error)
    }

    setIsRunningTests(false)
  }

  const clearResults = () => {
    setTestResults([])
    setRagServerId(null)
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'success': return '✅'
      case 'error': return '❌'
      default: return '❓'
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">🧪 MCP Connection Tester</h2>
          <p className="text-gray-600 text-sm">
            Test the RAG server connection and all available tools to ensure everything is working correctly.
          </p>
        </div>

        <div className="p-4">
          <div className="flex gap-3 mb-6">
            <button
              onClick={runAllTests}
              disabled={isRunningTests}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isRunningTests
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isRunningTests ? '🔄 Running Tests...' : '🚀 Run All Tests'}
            </button>
            
            <button
              onClick={clearResults}
              disabled={isRunningTests}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🗑️ Clear Results
            </button>
          </div>

          {/* Test Results */}
          {testResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-800 mb-3">Test Results:</h3>
              
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border transition-all ${
                    result.status === 'success' 
                      ? 'border-green-200 bg-green-50' 
                      : result.status === 'error'
                      ? 'border-red-200 bg-red-50'
                      : result.status === 'running'
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(result.status)}</span>
                      <span className="font-medium text-gray-800">{result.test}</span>
                      {result.duration && (
                        <span className="text-xs text-gray-500">({result.duration}ms)</span>
                      )}
                    </div>
                    
                    {result.status === 'running' && (
                      <div className="text-blue-600 animate-spin">⟳</div>
                    )}
                  </div>
                  
                  {result.result && (
                    <div className="mt-2 text-sm text-gray-700 bg-white rounded p-2 border">
                      {result.result}
                    </div>
                  )}
                  
                  {result.error && (
                    <div className="mt-2 text-sm text-red-700 bg-red-100 rounded p-2 border border-red-200">
                      Error: {result.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Current Server Status */}
          {ragServerId && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
              <h4 className="font-medium text-gray-800 mb-2">🖥️ Current RAG Server Status:</h4>
              <div className="text-sm text-gray-600">
                <p><strong>Server ID:</strong> {ragServerId}</p>
                <p><strong>Connected Servers:</strong> {servers.filter(s => s.status === 'connected').length}</p>
                <p><strong>Total Servers:</strong> {servers.length}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}