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

**Transformers.js (Default)**
```env
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

**Ollama**
```env
EMBEDDING_SERVICE=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://localhost:11434
```

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