# 🤖 Model Management Guide

## ⚡ Lazy Loading Feature

The RAG server now supports **lazy loading** for optimal performance and reduced initial download size.

### How It Works

1. **Instant Startup**: Server starts immediately without downloading models
2. **On-Demand Download**: Models download automatically when first used
3. **Progress Tracking**: Real-time download progress with detailed status
4. **Local Caching**: Downloaded models persist for offline use

### Configuration

```env
# Enable lazy loading (default: true in production)
TRANSFORMERS_LAZY_LOADING=true

# Available models
EMBEDDING_MODEL=all-MiniLM-L6-v2  # 23MB, fast
# EMBEDDING_MODEL=all-MiniLM-L12-v2  # 45MB, better quality
# EMBEDDING_MODEL=bge-small-en       # 67MB, high quality
# EMBEDDING_MODEL=bge-base-en        # 109MB, best quality
```

## 📱 Available MCP Tools

### 1. `list_available_models`
Get all available embedding models with specifications.

```json
{
  "currentModel": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "service": "transformers",
    "dimensions": 384,
    "description": "Fast and efficient, good for general use"
  },
  "availableModels": {
    "all-MiniLM-L6-v2": {
      "modelId": "Xenova/all-MiniLM-L6-v2",
      "dimensions": 384,
      "maxTokens": 256,
      "description": "Fast and efficient, good for general use"
    },
    // ... more models
  }
}
```

### 2. `switch_embedding_model`
Switch to a different embedding model.

**Input:**
```json
{
  "modelName": "bge-small-en"
}
```

**Output:**
```json
{
  "success": true,
  "message": "Successfully switched to model: bge-small-en",
  "newModel": {
    "model": "Xenova/bge-small-en",
    "dimensions": 384,
    "service": "transformers"
  }
}
```

### 3. `download_model`
Pre-download a model for offline use.

**Input:**
```json
{
  "modelName": "all-MiniLM-L12-v2"  // Optional
}
```

**Output:**
```json
{
  "success": true,
  "message": "Model all-MiniLM-L12-v2 downloaded successfully",
  "downloadTime": "5.2s",
  "cacheLocation": "./data/.transformers-cache"
}
```

### 4. `get_download_progress`
Monitor real-time download progress.

**Output:**
```json
{
  "downloadProgress": {
    "model.onnx": {
      "loaded": 15728640,
      "total": 23068160,
      "percentage": 68
    }
  },
  "isDownloading": true
}
```

### 5. `get_model_cache_info`
Get cache statistics and management info.

**Output:**
```json
{
  "isCached": true,
  "cacheSize": "97M",
  "cachePath": "./data/.transformers-cache",
  "modelCount": 2,
  "availableModels": ["Xenova/all-MiniLM-L6-v2", "Xenova/bge-small-en"]
}
```

### 6. `force_reindex`
Rebuild vector index with current model.

**Input:**
```json
{
  "clearCache": false  // Optional: clear vector cache
}
```

## 🚀 Performance Optimization Tips

### Startup Strategies

#### 1. **Instant Start** (Default)
```bash
# Fastest startup, download on first use
TRANSFORMERS_LAZY_LOADING=true
```
- ✅ Server ready in ~2 seconds
- ⚠️ First search takes 5-10 seconds (model download)

#### 2. **Pre-warmed Start**
```bash
# Download model during startup
TRANSFORMERS_LAZY_LOADING=false
```
- ⚠️ Server startup takes 30-60 seconds
- ✅ First search is instant

### Model Selection Guide

| Model | Size | Speed | Quality | Use Case |
|-------|------|-------|---------|----------|
| `all-MiniLM-L6-v2` | 23MB | ⚡ Fast | ✅ Good | General purpose, quick setup |
| `all-MiniLM-L12-v2` | 45MB | ⚡ Fast | ✅✅ Better | Balanced performance |
| `bge-small-en` | 67MB | 🔄 Medium | ✅✅✅ High | English text, quality focused |
| `bge-base-en` | 109MB | 🐌 Slow | ✅✅✅✅ Best | Maximum quality, large corpus |

### Cache Management

#### Automatic Cache
```bash
# Models automatically cached after download
ls ./data/.transformers-cache/
# Xenova_all-MiniLM-L6-v2/
# Xenova_bge-small-en/
```

#### Manual Cache Control
```javascript
// Check cache status
await server.call('get_model_cache_info');

// Pre-download multiple models
await server.call('download_model', { modelName: 'all-MiniLM-L6-v2' });
await server.call('download_model', { modelName: 'bge-small-en' });

// Switch between cached models (instant)
await server.call('switch_embedding_model', { modelName: 'bge-small-en' });
```

## 🔧 Troubleshooting

### Common Issues

#### 1. **Download Fails**
```bash
# Check internet connection
curl -I https://huggingface.co

# Check disk space
df -h ./data/.transformers-cache
```

#### 2. **Model Switch Takes Long**
```bash
# Model not cached - will download
# Pre-download first:
# Use download_model MCP tool
```

#### 3. **Cache Growing Large**
```bash
# Check cache size
du -sh ./data/.transformers-cache

# Clean old models manually
rm -rf ./data/.transformers-cache/Xenova_old-model/
```

### Performance Monitoring

#### Download Progress
```bash
# Real-time progress monitoring
watch -n 1 "curl -s http://localhost:3000/api/download-progress"
```

#### Cache Statistics
```bash
# Check what's cached
ls -la ./data/.transformers-cache/
```

## 💡 Best Practices

### Development
- Use `all-MiniLM-L6-v2` for fast iteration
- Enable lazy loading for quick restarts
- Pre-download models you'll test

### Production
- Choose model based on quality requirements
- Pre-warm cache during deployment
- Monitor cache disk usage
- Use `bge-small-en` for balanced performance

### Enterprise
- Pre-bundle models in deployment artifacts
- Use `bge-base-en` for maximum quality
- Set up cache warming scripts
- Monitor model performance metrics

## 📈 Performance Comparison

### Startup Times
```
Lazy Loading ON:  2-3 seconds
Lazy Loading OFF: 30-60 seconds
Model Switch:     5-10 seconds (if cached: instant)
```

### Memory Usage
```
Base Server:      ~50MB
+ MiniLM-L6-v2:   +80MB
+ BGE-Small:      +120MB
+ BGE-Base:       +200MB
```

### Download Times (100Mbps)
```
all-MiniLM-L6-v2:  ~2 seconds
all-MiniLM-L12-v2: ~4 seconds
bge-small-en:      ~6 seconds
bge-base-en:       ~10 seconds
```

This lazy loading system provides the perfect balance of quick startup and powerful AI capabilities! 🚀