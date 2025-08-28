import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// Conversations table
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// Messages table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user, assistant, system, tool
  content: text('content').notNull(),
  metadata: text('metadata', { mode: 'json' }), // JSON metadata
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// Tool calls table
export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
  serverId: text('server_id').notNull(),
  serverName: text('server_name'),
  parameters: text('parameters', { mode: 'json' }).notNull(), // JSON parameters
  result: text('result', { mode: 'json' }), // JSON result
  executionTime: integer('execution_time'), // milliseconds
  status: text('status').notNull(), // pending, success, error
  reasoning: text('reasoning'), // LLM's reasoning for tool selection
  errorMessage: text('error_message'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// Agent sessions table
export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id').notNull(),
  agentType: text('agent_type').notNull(), // main, reasoning, fast
  modelName: text('model_name').notNull(), // llama3.1:8b, deepseek-r1:8b, mistral:7b
  contextLength: integer('context_length').notNull().default(4096),
  maxTokens: integer('max_tokens').notNull().default(1024),
  temperature: real('temperature').notNull().default(0.7),
  systemPrompt: text('system_prompt'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// Server connections table
export const serverConnections = sqliteTable('server_connections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text('server_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  transportType: text('transport_type').notNull(), // stdio, http
  command: text('command'), // for stdio
  args: text('args', { mode: 'json' }), // for stdio
  cwd: text('cwd'), // for stdio
  env: text('env', { mode: 'json' }), // for stdio
  url: text('url'), // for http
  headers: text('headers', { mode: 'json' }), // for http
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  autoReconnect: integer('auto_reconnect', { mode: 'boolean' }).notNull().default(true),
  reconnectDelay: integer('reconnect_delay').notNull().default(5000),
  maxReconnect: integer('max_reconnect').notNull().default(5),
  lastConnectedAt: text('last_connected_at'),
  connectionCount: integer('connection_count').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// Tool metadata table
export const toolMetadata = sqliteTable('tool_metadata', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text('server_id')
    .notNull()
    .references(() => serverConnections.serverId, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
  description: text('description').notNull(),
  inputSchema: text('input_schema', { mode: 'json' }).notNull(), // JSON input schema
  category: text('category'),
  tags: text('tags', { mode: 'json' }), // array of strings
  examples: text('examples', { mode: 'json' }), // array of examples
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  toolCalls: many(toolCalls),
}))

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
  message: one(messages, {
    fields: [toolCalls.messageId],
    references: [messages.id],
  }),
}))

export const serverConnectionsRelations = relations(serverConnections, ({ many }) => ({
  tools: many(toolMetadata),
}))

export const toolMetadataRelations = relations(toolMetadata, ({ one }) => ({
  server: one(serverConnections, {
    fields: [toolMetadata.serverId],
    references: [serverConnections.serverId],
  }),
}))

// Infer types for use in application
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

export type ToolCall = typeof toolCalls.$inferSelect
export type NewToolCall = typeof toolCalls.$inferInsert

export type AgentSession = typeof agentSessions.$inferSelect
export type NewAgentSession = typeof agentSessions.$inferInsert

export type ServerConnection = typeof serverConnections.$inferSelect
export type NewServerConnection = typeof serverConnections.$inferInsert

export type ToolMetadata = typeof toolMetadata.$inferSelect
export type NewToolMetadata = typeof toolMetadata.$inferInsert