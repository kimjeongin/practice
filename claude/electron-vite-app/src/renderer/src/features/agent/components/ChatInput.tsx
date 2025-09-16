interface ChatInputProps {
  inputValue: string
  error: string | null
  isInitialized: boolean
  isLoading: boolean
  isAgentWorking: boolean
  onInputChange: (value: string) => void
  onSendMessage: () => void
}

export function ChatInput({
  inputValue,
  error,
  isInitialized,
  isLoading,
  isAgentWorking,
  onInputChange,
  onSendMessage,
}: ChatInputProps): React.JSX.Element {
  return (
    <div className="border-t border-gray-200 p-4">
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="flex space-x-2">
        <textarea
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSendMessage()
            }
          }}
          placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={1}
          disabled={!isInitialized || isLoading || isAgentWorking}
        />
        <button
          onClick={onSendMessage}
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
  )
}