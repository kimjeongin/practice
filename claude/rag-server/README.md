# RAG MCP Server 

> **Complete Local RAG Solution with Model Context Protocol (MCP) Integration**

A TypeScript-based Model Context Protocol (MCP) server that provides fully local Retrieval Augmented Generation (RAG) capabilities using FAISS vector search, Transformers.js embeddings, and SQLite metadata storage - **no remote dependencies required!**

## ✨ Features

- **🏠 Fully Local**: Zero external dependencies - everything runs on your machine
- **⚡ Instant Startup**: Lazy loading with 2-3 second boot time
- **🔍 Hybrid Search**: Combines semantic vector search + keyword search with adjustable weights
- **🤖 Multiple Embedding Options**: Transformers.js (default), Ollama, or OpenAI
- **📁 Smart Document Processing**: Adaptive chunking strategies per file type
- **🔄 Real-time Monitoring**: Automatic indexing using chokidar file watcher
- **💾 SQLite Metadata**: Efficient file metadata and custom tags storage
- **🔌 Full MCP Protocol**: 7 complete MCP tools for seamless integration
- **🔧 TypeScript**: Complete type safety and modern development experience
- **📊 Production Ready**: Comprehensive testing and documentation

## 🚀 Quick Start

### Option 1: Zero-Setup Installation (Recommended)

```bash
# 1. Install dependencies
pnpm install

# 2. Build the project
pnpm build

# 3. Start the server (uses built-in Transformers.js)
pnpm start
```

**That's it!** The server will:
- Start instantly (2-3 seconds)
- Download AI models automatically when first used (23MB)
- Work completely offline after initial setup

### Option 2: High-Quality with Ollama

```bash
# 1. Install and start Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 2. Configure for Ollama
cp .env.example .env
# Edit .env: set EMBEDDING_SERVICE=ollama

# 3. Install and start
pnpm install && pnpm build && pnpm start
```

### Option 3: Cloud-Quality with OpenAI

```bash
# 1. Configure OpenAI
cp .env.example .env
# Edit .env: set EMBEDDING_SERVICE=openai and add OPENAI_API_KEY

# 2. Install and start
pnpm install && pnpm build && pnpm start
```

## 📖 How to Use

### 1. Add Documents

Simply place files in the `data/` directory:

```bash
# Supported formats: .txt, .md, .json, .xml, .html, .csv
echo "Machine learning is a subset of AI..." > data/ai-guide.txt
echo "# Neural Networks\nDeep learning..." > data/neural-nets.md
```

Files are automatically detected, processed, and indexed in real-time.

### 2. Search Documents

The server provides 7 MCP tools for different operations:

```bash
# Test with our comprehensive test client
npx tsx test-mcp-client-updated.ts
```

**Available MCP Tools:**
- `search_documents` - Advanced semantic/keyword/hybrid search
- `list_files` - Browse all indexed documents 
- `get_server_status` - Check system status and statistics
- `get_current_model_info` - View current AI model details
- `list_available_models` - See all available embedding models
- `switch_embedding_model` - Change AI models on-the-fly
- `force_reindex` - Rebuild search index

### 3. Search Examples

**Semantic Search:**
```json
{
  "name": "search_documents",
  "arguments": {
    "query": "machine learning algorithms",
    "useSemanticSearch": true,
    "topK": 5
  }
}
```

**Hybrid Search (Best Results):**
```json
{
  "name": "search_documents", 
  "arguments": {
    "query": "neural networks deep learning",
    "useHybridSearch": true,
    "semanticWeight": 0.7,
    "topK": 5
  }
}
```

## ⚙️ Configuration

### Core Settings

Create `.env` from `.env.example`:

```env
# Basic Configuration
DATABASE_PATH=./data/rag.db
DATA_DIR=./data
CHUNK_SIZE=1024
SIMILARITY_TOP_K=5

# Embedding Service (choose one)
EMBEDDING_SERVICE=transformers  # Default: local, zero-setup
# EMBEDDING_SERVICE=ollama       # Higher quality, requires Ollama
# EMBEDDING_SERVICE=openai       # Highest quality, requires API key
```

### Embedding Models

**Transformers.js (Built-in)**
```env
EMBEDDING_MODEL=all-MiniLM-L6-v2    # 23MB, fast (default)
# EMBEDDING_MODEL=all-MiniLM-L12-v2  # 45MB, better quality  
# EMBEDDING_MODEL=bge-small-en       # 67MB, high quality
# EMBEDDING_MODEL=bge-base-en        # 109MB, best quality
```

**Ollama (External)**
```env
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text    # 768 dimensions
```

**OpenAI (Cloud)**
```env
OPENAI_API_KEY=your_api_key_here
EMBEDDING_MODEL=text-embedding-3-small  # 1536 dimensions
```

## 🏗️ Architecture

### Project Structure

```
src/
├── app/              # Application entry point
│   ├── application.ts # Main RAG application class
│   └── index.ts      # Server startup
├── mcp/              # Model Context Protocol layer
│   ├── server/       # MCP server implementation
│   └── handlers/     # Tool handlers (search, files, models, system)
├── rag/              # RAG domain logic
│   ├── services/     # Core business logic
│   ├── repositories/ # Data access layer
│   ├── workflows/    # RAG orchestration
│   └── utils/        # Helper utilities
├── infrastructure/   # External dependencies
│   ├── embeddings/   # Embedding service adapters
│   ├── vectorstore/  # FAISS vector database
│   ├── database/     # SQLite connection
│   ├── monitoring/   # File system watcher
│   └── config/       # Configuration management
└── shared/          # Common types and utilities
```

### Data Flow

```
Documents → File Watcher → Processing Service → Chunking Service
    ↓
Embedding Service → Vector Store (FAISS) + Metadata (SQLite)
    ↓
Search Request → RAG Workflow → Hybrid Search → Results
```

## 🧪 Testing

### Automated Testing

```bash
# Run comprehensive test suite
npx tsx test-mcp-client-updated.ts

# Expected results: 10/10 tests pass (100% success rate)
```

### Manual Testing

```bash
# Development mode with hot reload
pnpm dev

# Check server status
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_server_status","arguments":{}}}'
```

### Performance Testing

```bash
# Add large documents for stress testing
for i in {1..100}; do
  echo "Large document $i with machine learning content..." > data/doc-$i.txt
done

# Monitor processing
tail -f logs/rag-server.log
```

## 📚 Documentation

- **[Model Management](docs/MODEL_MANAGEMENT.md)** - AI model configuration and optimization
- **[Production Deployment](docs/PRODUCTION_DEPLOYMENT.md)** - Bundle sizes and deployment strategies  
- **[API Reference](docs/API_REFERENCE.md)** - Complete MCP tools documentation
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing and extending the system

## 🔧 Development

```bash
# Install dependencies
pnpm install

# Development mode (hot reload)
pnpm dev

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Build for production
pnpm build
```

### Extension Points

- **Custom Embedding Providers**: Extend `EmbeddingAdapter`
- **New File Types**: Add processors to `FileProcessingService`
- **Additional Vector Stores**: Implement `VectorStoreAdapter`
- **MCP Tools**: Add handlers to `MCPServer`

## 📊 Performance

### Startup Performance
```
Lazy Loading ON:  2-3 seconds
Model Download:   5-10 seconds (first time only)
Memory Usage:     ~150MB runtime
Search Speed:     <100ms typical
```

### Bundle Sizes
```
Core Application: ~50MB
With Dependencies: ~380MB  
AI Models: 23MB-109MB (downloaded on demand)
```

### Search Quality Comparison
| Search Type | Speed | Quality | Use Case |
|-------------|-------|---------|----------|
| Keyword | ⚡ Instant | ✅ Good | Exact matches |
| Semantic | ⚡ Fast | ✅✅✅ High | Conceptual search |
| Hybrid | ⚡ Fast | ✅✅✅✅ Best | Production use |

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`) 
5. **Open** a Pull Request

### Development Setup

```bash
git clone https://github.com/your-org/rag-mcp-server.git
cd rag-mcp-server
pnpm install
pnpm dev
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🏆 Key Benefits

- **Zero Configuration**: Works out of the box with sensible defaults
- **Local-First**: No data leaves your machine, complete privacy
- **Production Ready**: Comprehensive testing, documentation, and error handling
- **Extensible**: Clean architecture allows easy customization
- **Modern Stack**: TypeScript, ESM, latest dependencies
- **MCP Integration**: Seamless integration with Claude and other MCP clients

---

**Ready to get started?** Run `pnpm install && pnpm build && pnpm start` and you'll have a full RAG system running locally in under 30 seconds! 🚀