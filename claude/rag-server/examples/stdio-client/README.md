# RAG Server Stdio Client Example

This directory contains a TypeScript example for connecting to the RAG MCP server using stdio transport.

## Files

- `stdio-client.ts` - Test client with basic tool testing and interactive search mode
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Prerequisites

1. Make sure the RAG MCP server is built:
   ```bash
   # From the project root
   yarn build
   ```

2. Install dependencies in this directory:
   ```bash
   cd examples/stdio-client
   yarn install
   ```

## Usage

Run the stdio client:

```bash
# Using TypeScript directly (development)
yarn dev

# Or build and run
yarn start
```

The client will:

1. **Initial Tests**: Connect to the server and run basic tests
   - Spawn the server as a child process with stdio transport
   - List available tools
   - Test `get_vectordb_info` tool

2. **Additional Search Tests**: Run predefined search queries
   - Test 5 different search queries automatically
   - Display results summary for each query

3. **Test Completion**: After all tests complete, client automatically disconnects
   - No user interaction required - all tests run automatically
   - For interactive search, use the HTTP client instead

## Example Session

```
🔗 Starting stdio MCP client test...

📡 Creating stdio transport...
🔌 Connecting to server...
✅ Connected successfully!

🔍 Testing tools/list...
📋 Available tools: [get_vectordb_info, search]

[Tool tests run...]

✅ stdio transport test completed successfully!

🔍 Running additional search tests with predefined queries...

📝 Test 1/5: "machine learning algorithms"
   ⏱️  Duration: 95.23ms
   📊 Results: 0
   🔍 Method: vector search
   📄 No results found

📝 Test 2/5: "database configuration"
   ⏱️  Duration: 112.45ms
   📊 Results: 0
   📄 No results found

[Additional tests...]

✅ Additional search tests completed!

💡 For interactive search, use the HTTP client instead:
   cd ../http-client && yarn dev
🔌 Client disconnected
```

## Differences from HTTP Client

- **Transport**: Uses stdio transport instead of HTTP
- **Server Spawning**: Automatically spawns the server as a child process
- **Process Management**: Server lifecycle is managed by the client
- **No Network Setup**: No need for HTTP server configuration
- **Testing Mode**: Runs predefined tests automatically instead of interactive mode
- **No User Input**: All tests run without requiring user interaction

## Troubleshooting

- **Connection Failed**: Make sure the server is built with `yarn build`
- **No Results**: Try lowering the score threshold or using different keywords
- **Tool Not Available**: Verify the server is properly initialized and tools are registered
- **Child Process Issues**: Check that Node.js has permission to spawn child processes