/**
 * IPC Channel Constants
 */

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

  // Initialization status
  GET_INIT_STATUS: 'agent:get-init-status',
  IS_SYSTEM_READY: 'agent:is-system-ready',

  // Events
  AGENT_STARTED: 'agent:started',
  AGENT_THINKING: 'agent:thinking',
  AGENT_SELECTING_TOOL: 'agent:selecting-tool',
  AGENT_EXECUTING_TOOL: 'agent:executing-tool',
  AGENT_COMPLETED: 'agent:completed',
  AGENT_ERROR: 'agent:error',

  // Initialization events
  INIT_PROGRESS: 'agent:init-progress',
  INIT_COMPLETED: 'agent:init-completed',
  INIT_FAILED: 'agent:init-failed',

  // MCP Server Management
  GET_MCP_SERVERS: 'agent:get-mcp-servers',
  ADD_MCP_SERVER: 'agent:add-mcp-server',
  REMOVE_MCP_SERVER: 'agent:remove-mcp-server',
  CONNECT_MCP_SERVER: 'agent:connect-mcp-server',
  DISCONNECT_MCP_SERVER: 'agent:disconnect-mcp-server',
  UPDATE_MCP_SERVER: 'agent:update-mcp-server',
} as const

// General IPC Channels
export const GENERAL_IPC_CHANNELS = {
  GET_VERSION: 'app:get-version',
  QUIT_APP: 'app:quit',
} as const

// API Client IPC Channels
export const API_CLIENT_IPC_CHANNELS = {
  HEALTH_CHECK: 'api:health-check',
  LOGIN: 'api:login',
  LOGOUT: 'api:logout',
  GET_USERS: 'api:get-users',
  CREATE_USER: 'api:create-user',
  GET_PROTECTED_DATA: 'api:get-protected-data',
  UPLOAD_FILE: 'api:upload-file',
  UPLOAD_MULTIPLE_FILES: 'api:upload-multiple-files',
  GET_LOGIN_STATUS: 'api:get-login-status',

  // SSE (Server-Sent Events) Channels
  SSE_CONNECT_BASIC: 'api:sse-connect-basic',
  SSE_CONNECT_CUSTOM: 'api:sse-connect-custom',
  SSE_CONNECT_PROTECTED: 'api:sse-connect-protected',
  SSE_DISCONNECT: 'api:sse-disconnect',
  SSE_DISCONNECT_ALL: 'api:sse-disconnect-all',
  SSE_GET_STATUS: 'api:sse-get-status',
} as const
