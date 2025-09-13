# RAG MCP Server

MCP server implementing RAG (Retrieval Augmented Generation) with semantic document search and automatic file processing.

## Quick Start

### Prerequisites
- Node.js >= 22.0.0
- Yarn package manager
- Ollama server running locally (for embeddings)

### Installation

```bash
yarn install
```

### Configuration

```bash
cp .env.example .env
```

Key configuration variables:
- `EMBEDDING_MODEL`: Ollama embedding model (default: qllama/multilingual-e5-large-instruct:latest)
- `DOCUMENTS_DIR`: Directory to watch for documents (default: ./documents)
- `MCP_TRANSPORT`: stdio (Claude Desktop) or streamable-http (HTTP client)

### Setup

```bash
# Initialize database
yarn db:setup

# Start development server with file watching
yarn dev
```

## Architecture

### Project Structure
```
src/
├── app/                    # Application entry point
├── domains/
│   ├── filesystem/         # File watching and monitoring
│   ├── mcp/               # MCP protocol implementation
│   │   ├── handlers/       # Tool handlers (search, info)
│   │   ├── server/         # MCP server core
│   │   └── transport/      # stdio/HTTP transports
│   └── rag/               # RAG domain logic
│       ├── core/           # Types and interfaces
│       ├── lancedb/        # Vector store provider
│       ├── services/       # Search, processing, chunking
│       └── rag-service.ts  # Main RAG facade
└── shared/                 # Common utilities
    ├── config/             # Configuration management
    ├── logger/             # Logging system
    └── utils/              # Helper utilities
```

### Data Flow
1. **File Monitoring**: Automatic document detection and indexing
2. **Document Processing**: Chunking and embedding generation
3. **Vector Storage**: Efficient similarity search with LanceDB
4. **MCP Interface**: Tool exposure via stdio or HTTP transport
5. **Search Pipeline**: Query processing with semantic ranking

## Available Commands

### Development
```bash
yarn dev                    # Development with auto-restart
yarn typecheck              # TypeScript validation
yarn lint                   # Code linting
```

### Build & Production
```bash
yarn build                  # Production build
yarn start                  # Run production server
yarn build:executable       # Create platform binaries
```

### Database Management
```bash
yarn db:setup               # Initialize vector database
yarn db:reset               # Reset and reindex documents
```

## MCP Tools

### search
Advanced document search with multiple search modes and LLM-based reranking.

**Parameters:**
- `query` (string): Search query text
- `topK` (number, optional): Maximum results (1-50, default: 5)
- `searchType` (string, optional): Search mode - 'semantic', 'keyword', or 'hybrid' (default: 'semantic')

**Search Modes:**
- **Semantic**: Uses embedding similarity for conceptual matches
- **Keyword**: Traditional full-text search with language-aware tokenization
- **Hybrid**: Combines semantic (70%) + keyword (30%) results with LLM reranking

**LLM Reranking:**
When `searchType` is 'hybrid' and LLM reranking is enabled, the system:
1. Retrieves semantic results (14 out of 20) and keyword results (6 out of 20)
2. Combines and deduplicates results 
3. Uses qwen3:4b model to evaluate relevance and rerank by ID
4. Returns top-K most relevant results

### get_vectordb_info
Retrieve vector database statistics and configuration.

## Configuration

### Environment Variables

#### Basic Configuration
```bash
NODE_ENV=development
DATA_DIR=./.data
DOCUMENTS_DIR=./documents
LOG_LEVEL=info
```

#### Document Processing
```bash
CHUNK_SIZE=400                    # Chunk size in characters
CHUNK_OVERLAP=100                 # Overlap between chunks
CHUNKING_STRATEGY=normal          # 'normal' or 'contextual'
MIN_CHUNK_SIZE=300               # Minimum chunk size
MAX_CONCURRENT_PROCESSING=3       # Processing concurrency
```

#### Ollama Integration
```bash
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=qllama/multilingual-e5-large-instruct:latest
EMBEDDING_BATCH_SIZE=12
EMBEDDING_CONCURRENCY=4
```

#### LLM Reranking (NEW)
```bash
# Enable LLM-based reranking for hybrid search
ENABLE_LLM_RERANKING=true

# Model for reranking (ensure it's available: ollama pull qwen3:4b)
LLM_RERANKING_MODEL=qwen3:4b

# Timeout for reranking operations
LLM_RERANKING_TIMEOUT_MS=60000

# Hybrid search ratios (must sum to 1.0)
HYBRID_SEMANTIC_RATIO=0.7
HYBRID_KEYWORD_RATIO=0.3

# Results to fetch before reranking
HYBRID_TOTAL_RESULTS_FOR_RERANKING=20
```

#### MCP Transport
```bash
MCP_TRANSPORT=streamable-http     # 'stdio' or 'streamable-http'
MCP_PORT=3000                     # HTTP port (if using HTTP transport)
MCP_HOST=localhost                # Server host
```

## Client Integration

### Claude Desktop (Recommended)
Add to Claude Desktop configuration:

```json
{
  "mcpServers": {
    "rag-server": {
      "command": "node",
      "args": ["/absolute/path/to/rag-server/dist/app/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "DOCUMENTS_DIR": "/path/to/your/documents"
      }
    }
  }
}
```

### HTTP Client
Set `MCP_TRANSPORT=streamable-http` in .env and connect to `http://localhost:3000`.

```bash
# Test HTTP integration
cd examples/stdio-client
npm install && npm start
```

## Supported File Types

- **Text**: .txt, .md
- **Documents**: .pdf, .html
- **Data**: .json, .csv
- **Office**: .docx (via mammoth)

## Performance & Optimization

- **Embedding Model**: Lighter models (e.g., qwen3:0.6b) for faster processing
- **Chunk Strategy**: Normal chunking for general use, contextual for complex documents
- **Concurrency**: Adjust `MAX_CONCURRENT_PROCESSING` based on system resources
- **Batch Size**: Optimize `EMBEDDING_BATCH_SIZE` for memory usage

## Development

### Testing
```bash
# Test stdio transport
cd examples/stdio-client && npm start

# Debug with verbose logging
LOG_LEVEL=debug yarn dev
```

### Adding New Features
1. Follow domain-driven structure under `src/domains/`
2. Add configuration to `ConfigFactory`
3. Update environment templates
4. Add appropriate logging and error handling

## Troubleshooting

### Common Issues

**Documents not processing**
- Check `DOCUMENTS_DIR` path and permissions
- Verify file watcher is monitoring correctly

**No search results**
- Ensure documents are indexed: `yarn db:reset`
- Check embedding model availability in Ollama

**Connection errors**
- Verify Ollama server is running (`ollama serve`)
- Check `OLLAMA_BASE_URL` configuration
- For HTTP transport, ensure port 3000 is available

**Debug mode**
```bash
LOG_LEVEL=debug yarn dev
```

## License

MIT