# Monitoring Guide

## Overview

The RAG MCP Server includes built-in monitoring and observability features for production use.

## Monitoring Features

- **Web Dashboard** - Real-time metrics at http://localhost:3001
- **Structured Logging** - JSON-based logging with Pino
- **Error Tracking** - Comprehensive error monitoring
- **Health Checks** - API endpoints for system health
- **Performance Metrics** - Response times and throughput tracking

## Web Dashboard

### Access
The monitoring dashboard is available at:
```bash
http://localhost:3001
```

### Features
- **System Health**: Server status and uptime
- **Error Tracking**: Recent errors and error rates
- **Performance**: Response times and throughput
- **Resource Usage**: Memory and CPU metrics

### API Endpoints

```bash
# System health check
curl http://localhost:3001/api/health

# Get system status
curl http://localhost:3001/api/status

# View recent metrics
curl http://localhost:3001/metrics
```

## Logging System

### Log Files
Logs are automatically created in the `./logs/` directory:
```bash
./logs/
├── rag-server.log       # All application logs
└── rag-server-error.log # Error-only logs
```

### Log Levels
- **INFO**: Normal operations and events
- **WARN**: Non-critical issues
- **ERROR**: Critical errors
- **FATAL**: System failures

### Log Format
Structured JSON format for easy parsing:
```json
{
  "level": 30,
  "time": "2025-08-22T06:03:44.589Z",
  "service": "rag-mcp-server",
  "component": "RAGApplication",
  "operation": "document_processing",
  "duration": 207,
  "msg": "Document processed successfully"
}
```

### Monitoring Logs
```bash
# View all logs
tail -f logs/rag-server.log

# View errors only
tail -f logs/rag-server-error.log

# Filter specific operations
tail -f logs/rag-server.log | grep "search"
```

## Error Monitoring

### Error Types
The system tracks common error categories:
- **FILE_PARSE_ERROR**: Document processing failures
- **SEARCH_ERROR**: Vector search issues
- **VECTOR_STORE_ERROR**: FAISS operations
- **EMBEDDING_ERROR**: Model inference failures
- **DATABASE_ERROR**: SQLite operations
- **NETWORK_ERROR**: External service issues

### Error Context
Errors include detailed context:
```json
{
  "error": {
    "name": "FileProcessingError",
    "message": "Document parsing failed",
    "code": "FILE_PARSE_ERROR",
    "context": {
      "filePath": "/documents/file.pdf",
      "operation": "document_processing"
    }
  }
}
```

### Error Recovery
- **Retry Logic**: Failed operations retry automatically
- **Graceful Degradation**: System continues with reduced functionality
- **Error Logging**: All errors and recovery attempts logged

## Circuit Breakers

### States
- **Closed**: Normal operation, all requests pass through
- **Half-Open**: Testing recovery, limited requests allowed
- **Open**: Service unavailable, requests fail immediately

### Configuration
Circuit breakers protect against cascading failures:
- Request timeout: 1000ms
- Error threshold: 50% failure rate
- Reset timeout: 10 seconds
- Volume threshold: 5 requests minimum

### Monitoring
```bash
# Check circuit breaker status
curl http://localhost:3001/api/health | jq '.circuitBreakers'

# Monitor in logs
tail -f logs/rag-server.log | grep "circuit"
```

## Performance Monitoring

### Key Metrics
- **Processing**: Document processing rate and embedding generation time
- **Search**: Query response times and result quality
- **Resources**: Memory usage (~150MB baseline) and CPU utilization
- **Throughput**: Concurrent request handling and indexing rate

### Performance Analysis
```bash
# Monitor processing
tail -f logs/rag-server.log | grep "duration"

# Track search performance
tail -f logs/rag-server.log | grep "search"

# Monitor memory
ps aux | grep rag-server
```

### Performance Baselines
- Startup: 2-3 seconds
- Search response: <100ms average
- Memory usage: 150-200MB typical
- Document processing: Real-time indexing
- Throughput: 1000+ documents/hour

## Production Setup

### Health Checks
Set up automated monitoring:
```bash
# Basic health check
curl -f http://localhost:3001/api/health

# Detailed health status
curl -s http://localhost:3001/api/health | jq '.'
```

### External Monitoring
For production, consider integrating with:
- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **ELK Stack**: Log aggregation and analysis
- **AlertManager**: Automated alerting

### Alerting
Set up alerts for:
- High error rates (>10 errors/minute)
- Circuit breaker activation
- High memory usage (>500MB)
- Slow response times (>1 second)

### Custom Metrics
Add custom tracking in your application:
```typescript
import { logger } from './src/shared/logger/index.js';

logger.info('Custom metric', {
  operation: 'custom_operation',
  duration: 150,
  component: 'CustomComponent'
});
```

## Troubleshooting

### Debug Logging
Enable verbose logging:
```bash
# Set debug level
export LOG_LEVEL=debug
yarn start
```

### Common Issues

**Dashboard not accessible:**
```bash
# Check if port is in use
netstat -tulpn | grep 3001

# Check server startup logs
tail -f logs/rag-server.log | grep "dashboard"
```

**Missing logs:**
```bash
# Verify log directory
ls -la logs/

# Check disk space
df -h
```

**High error rates:**
```bash
# Check error patterns
tail -f logs/rag-server-error.log

# Monitor system resources
top -p $(pgrep -f "rag-server")
```

### Performance Issues
```bash
# Monitor resource usage
ps aux | grep rag-server

# Check processing status
curl -s http://localhost:3001/api/health
```

## Best Practices

### Production Monitoring
1. Set up automated health checks every minute
2. Configure alerting for error rates >10/minute
3. Rotate logs daily to prevent disk space issues
4. Monitor memory usage trends
5. Test monitoring setup in staging

### Log Management
1. Use log rotation (logrotate)
2. Compress old logs to save space
3. Index logs for faster searching
4. Set up log-based alerts for critical errors

### Performance Optimization
1. Monitor search latency trends
2. Track memory usage patterns
3. Analyze error patterns for improvements
4. Set performance baselines and track deviations

---

**Start monitoring:** Access the dashboard at http://localhost:3001