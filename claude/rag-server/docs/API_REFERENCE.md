# API Reference

## MCP Tools

### search

Search through indexed documents using semantic search with natural language queries.

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

**Parameter Details:**
- `query` (required): Search query text
- `topK` (optional): Maximum number of results to return (1-50, default: 5)

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

Get information about the vector database including document count, model information, and index statistics.

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

## MCP Resources

Resources functionality has been simplified. The server provides basic file reading capability for `file://` URIs.

## Transport Configuration

### stdio Transport (Claude Desktop)

Used for integration with Claude Desktop and other MCP clients that support stdio transport.

**Environment Configuration:**
```bash
MCP_TRANSPORT=stdio
```

**Claude Desktop Configuration:**
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

### HTTP Transport

Used for HTTP-based MCP clients and testing.

**Environment Configuration:**
```bash
MCP_TRANSPORT=streamable-http
MCP_PORT=3000
MCP_HOST=localhost
MCP_ENABLE_CORS=true
```

**Client Connection:**
Connect to `http://localhost:3000` using MCP HTTP client libraries.

## Error Responses

All tools return structured error responses when operations fail:

```json
{
  "error": "SearchFailed",
  "message": "Search operation failed: Connection timeout",
  "suggestion": "Try a different query or check if documents are indexed properly"
}
```

Common error types:
- `InvalidQuery`: Missing or invalid query parameter
- `SearchFailed`: Search operation encountered an error  
- `UnknownTool`: Requested tool is not available
- `ToolExecutionFailed`: Tool execution encountered an error

## Performance Notes

### Search Performance

- Semantic search typically completes within 100-500ms for small to medium document collections
- Performance scales with document count and embedding model complexity
- Results are ranked by semantic similarity score (0-1, higher is more relevant)

### Embedding Models

**Local Transformers Models:**
- Faster startup, no external dependencies
- Models downloaded and cached locally
- CPU/GPU acceleration available

**Ollama Models:**  
- Requires Ollama server running
- Shared model cache across applications
- Better for large models and GPU acceleration

### Indexing Performance

- Documents are processed automatically when added to the watched directory
- Processing speed depends on document size and embedding model
- Large documents are chunked for optimal search performance