import React, { useState, useEffect } from 'react'

interface ApiResponse {
  success: boolean
  data?: any
  errorCode?: string
  message?: string
}

interface LoginStatus {
  isLoggedIn: boolean
  hasToken: boolean
}

export const ApiClientTest: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null)
  const [responses, setResponses] = useState<Record<string, ApiResponse>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  // Form states
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('password')
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [fileName, setFileName] = useState('test.txt')
  const [fileContent, setFileContent] = useState('Hello World!')
  const [fileTitle, setFileTitle] = useState('Test File')
  const [fileDescription, setFileDescription] = useState('A test file upload')

  // Check login status on mount
  useEffect(() => {
    checkLoginStatus()
  }, [])

  const executeAPI = async (name: string, apiCall: () => Promise<ApiResponse>) => {
    setLoading(prev => ({ ...prev, [name]: true }))
    try {
      const result = await apiCall()
      setResponses(prev => ({ ...prev, [name]: result }))
      return result
    } catch (error) {
      const errorResponse = {
        success: false,
        errorCode: 'CLIENT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
      setResponses(prev => ({ ...prev, [name]: errorResponse }))
      return errorResponse
    } finally {
      setLoading(prev => ({ ...prev, [name]: false }))
    }
  }

  const checkLoginStatus = async () => {
    const result = await executeAPI('loginStatus', () => window.api.apiClient.getLoginStatus())
    if (result.success && 'data' in result) {
      setLoginStatus(result.data)
      setIsLoggedIn(result.data.isLoggedIn)
    }
  }

  const handleHealthCheck = () => {
    executeAPI('health', () => window.api.apiClient.healthCheck())
  }

  const handleLogin = async () => {
    const result = await executeAPI('login', () => window.api.apiClient.login(username, password))
    if (result.success) {
      setIsLoggedIn(true)
      await checkLoginStatus()
    }
  }

  const handleLogout = async () => {
    const result = await executeAPI('logout', () => window.api.apiClient.logout())
    if (result.success) {
      setIsLoggedIn(false)
      await checkLoginStatus()
    }
  }

  const handleGetUsers = () => {
    executeAPI('users', () => window.api.apiClient.getUsers())
  }

  const handleCreateUser = () => {
    if (!userName || !userEmail) {
      alert('Please enter name and email')
      return
    }
    executeAPI('createUser', () => window.api.apiClient.createUser(userName, userEmail))
  }

  const handleGetProtectedData = () => {
    executeAPI('protected', () => window.api.apiClient.getProtectedData())
  }

  const handleUploadFile = () => {
    if (!fileName || !fileContent) {
      alert('Please enter file name and content')
      return
    }
    executeAPI('upload', () => window.api.apiClient.uploadFile(fileName, fileContent, fileTitle, fileDescription))
  }

  const handleUploadMultipleFiles = () => {
    const files = [
      { name: 'file1.txt', content: 'Content of file 1' },
      { name: 'file2.txt', content: 'Content of file 2' },
      { name: 'file3.txt', content: 'Content of file 3' }
    ]
    executeAPI('multiUpload', () => window.api.apiClient.uploadMultipleFiles(files, 'test-category'))
  }

  const ResponseDisplay: React.FC<{ title: string; response?: ApiResponse; isLoading?: boolean }> = ({
    title,
    response,
    isLoading
  }) => (
    <div className="mt-2 p-3 border rounded">
      <h4 className="font-semibold text-sm mb-2">{title}</h4>
      {isLoading ? (
        <div className="text-blue-600">Loading...</div>
      ) : response ? (
        <pre className={`text-xs overflow-auto max-h-32 ${response.success ? 'text-green-600' : 'text-red-600'}`}>
          {JSON.stringify(response, null, 2)}
        </pre>
      ) : (
        <div className="text-gray-500">No response yet</div>
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">API Client Test</h1>

      {/* Login Status */}
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">Login Status</h2>
        <div className="flex items-center gap-4 mb-2">
          <span className={`px-2 py-1 rounded text-sm ${isLoggedIn ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {isLoggedIn ? 'Logged In' : 'Not Logged In'}
          </span>
          <button
            onClick={checkLoginStatus}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            disabled={loading.loginStatus}
          >
            Refresh Status
          </button>
        </div>
        {loginStatus && (
          <div className="text-sm text-gray-600">
            Has Token: {loginStatus.hasToken ? 'Yes' : 'No'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Health Check */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">Health Check</h2>
            <button
              onClick={handleHealthCheck}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              disabled={loading.health}
            >
              Check Server Health
            </button>
            <ResponseDisplay title="Health Response" response={responses.health} isLoading={loading.health} />
          </div>

          {/* Authentication */}
          <div>
            <h2 className="text-lg font-semibold mb-2">Authentication</h2>
            <div className="space-y-2 mb-2">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleLogin}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={loading.login || isLoggedIn}
                >
                  Login
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  disabled={loading.logout || !isLoggedIn}
                >
                  Logout
                </button>
              </div>
            </div>
            <ResponseDisplay title="Auth Response" response={responses.login || responses.logout} isLoading={loading.login || loading.logout} />
          </div>

          {/* User Management */}
          <div>
            <h2 className="text-lg font-semibold mb-2">User Management</h2>
            <div className="space-y-2 mb-2">
              <button
                onClick={handleGetUsers}
                className="w-full px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                disabled={loading.users}
              >
                Get Users
              </button>
              <input
                type="text"
                placeholder="User Name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="email"
                placeholder="User Email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <button
                onClick={handleCreateUser}
                className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                disabled={loading.createUser}
              >
                Create User
              </button>
            </div>
            <ResponseDisplay title="Users Response" response={responses.users || responses.createUser} isLoading={loading.users || loading.createUser} />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Protected Data */}
          <div>
            <h2 className="text-lg font-semibold mb-2">Protected Data</h2>
            <button
              onClick={handleGetProtectedData}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
              disabled={loading.protected}
            >
              Get Protected Data
            </button>
            <ResponseDisplay title="Protected Response" response={responses.protected} isLoading={loading.protected} />
          </div>

          {/* File Upload */}
          <div>
            <h2 className="text-lg font-semibold mb-2">File Upload</h2>
            <div className="space-y-2 mb-2">
              <input
                type="text"
                placeholder="File Name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <textarea
                placeholder="File Content"
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full px-3 py-2 border rounded h-20"
              />
              <input
                type="text"
                placeholder="Title (optional)"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={fileDescription}
                onChange={(e) => setFileDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <button
                onClick={handleUploadFile}
                className="w-full px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
                disabled={loading.upload}
              >
                Upload Single File
              </button>
              <button
                onClick={handleUploadMultipleFiles}
                className="w-full px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600"
                disabled={loading.multiUpload}
              >
                Upload Multiple Files
              </button>
            </div>
            <ResponseDisplay title="Upload Response" response={responses.upload || responses.multiUpload} isLoading={loading.upload || loading.multiUpload} />
          </div>
        </div>
      </div>
    </div>
  )
}