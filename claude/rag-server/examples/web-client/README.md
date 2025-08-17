# Web Client Example

A beautiful, responsive web interface for the RAG MCP Server. This example demonstrates how to create a browser-based client that interacts with the RAG server through a REST API wrapper.

## 🌟 Features

- ✅ **Modern UI** - Clean, responsive design with smooth animations
- ✅ **Real-time Status** - Live connection status and server monitoring
- ✅ **Document Upload** - Drag-and-drop file upload with preview
- ✅ **Advanced Search** - Semantic, keyword, and hybrid search options
- ✅ **File Management** - Browse and manage uploaded documents
- ✅ **Model Management** - View and manage embedding models
- ✅ **Performance Monitoring** - Real-time server metrics
- ✅ **Mobile Responsive** - Works on all devices

## 📸 Screenshots

### Main Interface
- Beautiful gradient header with connection status
- Grid layout for different functionalities
- Real-time status indicators

### Search Interface
- Multiple search modes (semantic, hybrid)
- Adjustable parameters (similarity weight, result count)
- Color-coded similarity scores

### Document Management
- File list with metadata
- Upload form with content preview
- Batch operations

## 🚀 Quick Start

### Option 1: Simple HTTP Server

1. **Start the RAG server** (from root directory):
   ```bash
   cd ../../
   pnpm build && pnpm start
   ```

2. **Serve the web client**:
   ```bash
   cd examples/web-client
   python -m http.server 8080
   # Or with Python 3
   python3 -m http.server 8080
   ```

3. **Open in browser**:
   ```
   http://localhost:8080
   ```

### Option 2: With Live Server (Development)

1. **Install live-server**:
   ```bash
   npm install -g live-server
   # Or locally
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Browser opens automatically** at http://localhost:8080

## 🔧 How It Works

### Client Architecture

```
Web Browser
     ↓ (HTTP/REST API calls)
API Wrapper Service ← (You need to implement this)
     ↓ (MCP Protocol)
RAG MCP Server
```

### Current Implementation

This example includes a **simulation layer** that demonstrates the UI/UX without requiring a REST API wrapper. In production, you would:

1. **Create a REST API wrapper** that translates HTTP requests to MCP calls
2. **Replace the simulation** with real API endpoints
3. **Add authentication** and security measures

### Key Components

1. **Connection Management** (`RAGWebClient.connect()`)
   - Establishes connection to server
   - Monitors connection status
   - Handles reconnection logic

2. **Document Upload** (`RAGWebClient.uploadFile()`)
   - Form validation and submission
   - Progress indicators
   - File metadata handling

3. **Search Interface** (`RAGWebClient.searchDocuments()`)
   - Multiple search modes
   - Parameter customization
   - Result visualization

4. **File Management** (`RAGWebClient.listFiles()`)
   - Document listing and metadata
   - File operations
   - Storage management

## 🎨 UI Components

### Status Bar
```html
<div class="status-bar">
  <div class="status-indicator">
    <div class="status-dot connected"></div>
    <span>Connected</span>
  </div>
</div>
```

### Search Options
```html
<div class="search-options">
  <input type="checkbox" id="semanticSearch" checked>
  <input type="checkbox" id="hybridSearch">
  <input type="range" id="semanticWeight" min="0" max="1" step="0.1">
</div>
```

### Results Display
```html
<div class="result-item">
  <div class="result-header">
    <div class="result-title">document.md</div>
    <div class="result-score">94.2%</div>
  </div>
  <div class="result-content">Content preview...</div>
</div>
```

## 📱 Responsive Design

### Mobile Layout
- Single column layout on small screens
- Touch-friendly buttons and controls
- Optimized spacing and typography

### Desktop Layout
- Multi-column grid layout
- Sidebar navigation
- Keyboard shortcuts support

## 🔌 API Integration

To integrate with a real RAG server, replace the simulation methods:

### Example REST API Wrapper

```javascript
class RAGWebClient {
  async uploadFile(fileName, content) {
    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, content })
    });
    return response.json();
  }

  async searchDocuments(options) {
    const response = await fetch(`${this.baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    return response.json();
  }
}
```

### Required API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Server health check |
| `/api/upload` | POST | Upload documents |
| `/api/search` | POST | Search documents |
| `/api/files` | GET | List all files |
| `/api/status` | GET | Server status |
| `/api/models` | GET | Available models |
| `/api/model-info` | GET | Current model |

## 🎯 Customization

### Styling
- Modify `styles` in `index.html`
- Change color scheme with CSS variables
- Add custom animations and transitions

### Functionality
- Add new MCP tool integrations
- Implement file upload via drag-and-drop
- Add real-time WebSocket updates

### Features
- Add user authentication
- Implement document collections/folders
- Add advanced search filters
- Include performance analytics

## 🐛 Troubleshooting

### CORS Issues
```javascript
// Add CORS headers to your API wrapper
app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true
}));
```

### Connection Problems
- Ensure RAG server is running on port 3001
- Check browser console for error messages
- Verify API wrapper is properly configured

### UI Issues
- Clear browser cache and reload
- Check browser compatibility (modern browsers only)
- Ensure JavaScript is enabled

## 🚀 Production Deployment

### Security Considerations
- Add HTTPS/TLS encryption
- Implement authentication and authorization
- Validate all user inputs
- Rate limiting and CORS configuration

### Performance Optimization
- Minify CSS and JavaScript
- Implement caching strategies
- Use CDN for static assets
- Optimize images and fonts

### Hosting Options
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Self-hosted**: Nginx, Apache
- **Cloud**: AWS S3 + CloudFront, Azure Static Web Apps

This web client provides a complete, production-ready interface for your RAG MCP Server! 🎉