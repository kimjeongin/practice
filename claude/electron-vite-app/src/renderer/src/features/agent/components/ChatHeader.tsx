import { getAppModelInfo } from '@shared/config/app.config'
import { MCPServerStatus } from '../../../components/mcp-servers/MCPServerStatus'

interface ChatHeaderProps {
  mcpServers: {
    totalTools: number
    connectedServers: number
    totalServers: number
  }
  showMCPStatus: boolean
  onToggleMCPStatus: () => void
  onClearConversation: () => void
}

export function ChatHeader({
  mcpServers,
  showMCPStatus,
  onToggleMCPStatus,
  onClearConversation,
}: ChatHeaderProps): React.JSX.Element {
  return (
    <div className="border-b border-gray-200 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">🤖 AI Agent Chat</h2>
          <div className="flex items-center space-x-4">
            <p className="text-sm text-gray-600">
              Powered by {getAppModelInfo().displayName} • {mcpServers.totalTools} tools available
            </p>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${mcpServers.connectedServers > 0 ? 'bg-green-500' : 'bg-red-500'}`}
              ></span>
              <span className="text-xs text-gray-600">
                MCP Servers: {mcpServers.connectedServers}/{mcpServers.totalServers}
              </span>
              <button
                onClick={onToggleMCPStatus}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                {showMCPStatus ? 'Hide MCP Details' : 'Show MCP Details'}
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={onClearConversation}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Clear Chat
        </button>
      </div>

      {showMCPStatus && (
        <div className="mt-4">
          <MCPServerStatus />
        </div>
      )}
    </div>
  )
}