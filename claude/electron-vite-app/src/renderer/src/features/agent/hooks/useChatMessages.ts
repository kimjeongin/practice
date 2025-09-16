import { useState, useCallback, useRef } from 'react'
import type { Message, ThinkingStatus } from '@shared/types/agent-ui.types'

interface UseChatMessagesReturn {
  messages: Message[]
  inputValue: string
  conversationId: string | null
  currentThinking: ThinkingStatus | null
  isAgentWorking: boolean
  setInputValue: (value: string) => void
  addMessage: (message: Message) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setConversationId: (id: string | null) => void
  handleAgentThinking: (status: ThinkingStatus) => void
  setIsAgentWorking: (working: boolean) => void
  setCurrentThinking: (thinking: ThinkingStatus | null) => void
  streamResponse: (content: string, messageId: string) => () => void
  clearConversation: () => void
}

export function useChatMessages(): UseChatMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('agent-conversation-id') || null
    } catch {
      return null
    }
  })
  const [currentThinking, setCurrentThinking] = useState<ThinkingStatus | null>(null)
  const [isAgentWorking, setIsAgentWorking] = useState(false)

  const hasShownWelcome = useRef(false)

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
  }, [])

  const handleAgentThinking = useCallback((status: ThinkingStatus) => {
    setCurrentThinking(status)
    setIsAgentWorking(true)
  }, [])

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
    }, 50)

    return () => {
      console.log('🧹 Cleaning up streaming interval')
      clearInterval(interval)
      isStreamingComplete = true
    }
  }, [])

  const clearConversation = useCallback((): void => {
    setMessages([])
    setConversationId(null)
    setCurrentThinking(null)
    setIsAgentWorking(false)
    hasShownWelcome.current = false

    try {
      sessionStorage.removeItem('agent-conversation-id')
    } catch {
      // Ignore sessionStorage errors
    }
  }, [])

  return {
    messages,
    inputValue,
    conversationId,
    currentThinking,
    isAgentWorking,
    setInputValue,
    addMessage,
    setMessages,
    setConversationId,
    handleAgentThinking,
    setIsAgentWorking,
    setCurrentThinking,
    streamResponse,
    clearConversation,
  }
}