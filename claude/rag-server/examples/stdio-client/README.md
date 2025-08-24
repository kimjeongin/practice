# Basic RAG MCP Client Example

This example demonstrates how to create a simple MCP client that connects to the RAG server and performs basic operations.

## Features

- ✅ Connect to RAG MCP Server
- ✅ Upload documents
- ✅ Search documents (semantic search)
- ✅ List all files
- ✅ Check server status

## Setup

1. **Start the RAG server first** (from the root directory):
   ```bash
   cd ../../
   pnpm build && pnpm start
   ```

2. **Install dependencies** (in this directory):
   ```bash
   cd examples/basic-client
   npm install
   ```

3. **Run the example**:
   ```bash
   npm start
   ```

## How it works

The example:

1. **Connects** to the RAG server using stdio transport
2. **Uploads** a sample document about machine learning
3. **Lists** all files to verify upload
4. **Searches** for various queries to demonstrate semantic search
5. **Displays** results with similarity scores and metadata

## Code Structure

```typescript
class BasicRAGClient {
  async connect()           // Connect to MCP server
  async uploadFile()        // Upload document content
  async searchDocuments()   // Search with queries
  async listFiles()         // List all documents
  async getServerStatus()   // Check server health
  async disconnect()        // Clean shutdown
}
```

## Expected Output

```
🔗 Connecting to RAG MCP Server...
✅ Connected successfully!
📋 Available tools: search_documents, upload_file, list_files, get_server_status, get_current_model_info, list_available_models, download_model

🏥 Checking server status...
📊 Server status: { status: 'healthy', totalDocuments: 0, ... }

📄 Uploading file: machine-learning-basics.md
✅ File uploaded successfully

📁 Listing all files...
📊 Found 1 files

🔍 Performing searches...

🔍 Searching for: "neural networks"
📊 Found 2 results

📝 Top result for "neural networks":
   Content: Computing systems inspired by biological neural networks...
   Similarity: 92.3%
   File: machine-learning-basics.md

🎉 Basic example completed successfully!
```

## Next Steps

- Try the [Advanced Client](../advanced-client/) for more features
- Explore the [Interactive CLI](../interactive-cli/) for manual testing
- Check out the [Web Client](../web-client/) for browser integration