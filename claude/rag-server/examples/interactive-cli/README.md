# Interactive CLI Client Example

An interactive command-line interface for manually testing and exploring all RAG server capabilities. Perfect for development, debugging, and learning how the MCP tools work.

## 🎯 Features

- ✅ **Interactive Shell** - Command-line interface with prompt
- ✅ **All MCP Tools** - Access to every available tool
- ✅ **Real-time Testing** - Manual testing and experimentation
- ✅ **Help System** - Built-in command documentation
- ✅ **Error Handling** - Graceful error messages and recovery

## 🛠️ Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `help` | Show all commands | Shows this list |
| `status` | Get server status | Health, memory, uptime |
| `upload` | Upload a document | Upload with filename and content |
| `list` | List all files | Show all uploaded documents |
| `search` | Semantic search | Search with similarity scores |
| `hybrid` | Hybrid search | Semantic + keyword combined |
| `models` | List available models | Show all embedding models |
| `model-info` | Current model info | Show active model details |
| `download` | Download a model | Pre-download for offline use |
| `generate` | RAG response | Generate answers from context |
| `clear` | Clear screen | Reset the display |
| `exit` | Exit CLI | Quit the application |

## 🚀 Setup & Usage

1. **Start the RAG server** (from root directory):
   ```bash
   cd ../../
   pnpm build && pnpm start
   ```

2. **Install dependencies**:
   ```bash
   cd examples/interactive-cli
   npm install
   ```

3. **Run the interactive CLI**:
   ```bash
   npm start
   ```

## 💬 Example Session

```
🚀 Interactive RAG MCP Client
══════════════════════════════════════════════════
🔗 Connecting to RAG server...
✅ Connected successfully!

📋 Available Commands:
  help           - Show this help message
  status         - Get server status
  upload         - Upload a document
  list           - List all files
  search         - Search documents
  hybrid         - Hybrid search (semantic + keyword)
  models         - List available models
  model-info     - Get current model info
  download       - Download a model
  generate       - Generate RAG response
  clear          - Clear screen
  exit           - Exit the CLI

🔍 RAG> status
🏥 Getting server status...
📊 Server Status:
   Health: healthy
   Documents: 0
   Memory: 145.2MB
   Uptime: 00:01:23
   Error Rate: 0/min

🔍 RAG> upload
📝 Enter filename: ai-basics.md
📄 Enter content (or type "sample" for example): sample
📤 Uploading document...
✅ Document uploaded successfully!
📊 Result: {success: true, message: "File uploaded and processed successfully"}

🔍 RAG> search
🔍 Enter search query: neural networks
📊 Number of results (default 5): 3
🔍 Searching for: "neural networks"
📊 Found 2 results:

   1. ai-basics.md
      📊 Similarity: 94.2%
      📝 Content: "Neural Networks are the backbone of modern AI systems..."

   2. ai-basics.md
      📊 Similarity: 87.1%
      📝 Content: "Deep Learning utilizes multi-layer neural networks..."

🔍 RAG> generate
❓ Enter your question: What are neural networks?
📄 Additional context (optional): 
🤖 Generating RAG response...
🤖 Response:
──────────────────────────────────────────────────
Neural networks are computational models inspired by the human brain's structure and function. They consist of interconnected nodes (neurons) that process information through weighted connections. In the context of AI, neural networks are the backbone of modern artificial intelligence systems, enabling machines to learn patterns from data and make predictions or classifications.

Key characteristics include:
- Layered architecture with input, hidden, and output layers
- Ability to learn from training data through backpropagation
- Capability to approximate complex non-linear functions
- Foundation for deep learning when using multiple hidden layers
──────────────────────────────────────────────────

🔍 RAG> exit
👋 Goodbye!
```

## 🎯 Use Cases

### **Development & Testing**
- Test individual MCP tools interactively
- Debug search queries and results
- Experiment with different search parameters
- Validate document upload and processing

### **Learning & Exploration**
- Understand how RAG systems work
- Compare semantic vs hybrid search results
- Explore model management features
- Learn MCP protocol interactions

### **Debugging & Troubleshooting**
- Check server health and status
- Verify document processing
- Test error conditions
- Monitor performance metrics

### **Content Management**
- Upload and organize documents
- Search and retrieve information
- Generate responses from knowledge base
- Manage embedding models

## 💡 Tips

1. **Start with Status**: Always check `status` first to verify connection
2. **Use Sample Content**: Type "sample" when uploading to get example content
3. **Experiment with Search**: Try both `search` and `hybrid` commands
4. **Check Models**: Use `models` to see available embedding options
5. **Clear When Needed**: Use `clear` to reset the screen

## 🔧 Customization

You can extend the CLI by:

1. **Adding new commands** in the `handleCommand` method
2. **Modifying prompts** for better user experience  
3. **Adding command aliases** for faster typing
4. **Implementing command history** for repeated commands
5. **Adding batch operations** for multiple documents

## 🐛 Troubleshooting

**Connection Issues:**
```bash
🔍 RAG> status
❌ Command failed: Connection refused
```
- Ensure RAG server is running
- Check server is listening on correct port
- Verify build completed successfully

**No Results:**
```bash
🔍 RAG> search
❌ No results found
```
- Upload documents first using `upload`
- Check documents processed with `list`
- Try different search terms

**Model Errors:**
```bash
🔍 RAG> models
❌ Command failed: Model service unavailable
```
- Check embedding service configuration
- Verify Ollama is running (if using Ollama)
- Try `model-info` to check current model

This interactive CLI provides the most hands-on way to explore and understand the RAG server's capabilities! 🚀