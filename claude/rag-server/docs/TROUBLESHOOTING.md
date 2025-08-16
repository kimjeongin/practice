# Troubleshooting Guide

> **Complete diagnostic and debugging guide for RAG MCP Server issues**

This guide provides solutions for common issues, debugging techniques, and diagnostic procedures based on real-world deployment experience and comprehensive testing results.

## 🚨 Quick Diagnosis

### Health Check Commands

```bash
# 1. Basic health check
curl -f http://localhost:3001/api/health || echo "Service down"

# 2. Detailed system status
curl -s http://localhost:3001/api/health | jq '{status, errorRate, totalErrors, uptime}'

# 3. Check if server is running
netstat -tlnp | grep 3001 || echo "Port 3001 not listening"

# 4. View recent errors
tail -20 logs/rag-server-error.log

# 5. Monitor live logs
tail -f logs/rag-server.log | grep -E "(ERROR|WARN|FATAL)"
```

## 🔧 Common Issues & Solutions

### 1. Server Won't Start

#### **Issue**: Port already in use
```bash
# Error: listen EADDRINUSE :::3001
```

**Solution:**
```bash
# Find process using port 3001
lsof -ti:3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or use a different port
export PORT=3002
pnpm start
```

#### **Issue**: Missing dependencies
```bash
# Error: Cannot find module '@langchain/community'
```

**Solution:**
```bash
# Clean install dependencies
rm -rf node_modules package-lock.json
pnpm install

# Check for peer dependency issues
pnpm install --peer-deps-external-only
```

#### **Issue**: Database permissions
```bash
# Error: SQLITE_CANTOPEN: unable to open database file
```

**Solution:**
```bash
# Create data directory and set permissions
mkdir -p data logs
chmod 755 data logs

# Check disk space
df -h

# Check file permissions
ls -la data/
chmod 644 data/rag.db  # if exists
```

### 2. Model Loading Issues

#### **Issue**: Transformers.js model download fails
```bash
# Error: Failed to download model all-MiniLM-L6-v2
```

**Solution:**
```bash
# Check internet connectivity
curl -I https://huggingface.co/

# Clear cache and retry
rm -rf cache/transformers
export TRANSFORMERS_CACHE_DIR=./cache/transformers
pnpm start

# Use different model
export EMBEDDING_MODEL=all-MiniLM-L12-v2
```

#### **Issue**: Ollama connection failed
```bash
# Error: fetch failed - connect ECONNREFUSED 127.0.0.1:11434
```

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama service
ollama serve

# Pull required model
ollama pull nomic-embed-text

# Verify model is available
ollama list
```

#### **Issue**: OpenAI API errors
```bash
# Error: 401 Unauthorized / Invalid API key
```

**Solution:**
```bash
# Verify API key format (starts with sk-)
echo $OPENAI_API_KEY | grep "^sk-"

# Test API key directly
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Check rate limits
curl -s -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models | jq '.error'
```

### 3. File Processing Issues

#### **Issue**: Documents not processing
```bash
# Files added to ./data but not indexed
```

**Solution:**
```bash
# Check file watcher logs
tail -f logs/rag-server.log | grep -E "(watcher|processing)"

# Verify supported file types
ls data/ | grep -E "\.(txt|md|json|xml|html|csv)$"

# Check file permissions
ls -la data/
chmod 644 data/*.txt  # Make files readable

# Manually trigger processing
curl -X POST http://localhost:3001/api/process-directory
```

#### **Issue**: Large file processing fails
```bash
# Error: File too large or processing timeout
```

**Solution:**
```bash
# Check file sizes
ls -lh data/ | awk '$5 > "10M"'

# Split large files
split -l 1000 large-file.txt data/split-file-

# Increase timeout
export PROCESSING_TIMEOUT=60000
export MAX_FILE_SIZE=104857600  # 100MB
```

#### **Issue**: Encoding errors
```bash
# Error: Invalid character encoding
```

**Solution:**
```bash
# Check file encodings
file -bi data/*.txt

# Convert to UTF-8
iconv -f ISO-8859-1 -t UTF-8 file.txt > file-utf8.txt

# Remove problematic characters
sed 's/[^[:print:]\t\n\r]//g' file.txt > clean-file.txt
```

### 4. Search & Retrieval Issues

#### **Issue**: Search returns no results
```bash
# Empty search results despite having documents
```

**Solution:**
```bash
# Check if documents are indexed
curl -s http://localhost:3001/api/health | jq '.totalDocuments'

# Verify vector store
ls -la data/faiss_index/

# Check database
sqlite3 data/rag.db "SELECT COUNT(*) FROM file_metadata;"

# Test with different search types
curl -X POST http://localhost:3001/search \
  -d '{"query": "test", "useSemanticSearch": false}'
```

#### **Issue**: Search performance is slow
```bash
# Search queries taking >5 seconds
```

**Solution:**
```bash
# Check vector store size
ls -lh data/faiss_index/

# Monitor search performance
tail -f logs/rag-server.log | grep -E "(search|query|duration)"

# Reduce search parameters
export SIMILARITY_TOP_K=3
export SEARCH_TIMEOUT=5000

# Consider model optimization
export EMBEDDING_MODEL=all-MiniLM-L6-v2  # Faster model
```

### 5. Memory & Performance Issues

#### **Issue**: High memory usage
```bash
# Process consuming >2GB RAM
```

**Solution:**
```bash
# Monitor memory usage
ps aux | grep rag-server
top -p $(pgrep -f rag-server)

# Check for memory leaks
curl -s http://localhost:3001/api/health | jq '.memoryUsage'

# Tune Node.js memory
export NODE_OPTIONS="--max-old-space-size=1024"

# Enable garbage collection
export NODE_OPTIONS="$NODE_OPTIONS --expose-gc"

# Restart with memory monitoring
pnpm start | grep -E "(memory|heap|gc)"
```

#### **Issue**: CPU usage spikes
```bash
# 100% CPU during processing
```

**Solution:**
```bash
# Reduce batch size
export BATCH_SIZE=5
export MAX_CONCURRENT_REQUESTS=10

# Enable lazy loading
export LAZY_LOADING=true
export PRELOAD_MODELS=false

# Monitor processing queue
watch -n 1 'curl -s http://localhost:3001/api/health | jq ".processingQueue"'
```

### 6. Database Issues

#### **Issue**: Database corruption
```bash
# Error: database disk image is malformed
```

**Solution:**
```bash
# Check database integrity
sqlite3 data/rag.db "PRAGMA integrity_check;"

# Backup database
cp data/rag.db data/rag.db.backup

# Repair database
sqlite3 data/rag.db ".recover" | sqlite3 data/rag-recovered.db

# Restore from backup
mv data/rag-recovered.db data/rag.db
```

#### **Issue**: Database locked
```bash
# Error: database is locked
```

**Solution:**
```bash
# Check for running processes
ps aux | grep rag-server
lsof data/rag.db

# Force unlock (careful!)
fuser -k data/rag.db

# Enable WAL mode for better concurrency
sqlite3 data/rag.db "PRAGMA journal_mode=WAL;"
```

### 7. Network & API Issues

#### **Issue**: CORS errors in browser
```bash
# Access to fetch blocked by CORS policy
```

**Solution:**
```bash
# Enable CORS for your domain
export CORS_ORIGINS=https://yourdomain.com
export CORS_ENABLED=true

# Or disable CORS for development
export CORS_ENABLED=false

# Verify CORS headers
curl -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS http://localhost:3001/api/health
```

#### **Issue**: Rate limiting blocking requests
```bash
# Error: Too Many Requests (429)
```

**Solution:**
```bash
# Check rate limit status
curl -s http://localhost:3001/api/health | jq '.rateLimitStatus'

# Temporarily disable rate limiting
export RATE_LIMIT_ENABLED=false

# Increase rate limits
export RATE_LIMIT_MAX_REQUESTS=200
export RATE_LIMIT_WINDOW_MS=60000
```

## 🔍 Debugging Techniques

### Enable Debug Logging

```bash
# Enable verbose logging
export LOG_LEVEL=debug
pnpm start

# Monitor specific components
tail -f logs/rag-server.log | grep -E "(VectorStore|EmbeddingService|FileWatcher)"

# Enable performance logging
export PERFORMANCE_LOG_ENABLED=true
```

### Component-Specific Debugging

#### File Watcher Debugging
```bash
# Monitor file events
tail -f logs/rag-server.log | grep -E "(file.*added|file.*changed|file.*removed)"

# Check watch patterns
export WATCH_IGNORED="node_modules/**,dist/**,.git/**,logs/**"
export WATCH_DEBOUNCE_DELAY=2000
```

#### Vector Store Debugging
```bash
# Check vector store operations
tail -f logs/rag-server.log | grep -E "(vector|faiss|embedding|index)"

# Verify vector dimensions
curl -s http://localhost:3001/api/model-info | jq '.dimensions'

# Check index statistics
ls -la data/faiss_index/
```

#### Search Debugging
```bash
# Enable search operation logging
curl -X POST http://localhost:3001/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test query",
    "debug": true,
    "useSemanticSearch": true,
    "topK": 3
  }'
```

### Performance Profiling

```bash
# Enable Node.js profiling
export NODE_OPTIONS="--prof"
pnpm start

# Generate profile report
node --prof-process isolate-*.log > profile.txt

# Memory heap snapshot
export NODE_OPTIONS="--heapsnapshot-signal=SIGUSR2"
kill -USR2 $PID  # Take heap snapshot
```

## 📊 Monitoring & Diagnostics

### Real-time Monitoring

```bash
# Monitor all metrics
watch -n 5 'curl -s http://localhost:3001/api/health | jq "{status, errorRate, totalDocuments, memoryUsage}"'

# Monitor error patterns
tail -f logs/rag-server-error.log | jq -r '.error.code + ": " + .msg'

# Monitor circuit breakers
watch -n 2 'curl -s http://localhost:3001/api/circuit-breakers | jq ".[].state"'
```

### Error Analysis

```bash
# Analyze error patterns
grep -o '"code":"[^"]*"' logs/rag-server-error.log | sort | uniq -c

# Find most frequent errors
jq -r '.error.code' logs/rag-server-error.log | sort | uniq -c | sort -nr

# Timeline analysis
jq -r '.time + " " + .error.code' logs/rag-server-error.log | tail -20
```

### System Resource Monitoring

```bash
# Monitor system resources
while true; do
  echo "$(date): CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}'), Memory: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
  sleep 10
done

# Disk space monitoring
df -h | grep -E "(data|logs|cache)"

# I/O monitoring
iotop -p $(pgrep -f rag-server)
```

## 🚑 Emergency Procedures

### Complete System Reset

```bash
#!/bin/bash
# emergency-reset.sh
set -euo pipefail

echo "🚨 Starting emergency system reset..."

# 1. Stop all processes
pkill -f rag-server || true

# 2. Backup current state
timestamp=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$timestamp
cp -r data logs backups/$timestamp/ || true

# 3. Clear cache and temporary files
rm -rf cache/* dist/* || true

# 4. Reset database (WARNING: DATA LOSS)
# mv data/rag.db data/rag.db.backup.$timestamp

# 5. Clear vector store
# rm -rf data/faiss_index/*

# 6. Reinstall dependencies
pnpm install

# 7. Rebuild application
pnpm build

# 8. Start with minimal configuration
export LOG_LEVEL=debug
export EMBEDDING_SERVICE=transformers
export EMBEDDING_MODEL=all-MiniLM-L6-v2
pnpm start

echo "✅ Emergency reset complete"
```

### Data Recovery

```bash
#!/bin/bash
# data-recovery.sh

echo "🔄 Starting data recovery process..."

# 1. Stop application
pkill -f rag-server || true

# 2. Check database integrity
if sqlite3 data/rag.db "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "✅ Database integrity OK"
else
    echo "❌ Database corrupted, attempting recovery"
    sqlite3 data/rag.db ".recover" | sqlite3 data/rag-recovered.db
    mv data/rag.db data/rag.db.corrupted
    mv data/rag-recovered.db data/rag.db
fi

# 3. Rebuild vector store if needed
if [ ! -d "data/faiss_index" ] || [ -z "$(ls -A data/faiss_index)" ]; then
    echo "🔄 Rebuilding vector store from documents..."
    rm -rf data/faiss_index
    pnpm start
fi

echo "✅ Data recovery complete"
```

## 📞 Getting Help

### Diagnostic Information Collection

```bash
#!/bin/bash
# collect-diagnostics.sh

echo "📋 Collecting diagnostic information..."

# System information
echo "=== System Info ===" > diagnostics.txt
uname -a >> diagnostics.txt
node --version >> diagnostics.txt
pnpm --version >> diagnostics.txt

# Application status
echo "=== Application Status ===" >> diagnostics.txt
curl -s http://localhost:3001/api/health >> diagnostics.txt 2>&1

# Recent logs
echo "=== Recent Logs ===" >> diagnostics.txt
tail -100 logs/rag-server.log >> diagnostics.txt

# Recent errors
echo "=== Recent Errors ===" >> diagnostics.txt
tail -50 logs/rag-server-error.log >> diagnostics.txt

# Environment variables (sanitized)
echo "=== Environment ===" >> diagnostics.txt
env | grep -E "^(NODE_|LOG_|EMBEDDING_|DATABASE_)" | sed 's/=.*KEY.*/=***/' >> diagnostics.txt

# File system
echo "=== File System ===" >> diagnostics.txt
ls -la data/ >> diagnostics.txt
ls -la logs/ >> diagnostics.txt
df -h >> diagnostics.txt

echo "✅ Diagnostics saved to diagnostics.txt"
```

### Support Channels

- **📖 Documentation**: Check docs/ directory for detailed guides
- **🐛 Bug Reports**: Create issue with diagnostic information
- **💬 Community**: Discussions for general questions
- **📧 Enterprise**: Contact for enterprise support

### Issue Reporting Template

```markdown
## Issue Description
Brief description of the problem

## Environment
- OS: [e.g., Ubuntu 20.04]
- Node.js version: [e.g., 18.17.0]
- RAM: [e.g., 4GB]
- Embedding service: [transformers/ollama/openai]

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior  
What actually happens

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

**Still having issues?** Follow the diagnostic procedures above and provide the collected information when seeking help! 🆘