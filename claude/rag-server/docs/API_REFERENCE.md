# API Reference

## Overview

The RAG MCP Server provides MCP (Model Context Protocol) tools for document management and search operations.

## MCP Tools

### Document Management

#### `list_files`
List all indexed documents with metadata.

**Parameters:** None

**Response:**
```json
{
  "files": [
    {
      "id": "cuid123",
      "name": "document.txt",
      "path": "./documents/document.txt",
      "size": 1024,
      "fileType": "text/plain",
      "modifiedAt": "2025-08-22T10:00:00Z",
      "indexedAt": "2025-08-22T10:01:00Z"
    }
  ],
  "total": 1
}
```

### Search Operations

#### `search_documents`
Search through indexed documents using semantic, keyword, or hybrid search.

**Parameters:**
```json
{
  "query": "machine learning algorithms",
  "useSemanticSearch": true,
  "useKeywordSearch": false,
  "useHybridSearch": false,
  "semanticWeight": 0.7,
  "topK": 5,
  "threshold": 0.1
}
```

**Response:**
```json
{
  "results": [
    {
      "fileId": "cuid123",
      "fileName": "ml-guide.txt",
      "content": "Machine learning algorithms are...",
      "score": 0.85,
      "chunkIndex": 0
    }
  ],
  "query": "machine learning algorithms",
  "searchType": "semantic",
  "resultsCount": 1,
  "processingTime": 45
}
```

**Search Types:**
- `useSemanticSearch`: Vector-based similarity search
- `useKeywordSearch`: Traditional text matching
- `useHybridSearch`: Combination of semantic + keyword (best results)

### System Information

#### `get_server_status`
Get current server status and health metrics.

**Parameters:** None

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "totalDocuments": 15,
  "totalChunks": 450,
  "memoryUsage": {
    "rss": 157286400,
    "heapTotal": 89653248,
    "heapUsed": 65432192
  },
  "processingQueue": 0,
  "errorRate": 0.1,
  "version": "1.0.0"
}
```

#### `get_current_model_info`
Get information about the current embedding model.

**Parameters:** None

**Response:**
```json
{
  "service": "transformers",
  "model": "all-MiniLM-L6-v2",
  "dimensions": 384,
  "maxTokens": 256,
  "isLoaded": true,
  "loadTime": 2340,
  "cacheLocation": "./.data/.transformers-cache"
}
```

#### `list_available_models`
Get list of available embedding models.

**Parameters:** None

**Response:**
```json
{
  "currentModel": {
    "model": "all-MiniLM-L6-v2",
    "service": "transformers",
    "dimensions": 384
  },
  "availableModels": {
    "all-MiniLM-L6-v2": {
      "modelId": "Xenova/all-MiniLM-L6-v2",
      "dimensions": 384,
      "size": "23MB",
      "description": "Fast and efficient, good for general use"
    },
    "all-MiniLM-L12-v2": {
      "modelId": "Xenova/all-MiniLM-L12-v2", 
      "dimensions": 384,
      "size": "45MB",
      "description": "Better quality, slightly slower"
    },
    "bge-small-en": {
      "modelId": "Xenova/bge-small-en",
      "dimensions": 384,
      "size": "67MB",
      "description": "High quality for English text"
    },
    "bge-base-en": {
      "modelId": "Xenova/bge-base-en",
      "dimensions": 768,
      "size": "109MB",
      "description": "Best quality, larger model"
    }
  }
}
```

## HTTP Endpoints

### Health Check

#### `GET /api/health`
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-22T10:00:00Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

#### `GET /metrics`
Prometheus-style metrics endpoint.

**Response:**
```
# HELP rag_server_uptime_seconds Server uptime in seconds
# TYPE rag_server_uptime_seconds counter
rag_server_uptime_seconds 3600

# HELP rag_server_documents_total Total number of indexed documents
# TYPE rag_server_documents_total gauge
rag_server_documents_total 15

# HELP rag_server_search_requests_total Total search requests
# TYPE rag_server_search_requests_total counter
rag_server_search_requests_total 125
```

## Error Responses

### Standard Error Format
All errors follow this format:

```json
{
  "error": {
    "name": "SearchError",
    "message": "Search operation failed",
    "code": "SEARCH_ERROR",
    "statusCode": 500,
    "context": {
      "query": "test query",
      "operation": "semantic_search"
    }
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `FILE_PARSE_ERROR` | Document processing failed | 422 |
| `SEARCH_ERROR` | Search operation failed | 500 |
| `VECTOR_STORE_ERROR` | Vector store operation failed | 500 |
| `EMBEDDING_ERROR` | Embedding generation failed | 500 |
| `DATABASE_ERROR` | Database operation failed | 500 |
| `VALIDATION_ERROR` | Invalid input parameters | 400 |
| `NOT_FOUND` | Resource not found | 404 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |

## Usage Examples

### MCP Client Example

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: "rag-client",
  version: "1.0.0"
});

// Search documents
const searchResult = await client.request({
  method: "tools/call",
  params: {
    name: "search_documents",
    arguments: {
      query: "machine learning",
      useSemanticSearch: true,
      topK: 5
    }
  }
});

// Get server status
const status = await client.request({
  method: "tools/call", 
  params: {
    name: "get_server_status",
    arguments: {}
  }
});
```

### HTTP Client Example

```bash
# Health check
curl -X GET http://localhost:3001/api/health

# Get metrics
curl -X GET http://localhost:3001/metrics

# Check if server is responding
curl -f http://localhost:3001/api/health || echo "Server down"
```

## Configuration

### Search Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query text |
| `useSemanticSearch` | boolean | false | Enable vector similarity search |
| `useKeywordSearch` | boolean | false | Enable text matching search |
| `useHybridSearch` | boolean | false | Enable combined search |
| `semanticWeight` | number | 0.7 | Weight for semantic results (0-1) |
| `topK` | number | 5 | Maximum results to return |
| `threshold` | number | 0.1 | Minimum similarity threshold |

### Performance Tuning

For optimal performance:
- Use `useHybridSearch: true` for best result quality
- Set `topK` between 3-10 for good performance
- Adjust `threshold` based on your quality requirements
- Use `semanticWeight: 0.7` for balanced results

---

**Need help?** Check the [Troubleshooting Guide](TROUBLESHOOTING.md) for common issues.