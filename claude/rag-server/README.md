# RAG MCP Server

A TypeScript-based Model Context Protocol (MCP) server that provides Retrieval Augmented Generation (RAG) capabilities using Fastify, LlamaIndex.js, and SQLite.

## Features

- **RAG Support**: Semantic search over local documents using LlamaIndex.js
- **File Monitoring**: Automatic file watching and indexing using chokidar
- **Metadata Management**: SQLite database for file metadata and custom tags
- **MCP Protocol**: Full Model Context Protocol implementation
- **RESTful API**: Additional REST endpoints for direct access
- **TypeScript**: Full type safety and modern development experience
- **Local Embeddings**: Uses HuggingFace embeddings (no API keys required by default)

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Build the project:**
   ```bash
   pnpm build
   ```

4. **Start the server:**
   ```bash
   pnpm start
   ```

5. **Or run in development mode:**
   ```bash
   pnpm dev
   ```

## Configuration

The server can be configured via environment variables in `.env`:

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: localhost)
- `DATABASE_PATH`: SQLite database file path (default: ./data/rag.db)
- `DATA_DIR`: Directory to watch for documents (default: ./data)
- `EMBEDDING_MODEL`: HuggingFace embedding model (default: BAAI/bge-small-en-v1.5)
- `CHUNK_SIZE`: Text chunk size for processing (default: 1024)
- `CHUNK_OVERLAP`: Overlap between chunks (default: 20)
- `SIMILARITY_TOP_K`: Number of similar chunks to retrieve (default: 5)

## Usage

### Adding Documents

Place your documents in the `data` directory (configured via `DATA_DIR`). Supported formats:
- `.txt` - Plain text files
- `.md` - Markdown files
- `.json` - JSON files
- `.xml` - XML files
- `.html` - HTML files
- `.csv` - CSV files

Files are automatically monitored and indexed when added, modified, or removed.

### MCP Tools

The server provides the following MCP tools:

1. **search_documents** - Search through indexed documents
2. **list_files** - List all indexed files with metadata
3. **get_file_metadata** - Get detailed metadata for a specific file
4. **update_file_metadata** - Add or update custom metadata for files
5. **search_files_by_metadata** - Search files by their custom metadata
6. **get_server_status** - Get server status and statistics
7. **force_reindex** - Force complete reindexing of all files

### REST API Endpoints

- `GET /health` - Health check
- `POST /api/search` - Search documents
- `GET /api/files` - List files
- `GET /api/files/:id` - Get file details
- `PUT /api/files/:id/metadata` - Update file metadata
- `GET /api/info` - Server information

### Example Usage

**Search documents via REST API:**
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to implement authentication?",
    "topK": 5,
    "fileTypes": ["md", "txt"]
  }'
```

**Update file metadata:**
```bash
curl -X PUT http://localhost:3000/api/files/FILE_ID/metadata \
  -H "Content-Type: application/json" \
  -d '{
    "category": "documentation",
    "priority": "high",
    "tags": "auth,security"
  }'
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode (with hot reload)
pnpm dev

# Build for production
pnpm build

# Run type checking
pnpm typecheck

# Run linting
pnpm lint
```

## Architecture

- **Fastify**: Fast and efficient web framework
- **LlamaIndex.js**: RAG and document processing
- **SQLite**: Metadata storage and file management
- **Chokidar**: File system monitoring
- **HuggingFace**: Local embeddings (no external API required)
- **TypeScript**: Type safety and developer experience

## Database Schema

The server uses SQLite with the following tables:

- `files` - Basic file information (path, size, hash, etc.)
- `file_metadata` - Custom key-value metadata for files
- `document_chunks` - Processed text chunks for RAG

## License

MIT