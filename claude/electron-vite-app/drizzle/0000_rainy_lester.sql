CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`agent_type` text NOT NULL,
	`model_name` text NOT NULL,
	`context_length` integer DEFAULT 4096 NOT NULL,
	`max_tokens` integer DEFAULT 1024 NOT NULL,
	`temperature` real DEFAULT 0.7 NOT NULL,
	`system_prompt` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `server_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`transport_type` text NOT NULL,
	`command` text,
	`args` text,
	`cwd` text,
	`env` text,
	`url` text,
	`headers` text,
	`enabled` integer DEFAULT true NOT NULL,
	`auto_reconnect` integer DEFAULT true NOT NULL,
	`reconnect_delay` integer DEFAULT 5000 NOT NULL,
	`max_reconnect` integer DEFAULT 5 NOT NULL,
	`last_connected_at` text,
	`connection_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_connections_server_id_unique` ON `server_connections` (`server_id`);--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`server_id` text NOT NULL,
	`server_name` text,
	`parameters` text NOT NULL,
	`result` text,
	`execution_time` integer,
	`status` text NOT NULL,
	`reasoning` text,
	`error_message` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tool_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`description` text NOT NULL,
	`input_schema` text NOT NULL,
	`category` text,
	`tags` text,
	`examples` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `server_connections`(`server_id`) ON UPDATE no action ON DELETE cascade
);
