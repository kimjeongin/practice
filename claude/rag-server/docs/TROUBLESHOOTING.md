# Troubleshooting Guide

## Quick Diagnosis

### Health Check Commands

```bash
# 1. Basic health check
curl -f http://localhost:3001/api/health || echo "Service down"

# 2. Check if server is running
netstat -tlnp | grep 3001 || echo "Port 3001 not listening"

# 3. View recent errors
tail -20 logs/rag-server-error.log

# 4. Monitor live logs
tail -f logs/rag-server.log | grep -E "(ERROR|WARN|FATAL)"
```

## Common Issues

### 1. Server Won't Start

**Port already in use:**
```bash
# Error: listen EADDRINUSE :::3001

# Find process using port 3001
lsof -ti:3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or use different port
export PORT=3002
yarn start
```

**Missing dependencies:**
```bash
# Error: Cannot find module

# Clean install
rm -rf node_modules yarn.lock
yarn install

# Rebuild
yarn build
```

**Database permissions:**
```bash
# Error: SQLITE_CANTOPEN

# Create directories and set permissions
mkdir -p data logs documents
chmod 755 data logs documents

# Check disk space
df -h

# Reset database
yarn db:reset
```

### 2. Model Loading Issues

**Transformers.js download fails:**
```bash
# Error: Failed to download model

# Check internet connection
curl -I https://huggingface.co/

# Clear cache and retry
rm -rf ./.data/.transformers-cache
yarn start

# Use different model
export EMBEDDING_MODEL=all-MiniLM-L12-v2
```

**Ollama connection failed:**
```bash
# Error: fetch failed - connect ECONNREFUSED 127.0.0.1:11434

# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama service
ollama serve

# Pull required model
ollama pull nomic-embed-text

# Verify model
ollama list
```

### 3. File Processing Issues

**Documents not processing:**
```bash
# Files added but not indexed

# Check file watcher logs
tail -f logs/rag-server.log | grep -E "(watcher|processing)"

# Verify supported file types
ls documents/ | grep -E "\.(txt|md|json|xml|html|csv)$"

# Check file permissions
ls -la documents/
chmod 644 documents/*.txt

# Manually trigger processing
# Add file to documents/ directory
```

**Large file processing fails:**
```bash
# Error: File too large or timeout

# Check file sizes
ls -lh documents/ | awk '$5 > "10M"'

# Split large files
split -l 1000 large-file.txt documents/split-file-

# Increase limits
export MAX_FILE_SIZE=104857600  # 100MB
```

**Encoding errors:**
```bash
# Error: Invalid character encoding

# Check file encodings
file -bi documents/*.txt

# Convert to UTF-8
iconv -f ISO-8859-1 -t UTF-8 file.txt > file-utf8.txt

# Remove problematic characters
sed 's/[^[:print:]\t\n\r]//g' file.txt > clean-file.txt
```

### 4. Search Issues

**Search returns no results:**
```bash
# Empty search results despite having documents

# Check if documents are indexed
curl -s http://localhost:3001/api/health | jq '.totalDocuments'

# Verify vector store
ls -la ./.data/vectors/

# Check database
ls -la database.db

# Test different search types
# Use MCP tools or API endpoints
```

**Search performance is slow:**
```bash
# Search queries taking >5 seconds

# Check vector store size
ls -lh ./.data/vectors/

# Monitor search performance
tail -f logs/rag-server.log | grep -E "(search|query|duration)"

# Reduce search parameters
export SIMILARITY_TOP_K=3

# Consider faster model
export EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### 5. Memory & Performance Issues

**High memory usage:**
```bash
# Process consuming >2GB RAM

# Monitor memory usage
ps aux | grep rag-server
top -p $(pgrep -f rag-server)

# Tune Node.js memory
export NODE_OPTIONS="--max-old-space-size=1024"

# Restart server
yarn start
```

**CPU usage spikes:**
```bash
# 100% CPU during processing

# Reduce batch size
export BATCH_SIZE=5
export MAX_CONCURRENT_PROCESSING=2

# Enable lazy loading
export TRANSFORMERS_LAZY_LOADING=true

# Monitor processing
curl -s http://localhost:3001/api/health
```

### 6. Database Issues

**Database corruption:**
```bash
# Error: database disk image is malformed

# Check database integrity
sqlite3 database.db "PRAGMA integrity_check;"

# Backup current database
cp database.db database.db.backup

# Reset database
yarn db:reset

# Restore from backup if needed
```

**Database locked:**
```bash
# Error: database is locked

# Check for running processes
ps aux | grep rag-server
lsof database.db

# Force unlock (careful!)
fuser -k database.db

# Restart server
yarn start
```

### 7. Network & API Issues

**CORS errors:**
```bash
# Access blocked by CORS policy

# Enable CORS for development
export CORS_ENABLED=false

# Or configure for production
export CORS_ORIGINS=https://yourdomain.com
export CORS_ENABLED=true
```

**Rate limiting:**
```bash
# Error: Too Many Requests (429)

# Temporarily disable rate limiting
export RATE_LIMIT_ENABLED=false

# Or increase limits
export RATE_LIMIT_MAX_REQUESTS=200
```

## Debugging Techniques

### Enable Debug Logging

```bash
# Enable verbose logging
export LOG_LEVEL=debug
yarn start

# Monitor specific components
tail -f logs/rag-server.log | grep -E "(VectorStore|EmbeddingService|FileWatcher)"
```

### Component-Specific Debugging

**File Watcher:**
```bash
# Monitor file events
tail -f logs/rag-server.log | grep -E "(file.*added|file.*changed)"

# Check watch patterns
export DOCUMENTS_DIR=./documents
```

**Vector Store:**
```bash
# Check vector operations
tail -f logs/rag-server.log | grep -E "(vector|faiss|embedding)"

# Verify vector dimensions
curl -s http://localhost:3001/api/health | jq '.modelInfo'
```

**Search Operations:**
```bash
# Monitor search requests
tail -f logs/rag-server.log | grep -E "(search|query)"
```

## Emergency Procedures

### Complete System Reset

```bash
#!/bin/bash
# emergency-reset.sh

echo "🚨 Starting emergency reset..."

# 1. Stop processes
pkill -f rag-server || true

# 2. Backup current state
timestamp=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$timestamp
cp -r data logs backups/$timestamp/ || true

# 3. Clear cache and temporary files
rm -rf ./.data/.transformers-cache/*
rm -rf dist/*

# 4. Reset database
yarn db:reset

# 5. Reinstall dependencies
yarn install

# 6. Rebuild
yarn build

# 7. Start with debug logging
export LOG_LEVEL=debug
export EMBEDDING_SERVICE=transformers
export EMBEDDING_MODEL=all-MiniLM-L6-v2
yarn start

echo "✅ Reset complete"
```

### Data Recovery

```bash
#!/bin/bash
# data-recovery.sh

echo "🔄 Starting data recovery..."

# Stop application
pkill -f rag-server || true

# Check database integrity
if sqlite3 database.db "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "✅ Database integrity OK"
else
    echo "❌ Database corrupted, resetting"
    yarn db:reset
fi

# Rebuild vector store if needed
if [ ! -d "./.data/vectors" ] || [ -z "$(ls -A ./.data/vectors)" ]; then
    echo "🔄 Rebuilding vector store..."
    rm -rf ./.data/vectors
    yarn start
fi

echo "✅ Recovery complete"
```

## Getting Help

### Diagnostic Information

```bash
#!/bin/bash
# collect-diagnostics.sh

echo "📋 Collecting diagnostics..."

# System information
echo "=== System Info ===" > diagnostics.txt
uname -a >> diagnostics.txt
node --version >> diagnostics.txt
yarn --version >> diagnostics.txt

# Application status
echo "=== Application Status ===" >> diagnostics.txt
curl -s http://localhost:3001/api/health >> diagnostics.txt 2>&1

# Recent logs
echo "=== Recent Logs ===" >> diagnostics.txt
tail -100 logs/rag-server.log >> diagnostics.txt

# Recent errors
echo "=== Recent Errors ===" >> diagnostics.txt
tail -50 logs/rag-server-error.log >> diagnostics.txt

# Environment (sanitized)
echo "=== Environment ===" >> diagnostics.txt
env | grep -E "^(NODE_|LOG_|EMBEDDING_|DATABASE_)" | sed 's/=.*KEY.*/=***/' >> diagnostics.txt

# File system
echo "=== File System ===" >> diagnostics.txt
ls -la data/ >> diagnostics.txt
ls -la logs/ >> diagnostics.txt
df -h >> diagnostics.txt

echo "✅ Diagnostics saved to diagnostics.txt"
```

### Issue Reporting Template

```markdown
## Issue Description
Brief description of the problem

## Environment
- OS: [e.g., Ubuntu 20.04]
- Node.js version: [e.g., 22.0.0]
- RAM: [e.g., 4GB]
- Embedding service: [transformers/ollama]

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected vs Actual Behavior
What should happen vs what actually happens

## Logs
```
Recent error logs here
```

## Diagnostic Output
```
Output from collect-diagnostics.sh
```
```

---

**Still having issues?** Run the diagnostic script and provide the output when seeking help.