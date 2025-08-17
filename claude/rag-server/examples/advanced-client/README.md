# Advanced RAG MCP Client Example

This example demonstrates **all available MCP tools** and advanced features of the RAG server including model management, hybrid search, RAG response generation, and performance monitoring.

## 🚀 Features

- ✅ **All 7 MCP Tools** - Complete API coverage
- ✅ **Model Management** - List, download, and switch models
- ✅ **Advanced Search** - Semantic, keyword, and hybrid search
- ✅ **RAG Generation** - Context-aware response generation
- ✅ **Performance Monitoring** - Server status and metrics
- ✅ **Error Handling** - Robust error management
- ✅ **Multiple Documents** - Batch upload and processing

## 🛠️ Available MCP Tools Demonstrated

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| `upload_file` | Upload documents | Upload multiple AI/ML documents |
| `search_documents` | Search content | Semantic, hybrid, and filtered search |
| `list_files` | List documents | Show all uploaded files |
| `generate_response` | RAG responses | Answer questions using context |
| `get_server_status` | Server health | Monitor performance metrics |
| `get_current_model_info` | Model info | Check current embedding model |
| `list_available_models` | Available models | Show all downloadable models |
| `download_model` | Download models | Pre-download for offline use |

## 📋 Setup

1. **Start the RAG server** (from root directory):
   ```bash
   cd ../../
   pnpm build && pnpm start
   ```

2. **Install dependencies**:
   ```bash
   cd examples/advanced-client
   npm install
   ```

3. **Run the advanced example**:
   ```bash
   npm start
   ```

## 📊 Example Output

```
🚀 Advanced RAG Client - Connecting to server...
✅ Connected successfully!
🛠️  Available tools (7): search_documents, upload_file, list_files, generate_response, get_server_status, get_current_model_info, list_available_models, download_model

📊 Server Status: healthy (0 documents)

🤖 === MODEL MANAGEMENT ===
🔍 Getting current model info...
📍 Current model: Xenova/all-MiniLM-L6-v2 (384D)
📋 Listing available models...
📋 Available models: 4

📚 === DOCUMENT MANAGEMENT ===
📤 Uploading: ai-fundamentals.md
📤 Uploading: machine-learning-algorithms.md  
📤 Uploading: data-science-workflow.md
📋 Listing all files...
📁 Total files in system: 3

🔍 === ADVANCED SEARCH DEMO ===

🎯 Semantic Search: "neural networks deep learning"
  1. ai-fundamentals.md
     📊 Similarity: 94.2%
     📝 "Neural Networks: The backbone of modern AI..."
  2. machine-learning-algorithms.md
     📊 Similarity: 87.6%
     📝 "Feedforward Networks: Basic neural network architecture..."

🎯 Hybrid Search: "data processing cleaning"
  1. data-science-workflow.md
     📊 Similarity: 91.8%
     📝 "Data cleaning and validation..."

🤖 === RAG RESPONSE GENERATION ===

❓ Question: "What are the main types of machine learning?"
🤖 Response: Based on the documents, there are three main types of machine learning:

1. **Supervised Learning** - Uses labeled training data to learn patterns...

📊 === PERFORMANCE ANALYSIS ===
📈 Final server status:
   Documents: 3
   Memory usage: 145.2MB
   Uptime: 00:02:34
   Error rate: 0/min

🎉 Advanced example completed successfully!
💡 This demo showcased:
   ✅ All 7 MCP tools
   ✅ Multiple search strategies
   ✅ Model management
   ✅ Performance monitoring
   ✅ Error handling
```

## 🔧 Code Structure

```typescript
class AdvancedRAGClient {
  // Document Management
  async uploadFile(content, fileName)
  async listFiles()
  
  // Advanced Search
  async searchDocuments(options)  // Semantic, hybrid, filtered
  async generateResponse(query, context)
  
  // Model Management  
  async getCurrentModelInfo()
  async listAvailableModels()
  async downloadModel(modelName)
  
  // System Management
  async getServerStatus()
}
```

## 💡 Key Concepts Demonstrated

### 1. **Search Strategies**
- **Semantic Search**: Uses AI embeddings for conceptual matching
- **Hybrid Search**: Combines semantic + keyword search  
- **Filtered Search**: Restricts results to specific file types

### 2. **Model Management**
- Check current embedding model and dimensions
- List all available models for download
- Download models for offline use

### 3. **RAG Pipeline**
- Upload documents → Automatic processing → Vector indexing
- Search relevant context → Generate responses with AI
- Monitor performance and system health

### 4. **Error Handling**
- Connection management with retries
- Graceful degradation when features unavailable
- Comprehensive error reporting

## 🎯 Use Cases

This advanced client is perfect for:
- **Enterprise Integration** - Full API coverage
- **AI Application Development** - RAG pipeline testing
- **Performance Benchmarking** - Load testing and monitoring
- **Model Experimentation** - Comparing different embedding models
- **Production Monitoring** - Health checks and metrics

## 📚 Next Steps

- Explore [Interactive CLI](../interactive-cli/) for manual testing
- Try [Web Client](../web-client/) for browser integration
- Check main [documentation](../../docs/) for deployment guides