# RAG MCP Server

MCP server implementing RAG (Retrieval Augmented Generation) with semantic document search and automatic file processing.

## Features

- **Semantic Search**: Vector-based document search using embedding models
- **Automatic Processing**: File watching with real-time document indexing  
- **Multiple Transports**: stdio (Claude Desktop) and HTTP support
- **Embedding Providers**: Local Transformers and Ollama models
- **File Format Support**: Text, Markdown, PDF, HTML, JSON
- **Reranking**: Improves search result relevance

## Quick Start

### 1. Installation

```bash
yarn install
```

### 2. Configuration

```bash
cp .env.example .env
```

Configure key settings:

```bash
# Choose embedding service: transformers or ollama
EMBEDDING_SERVICE=ollama
EMBEDDING_MODEL=dengcao/Qwen3-Embedding-0.6B:Q8_0

# MCP transport: stdio or streamable-http
MCP_TRANSPORT=stdio

# Document directory
DOCUMENTS_DIR=./documents
```

### 3. Database Setup

```bash
yarn db:setup
```

### 4. Start Server

```bash
# Development with file watching
yarn dev

# Production
yarn build && yarn start
```

## Architecture

### Application Flow

1. **Startup**: RAGService initializes embedding models, vector store (LanceDB), and reranking service
2. **File Watching**: FileWatcher monitors document directory for changes
3. **Document Processing**: Files are chunked, embedded, and stored in vector database
4. **MCP Server**: Handles client connections via stdio or HTTP transport
5. **Search Pipeline**: Query → Embedding → Vector Search → Reranking → Results

### Domain Structure

```
src/
├── app/                    # Application entry point
├── domains/
│   ├── filesystem/         # File watching and monitoring
│   ├── mcp/               # MCP protocol implementation
│   │   ├── handlers/       # Tool handlers (search, info)
│   │   ├── server/         # MCP server core
│   │   └── transport/      # stdio/HTTP transports
│   └── rag/               # RAG domain
│       ├── core/           # Types and interfaces
│       ├── lancedb/        # Vector store provider
│       ├── ollama/         # Embedding/reranking services
│       ├── services/       # Search, processing, chunking
│       └── rag-service.ts  # Main RAG facade
└── shared/                 # Common utilities
    ├── config/             # Configuration management
    ├── logger/             # Logging
    └── utils/              # Utilities
```

## MCP Tools

### search

Search documents using natural language queries with semantic similarity.

**Parameters:**
- `query` (required): Search query text
- `topK` (optional): Maximum results (1-50, default: 5)

**Request:**
```json
{
  "name": "search",
  "arguments": {
    "query": "machine learning algorithms",
    "topK": 5
  }
}
```

**Response:**
```json
{
  "query": "machine learning algorithms",
  "results_count": 3,
  "results": [
    {
      "rank": 1,
      "content": "Machine learning algorithms are...",
      "relevance_score": 0.85,
      "source": {
        "filename": "ml-guide.txt",
        "filepath": "./documents/ml-guide.txt",
        "file_type": "text/plain",
        "chunk_index": 0
      },
      "metadata": {}
    }
  ],
  "search_info": {
    "total_results": 3,
    "search_method": "semantic",
    "max_requested": 5
  }
}
```

### get_vectordb_info

Get vector database statistics and model information.

**Request:**
```json
{
  "name": "get_vectordb_info",
  "arguments": {}
}
```

**Response:**
```json
{
  "status": "connected",
  "database_info": {
    "provider": "lancedb",
    "uri": "./.data/lancedb",
    "table_name": "documents"
  },
  "index_stats": {
    "total_vectors": 1250,
    "dimensions": 768,
    "model_name": "gte-multilingual-base"
  },
  "embedding_info": {
    "service": "transformers",
    "model": "gte-multilingual-base", 
    "dimensions": 768
  },
  "document_stats": {
    "total_documents": 45,
    "total_chunks": 1250,
    "avg_chunks_per_document": 27.8,
    "supported_file_types": ["txt", "md", "pdf", "html", "json"]
  }
}
```

## Client Integration

### Claude Desktop

Add to Claude Desktop configuration:

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

### HTTP Client

Set `MCP_TRANSPORT=streamable-http` and connect to `http://localhost:3000`.

```bash
# Test HTTP client
cd examples/http-client
npm install && npm start
```

## Configuration

### Environment Variables

```bash
# Basic
NODE_ENV=development
DOCUMENTS_DIR=./documents
LOG_LEVEL=info

# Embedding (Ollama)
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=dengcao/Qwen3-Embedding-0.6B:Q8_0
RERANKING_MODEL=dengcao/Qwen3-Reranker-0.6B:Q8_0

# Vector Store
LANCEDB_URI=./.data/lancedb

# MCP Transport
MCP_TRANSPORT=stdio           # stdio or streamable-http
MCP_PORT=3000
MCP_HOST=localhost

# Document Processing
CHUNK_SIZE=1024
CHUNK_OVERLAP=20
MAX_CONCURRENT_PROCESSING=3
```

### Embedding Models

**Ollama (External):**
- Requires Ollama server running
- Shared model cache
- Better GPU acceleration
- Recommended: `nomic-embed-text`, `dengcao/Qwen3-Embedding-0.6B:Q8_0`

**Transformers (Local):**
- No external dependencies
- CPU/GPU acceleration
- Models cached locally
- Available: `gte-multilingual-base`

## Development

### Scripts

```bash
# Development
yarn dev                    # Watch mode with auto-restart
yarn typecheck              # TypeScript checking
yarn lint                   # Code linting

# Build
yarn build                  # Production build
yarn build:executable       # Platform-specific binaries

# Database
yarn db:setup               # Initialize database
yarn db:reset               # Reset and reindex all documents
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
docker build -t rag-server .
docker run -p 3000:3000 -v ./documents:/app/documents rag-server
```

### Standalone Binary

```bash
yarn build:executable
```

Creates platform-specific binaries in `deploy/dist/`.

## Error Responses

All tools return structured errors:

```json
{
  "error": "SearchFailed",
  "message": "Search operation failed: Connection timeout", 
  "suggestion": "Try a different query or check if documents are indexed properly"
}
```

**Error Types:**
- `InvalidQuery`: Missing or invalid parameters
- `SearchFailed`: Search operation error
- `UnknownTool`: Tool not available
- `ToolExecutionFailed`: Execution error

## Performance

### Search Performance
- Semantic search: 100-500ms for small-medium collections
- Performance scales with document count and model complexity
- Results ranked by similarity score (0-1, higher = more relevant)

### Indexing Performance
- Documents processed automatically when added to watched directory
- Processing speed depends on document size and embedding model
- Large documents chunked for optimal search performance

## Troubleshooting

**Common Issues:**

1. **Documents not processing**: Check `DOCUMENTS_DIR` path and permissions
2. **No search results**: Ensure documents are indexed (`yarn db:reset`)
3. **Embedding errors**: Verify `OLLAMA_BASE_URL` and model availability
4. **MCP connection**: Check transport configuration and ports

**Debug Logging:**
```bash
LOG_LEVEL=debug yarn dev
```

**Reset Database:**
```bash
yarn db:reset && yarn dev
```

## License

MIT