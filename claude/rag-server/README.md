# RAG MCP Server

A TypeScript-based Model Context Protocol (MCP) server that provides fully local Retrieval Augmented Generation (RAG) capabilities using LangChain, FAISS vector search, and Ollama embeddings - no remote dependencies required!

## Features

- **🏠 Fully Local**: No remote dependencies - everything runs on your machine
- **⚡ LangChain Pipeline**: Industry-standard RAG implementation  
- **🔍 FAISS Vector Search**: High-performance local vector database
- **🤖 Ollama Integration**: Local embeddings with multiple model options
- **📁 Smart Document Processing**: Adaptive chunking strategies per file type
- **🔄 Real-time File Monitoring**: Automatic indexing using chokidar
- **🔀 Hybrid Search**: Combines semantic and keyword search with adjustable weights
- **💾 SQLite Metadata**: Efficient file metadata and custom tags storage
- **🔌 MCP Protocol**: Full Model Context Protocol implementation
- **🔧 TypeScript**: Complete type safety and modern development experience
- **📊 Smart Chunking**: Markdown header-based, JSON object-based chunking

## Quick Start

### Option 1: Using Built-in Transformers.js (Recommended - No External Dependencies)

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Default configuration uses built-in Transformers.js - no setup needed!
   ```

### Option 2: Using External Ollama (Higher Quality)

1. **Install and start Ollama:**
   ```bash
   # Install Ollama (visit https://ollama.com)
   ollama pull nomic-embed-text
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env: set EMBEDDING_SERVICE=ollama
   ```

### Option 3: Using OpenAI Embeddings (Cloud-based)

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env: set EMBEDDING_SERVICE=openai and add your OPENAI_API_KEY
   ```

### Continue for both options:

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

### Core Settings
- `DATABASE_PATH`: SQLite database file path (default: ./data/rag.db)
- `DATA_DIR`: Directory to watch for documents (default: ./data)
- `CHUNK_SIZE`: Text chunk size for processing (default: 1024)
- `CHUNK_OVERLAP`: Overlap between chunks (default: 20)
- `SIMILARITY_TOP_K`: Number of similar chunks to retrieve (default: 5)

### Embedding Service Configuration
- `EMBEDDING_SERVICE`: Choose 'transformers', 'ollama', or 'openai' (default: transformers)
- `EMBEDDING_DIMENSIONS`: Vector dimensions (384 for Transformers.js, 768 for Ollama, 1536 for OpenAI)

### Transformers.js Configuration (Built-in - Default)
- `EMBEDDING_MODEL`: Model name (default: all-MiniLM-L6-v2)
  - `all-MiniLM-L6-v2`: Fast and efficient (384 dims)
  - `all-MiniLM-L12-v2`: Larger and more accurate (384 dims)
  - `bge-small-en`: High quality English embeddings (384 dims)
  - `bge-base-en`: Better quality, slower (768 dims)

### Ollama Configuration (External Local Server)
- `OLLAMA_BASE_URL`: Ollama server URL (default: http://localhost:11434)
- `EMBEDDING_MODEL`: Ollama model name (default: nomic-embed-text)

### OpenAI Configuration (Cloud API)
- `OPENAI_API_KEY`: Your OpenAI API key (required for OpenAI service)
- `EMBEDDING_MODEL`: OpenAI model name (default: text-embedding-3-small)

### ChromaDB Configuration
- `CHROMA_SERVER_URL`: ChromaDB server URL (default: http://localhost:8000)
- `CHROMA_COLLECTION_NAME`: Collection name (default: rag_documents)

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
- **LangChain**: Industry-standard RAG framework
- **FAISS**: High-performance local vector database
- **Transformers.js**: Built-in local embedding models (default)
- **SQLite**: Metadata storage and file management  
- **Chokidar**: Real-time file system monitoring
- **TypeScript**: Complete type safety and developer experience

### Embedding Services
- **Transformers.js (Default)**: Built-in local embeddings with zero setup
  - `all-MiniLM-L6-v2`: Fast and efficient (384 dimensions) - Default
  - `all-MiniLM-L12-v2`: Larger and more accurate (384 dimensions)
  - `bge-small-en`: High quality English embeddings (384 dimensions)
  - `bge-base-en`: Better quality, slower (768 dimensions)
- **Ollama (Optional)**: External local embeddings with higher quality
  - `nomic-embed-text`: Fast and efficient (768 dimensions)
  - `all-minilm`: Smaller and faster (384 dimensions)
  - `mxbai-embed-large`: Larger and more accurate (1024 dimensions)
- **OpenAI (Optional)**: Cloud-based high-quality embeddings

### Local RAG Pipeline
1. **File Detection**: Chokidar monitors data directory for changes
2. **Smart Processing**: Adaptive chunking based on file type (Markdown headers, JSON objects)
3. **Local Embedding**: Transformers.js generates embeddings completely offline (or Ollama if configured)
4. **Dual Storage**: Metadata in SQLite, vectors in FAISS (both local)
5. **Hybrid Search**: Combines FAISS semantic search + SQLite keyword search
6. **Real-time Updates**: Incremental index updates on file changes
7. **Zero Setup**: Works out of the box with built-in models

## Database Schema

### SQLite Tables (Metadata & Coordination)
- `files` - Basic file information (path, size, hash, modification dates)
- `file_metadata` - Custom key-value metadata for files  
- `document_chunks` - Processed text chunks with FAISS index references

### FAISS Vector Index (Local File System)
- **Index Files**: Stored in `data/faiss_index/` directory
- **Document Vectors**: High-dimensional embeddings for semantic search
- **Metadata**: File references, chunk positions, and search metadata
- **Persistence**: Automatically saved/loaded from local files

## License

MIT