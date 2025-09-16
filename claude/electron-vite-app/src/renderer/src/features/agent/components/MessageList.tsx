import { useRef, useEffect } from 'react'
import type { Message, ThinkingStatus } from '@shared/types/agent-ui.types'

interface MessageListProps {
  messages: Message[]
  currentThinking: ThinkingStatus | null
  isAgentWorking: boolean
  isLoading: boolean
  mcpServers: {
    servers: Array<{
      id: string
      name: string
      status: string
      toolCount: number
    }>
  }
}

export function MessageList({
  messages,
  currentThinking,
  isAgentWorking,
  isLoading,
  mcpServers,
}: MessageListProps): React.JSX.Element {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Agent Thinking Indicator */}
      {isAgentWorking && currentThinking && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-lg p-3 bg-yellow-50 border border-yellow-200">
            <div className="flex items-center space-x-2">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-sm text-gray-600">
                {currentThinking.phase}: {currentThinking.message}
              </span>
            </div>

            {/* Tool Selection Information */}
            {currentThinking.toolName && (
              <div className="text-xs text-gray-500 mt-2 bg-white p-2 rounded border">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-semibold text-gray-700">🔧 Selected Tool:</span>
                  <span className="font-medium text-blue-700">{currentThinking.toolName}</span>
                  {(() => {
                    const server = mcpServers.servers.find(server =>
                      server.status === 'connected' && server.toolCount > 0
                    )
                    return (
                      server && (
                        <>
                          <span>from</span>
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                            {server.name}
                          </span>
                        </>
                      )
                    )
                  })()}
                </div>

                {/* Tool Selection Reasoning */}
                {currentThinking.reasoning && (
                  <div className="mt-1">
                    <span className="font-semibold text-gray-700">💭 Why:</span>
                    <span className="ml-1 text-gray-600 italic">{currentThinking.reasoning}</span>
                  </div>
                )}

                {/* Tool Parameters */}
                {currentThinking.toolParameters && Object.keys(currentThinking.toolParameters).length > 0 && (
                  <div className="mt-1">
                    <span className="font-semibold text-gray-700">⚙️ Parameters:</span>
                    <div className="ml-2 mt-1 font-mono text-xs bg-gray-50 p-1 rounded">
                      {JSON.stringify(currentThinking.toolParameters, null, 2)}
                    </div>
                  </div>
                )}
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
                <p className="font-semibold mb-2 text-gray-700">🔧 Tools used ({message.toolsUsed.length}):</p>
                {message.toolsUsed.map((tool, idx) => {
                  const server = mcpServers.servers.find((s) => s.id === tool.serverId)
                  const serverName = server ? server.name : tool.serverId

                  return (
                    <div key={idx} className="bg-gray-50 p-3 rounded mb-2 border border-gray-200">
                      {/* Tool header */}
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-blue-700">{tool.toolName}</span>
                          <span className="text-gray-500">from</span>
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                            {serverName}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">{tool.executionTime}ms</span>
                          {server && (
                            <div className="flex items-center space-x-1">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  server.status === 'connected' ? 'bg-green-500' : 'bg-red-500'
                                }`}
                              ></span>
                              <span className="text-gray-400 text-xs">{server.status}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tool parameters */}
                      {tool.parameters && Object.keys(tool.parameters as Record<string, any>).length > 0 && (
                        <div className="mb-2">
                          <span className="font-semibold text-gray-600">⚙️ Parameters:</span>
                          <div className="mt-1 font-mono text-xs bg-white p-2 rounded border max-h-20 overflow-y-auto">
                            <pre>{JSON.stringify(tool.parameters, null, 2)}</pre>
                          </div>
                        </div>
                      )}

                      {/* Tool result preview */}
                      {tool.result && (
                        <div>
                          <span className="font-semibold text-gray-600">📋 Result:</span>
                          <div className="mt-1 font-mono text-xs bg-white p-2 rounded border max-h-96 overflow-y-auto">
                            {(() => {
                              if (typeof tool.result === 'string') {
                                return tool.result
                              }
                              return JSON.stringify(tool.result, null, 2)
                            })()}
                          </div>
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
  )
}