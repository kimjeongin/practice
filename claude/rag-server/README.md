# RAG MCP Server

A TypeScript-based Model Context Protocol (MCP) server that provides Retrieval Augmented Generation (RAG) capabilities with vector database integration, advanced semantic search, and hybrid search capabilities.

## Features

- **Vector Database Integration**: ChromaDB for high-performance semantic search
- **Hybrid RAG Architecture**: Combines SQLite metadata with vector embeddings
- **Multiple Embedding Services**: OpenAI embeddings and local HuggingFace models
- **Semantic Search**: Advanced vector similarity search with configurable thresholds
- **Hybrid Search**: Combines keyword and semantic search with adjustable weights
- **File Monitoring**: Automatic file watching and indexing using chokidar
- **Metadata Management**: SQLite database for file metadata and custom tags
- **MCP Protocol**: Full Model Context Protocol implementation
- **RESTful API**: Additional REST endpoints for direct access
- **TypeScript**: Full type safety and modern development experience
- **Docker Support**: Containerized ChromaDB deployment

## Quick Start

1. **Start ChromaDB (Vector Database):**
   ```bash
   docker-compose up -d chroma
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings (especially OPENAI_API_KEY for better embeddings)
   ```

4. **Build the project:**
   ```bash
   pnpm build
   ```

5. **Start the server:**
   ```bash
   pnpm start
   ```

6. **Or run in development mode:**
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

1. **search_documents** - Advanced document search with semantic and hybrid capabilities
   - `useSemanticSearch`: Enable vector-based semantic search
   - `useHybridSearch`: Combine semantic and keyword search
   - `semanticWeight`: Balance between semantic (0-1) and keyword search
2. **list_files** - List all indexed files with metadata
3. **get_file_metadata** - Get detailed metadata for a specific file
4. **update_file_metadata** - Add or update custom metadata for files
5. **search_files_by_metadata** - Search files by their custom metadata
6. **get_server_status** - Get server status and statistics (includes vector store info)
7. **force_reindex** - Force complete reindexing of all files

### REST API Endpoints

- `GET /health` - Health check
- `POST /api/search` - Search documents
- `GET /api/files` - List files
- `GET /api/files/:id` - Get file details
- `PUT /api/files/:id/metadata` - Update file metadata
- `GET /api/info` - Server information

### Example Usage

**Semantic search via REST API:**
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to implement authentication?",
    "topK": 5,
    "fileTypes": ["md", "txt"],
    "useSemanticSearch": true
  }'
```

**Hybrid search (combines semantic + keyword):**
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication security best practices",
    "topK": 5,
    "useHybridSearch": true,
    "semanticWeight": 0.7
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

### Core Components
- **Fastify**: Fast and efficient web framework
- **ChromaDB**: Vector database for semantic search
- **SQLite**: Metadata storage and file management  
- **Chokidar**: File system monitoring
- **TypeScript**: Type safety and developer experience

### Embedding Services
- **OpenAI**: High-quality embeddings via API (recommended)
- **HuggingFace Transformers**: Local embeddings (no API required)

### Data Flow
1. **File Processing**: Documents are chunked and processed
2. **Dual Storage**: Metadata goes to SQLite, embeddings to ChromaDB  
3. **Search**: Queries can use keyword (SQLite) or semantic (ChromaDB) search
4. **Hybrid Search**: Combines both approaches with configurable weights

## Database Schema

### SQLite Tables
- `files` - Basic file information (path, size, hash, etc.)
- `file_metadata` - Custom key-value metadata for files
- `document_chunks` - Processed text chunks with references to vector embeddings

### ChromaDB Collections
- `rag_documents` - Vector embeddings with metadata for semantic search
- Each document chunk is stored with its embedding and associated metadata

## License

MIT