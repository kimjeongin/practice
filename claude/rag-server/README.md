# RAG MCP Server

A Model Context Protocol (MCP) server that provides RAG (Retrieval Augmented Generation) capabilities with semantic document search and automatic file processing.

## Features

- **Semantic Search**: Vector-based document search using embedding models
- **Automatic File Processing**: Watch directories and process documents automatically
- **Multiple Embedding Providers**: Support for local Transformers models and Ollama
- **MCP Protocol**: Compatible with Claude Desktop and other MCP clients
- **Multiple Transport**: Support for both stdio and HTTP transport
- **File Processing**: Support for text, markdown, PDF, and other document formats

## Quick Start

### 1. Install Dependencies

```bash
yarn install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` to configure your setup. Key settings:

- `EMBEDDING_SERVICE`: Choose `transformers` (local) or `ollama` (external)
- `MCP_TRANSPORT`: Choose `stdio` (for Claude Desktop) or `streamable-http` (for HTTP clients)
- `DOCUMENTS_DIR`: Directory to watch for documents

### 3. Setup Database

```bash
yarn db:setup
```

### 4. Add Documents

Place your documents in the `./documents` directory (or the directory specified in `DOCUMENTS_DIR`). The server will automatically process them.

### 5. Start Server

```bash
# Development mode with file watching
yarn dev

# Production mode
yarn build && yarn start
```

## MCP Client Usage

### Claude Desktop Integration

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "rag-server": {
      "command": "node",
      "args": ["/path/to/rag-server/dist/app/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### HTTP Client Usage

Set `MCP_TRANSPORT=streamable-http` in your `.env` and use HTTP clients:

```bash
# Test with example client
cd examples/http-client
npm install
npm start
```

## Available Tools

### search

Search through indexed documents using natural language queries.

**Parameters:**

- `query` (required): Search query text
- `topK` (optional): Maximum results to return (1-50, default: 5)

### get_vectordb_info

Get information about the vector database including document count and model information.

## Configuration

### Environment Variables

Key configuration options:

```bash
# Basic setup
NODE_ENV=development
DOCUMENTS_DIR=./documents
LOG_LEVEL=info

# Embedding configuration
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=gte-multilingual-base

# Vector store
VECTOR_STORE_PROVIDER=lancedb
LANCEDB_URI=./.data/lancedb

# MCP transport
MCP_TRANSPORT=stdio
MCP_PORT=3000
```

### Embedding Models

**Transformers (Local):**

- `gte-multilingual-base`: Good multilingual support

**Ollama (External):**

- `nomic-embed-text`: Recommended general use

## Development

### Project Structure

```
src/
├── app/                 # Application entry point
├── domains/
│   ├── mcp/            # MCP protocol implementation
│   │   ├── handlers/   # Tool handlers (search, information)
│   │   └── server/     # MCP server
│   ├── rag/            # RAG domain logic
│   │   ├── services/   # Search, document processing
│   │   ├── lancedb/    # Vector store implementation
│   │   └── embeddings/ # Embedding providers
│   └── filesystem/     # File watching and processing
└── shared/             # Shared utilities
    ├── config/         # Configuration management
    ├── logger/         # Logging utilities
    └── utils/          # Common utilities
```

### Scripts

```bash
# Development
yarn dev                # Development mode with file watching
yarn typecheck          # Type checking
yarn lint               # Linting

# Build
yarn build              # Build for production
yarn build:executable   # Create platform-specific binaries

# Database
yarn db:setup           # Initialize database
yarn db:reset           # Reset database
```

### Testing

```bash
# Test stdio transport
cd examples/stdio-client && npm start

# Test HTTP transport
cd examples/http-client && npm start
```

## Deployment

### Docker

```bash
# Build
docker build -t rag-server .

# Run
docker run -p 3000:3000 -v ./documents:/app/documents rag-server
```

### Standalone Binary

```bash
yarn build:executable
```

Generates platform-specific binaries in `deploy/dist/`.

## Troubleshooting

### Common Issues

1. **Documents not being processed**: Check `DOCUMENTS_DIR` path and file permissions
2. **Search returns no results**: Ensure documents are processed and indexed
3. **Embedding errors**: Check `EMBEDDING_SERVICE` configuration and model availability
4. **MCP connection issues**: Verify transport configuration and port availability

### Logging

Set `LOG_LEVEL=debug` for detailed logs. Check logs in `./logs` directory.

### Database Issues

```bash
# Reset database and reprocess all documents
yarn db:reset
yarn dev
```

## License

MIT
