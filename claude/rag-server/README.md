# RAG MCP Server

A high-performance Model Context Protocol (MCP) server implementing Retrieval Augmented Generation (RAG) with advanced semantic search capabilities. Features automatic document processing, LanceDB vector storage, and multiple search strategies powered by Ollama embeddings.

## Features

- 🔍 **Advanced Search**: Semantic, keyword, and hybrid search modes with LLM reranking
- 📁 **Auto File Processing**: Real-time document monitoring and indexing
- 🧠 **Multiple Chunking Strategies**: Normal and contextual chunking with configurable parameters
- 🚀 **High Performance**: Concurrent processing with LanceDB vector storage
- 🔌 **Flexible Transport**: Support for stdio (Claude Desktop) and HTTP protocols
- 📊 **Rich Monitoring**: Comprehensive logging and database statistics

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [Yarn](https://yarnpkg.com/) package manager
- [Ollama](https://ollama.ai/) server running locally with embedding model

### Installation

```bash
# Clone and install dependencies
yarn install

# Setup configuration
cp .env.example .env
# Edit .env with your settings

# Initialize database and start development server
yarn db:setup
yarn dev
```

## Configuration

The server uses environment variables for configuration. Copy `.env.example` to `.env` and customize:

### Essential Settings

```bash
# Document processing
DOCUMENTS_DIR=./documents              # Directory to watch for documents
CHUNKING_STRATEGY=normal               # Chunking strategy: normal | contextual
CHUNK_SIZE=600                         # Chunk size in tokens (100-8192)

# Ollama integration
OLLAMA_BASE_URL=http://localhost:11434 # Ollama server URL
EMBEDDING_MODEL=bge-m3:567m            # Embedding model name

# MCP transport
MCP_TRANSPORT=stdio                    # Transport: stdio | streamable-http
MCP_PORT=3000                          # HTTP port (for streamable-http)
```

### Advanced Configuration

See `.env.example` for complete configuration options including:
- LLM reranking settings
- Search thresholds and ratios
- Processing concurrency limits
- File watcher parameters

## Usage

### Development

```bash
yarn dev          # Start with auto-restart and debug logging
yarn typecheck    # TypeScript type checking
yarn lint         # Code linting
```

### Production

```bash
yarn build        # Build for production
yarn start        # Run production server
```

### Database Management

```bash
yarn db:setup     # Initialize database and index documents
yarn db:reset     # Reset database and reindex all documents
```

## MCP Tools

### `search`

Advanced document search with multiple strategies.

**Parameters:**
- `query` (string, required): Natural language search query
- `topK` (number, optional): Maximum results (1-50, default: 5)
- `searchType` (string, optional): Search method

**Search Types:**
- `semantic`: Vector similarity for conceptual understanding
- `keyword`: Full-text search for exact term matching
- `hybrid`: Combined approach with LLM reranking (recommended)

**Example:**
```json
{
  "query": "authentication methods in API documentation",
  "topK": 10,
  "searchType": "hybrid"
}
```

### `get_vectordb_info`

Retrieve database statistics and health information.

**Returns:**
- Document count and indexing status
- Vector store health and configuration
- Embedding model information
- Processing statistics

## Client Integration

### Claude Desktop

Add to your MCP settings file:

```json
{
  "mcpServers": {
    "rag-server": {
      "command": "node",
      "args": ["/absolute/path/to/rag-server/dist/app/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "DOCUMENTS_DIR": "/path/to/your/documents",
        "EMBEDDING_MODEL": "bge-m3:567m"
      }
    }
  }
}
```

### HTTP Integration

For custom clients or web applications:

```bash
# Set HTTP transport in .env
MCP_TRANSPORT=streamable-http
MCP_PORT=3000
MCP_HOST=localhost

# Start server
yarn start

# Connect to http://localhost:3000
```

## Supported File Formats

| Type | Extensions | Notes |
|------|------------|-------|
| Text | `.txt`, `.md` | Direct text processing |
| Documents | `.pdf`, `.html` | OCR and content extraction |
| Data | `.json`, `.csv` | Structured data parsing |
| Office | `.docx` | Microsoft Word documents |

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   File Watcher  │───▶│  Document       │───▶│   LanceDB       │
│                 │    │  Processor      │    │  Vector Store   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                ▲                      ▲
                                │                      │
                                ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │◀───│  Search Service │◀───│  Ollama         │
│  (Claude/HTTP)  │    │                 │    │  Embeddings     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Troubleshooting

### Common Issues

**Documents not being processed**
```bash
# Check directory permissions and path
ls -la $DOCUMENTS_DIR

# Reset and reindex
yarn db:reset

# Check logs
LOG_LEVEL=debug yarn dev
```

**No search results**
```bash
# Verify Ollama is running
ollama serve

# Check embedding model availability
ollama list | grep bge-m3

# Verify database content
yarn start # and use get_vectordb_info tool
```

**Connection errors**
- Verify `OLLAMA_BASE_URL` is accessible
- Ensure port 3000 is available (for HTTP transport)
- Check firewall settings for Ollama port 11434

### Performance Tuning

- Adjust `CHUNK_SIZE` and `CHUNK_OVERLAP` for your content type
- Tune `MAX_CONCURRENT_PROCESSING` based on system resources
- Use `contextual` chunking for better semantic coherence
- Configure `EMBEDDING_BATCH_SIZE` for optimal throughput

## Development

### Project Structure

```
src/
├── app/                    # Application entry point
├── domains/
│   ├── filesystem/         # File watching and processing
│   ├── mcp/               # MCP protocol handlers
│   └── rag/               # RAG implementation
│       ├── core/          # Core types and interfaces
│       ├── lancedb/       # Vector store implementation
│       ├── ollama/        # Embedding and LLM services
│       └── services/      # Processing services
└── shared/
    ├── config/            # Configuration management
    └── logger/            # Logging utilities
```

### Building Executables

```bash
# Build standalone executables for all platforms
yarn build:executable

# Platform-specific builds
yarn bundle:linux
yarn bundle:macos
yarn bundle:windows
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `yarn typecheck` and `yarn lint`
5. Submit a pull request

## License

MIT - see [LICENSE](LICENSE) file for details.