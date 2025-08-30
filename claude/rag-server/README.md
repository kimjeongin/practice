# RAG MCP Server

Local RAG (Retrieval Augmented Generation) server implementing Model Context Protocol (MCP) with document indexing and semantic search capabilities.

## Features

- **Local vector search** using LanceDB or Qdrant
- **Document processing** for text, markdown, JSON, XML, HTML, CSV files
- **Embedding providers** supporting Transformers.js and Ollama
- **MCP tools** for document search and information retrieval
- **Automatic indexing** with file system monitoring
- **SQLite storage** for document metadata

## Installation

```bash
# Install dependencies
yarn install

# Setup database
yarn db:setup

# Build project
yarn build
```

## Configuration

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

### Key Settings

- `EMBEDDING_SERVICE`: `transformers` (local) or `ollama` (external)
- `VECTOR_STORE_PROVIDER`: `lancedb` (local) or `qdrant` (external)
- `MCP_TRANSPORT`: `stdio` (for MCP) or `streamable-http` (for HTTP)
- `DOCUMENTS_DIR`: Directory containing documents to index

### Embedding Services

**Transformers.js (Default) - Runs completely locally**
```env
EMBEDDING_SERVICE=transformers
```

Available models (dimensions and batch sizes are auto-configured):
- `all-MiniLM-L6-v2` - 384 dims, fast, good for general use (~23MB, batch: 20)
- `all-MiniLM-L12-v2` - 384 dims, more accurate than L6 (~45MB, batch: 15)
- `bge-small-en` - 384 dims, high quality English embeddings (~67MB, batch: 15)
- `bge-base-en` - 768 dims, better quality, slower (~109MB, batch: 10)
- `qwen3-embedding-0.6b` - 1024 dims, MTEB top performer, compact (~150MB, batch: 8)
- `qwen3-embedding-4b` - 2560 dims, high performance multilingual (~2.1GB, batch: 4)

**Recommended for best performance:**
```env
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=qwen3-embedding-0.6b
# EMBEDDING_DIMENSIONS=1024  # Auto-detected
# EMBEDDING_BATCH_SIZE=8     # Auto-optimized
```

**For high-end performance (requires more memory):**
```env
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=qwen3-embedding-4b
# EMBEDDING_DIMENSIONS=2560  # Auto-detected  
# EMBEDDING_BATCH_SIZE=4     # Auto-optimized
```

**Ollama (External service) - Auto-configured dimensions and batch sizes**
```env
EMBEDDING_SERVICE=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://localhost:11434
# EMBEDDING_DIMENSIONS=768  # Auto-detected
# EMBEDDING_BATCH_SIZE=8    # Auto-optimized
```

Available Ollama models:
- `nomic-embed-text` - 768 dims, recommended general use (batch: 8)
- `mxbai-embed-large` - 1024 dims, high quality (batch: 6)
- `snowflake-arctic-embed` - 1024 dims, good performance (batch: 6)
- `bge-large` - 1024 dims, multilingual (batch: 6)
- `dengcao/qwen3-embedding-8b` - 4096 dims, MTEB top performer (batch: 3)
- `dengcao/qwen3-embedding-4b` - 2560 dims, high performance (batch: 4)
- `dengcao/qwen3-embedding-0.6b` - 1024 dims, compact (batch: 6)

## Usage

### Start Server

```bash
# Development
yarn dev

# Production
yarn start
```

### MCP Tools

The server provides 4 MCP tools:

- `search` - Search documents with semantic/hybrid/fulltext options
- `search_similar` - Find documents similar to reference text
- `search_by_question` - Question-answering with context extraction
- `list_sources` - List indexed documents with metadata

See [API_REFERENCE.md](docs/API_REFERENCE.md) for detailed tool specifications.

### Add Documents

Place files in the configured documents directory (default: `./documents`):

```bash
echo "Machine learning content..." > documents/ml-guide.txt
echo "# Deep Learning Guide" > documents/dl-guide.md
```

Files are automatically indexed when added or modified.

## Development

### Scripts

- `yarn dev` - Development mode with hot reload
- `yarn build` - Build TypeScript
- `yarn test` - Run all tests
- `yarn typecheck` - Type checking
- `yarn lint` - Code linting

### Database

```bash
yarn db:setup    # Initialize database
yarn db:reset    # Reset database
yarn db:studio   # Open Prisma Studio
```

### Testing

```bash
yarn test:unit         # Unit tests
yarn test:integration  # Integration tests
yarn test:e2e          # End-to-end tests
```

## Architecture

```
src/
├── app/               # Application entry point
├── domains/
│   ├── mcp/          # MCP protocol implementation
│   │   ├── handlers/ # Tool handlers (search, information)
│   │   └── server/   # MCP server
│   └── rag/          # RAG domain logic
│       ├── services/ # Search, document processing
│       ├── repositories/ # Data access
│       ├── workflows/ # RAG workflows
│       └── integrations/ # Vector stores, embeddings
└── shared/           # Shared utilities
    ├── config/       # Configuration management
    ├── database/     # Database connection
    └── types/        # TypeScript definitions
```

### Database Schema

- **File** - Document metadata and indexing status
- **DocumentChunk** - Text chunks for vector search
- **FileMetadata** - Custom metadata key-value pairs
- **EmbeddingMetadata** - Model and embedding configuration tracking

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

**Embedding model not loading**
- Check `EMBEDDING_SERVICE` configuration
- For Ollama: verify service is running at `OLLAMA_BASE_URL`
- For Transformers: check disk space for model downloads

**Documents not indexing**
- Verify `DOCUMENTS_DIR` path exists
- Check file permissions
- Enable debug logging: `LOG_LEVEL=debug`

**MCP connection issues**
- Verify `MCP_TRANSPORT` setting
- For stdio: check Claude configuration
- For HTTP: verify port is available

### Logs

```bash
# View application logs
tail -f logs/rag-server.log

# View error logs  
tail -f logs/rag-server-error.log
```

## License

MIT License