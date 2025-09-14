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
} as const

// General IPC Channels
export const GENERAL_IPC_CHANNELS = {
  GET_VERSION: 'app:get-version',
  QUIT_APP: 'app:quit',
} as const
