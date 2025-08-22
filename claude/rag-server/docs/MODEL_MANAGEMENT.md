# Model Management Guide

## Overview

The RAG server supports multiple embedding models with lazy loading for optimal performance.

## Embedding Services

### Transformers.js (Default)
- **Local execution**: No external dependencies
- **Lazy loading**: Models download on first use
- **Caching**: Models persist locally for offline use

### Ollama Integration
- **High quality**: Better embedding quality
- **Local server**: Requires Ollama installation
- **Multiple models**: Support for various embedding models

## Configuration

```env
# Embedding service selection
EMBEDDING_SERVICE=transformers  # Default
# EMBEDDING_SERVICE=ollama       # Requires Ollama

# Transformers.js models
EMBEDDING_MODEL=all-MiniLM-L6-v2  # 23MB, fast (default)
# EMBEDDING_MODEL=all-MiniLM-L12-v2  # 45MB, better quality
# EMBEDDING_MODEL=bge-small-en       # 67MB, high quality
# EMBEDDING_MODEL=bge-base-en        # 109MB, best quality

# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
# EMBEDDING_MODEL=nomic-embed-text   # For Ollama
```

## Available Models

### Transformers.js Models

| Model | Size | Speed | Quality | Dimensions | Use Case |
|-------|------|-------|---------|------------|----------|
| `all-MiniLM-L6-v2` | 23MB | Fast | Good | 384 | General purpose (default) |
| `all-MiniLM-L12-v2` | 45MB | Fast | Better | 384 | Balanced performance |
| `bge-small-en` | 67MB | Medium | High | 384 | English text focus |
| `bge-base-en` | 109MB | Slow | Best | 768 | Maximum quality |

### Ollama Models

| Model | Quality | Dimensions | Requirements |
|-------|---------|------------|-------------|
| `nomic-embed-text` | High | 768 | Ollama server |
| `mxbai-embed-large` | Very High | 1024 | Ollama server |

## MCP Tools

The server provides MCP tools for model management:

### `list_available_models`
Get information about available embedding models.

### `get_current_model_info`
View current model configuration and status.

### Model Switching
Models can be switched by updating the environment configuration and restarting the server.

## Performance Considerations

### Startup Options

**Default (Lazy Loading)**
- Server starts in ~2 seconds
- Models download on first use (5-10 seconds)
- Optimal for development

**Pre-loading**
- Set `TRANSFORMERS_LAZY_LOADING=false`
- Slower startup (30-60 seconds)
- Instant first search
- Better for production

### Model Selection Guide

**For Development:**
- Use `all-MiniLM-L6-v2` for fast iteration
- Enable lazy loading for quick restarts

**For Production:**
- Use `bge-small-en` for balanced performance
- Use `bge-base-en` for maximum quality
- Consider pre-loading models

**For High Quality:**
- Use Ollama with `nomic-embed-text`
- Requires Ollama server setup

### Cache Management

Models are automatically cached in:
- Transformers.js: `./.data/.transformers-cache/`
- Ollama: Managed by Ollama service

```bash
# Check cache size
du -sh ./.data/.transformers-cache/

# Clear cache if needed
rm -rf ./.data/.transformers-cache/
```

## Troubleshooting

### Common Issues

**Model download fails:**
```bash
# Check internet connection
curl -I https://huggingface.co

# Check disk space
df -h

# Clear cache and retry
rm -rf ./.data/.transformers-cache/
```

**Ollama connection fails:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama
ollama serve

# Pull required model
ollama pull nomic-embed-text
```

**High memory usage:**
```bash
# Switch to smaller model
export EMBEDDING_MODEL=all-MiniLM-L6-v2

# Restart server
yarn start
```

### Performance Monitoring

```bash
# Check current model
curl -s http://localhost:3001/api/health | jq '.modelInfo'

# Monitor memory usage
ps aux | grep rag-server
```

## Best Practices

### Development
- Use `all-MiniLM-L6-v2` for fast development
- Enable lazy loading for quick restarts
- Test with different models to find optimal balance

### Production
- Choose model based on quality vs performance requirements
- Consider pre-loading models during deployment
- Monitor disk usage for model cache
- Use `bge-small-en` for balanced performance

### High-Quality Applications
- Use Ollama with `nomic-embed-text` for best results
- Ensure adequate hardware resources
- Monitor response times and adjust accordingly

## Performance Metrics

### Startup Times
- Lazy loading: 2-3 seconds
- Pre-loading: 30-60 seconds
- Model switching: 5-10 seconds (first time)

### Memory Usage
- Base server: ~150MB
- With MiniLM-L6-v2: ~230MB
- With BGE-Small: ~270MB
- With BGE-Base: ~350MB

### Download Times (100Mbps)
- all-MiniLM-L6-v2: ~2 seconds
- all-MiniLM-L12-v2: ~4 seconds
- bge-small-en: ~6 seconds
- bge-base-en: ~10 seconds