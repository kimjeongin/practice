import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import { useRagServerStatus } from '../../../hooks/useRagServerStatus'
import RagServerStatus from '../../../components/rag-server/RagServerStatus'

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

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [currentThinking, setCurrentThinking] = useState<ThinkingStatus | null>(null)
  const [isAgentWorking, setIsAgentWorking] = useState(false)
  const [showRagStatus, setShowRagStatus] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { isConnected: ragConnected, hasSearchTools } = useRagServerStatus()
  const {
    isInitialized,
    isLoading,
    error,
    healthStatus,
    initialize,
    processQuery,
    // testQuery, // Not used
    clearError
  } = useAgent()

  useEffect(() => {
    initializeSystem()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const initializeSystem = async () => {
    try {
      console.log('🚀 Initializing Agent System...')
      
      await initialize({
        type: 'main',
        model: 'llama3.1:8b',
        temperature: 0.7,
        maxTokens: 1024
      })

      // Add welcome message
      const welcomeMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Hello! I'm your AI agent powered by Llama 3.1 8B. I can help you with various tasks and use tools when needed.

Available capabilities:
- Natural language understanding and generation
- Tool selection and execution (when MCP servers are connected)
- Multi-step reasoning
- Conversation memory

Type your message below to get started!`,
        timestamp: new Date()
      }

      setMessages([welcomeMessage])
      console.log('✅ Agent System initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize Agent System:', error)
    }
  }

  // Agent thinking status handler
  const handleAgentThinking = useCallback((status: ThinkingStatus) => {
    setCurrentThinking(status)
    setIsAgentWorking(true)
  }, [])

  // Simulated streaming response handler
  const streamResponse = useCallback((content: string, messageId: string) => {
    const words = content.split(' ')
    let wordIndex = 0

    const interval = setInterval(() => {
      if (wordIndex < words.length) {
        const partialContent = words.slice(0, wordIndex + 1).join(' ')
        
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: partialContent, isStreaming: wordIndex < words.length - 1 }
            : msg
        ))
        
        wordIndex++
      } else {
        clearInterval(interval)
        setCurrentThinking(null)
        setIsAgentWorking(false)
      }
    }, 50) // Adjust speed as needed
  }, [])

  const sendMessage = async () => {
    if (!inputValue.trim() || !isInitialized || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsAgentWorking(true)

    // Simulate thinking phases
    const thinkingPhases = [
      { phase: 'analyzing', message: '🤔 Analyzing your request...', duration: 1000 },
      { phase: 'selecting_tool', message: '🔍 Selecting appropriate tools...', duration: 1500 },
      { phase: 'executing_tool', message: '⚡ Executing selected tools...', duration: 2000 },
      { phase: 'responding', message: '✍️ Generating response...', duration: 800 }
    ]

    let phaseIndex = 0
    const showNextPhase = () => {
      if (phaseIndex < thinkingPhases.length) {
        const phase = thinkingPhases[phaseIndex]
        handleAgentThinking(phase)
        phaseIndex++
        setTimeout(showNextPhase, phase.duration)
      } else {
        // Start actual processing
        processActualQuery(userMessage.content)
      }
    }

    showNextPhase()
  }

  const processActualQuery = async (query: string) => {
    try {
      const result = await processQuery(
        query,
        conversationId || undefined,
        { maxIterations: 5 }
      )

      if (result) {
        if (!conversationId) {
          setConversationId('current-session')
        }

        const assistantMessageId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          toolsUsed: result.toolsUsed,
          executionTime: result.totalExecutionTime,
          iterations: result.iterations,
          isStreaming: true
        }

        setMessages(prev => [...prev, assistantMessage])
        
        // Start streaming the response
        streamResponse(result.response, assistantMessageId)
      } else {
        setCurrentThinking(null)
        setIsAgentWorking(false)
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'I apologize, but I encountered an error processing your request.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      setCurrentThinking(null)
      setIsAgentWorking(false)
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  // const handleKeyPress = (e: React.KeyboardEvent) => {
  //   if (e.key === 'Enter' && !e.shiftKey) {
  //     e.preventDefault()
  //     sendMessage()
  //   }
  // }

  const clearConversation = () => {
    setMessages([])
    setConversationId(null)
    clearError()
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
          <p className="text-sm text-gray-500 mt-2">Starting Ollama connection and loading models</p>
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
              <li>• Ensure Ollama is running: <code className="bg-gray-200 px-1 rounded">ollama serve</code></li>
              <li>• Check if models are available: <code className="bg-gray-200 px-1 rounded">ollama list</code></li>
              <li>• Pull required models if missing: <code className="bg-gray-200 px-1 rounded">ollama pull llama3.1:8b</code></li>
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
                Powered by Llama 3.1 8B • {healthStatus?.availableTools || 0} tools available
              </p>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${ragConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-xs text-gray-600">
                  RAG {ragConnected ? 'Connected' : 'Disconnected'}
                  {hasSearchTools && ' (Search Ready)'}
                </span>
                <button
                  onClick={() => setShowRagStatus(!showRagStatus)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  {showRagStatus ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={clearConversation}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Clear Chat
          </button>
        </div>
        
        {/* RAG Server Status Panel */}
        {showRagStatus && (
          <div className="mt-4">
            <RagServerStatus />
          </div>
        )}
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
                  Using tool: {currentThinking.toolName}
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
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              
              {/* Tool usage info */}
              {message.toolsUsed && message.toolsUsed.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300 text-xs">
                  <p className="font-semibold mb-1">Tools used:</p>
                  {message.toolsUsed.map((tool, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{tool.toolName}</span>
                      <span>{tool.executionTime}ms</span>
                    </div>
                  ))}
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

              <div className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
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
            disabled={!isInitialized || isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || !isInitialized || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        
        <div className="mt-2 text-xs text-gray-500">
          Tip: Ask me to search documents, analyze data, or help with various tasks!
        </div>
      </div>
    </div>
  )
}