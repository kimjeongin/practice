# Sample Documentation

## ChromaDB Integration

ChromaDB is an AI-native open-source embedding database. It provides:

- **Vector Storage**: Efficient storage and retrieval of embeddings
- **Metadata Filtering**: Filter results based on document metadata
- **Distance Metrics**: Support for various similarity calculations
- **Scalability**: Handles large document collections

## MCP Server Features

Our Model Context Protocol server supports:

1. **Document Search**: Natural language queries across indexed documents
2. **File Management**: List, update, and manage document metadata
3. **Server Status**: Monitor indexing progress and system health
4. **Semantic Search**: Find relevant content using vector embeddings
5. **Hybrid Search**: Combine semantic and keyword-based search

## Testing Instructions

To test the RAG server:
1. Start ChromaDB service
2. Launch the MCP server
3. Index documents in the data directory
4. Perform search queries using the MCP tools