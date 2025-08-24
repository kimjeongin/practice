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
  UPDATE_SERVER: 'mcp:update-server',
  CONNECT_SERVER: 'mcp:connect-server',
  DISCONNECT_SERVER: 'mcp:disconnect-server',
  GET_SERVERS: 'mcp:get-servers',
  LIST_SERVERS: 'mcp:list-servers',
  
  // Tool Management
  GET_TOOLS: 'mcp:get-tools',
  LIST_TOOLS: 'mcp:list-tools',
  SEARCH_TOOLS: 'mcp:search-tools',
  GET_TOOL_DETAILS: 'mcp:get-tool-details',
  EXECUTE_TOOL: 'mcp:execute-tool',
  GET_EXECUTION_HISTORY: 'mcp:get-execution-history',
  CLEAR_EXECUTION_HISTORY: 'mcp:clear-execution-history',
  CLEAR_HISTORY: 'mcp:clear-history',
  
  // Resources and Prompts
  LIST_RESOURCES: 'mcp:list-resources',
  READ_RESOURCE: 'mcp:read-resource',
  LIST_PROMPTS: 'mcp:list-prompts',
  GET_PROMPT: 'mcp:get-prompt',
  
  // Configuration
  GET_CONFIG: 'mcp:get-config',
  UPDATE_CONFIG: 'mcp:update-config',
  
  // Event Subscription
  SUBSCRIBE_EVENTS: 'mcp:subscribe-events',
  UNSUBSCRIBE_EVENTS: 'mcp:unsubscribe-events',
  
  // RAG Server HTTP Client
  RAG_SERVER_STATUS: 'rag-server:get-status',
  RAG_SERVER_RECONNECT: 'rag-server:reconnect',
  RAG_SERVER_TEST: 'rag-server:test-search',
  
  // Events
  SERVER_STATUS_CHANGED: 'mcp:server-status-changed',
  TOOLS_DISCOVERED: 'mcp:tools-discovered',
  EXECUTION_COMPLETED: 'mcp:execution-completed'
} as const

// Agent IPC Channels
export const AGENT_IPC_CHANNELS = {
  INITIALIZE: 'agent:initialize',
  PROCESS_QUERY: 'agent:process-query',
  TEST_QUERY: 'agent:test-query',
  GET_AVAILABLE_TOOLS: 'agent:get-available-tools',
  UPDATE_CONFIG: 'agent:update-config',
  GET_CONFIG: 'agent:get-config',
  HEALTH_CHECK: 'agent:health-check',
  CLEANUP: 'agent:cleanup',
  
  // Events
  AGENT_STARTED: 'agent:started',
  AGENT_THINKING: 'agent:thinking',
  AGENT_SELECTING_TOOL: 'agent:selecting-tool',
  AGENT_EXECUTING_TOOL: 'agent:executing-tool',
  AGENT_COMPLETED: 'agent:completed',
  AGENT_ERROR: 'agent:error'
} as const

// General IPC Channels
export const GENERAL_IPC_CHANNELS = {
  GET_VERSION: 'app:get-version',
  QUIT_APP: 'app:quit'
} as const