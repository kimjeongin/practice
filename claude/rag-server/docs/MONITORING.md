# Monitoring Guide

> **Complete observability and monitoring setup for production RAG MCP Server**

This guide covers all monitoring capabilities, dashboard usage, logging, and production observability features validated through comprehensive testing.

## 📊 Overview

The RAG MCP Server includes a comprehensive monitoring stack:

- **🖥️ Real-time Web Dashboard** - Live metrics and system health
- **📋 Structured Logging** - Pino-based JSON logging with rotation
- **🛡️ Error Tracking** - Comprehensive error monitoring and alerting
- **⚡ Circuit Breakers** - Automatic failure detection and recovery
- **📈 Performance Metrics** - Real-time performance and throughput tracking

## 🖥️ Web Dashboard

### Accessing the Dashboard

Once your RAG server is running, the monitoring dashboard is automatically available at:

```bash
http://localhost:3001
```

### Dashboard Features

#### **System Health Overview**
- 🏥 **Health Status**: healthy/degraded/unhealthy
- 📊 **Error Rate**: Errors per minute
- 📈 **Total Errors**: Cumulative error count
- ⏱️ **Uptime**: System runtime

#### **Error Statistics**
- 📊 **By Error Code**: FILE_PARSE_ERROR, SEARCH_ERROR, etc.
- 🧩 **By Component**: Breakdown by system component
- 📈 **Timeline**: Error trends over time

#### **Circuit Breaker Status**
- 🔵 **Closed**: Normal operation
- 🟡 **Half-Open**: Testing recovery
- 🔴 **Open**: Circuit breaker triggered
- 📊 **Success/Failure Counts**: Performance metrics

#### **Real-time Error Log**
- 🔥 **Recent Errors**: Last 10 error entries
- 🏷️ **Error Context**: Component, operation, and details
- 📅 **Timestamps**: Precise error timing

### Dashboard API Endpoints

Access monitoring data programmatically:

```bash
# System health
curl http://localhost:3001/api/health

# Error statistics  
curl http://localhost:3001/api/errors

# Circuit breaker status
curl http://localhost:3001/api/circuit-breakers

# Real-time logs
curl http://localhost:3001/api/logs
```

## 📋 Logging System

### Log Files Location

The server automatically creates and rotates log files:

```bash
./logs/
├── rag-server.log       # All application logs
└── rag-server-error.log # Error-only logs
```

### Log Levels

**Production logging levels:**

- **`INFO` (30)**: Normal operations, startup, and success events
- **`WARN` (40)**: Non-critical issues and recoverable errors  
- **`ERROR` (50)**: Critical errors requiring attention
- **`FATAL` (60)**: System-level failures

### Log Format

All logs use structured JSON format with consistent fields:

```json
{
  "level": 30,
  "time": "2025-08-16T06:03:44.589Z",
  "service": "rag-mcp-server",
  "version": "1.0.0",
  "component": "RAGApplication",
  "operation": "application_initialization", 
  "duration": 207,
  "msg": "RAG Application initialized successfully"
}
```

### Key Log Fields

- **`service`**: Always "rag-mcp-server"
- **`version`**: Application version
- **`component`**: System component (RAGApplication, DocumentService, etc.)
- **`operation`**: Specific operation being performed
- **`duration`**: Operation duration in milliseconds
- **`error`**: Detailed error information (if applicable)

### Monitoring Log Files

```bash
# Monitor all logs in real-time
tail -f logs/rag-server.log

# Monitor only errors
tail -f logs/rag-server-error.log

# Filter for specific operations
tail -f logs/rag-server.log | grep "batch_processing"

# Monitor performance
tail -f logs/rag-server.log | grep -E "(duration|performance)"
```

## 🛡️ Error Monitoring

### Error Classification

The system tracks and categorizes all errors:

#### **Application Errors**
- **`FILE_PARSE_ERROR`**: Document processing failures
- **`SEARCH_ERROR`**: Vector search and retrieval issues
- **`VECTOR_STORE_ERROR`**: FAISS index operations
- **`EMBEDDING_ERROR`**: AI model inference failures
- **`TIMEOUT_ERROR`**: Operation timeouts

#### **System Errors**
- **`DATABASE_ERROR`**: SQLite operations
- **`FILESYSTEM_ERROR`**: File system operations
- **`NETWORK_ERROR`**: External service communications
- **`UNKNOWN_ERROR`**: Unclassified errors

### Error Context

Each error includes comprehensive context:

```json
{
  "error": {
    "name": "FileProcessingError",
    "message": "PDF parsing failed", 
    "code": "FILE_PARSE_ERROR",
    "statusCode": 500,
    "context": {
      "filePath": "/data/document.pdf",
      "operation": "pdf_parsing",
      "timestamp": "2025-08-16T06:03:44.589Z"
    },
    "isOperational": true,
    "stack": "Full stack trace..."
  }
}
```

### Alert Thresholds

**Automatic alerts trigger when:**

- **Error Rate**: >10 errors per minute
- **Specific Error Types**: FILE_PARSE_ERROR >20 occurrences
- **Circuit Breaker**: Any breaker opens
- **System Health**: Status becomes 'unhealthy'

### Error Recovery

The system includes automatic error recovery:

- **🔄 Retry Logic**: Failed operations retry up to 3 times
- **⚡ Circuit Breakers**: Automatically isolate failing services
- **🏥 Graceful Degradation**: Continue operating with reduced functionality
- **📋 Error Logging**: All recovery attempts are logged

## ⚡ Circuit Breakers

### Circuit Breaker States

**🔵 Closed (Normal)**
- All requests pass through
- Success/failure metrics tracked
- No failures detected

**🟡 Half-Open (Testing)**
- Limited requests allowed through  
- Testing if service recovered
- Automatic state transition based on results

**🔴 Open (Circuit Breaker Triggered)**
- Requests immediately fail
- Service considered unavailable
- Automatic recovery attempt after timeout

### Configuration

Circuit breakers are configured per service:

```typescript
{
  timeout: 1000,              // Request timeout (ms)
  errorThresholdPercentage: 50, // Failure rate to trigger (%)
  resetTimeout: 10000,         // Recovery test interval (ms)
  volumeThreshold: 5          // Minimum requests before evaluation
}
```

### Monitoring Circuit Breakers

```bash
# Check circuit breaker status
curl http://localhost:3001/api/circuit-breakers

# Monitor circuit breaker logs
tail -f logs/rag-server.log | grep -E "(circuit|breaker)"

# Watch for breaker state changes
watch -n 5 'curl -s http://localhost:3001/api/circuit-breakers | jq ".[].state"'
```

## 📈 Performance Monitoring

### Key Metrics Tracked

**📊 Processing Metrics**
- Document processing rate (docs/minute)
- Embedding generation time (ms/document)
- Vector indexing throughput
- Search response latency

**💾 Resource Metrics**
- Memory usage (baseline ~150MB)
- CPU utilization during processing
- Disk I/O for vector operations
- File system watcher activity

**🔍 Search Metrics**
- Query response times
- Search result quality scores
- Cache hit ratios
- Concurrent request handling

### Performance Log Analysis

```bash
# Monitor processing performance
tail -f logs/rag-server.log | grep -E "(batch_processing|embedding|duration)"

# Track memory usage
tail -f logs/rag-server.log | grep -E "(memory|heap)"

# Monitor search performance  
tail -f logs/rag-server.log | grep -E "(search|query|latency)"
```

### Performance Baselines

**Established performance baselines:**

```
🚀 Startup: 2-3 seconds (cold start)
📊 Processing: 200ms per 10 documents  
🔍 Search: <100ms average response
💾 Memory: 150-200MB typical usage
🔄 Throughput: 1000+ documents/hour
```

## 🔧 Production Monitoring Setup

### Health Check Endpoint

Set up automated health monitoring:

```bash
# Basic health check
curl -f http://localhost:3001/api/health || echo "Service unhealthy"

# Detailed health with metrics
curl -s http://localhost:3001/api/health | jq '{status, errorRate, totalErrors, uptime}'
```

### Log Aggregation

**For production deployment, consider:**

- **Fluentd/Fluent Bit**: Log collection and forwarding
- **ELK Stack**: Elasticsearch, Logstash, Kibana for analysis
- **Grafana**: Visualization of metrics and dashboards
- **Prometheus**: Metrics collection (can be added via custom middleware)

### Alerting Setup

**Recommended alerts:**

```bash
# Error rate alert
while true; do
  rate=$(curl -s http://localhost:3001/api/health | jq '.errorRate')
  if (( $(echo "$rate > 10" | bc -l) )); then
    echo "ALERT: High error rate: $rate/min"
  fi
  sleep 60
done

# Circuit breaker alert
breaker_status=$(curl -s http://localhost:3001/api/circuit-breakers | jq -r '.[].state')
if [[ "$breaker_status" == "open" ]]; then
  echo "ALERT: Circuit breaker open"
fi
```

### Custom Monitoring Integration

**Add custom metrics collection:**

```typescript
// Example: Custom performance tracking
import { logger } from './src/shared/logger/index.js';

function trackCustomMetric(operation: string, duration: number) {
  logger.info('Custom metric', {
    operation,
    duration,
    timestamp: new Date().toISOString(),
    component: 'CustomMetrics'
  });
}
```

## 🐛 Debugging & Troubleshooting

### Debug Logging

Enable verbose logging for troubleshooting:

```bash
# Set debug level (in development)
export LOG_LEVEL=debug
npm start

# Or modify logger configuration
```

### Common Monitoring Issues

**Dashboard not accessible:**
```bash
# Check if port 3001 is available
netstat -tlnp | grep 3001

# Check server logs for dashboard startup
tail -f logs/rag-server.log | grep "dashboard"
```

**Missing logs:**
```bash
# Verify log directory exists and is writable
ls -la logs/
chmod 755 logs/

# Check disk space
df -h
```

**High error rates:**
```bash
# Identify error patterns
tail -f logs/rag-server-error.log | grep -E "(FILE_PARSE_ERROR|SEARCH_ERROR)"

# Check system resources
top -p $(pgrep -f "rag-server")
```

### Performance Debugging

```bash
# Monitor resource usage
watch -n 2 'ps aux | grep rag-server'

# Check file processing queue
curl -s http://localhost:3001/api/health | jq '.processingQueue'

# Monitor embedding performance
tail -f logs/rag-server.log | grep "Generated.*embeddings" | tail -20
```

## 🎯 Best Practices

### Production Monitoring

1. **📊 Set up automated health checks** every minute
2. **🚨 Configure alerting** for error rates >10/min
3. **📋 Rotate logs daily** to prevent disk space issues
4. **💾 Monitor memory usage** trends for potential leaks
5. **🔄 Test circuit breaker functionality** in staging

### Log Management

1. **📁 Use log rotation** (logrotate or similar)
2. **🗜️ Compress old logs** to save disk space  
3. **🔍 Index logs** for faster searching
4. **📊 Create dashboards** for key metrics
5. **🚨 Set up log-based alerts** for critical errors

### Performance Optimization

1. **⚡ Monitor batch processing** efficiency
2. **🔍 Track search latency** trends
3. **💾 Watch memory usage** patterns
4. **📊 Analyze error patterns** for optimization opportunities
5. **🎯 Set performance baselines** and track deviations

---

**Ready to monitor your RAG server?** Start with the web dashboard at http://localhost:3001 and explore the comprehensive observability features! 🚀