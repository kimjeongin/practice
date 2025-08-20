/**
 * IPC Channel Constants
 */

// MCP IPC Channels
export const MCP_IPC_CHANNELS = {
  // Status and Management
  GET_STATUS: 'mcp:get-status',
  
  // Server Management
  ADD_SERVER: 'mcp:add-server',
  REMOVE_SERVER: 'mcp:remove-server', 
  CONNECT_SERVER: 'mcp:connect-server',
  DISCONNECT_SERVER: 'mcp:disconnect-server',
  GET_SERVERS: 'mcp:get-servers',
  
  // Tool Management
  GET_TOOLS: 'mcp:get-tools',
  EXECUTE_TOOL: 'mcp:execute-tool',
  GET_EXECUTION_HISTORY: 'mcp:get-execution-history',
  CLEAR_EXECUTION_HISTORY: 'mcp:clear-execution-history',
  
  // RAG Server Management
  ADD_RAG_SERVER: 'mcp:add-rag-server',
  
  // Events
  SERVER_STATUS_CHANGED: 'mcp:server-status-changed',
  TOOLS_DISCOVERED: 'mcp:tools-discovered',
  EXECUTION_COMPLETED: 'mcp:execution-completed'
} as const

// General IPC Channels
export const GENERAL_IPC_CHANNELS = {
  GET_VERSION: 'app:get-version',
  QUIT_APP: 'app:quit'
} as const