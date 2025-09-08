# RAG Server HTTP Client Example

This directory contains a TypeScript example for connecting to the RAG MCP server using streamable HTTP transport.

## Files

- `http-client.ts` - Test client with basic tool testing and interactive search mode
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Prerequisites

1. Make sure the RAG MCP server is running with HTTP transport:
   ```bash
   # From the project root
   MCP_TRANSPORT=streamable-http MCP_PORT=3000 yarn start
   ```

2. Install dependencies in this directory:
   ```bash
   cd examples/http-client
   yarn install
   ```

## Usage

Run the HTTP client:

```bash
# Using TypeScript directly (development)
yarn dev

# Or build and run
yarn start
```

The client will:

1. **Initial Tests**: Connect to the server and run basic tests
   - Connect to the server at `http://localhost:3000/mcp`
   - List available tools
   - Test `get_vectordb_info` tool
   - Test `search` tool with basic and reranking searches

2. **Interactive Search Mode**: After tests complete, enter interactive mode
   - **Continuous search**: Keep entering queries until you type "exit"
   - **Real-time results**: See search results immediately
   - **Help system**: Type "help" for usage information

#### Interactive Commands

- `[query text]` - Perform semantic search
- `help` - Show help and current settings
- `exit` - Quit the application

## Example Session

```
🔗 Starting streamable-http MCP client test...

📡 Connecting to server: http://localhost:3000/mcp
🔌 Connecting to server...
✅ Connected successfully!

🔍 Testing tools/list...
📋 Available tools: [get_vectordb_info, search]

[Tool tests run...]

✅ streamable-http transport test completed successfully!

🔍 Starting interactive search mode...
💡 Commands:
   • Type a search query to search
   • Type "help" for more information
   • Type "exit" to quit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 Enter search query (or "help", "exit"): python programming

🔍 Searching for: "python programming"
⏳ Processing...

🎯 Search Results (245.67ms):
   Query: "python programming"
   Results: 3
   Method: vector search

📄 Results:

1. programming_guide.md
   Score: 0.875
   Content: Python is a high-level programming language that...

🔍 Enter search query (or "help", "exit"): exit

👋 Goodbye!
```

## Troubleshooting

- **Connection Failed**: Make sure the server is running with `MCP_TRANSPORT=streamable-http MCP_PORT=3000 yarn start`
- **No Results**: Try lowering the score threshold or using different keywords
- **Tool Not Available**: Verify the server is properly initialized and tools are registered