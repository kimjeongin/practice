import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import { useMCPServers } from '../../../hooks/useMCPServers'
import { useChatMessages } from '../hooks/useChatMessages'
import { getAppModelInfo } from '@shared/config/app.config'
import type { AgentExecutionResult, Message } from '@shared/types/agent-ui.types'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { LoadingStates } from './LoadingStates'

export function AgentChat(): React.JSX.Element {
  const [showMCPStatus, setShowMCPStatus] = useState(false)
  const initializationAttempted = useRef(false)
  const hasShownWelcome = useRef(false)

  const { servers: mcpServers } = useMCPServers()
  const { isInitialized, isLoading, error, healthStatus, initialize, processQuery, clearError } =
    useAgent()

  const {
    messages,
    inputValue,
    conversationId,
    currentThinking,
    isAgentWorking,
    setInputValue,
    setMessages,
    setConversationId,
    handleAgentThinking,
    setIsAgentWorking,
    setCurrentThinking,
    streamResponse,
    clearConversation,
  } = useChatMessages()

  const initializeSystem = useCallback(async (): Promise<void> => {
    if (initializationAttempted.current || isInitialized) {
      return
    }

    initializationAttempted.current = true

    try {
      await initialize({
        type: 'main',
        temperature: 0.3,
        maxTokens: 512,
      })
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ **Critical Initialization Error**

${error instanceof Error ? error.message : 'Unknown error occurred'}

Please check the console for more details and ensure all required services are running.`,
        timestamp: new Date(),
      }

      setMessages([errorMessage])
      initializationAttempted.current = false
    }
  }, [initialize, isInitialized, setMessages])

  useEffect(() => {
    initializeSystem()
  }, [initializeSystem])

  useEffect(() => {
    if (isInitialized && !error && !hasShownWelcome.current) {
      const toolCount = healthStatus?.availableTools || 0
      const connectedServers = mcpServers?.servers
        ? mcpServers.servers.filter((s) => s.status === 'connected').length
        : 0

      const welcomeMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Hello! I'm your AI agent powered by ${getAppModelInfo().displayName}. I'm ready to help you with various tasks.

**Status:** ${getAppModelInfo().displayName} (${healthStatus?.ollamaHealthy ? 'Ready' : 'Checking...'}) • ${toolCount} tools • ${connectedServers} MCP servers connected

Type your message below to get started! I can help with research, analysis, and tasks using available tools.`,
        timestamp: new Date(),
      }

      setMessages((prev) => (prev.length === 0 ? [welcomeMessage] : prev))
      hasShownWelcome.current = true
    }
  }, [isInitialized, error, healthStatus, mcpServers, setMessages])

  useEffect(() => {
    if (!isInitialized && error && !hasShownWelcome.current) {
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
3. Pull required models if missing: \`ollama pull deepseek-r1:1.5b\`

Please resolve these issues and refresh the application.`,
        timestamp: new Date(),
      }

      setMessages((prev) => (prev.length === 0 ? [failureMessage] : prev))
      hasShownWelcome.current = true
    }
  }, [isInitialized, error, setMessages])

  const processActualQuery = async (query: string): Promise<void> => {
    let queryResult: AgentExecutionResult | null = null

    try {
      console.log('🔍 Processing query:', query.substring(0, 100))

      handleAgentThinking({
        phase: 'selecting_tools',
        message: '🔍 Selecting appropriate tools...',
      })

      queryResult = await processQuery(query, conversationId || undefined, { maxIterations: 5 })
      console.log('📊 Query result:', { hasResult: !!queryResult, success: queryResult?.success })

      if (queryResult && queryResult.success) {
        if (!conversationId && queryResult.conversationId) {
          console.log('🆔 Setting conversation ID:', queryResult.conversationId)
          setConversationId(queryResult.conversationId)
          try {
            sessionStorage.setItem('agent-conversation-id', queryResult.conversationId)
          } catch (error) {
            console.warn('Failed to save conversation ID to sessionStorage:', error)
          }
        }

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

        setMessages((prev) => {
          const newMessages = [...prev, assistantMessage]
          console.log('💬 Assistant message added:', {
            messageId: assistantMessageId,
            previousCount: prev.length,
            newCount: newMessages.length,
            hasToolsUsed: !!queryResult?.toolsUsed?.length,
            toolCount: queryResult?.toolsUsed?.length || 0,
          })
          return newMessages
        })
        console.log('💬 Starting response streaming')

        streamResponse(queryResult.response, assistantMessageId)
      } else {
        console.error('❌ Query processing failed:', queryResult?.error)
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
        console.log('📝 Error message added to conversation history')
      }
    } catch (error) {
      console.error('❌ Exception in processActualQuery:', error)
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
      console.log('📝 Exception error message added to conversation history')
    }
  }

  const sendMessage = async (): Promise<void> => {
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

    console.log('📝 Adding user message and clearing input', {
      messageId: userMessage.id,
      currentMessageCount: messages.length,
      conversationId: conversationId || 'none',
    })
    setMessages((prev) => {
      const newMessages = [...prev, userMessage]
      console.log('📋 Message state updated:', {
        previousCount: prev.length,
        newCount: newMessages.length,
        lastMessage: userMessage.content.substring(0, 50),
      })
      return newMessages
    })
    setInputValue('')
    setIsAgentWorking(true)

    handleAgentThinking({
      phase: 'analyzing',
      message: '🤔 Analyzing your request...',
    })

    try {
      console.log('▶️ Starting processActualQuery')
      await processActualQuery(userMessage.content)
    } catch (error) {
      console.error('❌ Failed to process message:', error)
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
      console.log('📝 sendMessage error added to conversation history')
    }
  }

  const handleClearConversation = (): void => {
    clearConversation()
    clearError()
    hasShownWelcome.current = false
  }

  const handleRetryInitialization = (): void => {
    initializationAttempted.current = false
    initializeSystem()
  }

  const loadingState = LoadingStates({
    isInitialized,
    isLoading,
    error,
    onRetryInitialization: handleRetryInitialization,
  })

  if (loadingState) {
    return loadingState
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <ChatHeader
        mcpServers={mcpServers}
        showMCPStatus={showMCPStatus}
        onToggleMCPStatus={() => setShowMCPStatus(!showMCPStatus)}
        onClearConversation={handleClearConversation}
      />

      <MessageList
        messages={messages}
        currentThinking={currentThinking}
        isAgentWorking={isAgentWorking}
        isLoading={isLoading}
        mcpServers={mcpServers}
      />

      <ChatInput
        inputValue={inputValue}
        error={error}
        isInitialized={isInitialized}
        isLoading={isLoading}
        isAgentWorking={isAgentWorking}
        onInputChange={setInputValue}
        onSendMessage={sendMessage}
      />
    </div>
  )
}
