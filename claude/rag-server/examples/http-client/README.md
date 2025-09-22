# HTTP Client Example

TypeScript client for RAG MCP server using HTTP transport.

## Setup

```bash
cd examples/http-client
yarn install
```

## Usage

1. Start RAG server with HTTP transport:
   ```bash
   # From project root
   MCP_TRANSPORT=streamable-http MCP_PORT=3000 yarn start
   ```

2. Run the client:
   ```bash
   yarn dev
   ```

## What it does

- Connects to server at `http://localhost:3000/mcp`
- Tests available tools (`get_vectordb_info`, `search`)
- Interactive search mode with commands:
  - `[search query]` - Perform semantic search
  - `help` - Show help
  - `exit` - Quit

## Requirements

- RAG server running with HTTP transport
- Port 3000 available