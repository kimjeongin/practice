# Electron MCP Agent

An intelligent desktop application powered by LangGraph and Model Context Protocol (MCP) servers. This application provides a sophisticated agent-based chatbot that can dynamically connect to various MCP servers to access tools and enhance its capabilities.

## ✨ Features

- **🤖 LangGraph-powered Agent**: Advanced AI agent built with LangChain.js and LangGraph for reliable, controllable workflows
- **🔧 Multi-MCP Server Support**: Connect to multiple MCP servers simultaneously using `@langchain/mcp-adapters`
- **🦙 Local Ollama Integration**: Privacy-focused local LLM integration with `@langchain/ollama`
- **💬 Persistent Conversations**: SQLite-based conversation management with Prisma
- **⚡ Real-time Communication**: Event-driven architecture with real-time updates
- **🎨 Modern UI**: React + TypeScript + Tailwind CSS interface

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 🛠 Prerequisites

1. **Ollama**: Install and run [Ollama](https://ollama.com/) locally
   ```bash
   # Install a model (e.g., Llama 3.1)
   ollama pull llama3.1:8b
   ```

2. **Node.js**: Version 16 or higher
3. **Yarn**: Package manager (or npm/pnpm)

## 🚀 Project Setup

### Install Dependencies

```bash
$ yarn install
```

### Database Setup

```bash
# Generate Prisma client and setup database
$ yarn db:setup
```

### Development

```bash
$ yarn dev
```

### Build

```bash
# For windows
$ yarn build:win

# For macOS
$ yarn build:mac

# For Linux
$ yarn build:linux
```

## 🧪 Testing the System

Test the LangGraph agent system:

```bash
$ node test-langgraph-system.js
```

## 🏗 Architecture Overview

### New LangGraph-Based System

The application has been refactored to use LangChain.js and LangGraph for a much simpler and more reliable architecture:

- **Before**: 774 lines of complex custom ReAct implementation
- **After**: ~200 lines using proven LangChain patterns

### Key Components

1. **LangGraph Agent Service** (`src/lib/agent/services/langgraph-agent.service.ts`)
   - StateGraph-based workflow
   - Built-in ReAct pattern
   - Automatic tool integration

2. **MCP Loader Service** (`src/lib/agent/services/mcp-loader.service.ts`)
   - Simplified MCP server management
   - Uses `@langchain/mcp-adapters`
   - Auto-reload capabilities

3. **Conversation Manager** (unchanged)
   - Persistent conversation storage
   - Message history management

## 📡 MCP Server Integration

The application uses `@langchain/mcp-adapters` to connect to MCP servers:

```typescript
// Example MCP server configuration
const mcpServers = [
  {
    name: "filesystem",
    command: "node",
    args: ["path/to/filesystem-server"],
    transport: "stdio"
  },
  {
    name: "web-search",
    url: "http://localhost:8000/mcp",
    transport: "sse"
  }
]
```

## 🔧 Configuration

MCP servers are configured in `userData/mcp-servers-config.json`:

```json
{
  "servers": [
    {
      "name": "example-server",
      "command": "node",
      "args": ["server.js"],
      "transport": "stdio"
    }
  ],
  "autoReload": true,
  "reloadInterval": 30000
}
```

## 📋 Migration Guide

If upgrading from the old system:

1. **Agent Orchestrator → LangGraph Agent**:
   ```typescript
   // Old
   import { getAgentOrchestrator } from './agent'
   const orchestrator = getAgentOrchestrator()
   
   // New  
   import { getLangGraphAgent } from './agent'
   const agent = getLangGraphAgent()
   ```

2. **MCP Management**: Now handled automatically by MCP Loader Service
3. **API Compatibility**: All existing APIs remain the same
