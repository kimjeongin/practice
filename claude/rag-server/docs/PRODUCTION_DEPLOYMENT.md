# Production Deployment Guide

## Overview

This guide covers Docker deployment, cloud platforms, and production configurations for the RAG MCP Server.

## Deployment Options

- **Docker Deployment** - Containerized deployment with health checks
- **Cloud Deployment** - AWS, GCP, Azure platforms
- **Direct Installation** - Node.js-based deployment
- **Scaling Setup** - High-availability configurations

## Quick Installation

### Docker Installation (Recommended)

**Prerequisites:**
- Docker 20.10+ and Docker Compose
- 2GB+ RAM available
- 10GB+ disk space

**Steps:**

```bash
# 1. Clone repository
git clone <repository-url>
cd rag-server

# 2. Configure environment
cp .env.example .env
# Edit .env with production settings

# 3. Build and start
docker-compose up -d

# 4. Verify installation
curl http://localhost:3001/api/health
```

### Direct Installation

**Prerequisites:**
- Node.js 22+
- yarn package manager
- 2GB+ RAM available

**Steps:**

```bash
# 1. Install dependencies
yarn install

# 2. Setup database
yarn db:setup

# 3. Configure environment
cp .env.example .env
# Edit .env with settings

# 4. Build and start
yarn build
yarn start

# 5. Verify installation
curl http://localhost:3001/api/health
```

## Performance Metrics

**Bundle Analysis:**

| Component | Size |
|-----------|------|
| Core Application | ~50MB |
| Node.js Runtime | ~150MB |
| FAISS Library | ~25MB |
| AI Model (default) | 23MB |
| **Total** | ~248MB |

**Performance:**
- Startup time: 2-3 seconds
- Document processing: Real-time
- Memory usage: 150-200MB
- Search latency: <100ms average

## Docker Deployment

### Production Dockerfile

```dockerfile
# Multi-stage build
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Production stage
FROM node:22-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    curl

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S rag-server -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=rag-server:nodejs /app/dist ./dist
COPY --from=builder --chown=rag-server:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=rag-server:nodejs /app/package.json ./
COPY --from=builder --chown=rag-server:nodejs /app/prisma ./prisma

# Create required directories
RUN mkdir -p data logs documents && \
    chown -R rag-server:nodejs data logs documents

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

USER rag-server

EXPOSE 3001

CMD ["node", "dist/app/index.js"]
```

### Docker Compose Setup

```yaml
version: '3.8'

services:
  rag-server:
    build: .
    container_name: rag-mcp-server
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./documents:/app/documents
      - ./logs:/app/logs
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - EMBEDDING_SERVICE=transformers
      - DATABASE_URL=file:./data/database.db
      - DATA_DIR=./data
      - DOCUMENTS_DIR=./documents
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

volumes:
  rag_data:
  rag_logs:
  rag_documents:
```

**Start with Docker Compose:**

```bash
# Start services
docker-compose up -d

# Monitor logs
docker-compose logs -f rag-server

# Check status
docker-compose ps
```

## Production Configuration

### Essential Environment Variables

```bash
# Production .env file

# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3001

# Database
DATABASE_URL="file:./data/database.db"

# Directories
DATA_DIR=./data
DOCUMENTS_DIR=./documents
FAISS_INDEX_PATH=./data/vectors

# Embedding Service
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=all-MiniLM-L6-v2

# Processing
CHUNK_SIZE=1024
CHUNK_OVERLAP=50
BATCH_SIZE=10
MAX_CONCURRENT_PROCESSING=3

# Monitoring
ENABLE_MONITORING=true
MONITORING_PORT=3001

# Security
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_ENABLED=true
```

### Performance Optimizations

```bash
# Node.js settings
NODE_OPTIONS="--max-old-space-size=2048"
UV_THREADPOOL_SIZE=16

# Application tuning
TRANSFORMERS_LAZY_LOADING=true
EMBEDDING_CACHE_SIZE=1000
MAX_CONCURRENT_EMBEDDINGS=3
```

## Cloud Deployment

### AWS ECS

```bash
# 1. Create ECR repository
aws ecr create-repository --repository-name rag-mcp-server

# 2. Build and push image
$(aws ecr get-login --no-include-email)
docker build -t rag-mcp-server .
docker tag rag-mcp-server:latest <account-id>.dkr.ecr.<region>.amazonaws.com/rag-mcp-server:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/rag-mcp-server:latest

# 3. Deploy to ECS
aws ecs create-cluster --cluster-name rag-cluster
```

### Google Cloud Run

```bash
# 1. Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/rag-mcp-server

# 2. Deploy
gcloud run deploy rag-mcp-server \
  --image gcr.io/PROJECT_ID/rag-mcp-server \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 1 \
  --max-instances 10
```

### DigitalOcean App Platform

```yaml
name: rag-mcp-server
services:
- name: rag-server
  source_dir: /
  github:
    repo: your-org/rag-mcp-server
    branch: main
  build_command: yarn build
  run_command: yarn start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: professional-xs
  envs:
  - key: NODE_ENV
    value: production
  - key: LOG_LEVEL
    value: info
  health_check:
    http_path: /api/health
```

## Security Configuration

### Security Checklist

**Application Security:**
- [ ] Enable CORS with specific origins
- [ ] Implement rate limiting
- [ ] Use HTTPS in production
- [ ] Validate all input parameters
- [ ] Enable security headers
- [ ] Regular dependency updates

**Infrastructure Security:**
- [ ] Run containers as non-root user
- [ ] Use secrets management
- [ ] Enable firewall rules
- [ ] Monitor security logs
- [ ] Implement backup strategy

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000";

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring & Maintenance

### Health Monitoring

```bash
# Basic health check
curl -f http://localhost:3001/api/health

# Detailed health status
curl -s http://localhost:3001/api/health | jq '.'
```

### Automated Backup

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d-%H%M%S)

# Backup data directory
tar -czf "$BACKUP_DIR/data-$DATE.tar.gz" ./data/

# Backup logs
tar -czf "$BACKUP_DIR/logs-$DATE.tar.gz" ./logs/

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

## Scaling & High Availability

### Load Balancing

```yaml
# docker-compose-ha.yml
version: '3.8'

services:
  rag-server-1:
    build: .
    environment:
      - INSTANCE_ID=server-1
    volumes:
      - shared_data:/app/data

  rag-server-2:
    build: .
    environment:
      - INSTANCE_ID=server-2
    volumes:
      - shared_data:/app/data

  loadbalancer:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
    depends_on:
      - rag-server-1
      - rag-server-2

volumes:
  shared_data:
```

## Deployment Recommendations

### Resource Requirements

**Small Deployment (1-10 users):**
- 2GB RAM, 1 CPU core
- 10GB disk space
- Single container

**Medium Deployment (10-100 users):**
- 4GB RAM, 2 CPU cores per instance
- 50GB shared storage
- 2-3 instances with load balancer

**Large Deployment (100+ users):**
- 8GB RAM, 4 CPU cores per instance
- 200GB+ storage with backups
- 3-10 instances with auto-scaling

---

**Ready for production:** Choose your deployment method and follow the security checklist for a robust setup.