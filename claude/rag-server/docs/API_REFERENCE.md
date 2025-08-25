# API Reference

## MCP Tools

The RAG MCP Server provides 4 tools for document search and information retrieval.

### search

Search documents using semantic, hybrid, or fulltext search methods.

**Parameters:**
```json
{
  "query": "machine learning algorithms",
  "search_type": "semantic",
  "limit": 5,
  "sources": ["txt", "md"],
  "metadata_filters": {"author": "john"}
}
```

**Parameter Details:**
- `query` (required): Search query text
- `search_type` (optional): `"semantic"` | `"hybrid"` | `"fulltext"` (default: `"semantic"`)
- `limit` (optional): Max results (1-50, default: 5)
- `sources` (optional): Filter by file types
- `metadata_filters` (optional): Key-value metadata filters

**Response:**
```json
{
  "query": "machine learning algorithms",
  "search_type": "semantic",
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

### search_similar

Find documents similar to provided reference text using semantic similarity.

**Parameters:**
```json
{
  "reference_text": "Neural networks are computational models...",
  "limit": 3,
  "exclude_source": "neural-networks.txt",
  "similarity_threshold": 0.1
}
```

**Parameter Details:**
- `reference_text` (required): Text to find similar content for
- `limit` (optional): Max similar documents (1-10, default: 3)
- `exclude_source` (optional): Exclude specific file by name/path/ID
- `similarity_threshold` (optional): Min similarity score (0.0-1.0, default: 0.1)

**Response:**
```json
{
  "reference_text": "Neural networks are computational models...",
  "similar_documents": [
    {
      "rank": 1,
      "similarity_score": 0.78,
      "content_preview": "Deep learning is a subset of machine learning...",
      "full_content": "Deep learning is a subset of machine learning that uses neural networks...",
      "source": {
        "filename": "deep-learning.md",
        "filepath": "./documents/deep-learning.md",
        "file_type": "text/markdown",
        "chunk_index": 1,
        "file_id": "clk123xyz"
      },
      "metadata": {}
    }
  ],
  "total_found": 2,
  "search_info": {
    "similarity_threshold": 0.1,
    "excluded_source": "neural-networks.txt",
    "search_method": "semantic_similarity"
  }
}
```

### search_by_question

Search for information using natural language questions with context extraction and answer synthesis.

**Parameters:**
```json
{
  "question": "What is machine learning?",
  "context_limit": 5,
  "sources": ["txt", "md"],
  "search_method": "semantic"
}
```

**Parameter Details:**
- `question` (required): Question or information request
- `context_limit` (optional): Max context chunks to analyze (1-20, default: 5)
- `sources` (optional): Filter by file types
- `search_method` (optional): `"semantic"` | `"hybrid"` (default: `"semantic"`)

**Response:**
```json
{
  "question": "What is machine learning?",
  "extracted_information": {
    "type": "definition_or_fact",
    "relevant_excerpts": [
      "Machine learning is a subset of artificial intelligence...",
      "ML algorithms learn patterns from data..."
    ],
    "definition_candidates": [
      "Machine learning is a method of data analysis..."
    ]
  },
  "confidence": 85,
  "context_chunks": [
    {
      "rank": 1,
      "content": "Machine learning is a subset of artificial intelligence...",
      "relevance_score": 0.92,
      "source": {
        "filename": "ml-intro.txt",
        "filepath": "./documents/ml-intro.txt",
        "chunk_index": 0
      }
    }
  ],
  "search_info": {
    "total_context_chunks": 3,
    "search_method": "semantic",
    "sources_searched": "all",
    "context_limit": 5
  },
  "context_found": true,
  "raw_context": "Machine learning is a subset of artificial intelligence..."
}
```

**Information Extraction Types:**
- `definition_or_fact`: What/define questions
- `process_or_method`: How questions  
- `temporal`: When/date questions
- `location`: Where questions
- `person_or_entity`: Who questions
- `explanation_or_reason`: Why questions
- `general_inquiry`: Other questions

### list_sources

List all indexed documents with metadata, statistics, and filtering options.

**Parameters:**
```json
{
  "include_stats": true,
  "source_type_filter": ["local_file"],
  "group_by": "file_type",
  "limit": 50
}
```

**Parameter Details:**
- `include_stats` (optional): Include collection statistics (default: false)
- `source_type_filter` (optional): Filter by source types (e.g., `["local_file", "file_upload"]`)
- `group_by` (optional): `"source_type"` | `"file_type"`
- `limit` (optional): Max sources to return (1-1000, default: 100)

**Response:**
```json
{
  "total_sources": 15,
  "returned_sources": 15,
  "sources": [
    {
      "id": "clk123xyz",
      "name": "machine-learning.txt",
      "path": "./documents/machine-learning.txt",
      "file_type": "text/plain",
      "size": 2048,
      "source_type": "local_file",
      "source_method": "file_watcher",
      "created_at": "2025-08-24T10:00:00Z",
      "indexed_at": "2025-08-24T10:01:00Z"
    }
  ],
  "grouped_sources": [
    {
      "group": "text/plain",
      "count": 8,
      "sources": []
    }
  ],
  "statistics": {
    "total_documents": 15,
    "total_size_bytes": 1048576,
    "total_size_mb": 1.0,
    "file_types": {
      "text/plain": 8,
      "text/markdown": 5,
      "application/json": 2
    },
    "source_types": {
      "local_file": 15
    },
    "source_methods": {
      "file_watcher": 15
    },
    "oldest_document": 1692864000000,
    "newest_document": 1724486400000
  }
}
```

## Error Handling

All tools return errors in this format:

```json
{
  "error": "SearchError",
  "message": "Search operation failed",
  "suggestion": "Try a different query or check if documents are indexed"
}
```

**Common Error Types:**
- `InvalidQuery`: Missing or invalid query parameter
- `InvalidReferenceText`: Missing reference text for similarity search
- `InvalidQuestion`: Missing question for question-based search
- `SearchFailed`: Search operation failed
- `SimilaritySearchFailed`: Similarity search failed
- `QuestionSearchFailed`: Question-based search failed
- `ListSourcesFailed`: Failed to list sources

## Usage Examples

### Basic Search
```typescript
const result = await mcpClient.request({
  method: "tools/call",
  params: {
    name: "search",
    arguments: {
      query: "neural networks",
      search_type: "semantic",
      limit: 3
    }
  }
});
```

### Find Similar Content
```typescript
const result = await mcpClient.request({
  method: "tools/call", 
  params: {
    name: "search_similar",
    arguments: {
      reference_text: "Machine learning algorithms use training data",
      limit: 5,
      similarity_threshold: 0.2
    }
  }
});
```

### Question Answering
```typescript
const result = await mcpClient.request({
  method: "tools/call",
  params: {
    name: "search_by_question", 
    arguments: {
      question: "How do neural networks learn?",
      context_limit: 10,
      search_method: "hybrid"
    }
  }
});
```

### List Documents
```typescript
const result = await mcpClient.request({
  method: "tools/call",
  params: {
    name: "list_sources",
    arguments: {
      include_stats: true,
      group_by: "file_type",
      limit: 100
    }
  }
});
```