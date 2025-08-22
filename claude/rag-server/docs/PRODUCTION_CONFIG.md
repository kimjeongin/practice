# Production Configuration Guide

## Overview

This guide covers environment configuration, security settings, and performance tuning for production deployment.

## Environment Variables

### Core Configuration

```bash
# Application Environment
NODE_ENV=production
LOG_LEVEL=info
PORT=3001

# Database Configuration
DATABASE_URL="file:./database.db"

# Data Directories
DATA_DIR=./.data
DOCUMENTS_DIR=./documents
LOGS_DIR=./logs
```

### Embedding Service

#### Transformers.js (Default)
```bash
# Local embedding service
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=all-MiniLM-L6-v2  # 23MB, fast
EMBEDDING_BATCH_SIZE=10
EMBEDDING_DIMENSIONS=384

# Alternative models
# EMBEDDING_MODEL=all-MiniLM-L12-v2  # 45MB, better quality
# EMBEDDING_MODEL=bge-small-en       # 67MB, high quality
# EMBEDDING_MODEL=bge-base-en        # 109MB, best quality

# Model loading
TRANSFORMERS_LAZY_LOADING=true
```

#### Ollama Integration
```bash
# External Ollama service
EMBEDDING_SERVICE=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

### Vector Store Configuration

```bash
# FAISS vector store
VECTOR_STORE_PROVIDER=faiss
FAISS_INDEX_PATH=./.data/vectors

# Alternative: Qdrant (uncomment if using)
# VECTOR_STORE_PROVIDER=qdrant
# QDRANT_URL=http://localhost:6333
# QDRANT_COLLECTION=documents
```

### Document Processing

```bash
# Processing settings
CHUNK_SIZE=1024
CHUNK_OVERLAP=50
SIMILARITY_TOP_K=5
SIMILARITY_THRESHOLD=0.1

# Pipeline configuration
MAX_CONCURRENT_PROCESSING=3
BATCH_SIZE=10
MAX_RETRIES=2
BASE_DELAY=1000
MAX_DELAY=5000
```

### Search Configuration

```bash
# Search options
ENABLE_HYBRID_SEARCH=true
ENABLE_QUERY_REWRITING=false
SEMANTIC_WEIGHT=0.7
ENABLE_RERANKING=false
ENABLE_COMPRESSION=false
```

### Monitoring

```bash
# Monitoring settings
ENABLE_MONITORING=true
MONITORING_PORT=3001
METRICS_PATH=/metrics
HEALTH_CHECK_PATH=/health
```

### Performance Tuning

```bash
# Node.js optimization
NODE_OPTIONS="--max-old-space-size=2048"
UV_THREADPOOL_SIZE=16

# Caching
ENABLE_CACHING=true
CACHE_SIZE=1000
CACHE_TTL=3600

# Concurrency
MAX_CONCURRENT_EMBEDDINGS=3
EMBEDDING_CACHE_SIZE=1000
```

## Security Configuration

### CORS Settings
```bash
# CORS configuration
CORS_ENABLED=true
CORS_ORIGINS=https://yourdomain.com
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_CREDENTIALS=true
```

### Rate Limiting
```bash
# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Security Headers
```bash
# Security headers
SECURITY_HEADERS_ENABLED=true
CONTENT_SECURITY_POLICY="default-src 'self'"
X_FRAME_OPTIONS=DENY
X_CONTENT_TYPE_OPTIONS=nosniff
```

## Environment-Specific Configs

### Development
```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
TRANSFORMERS_LAZY_LOADING=true
RATE_LIMIT_ENABLED=false
CORS_ENABLED=false
```

### Staging
```bash
# .env.staging
NODE_ENV=staging
LOG_LEVEL=info
TRANSFORMERS_LAZY_LOADING=false
RATE_LIMIT_ENABLED=true
CORS_ENABLED=true
```

### Production
```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=warn
TRANSFORMERS_LAZY_LOADING=false
RATE_LIMIT_ENABLED=true
CORS_ENABLED=true
SECURITY_HEADERS_ENABLED=true
```

## Docker Configuration

### Environment Variables
```yaml
# docker-compose.yml environment section
environment:
  - NODE_ENV=production
  - LOG_LEVEL=info
  - DATABASE_URL=file:./data/database.db
  - DATA_DIR=./data
  - EMBEDDING_SERVICE=transformers
  - EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### Resource Limits
```yaml
# Resource constraints
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '1.0'
    reservations:
      memory: 512M
      cpus: '0.5'
```

## Cloud Provider Configs

### AWS ECS
```json
{
  "name": "NODE_ENV",
  "value": "production"
},
{
  "name": "LOG_LEVEL",
  "value": "info"
},
{
  "name": "DATABASE_URL",
  "value": "file:./data/database.db"
}
```

### Google Cloud Run
```yaml
env:
- name: NODE_ENV
  value: "production"
- name: LOG_LEVEL
  value: "info"
- name: EMBEDDING_SERVICE
  value: "transformers"
```

## Security Best Practices

### File Permissions
```bash
# Set secure permissions
chmod 600 .env
chmod 755 data logs
chmod 644 database.db
```

### API Key Management
```bash
# Use environment variables for secrets
export OPENAI_API_KEY="your-key-here"

# Or use Docker secrets
echo "your-key" | docker secret create openai_key -
```

### Network Security
```bash
# Firewall configuration
ufw allow 3001/tcp  # Application port
ufw default deny incoming
ufw default allow outgoing
ufw enable
```

## Configuration Validation

### Required Variables
```bash
#!/bin/bash
# validate-config.sh

required_vars=(
    "NODE_ENV"
    "DATABASE_URL"
    "DATA_DIR"
    "EMBEDDING_SERVICE"
)

for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo "ERROR: Required variable $var is not set"
        exit 1
    fi
done

echo "✅ Configuration validation passed"
```

### Configuration Test
```bash
# Test configuration
yarn build
yarn start --dry-run  # If supported

# Verify environment
curl -f http://localhost:3001/api/health
```

## Performance Optimization

### Memory Settings
```bash
# Optimize Node.js memory usage
NODE_OPTIONS="--max-old-space-size=1024 --optimize-for-size"
```

### Database Optimization
```bash
# SQLite optimization
DATABASE_JOURNAL_MODE=WAL
DATABASE_SYNCHRONOUS=NORMAL
DATABASE_CACHE_SIZE=2000
```

### File Processing
```bash
# Processing optimization
FILE_BUFFER_SIZE=65536
MAX_FILE_SIZE=104857600  # 100MB
PROCESS_SUBDIRECTORIES=true
```

## Troubleshooting

### Common Issues

**Environment variables not loading:**
```bash
# Check .env file exists and is readable
ls -la .env
cat .env | grep NODE_ENV
```

**Port conflicts:**
```bash
# Change port if needed
export PORT=3002
yarn start
```

**Memory issues:**
```bash
# Reduce memory usage
export NODE_OPTIONS="--max-old-space-size=512"
export BATCH_SIZE=5
```

### Configuration Debugging
```bash
# Debug mode
export LOG_LEVEL=debug
export DEBUG=*
yarn start
```

## Pre-deployment Checklist

- [ ] Environment variables set correctly
- [ ] Database permissions configured
- [ ] File system permissions set
- [ ] Network firewall rules configured
- [ ] SSL certificates installed (if using HTTPS)
- [ ] Log rotation configured
- [ ] Health check endpoints responding
- [ ] Resource limits configured
- [ ] Backup strategy implemented

---

**Ready for production:** Ensure all configurations are validated and tested before deployment.