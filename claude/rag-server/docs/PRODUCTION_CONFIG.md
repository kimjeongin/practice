# Production Configuration Guide

> **Complete environment configuration and security setup for production RAG MCP Server**

This guide covers all production environment variables, security configurations, performance tuning, and operational best practices derived from comprehensive testing and real-world deployment experience.

## 🔧 Environment Variables

### Core Application Configuration

```bash
# Basic Application Settings
NODE_ENV=production
LOG_LEVEL=info
SERVICE_NAME=rag-mcp-server
SERVICE_VERSION=1.0.0

# Server Configuration
HOST=0.0.0.0
PORT=3001
MONITORING_PORT=3001

# Shutdown Configuration
GRACEFUL_SHUTDOWN_TIMEOUT=30000
```

### Database & Storage Configuration

```bash
# SQLite Database
DATABASE_PATH=./storage/database/rag.db
DATABASE_JOURNAL_MODE=WAL
DATABASE_SYNCHRONOUS=NORMAL
DATABASE_TIMEOUT=30000

# Data Directories
DATA_DIR=./documents
LOGS_DIR=./logs
BACKUP_DIR=./backups

# Vector Store Configuration
FAISS_INDEX_PATH=./storage/faiss_index
VECTOR_STORE_CACHE_SIZE=1000
VECTOR_STORE_BATCH_SIZE=10
```

### Embedding Service Configuration

#### Transformers.js (Local - Default)
```bash
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=all-MiniLM-L6-v2  # 23MB, production-ready
TRANSFORMERS_CACHE_DIR=./cache/transformers
DEVICE=cpu  # or 'gpu' if CUDA available
```

**Available Transformers.js Models:**
```bash
# Performance vs Quality Balance
EMBEDDING_MODEL=all-MiniLM-L6-v2    # 23MB, fast, 384 dimensions
EMBEDDING_MODEL=all-MiniLM-L12-v2   # 45MB, better quality, 384 dimensions
EMBEDDING_MODEL=bge-small-en         # 67MB, high quality, 384 dimensions
EMBEDDING_MODEL=bge-base-en          # 109MB, best quality, 768 dimensions
```

#### Ollama (Local High-Quality)
```bash
EMBEDDING_SERVICE=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_TIMEOUT=30000
OLLAMA_KEEP_ALIVE=5m
```

#### OpenAI (Cloud)
```bash
EMBEDDING_SERVICE=openai
OPENAI_API_KEY=sk-your-secret-key-here
EMBEDDING_MODEL=text-embedding-3-small  # 1536 dimensions
OPENAI_MAX_RETRIES=3
OPENAI_TIMEOUT=30000
```

### Processing Configuration

```bash
# Document Processing
CHUNK_SIZE=1024
CHUNK_OVERLAP=200
MAX_CHUNK_LENGTH=2048
BATCH_SIZE=10
MAX_CONCURRENT_REQUESTS=50

# Search Configuration
SIMILARITY_TOP_K=5
SEMANTIC_SEARCH_WEIGHT=0.7
KEYWORD_SEARCH_WEIGHT=0.3
SEARCH_TIMEOUT=30000

# Performance Optimization
LAZY_LOADING=true
PRELOAD_MODELS=false
ENABLE_CACHING=true
CACHE_SIZE=1000
CACHE_TTL=3600
```

### File System Monitoring

```bash
# File Watcher Configuration
WATCH_ENABLED=true
WATCH_POLLING=false
WATCH_IGNORED=node_modules/**,dist/**,.git/**
WATCH_DEBOUNCE_DELAY=1000

# File Processing
SUPPORTED_EXTENSIONS=.txt,.md,.json,.xml,.html,.csv
MAX_FILE_SIZE=104857600  # 100MB
PROCESS_SUBDIRECTORIES=true
```

### Logging Configuration

```bash
# Pino Logger Settings
LOG_LEVEL=info  # error, warn, info, debug, trace
LOG_PRETTY_PRINT=false
LOG_ROTATION_ENABLED=true
LOG_MAX_FILES=7
LOG_MAX_SIZE=100MB

# Custom Log Configuration
ERROR_LOG_ENABLED=true
PERFORMANCE_LOG_ENABLED=true
REQUEST_LOG_ENABLED=true
COMPONENT_LOG_ENABLED=true
```

### Monitoring & Observability

```bash
# Error Monitoring
ERROR_MONITORING_ENABLED=true
ERROR_THRESHOLD_PER_MINUTE=10
ERROR_ALERT_EMAIL=admin@yourcompany.com

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
HEALTH_CHECK_RETRIES=3

# Circuit Breaker Configuration
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_TIMEOUT=1000
CIRCUIT_BREAKER_ERROR_THRESHOLD=50
CIRCUIT_BREAKER_RESET_TIMEOUT=10000
CIRCUIT_BREAKER_VOLUME_THRESHOLD=5
```

### Security Configuration

```bash
# CORS Configuration
CORS_ENABLED=true
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESSFUL=false

# Security Headers
SECURITY_HEADERS_ENABLED=true
CONTENT_SECURITY_POLICY=default-src 'self'
X_FRAME_OPTIONS=DENY
X_CONTENT_TYPE_OPTIONS=nosniff
```

### Performance Tuning

```bash
# Node.js Optimization
NODE_OPTIONS=--max-old-space-size=2048 --optimize-for-size
UV_THREADPOOL_SIZE=16
NODE_MAX_CONCURRENCY=50

# Memory Management
MEMORY_LIMIT_MB=2048
GARBAGE_COLLECTION_ENABLED=true
MEMORY_MONITORING_ENABLED=true

# I/O Optimization
FILE_BUFFER_SIZE=65536
DATABASE_CACHE_SIZE=2000
VECTOR_CACHE_SIZE=1000
```

## 🔒 Security Best Practices

### Environment File Security

```bash
# .env file permissions (Unix/Linux)
chmod 600 .env

# Restrict access to app user only
chown rag-server:rag-server .env
```

### API Key Management

**Using Docker Secrets:**
```yaml
version: '3.8'
services:
  rag-server:
    image: rag-mcp-server:latest
    secrets:
      - openai_api_key
    environment:
      - OPENAI_API_KEY_FILE=/run/secrets/openai_api_key

secrets:
  openai_api_key:
    file: ./secrets/openai_api_key.txt
```

**Using Environment Variable Injection:**
```bash
# Load from secure key management
export OPENAI_API_KEY=$(aws secretsmanager get-secret-value --secret-id prod/openai --query SecretString --output text)
```

### File System Security

```bash
# Secure data directory permissions
mkdir -p data logs cache
chmod 750 data logs cache
chown -R rag-server:rag-server data logs cache

# Restrict database access
chmod 600 data/rag.db
```

### Network Security

```bash
# Firewall rules (Ubuntu/Debian)
ufw allow 3001/tcp  # Monitoring dashboard
ufw allow 22/tcp    # SSH access
ufw default deny incoming
ufw default allow outgoing
ufw enable

# Nginx reverse proxy with SSL
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🐳 Docker Configuration

### Production Dockerfile Environment

```dockerfile
# Set production environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MONITORING_ENABLED=true

# Security: Run as non-root user
USER rag-server

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1
```

### Docker Compose Production Setup

```yaml
version: '3.8'

services:
  rag-server:
    build: .
    restart: unless-stopped
    environment:
      # Load from .env file
      - NODE_ENV=production
      - LOG_LEVEL=info
      - DATABASE_PATH=/app/data/rag.db
      - DATA_DIR=/app/data
    volumes:
      # Persistent data storage
      - rag_data:/app/data:rw
      - rag_logs:/app/logs:rw
      - rag_cache:/app/cache:rw
      # Read-only configuration
      - ./config:/app/config:ro
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'

volumes:
  rag_data:
  rag_logs:
  rag_cache:
```

## ☁️ Cloud Provider Configuration

### AWS Configuration

```bash
# AWS ECS Task Definition Environment
{
  "name": "EMBEDDING_SERVICE",
  "value": "transformers"
},
{
  "name": "LOG_LEVEL", 
  "value": "info"
},
{
  "name": "DATABASE_PATH",
  "value": "/app/data/rag.db"
}

# AWS Secrets Manager Integration
{
  "name": "OPENAI_API_KEY",
  "valueFrom": "arn:aws:secretsmanager:region:account:secret:prod/openai-key"
}
```

### Google Cloud Configuration

```yaml
# Cloud Run Environment Variables
env:
- name: NODE_ENV
  value: "production"
- name: LOG_LEVEL
  value: "info"
- name: EMBEDDING_SERVICE
  value: "transformers"

# Secret Manager Integration
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: openai-api-key
      key: key
```

### Azure Configuration

```yaml
# Azure Container Instances
environmentVariables:
- name: NODE_ENV
  value: production
- name: LOG_LEVEL
  value: info
- name: EMBEDDING_SERVICE
  value: transformers

# Azure Key Vault Integration
- name: OPENAI_API_KEY
  secureValue: <reference-to-key-vault>
```

## 📊 Performance Configuration

### Memory Optimization

```bash
# Node.js heap optimization
NODE_OPTIONS="--max-old-space-size=2048 --optimize-for-size"

# Enable V8 optimizations
NODE_OPTIONS="$NODE_OPTIONS --harmony --experimental-vm-modules"

# Garbage collection tuning
NODE_OPTIONS="$NODE_OPTIONS --expose-gc --gc-interval=100"
```

### CPU Optimization

```bash
# Thread pool sizing
UV_THREADPOOL_SIZE=16

# Enable clustering for multi-core
CLUSTER_ENABLED=true
CLUSTER_WORKERS=4  # Number of CPU cores
```

### I/O Optimization

```bash
# Database optimization
DATABASE_JOURNAL_MODE=WAL
DATABASE_SYNCHRONOUS=NORMAL
DATABASE_CACHE_SIZE=2000
DATABASE_MMAP_SIZE=268435456  # 256MB

# File system optimization
FILE_BUFFER_SIZE=65536
FILE_CACHE_ENABLED=true
FILE_CACHE_SIZE=1000
```

## 🔧 Development vs Production

### Development Configuration

```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
LOG_PRETTY_PRINT=true
WATCH_POLLING=true
PRELOAD_MODELS=true
ENABLE_CACHING=false
RATE_LIMIT_ENABLED=false
```

### Staging Configuration

```bash
# .env.staging  
NODE_ENV=staging
LOG_LEVEL=info
LOG_PRETTY_PRINT=false
WATCH_POLLING=false
PRELOAD_MODELS=false
ENABLE_CACHING=true
RATE_LIMIT_ENABLED=true
```

### Production Configuration

```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=warn
LOG_PRETTY_PRINT=false
WATCH_POLLING=false
PRELOAD_MODELS=false
ENABLE_CACHING=true
RATE_LIMIT_ENABLED=true
SECURITY_HEADERS_ENABLED=true
```

## 🚨 Monitoring & Alerting Configuration

### Alert Thresholds

```bash
# Error rate alerting
ERROR_ALERT_THRESHOLD=10          # errors per minute
CIRCUIT_BREAKER_ALERT=true       # alert on breaker open
MEMORY_ALERT_THRESHOLD=80        # 80% memory usage
CPU_ALERT_THRESHOLD=80           # 80% CPU usage
DISK_ALERT_THRESHOLD=90          # 90% disk usage
```

### External Monitoring Integration

```bash
# Prometheus metrics endpoint
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
PROMETHEUS_PATH=/metrics

# Health check endpoints
HEALTH_CHECK_PATH=/api/health
READINESS_CHECK_PATH=/api/ready
LIVENESS_CHECK_PATH=/api/live
```

## 🔄 Configuration Management

### Configuration Validation

```bash
#!/bin/bash
# validate-config.sh
set -euo pipefail

# Required variables
required_vars=(
    "NODE_ENV"
    "DATABASE_PATH" 
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

### Runtime Configuration Updates

```bash
# Graceful configuration reload
kill -USR2 $PID  # Send signal to reload config

# Hot-swap embedding models
curl -X POST http://localhost:3001/api/config/reload-model \
  -H "Content-Type: application/json" \
  -d '{"model": "bge-base-en"}'
```

## 📋 Configuration Checklist

### Pre-deployment Checklist

- [ ] **Environment variables** set correctly for target environment
- [ ] **API keys and secrets** stored securely (not in .env files)
- [ ] **Database permissions** configured (read/write access)
- [ ] **File system permissions** set (750 for directories, 640 for files)
- [ ] **Network firewall** rules configured
- [ ] **SSL certificates** installed and valid
- [ ] **Log rotation** configured to prevent disk filling
- [ ] **Health checks** endpoints responding correctly
- [ ] **Resource limits** set (memory, CPU, disk)
- [ ] **Backup strategy** implemented and tested

### Security Checklist

- [ ] **CORS origins** whitelist configured for production domains
- [ ] **Rate limiting** enabled with appropriate thresholds
- [ ] **Security headers** enabled (CSP, X-Frame-Options, etc.)
- [ ] **Input validation** enabled for all user inputs
- [ ] **File upload restrictions** configured (size, type)
- [ ] **Error messages** sanitized (no sensitive info exposure)
- [ ] **Dependency vulnerabilities** scanned and resolved
- [ ] **Container security** scan passed
- [ ] **Access logs** enabled for security monitoring
- [ ] **Secrets rotation** schedule established

---

**Ready for production?** Use this configuration guide to set up a secure, performant, and monitored RAG MCP Server deployment! 🚀