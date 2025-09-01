import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import { useMCPServers } from '../../../hooks/useMCPServers'
import { MCPServerStatus } from '../../../components/mcp-servers/MCPServerStatus'

// Import interface for type  
interface AgentExecutionResult {
  success: boolean
  response: string
  conversationId: string
  toolsUsed: Array<{
    toolName: string
    serverId: string
    parameters: Record<string, unknown>
    result: unknown
    executionTime: number
  }>
  totalExecutionTime: number
  iterations: number
  error?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'thinking'
  content: string
  timestamp: Date
  toolsUsed?: Array<{
    toolName: string
    serverId: string
    executionTime: number
  }>
  executionTime?: number
  iterations?: number
  isStreaming?: boolean
  agentPhase?: string
}

interface ThinkingStatus {
  phase: string
  message: string
  toolName?: string
  reasoning?: string
}

export function AgentChat(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [currentThinking, setCurrentThinking] = useState<ThinkingStatus | null>(null)
  const [isAgentWorking, setIsAgentWorking] = useState(false)
  const [showMCPStatus, setShowMCPStatus] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { servers: mcpServers } = useMCPServers()
  const {
    isInitialized,
    isLoading,
    error,
    healthStatus,
    initialize,
    processQuery,
    // testQuery, // Not used
    clearError,
  } = useAgent()

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const initializeSystem = useCallback(async (): Promise<void> => {
    try {
      console.log('🚀 Initializing Agent System...')

      await initialize({
        type: 'main',
        model: 'llama3.1:8b',
        temperature: 0.7,
        maxTokens: 1024,
      })

      if (!error && isInitialized) {
        // Add welcome message with current status
        const toolCount = healthStatus?.availableTools || 0
        const welcomeMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Hello! I'm your AI agent powered by Llama 3.1 8B. I'm ready to help you with various tasks.

**Current Status:**
- 🧠 Model: Llama 3.1 8B (${healthStatus?.ollamaHealthy ? 'Ready' : 'Checking...'})
- 🔧 Available Tools: ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}
- 🔗 MCP Servers: ${mcpServers?.servers ? mcpServers.servers.filter((s: any) => s.status === 'connected').length : 0} connected

**Available Capabilities:**
- Natural language understanding and generation
- Tool selection and execution (when MCP servers are connected)
- Multi-step reasoning with tool usage
- Conversation memory and context

Type your message below to get started! I can help with research, analysis, and tasks using available tools.`,
          timestamp: new Date(),
        }

        setMessages([welcomeMessage])
        console.log('✅ Agent System initialized successfully')
      } else {
        // Show initialization failure message
        const failureMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ **Initialization Failed**

I encountered an issue while starting up. This might be due to:
- Ollama server not running
- Models not available
- Configuration issues

**Troubleshooting Steps:**
1. Make sure Ollama is running: \`ollama serve\`
2. Check available models: \`ollama list\`
3. Pull required models if missing: \`ollama pull llama3.1:8b\`

Please resolve these issues and refresh the application.`,
          timestamp: new Date(),
        }

        setMessages([failureMessage])
        console.error('❌ Agent System initialization failed')
      }
    } catch (error) {
      console.error('❌ Failed to initialize Agent System:', error)

      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ **Critical Initialization Error**

${error instanceof Error ? error.message : 'Unknown error occurred'}

Please check the console for more details and ensure all required services are running.`,
        timestamp: new Date(),
      }

      setMessages([errorMessage])
    }
  }, [initialize, error, isInitialized, healthStatus, mcpServers])

  useEffect(() => {
    initializeSystem()
  }, [initializeSystem])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Agent thinking status handler
  const handleAgentThinking = useCallback((status: ThinkingStatus) => {
    setCurrentThinking(status)
    setIsAgentWorking(true)
  }, [])

  // Simulated streaming response handler with improved cleanup
  const streamResponse = useCallback((content: string, messageId: string): (() => void) => {
    console.log('🎬 Starting response streaming for message:', messageId)
    const words = content.split(' ')
    let wordIndex = 0
    let isStreamingComplete = false

    const interval = setInterval(() => {
      if (isStreamingComplete || wordIndex >= words.length) {
        clearInterval(interval)
        if (!isStreamingComplete) {
          console.log('✅ Streaming completed, resetting states')
          setCurrentThinking(null)
          setIsAgentWorking(false)
          isStreamingComplete = true
        }
        return
      }

      const partialContent = words.slice(0, wordIndex + 1).join(' ')

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: partialContent, isStreaming: wordIndex < words.length - 1 }
            : msg
        )
      )

      wordIndex++
    }, 50) // Adjust speed as needed

    // Cleanup function in case component unmounts
    return () => {
      console.log('🧹 Cleaning up streaming interval')
      clearInterval(interval)
      isStreamingComplete = true
    }
  }, [])

  const sendMessage = async () => {
    console.log('🚀 sendMessage called:', {
      inputValue: inputValue.substring(0, 50),
      isInitialized,
      isLoading,
      isAgentWorking,
    })

    if (!inputValue.trim()) {
      console.warn('⚠️ Empty input, ignoring send request')
      return
    }

    if (!isInitialized) {
      console.warn('⚠️ Agent not initialized, cannot send message')
      return
    }

    if (isLoading || isAgentWorking) {
      console.warn('⚠️ Agent is busy, ignoring send request')
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    console.log('📝 Adding user message and clearing input')
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsAgentWorking(true)

    // Show initial thinking state
    handleAgentThinking({
      phase: 'analyzing',
      message: '🤔 Analyzing your request...',
    })

    try {
      console.log('▶️ Starting processActualQuery')
      await processActualQuery(userMessage.content)
    } catch (error) {
      console.error('❌ Failed to process message:', error)
      // Comprehensive state reset on error
      setCurrentThinking(null)
      setIsAgentWorking(false)
      clearError() // Also resets loading state

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    }
  }

  const processActualQuery = async (query: string): Promise<void> => {
    let queryResult: AgentExecutionResult | null = null

    try {
      console.log('🔍 Processing query:', query.substring(0, 100))

      // Update thinking state for tool selection
      handleAgentThinking({
        phase: 'selecting_tools',
        message: '🔍 Selecting appropriate tools...',
      })

      queryResult = await processQuery(query, conversationId || undefined, { maxIterations: 5 })
      console.log('📊 Query result:', { hasResult: !!queryResult, success: queryResult?.success })

      if (queryResult && queryResult.success) {
        // Update conversation ID if not set
        if (!conversationId && queryResult.conversationId) {
          console.log('🆔 Setting conversation ID:', queryResult.conversationId)
          setConversationId(queryResult.conversationId)
        }

        // Update thinking state for response generation
        handleAgentThinking({
          phase: 'responding',
          message: '✍️ Generating response...',
        })

        const assistantMessageId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          toolsUsed: queryResult.toolsUsed,
          executionTime: queryResult.totalExecutionTime,
          iterations: queryResult.iterations,
          isStreaming: true,
        }

        setMessages((prev) => [...prev, assistantMessage])
        console.log('💬 Starting response streaming')

        // Start streaming the response
        streamResponse(queryResult.response, assistantMessageId)
      } else {
        console.error('❌ Query processing failed:', queryResult?.error)
        // Comprehensive state reset
        setCurrentThinking(null)
        setIsAgentWorking(false)
        clearError()

        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            queryResult?.error ||
            'I apologize, but I encountered an error processing your request. Please try again.',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } catch (error) {
      console.error('❌ Exception in processActualQuery:', error)
      // Comprehensive state reset on exception
      setCurrentThinking(null)
      setIsAgentWorking(false)
      clearError()

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    }
  }

  // const handleKeyPress = (e: React.KeyboardEvent) => {
  //   if (e.key === 'Enter' && !e.shiftKey) {
  //     e.preventDefault()
  //     sendMessage()
  //   }
  // }

  const clearConversation = (): void => {
    console.log('🧹 Clearing conversation and resetting all states')
    setMessages([])
    setConversationId(null)
    setCurrentThinking(null)
    setIsAgentWorking(false)
    clearError() // This also resets loading state
  }

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

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
                <code className="bg-gray-200 px-1 rounded">ollama pull llama3.1:8b</code>
              </li>
            </ul>
          </div>
          <button
            onClick={() => initialize()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry Initialization
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">🤖 AI Agent Chat</h2>
            <div className="flex items-center space-x-4">
              <p className="text-sm text-gray-600">
                Powered by Llama 3.1 8B • {mcpServers.totalTools} tools available
              </p>
              <div className="flex items-center space-x-2">
                <span
                  className={`w-2 h-2 rounded-full ${mcpServers.connectedServers > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                ></span>
                <span className="text-xs text-gray-600">
                  MCP Servers: {mcpServers.connectedServers}/{mcpServers.totalServers}
                </span>
                <button
                  onClick={() => setShowMCPStatus(!showMCPStatus)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  {showMCPStatus ? 'Hide MCP Details' : 'Show MCP Details'}
                </button>
              </div>
              {/* RAG status display removed - now part of unified MCP server management */}
            </div>
          </div>
          <button
            onClick={clearConversation}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Clear Chat
          </button>
        </div>

        {/* MCP Server Status Panel */}
        {showMCPStatus && (
          <div className="mt-4">
            <MCPServerStatus />
          </div>
        )}

        {/* Server status panels removed - now handled by unified MCP server management */}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Agent Thinking Indicator */}
        {isAgentWorking && currentThinking && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-lg p-3 bg-yellow-50 border border-yellow-200">
              <div className="flex items-center space-x-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span className="text-sm text-gray-600">
                  {currentThinking.phase}: {currentThinking.message}
                </span>
              </div>
              {currentThinking.toolName && (
                <div className="text-xs text-gray-500 mt-1">
                  <div className="flex items-center space-x-2">
                    <span>Using tool:</span>
                    <span className="font-medium">{currentThinking.toolName}</span>
                    {/* Try to find server info */}
                    {(() => {
                      const tool = mcpServers.servers
                        .flatMap((server) =>
                          Array(server.toolCount)
                            .fill(null)
                            .map((): { serverId: string; serverName: string } => ({ serverId: server.id, serverName: server.name }))
                        )
                        .find((t) => t.serverId)

                      return (
                        tool && (
                          <>
                            <span>from</span>
                            <span className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                              MCP Server
                            </span>
                          </>
                        )
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>

              {/* Tool usage info */}
              {message.toolsUsed && message.toolsUsed.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300 text-xs">
                  <p className="font-semibold mb-1">🔧 Tools used:</p>
                  {message.toolsUsed.map((tool, idx) => {
                    // Find server name from MCP servers data
                    const server = mcpServers.servers.find((s) => s.id === tool.serverId)
                    const serverName = server ? server.name : tool.serverId

                    return (
                      <div key={idx} className="bg-gray-50 p-2 rounded mb-1">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{tool.toolName}</span>
                            <span className="text-gray-500">from</span>
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                              {serverName}
                            </span>
                          </div>
                          <span className="text-gray-500">{tool.executionTime}ms</span>
                        </div>
                        {/* Show server connection status */}
                        {server && (
                          <div className="flex items-center space-x-1 mt-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                server.status === 'connected' ? 'bg-green-500' : 'bg-red-500'
                              }`}
                            ></span>
                            <span className="text-gray-400 text-xs">{server.status}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Execution info */}
              {message.executionTime && (
                <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Total time: {message.executionTime}ms</span>
                    {message.iterations && <span>Iterations: {message.iterations}</span>}
                  </div>
                </div>
              )}

              <div
                className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}
              >
                {formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                <span className="text-gray-600">Agent is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="flex space-x-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={1}
            disabled={!isInitialized || isLoading || isAgentWorking}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || !isInitialized || isLoading || isAgentWorking}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading || isAgentWorking ? 'Processing...' : 'Send'}
          </button>
        </div>

        <div className="mt-2 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Tip: Ask me to search documents, analyze data, or help with various tasks!
          </div>
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 font-mono">
              Debug: Init={isInitialized ? '✓' : '✗'} Loading={isLoading ? '✓' : '✗'} Working=
              {isAgentWorking ? '✓' : '✗'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
