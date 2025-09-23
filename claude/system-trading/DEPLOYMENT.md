# Deployment Guide

## Prerequisites

- Docker and Docker Compose
- Git
- 4GB+ RAM recommended
- 10GB+ disk space

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd system-trading
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` file with your API credentials:

```bash
# Binance API (get from binance.com)
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key
BINANCE_TESTNET=true  # Set to false for live trading

# Upbit API (get from upbit.com)
UPBIT_ACCESS_KEY=your_upbit_access_key
UPBIT_SECRET_KEY=your_upbit_secret_key

# Database settings (use defaults for Docker)
DATABASE_URL=postgresql://postgres:password@postgres:5432/trading_db
REDIS_URL=redis://redis:6379/0
```

### 3. Deploy with Docker

```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f system-trading
```

### 4. Access Services

- **Trading API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Database Admin**: http://localhost:8080 (admin@trading.local / admin)
- **Redis Admin**: http://localhost:8081

## Production Deployment

### 1. Security Configuration

```bash
# Generate secure passwords
DATABASE_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Update docker-compose.yml with secure settings
# - Change default passwords
# - Enable SSL/TLS
# - Configure firewall rules
# - Set up monitoring
```

### 2. Environment Variables

```bash
# Production settings
API_DEBUG=false
LOG_LEVEL=INFO
BINANCE_TESTNET=false  # IMPORTANT: Use real trading

# Security
SECRET_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
```

### 3. SSL/HTTPS Setup

Use nginx reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4. Monitoring Setup

Add to docker-compose.yml:

```yaml
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.yml
services:
  system-trading:
    deploy:
      replicas: 3
    environment:
      - TRADING_ENGINE_ENABLED=false  # Only one engine instance

  trading-engine:
    image: system-trading
    command: uv run python main.py engine
    deploy:
      replicas: 1  # Keep only one trading engine
```

### Load Balancer

```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - system-trading
```

## Backup Strategy

### 1. Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres trading_db > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U postgres trading_db < backup.sql
```

### 2. Configuration Backup

```bash
# Backup configuration
cp .env .env.backup.$(date +%Y%m%d)
cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d)
```

### 3. Automated Backups

```bash
# Add to crontab
0 2 * * * /path/to/backup-script.sh
```

## Monitoring

### 1. Health Checks

```bash
# API health
curl http://localhost:8000/health

# Database health
docker-compose exec postgres pg_isready

# Redis health
docker-compose exec redis redis-cli ping
```

### 2. Log Monitoring

```bash
# Real-time logs
docker-compose logs -f

# Error logs only
docker-compose logs | grep ERROR

# Log aggregation
# Consider ELK stack or similar
```

### 3. Performance Monitoring

- CPU and memory usage
- Database query performance
- API response times
- Trading metrics

## Troubleshooting

### Common Issues

1. **API not responding**
   ```bash
   docker-compose restart system-trading
   docker-compose logs system-trading
   ```

2. **Database connection errors**
   ```bash
   docker-compose restart postgres
   # Check if port 5432 is free
   netstat -tlnp | grep 5432
   ```

3. **Exchange API errors**
   - Check API key permissions
   - Verify network connectivity
   - Check rate limits

4. **Memory issues**
   ```bash
   # Increase memory limits in docker-compose.yml
   services:
     system-trading:
       deploy:
         resources:
           limits:
             memory: 2G
   ```

### Debug Mode

```bash
# Run in debug mode
docker-compose -f docker-compose.yml -f docker-compose.debug.yml up

# Access container shell
docker-compose exec system-trading bash
```

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable SSL/TLS encryption
- [ ] Configure firewall rules
- [ ] Set up API rate limiting
- [ ] Enable audit logging
- [ ] Regular security updates
- [ ] Backup encryption
- [ ] Access control (VPN/whitelist)

## Performance Tuning

### Database Optimization

```sql
-- Optimize PostgreSQL
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
```

### Redis Optimization

```conf
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
```

### Application Tuning

- Adjust worker processes
- Configure connection pools
- Optimize query patterns
- Cache frequently accessed data

## Maintenance

### Regular Tasks

- Update dependencies monthly
- Review and rotate API keys quarterly
- Check disk space weekly
- Monitor performance metrics daily
- Backup verification monthly

### Updates

```bash
# Update application
git pull
docker-compose build
docker-compose up -d

# Update dependencies
uv sync
docker-compose build --no-cache
```

This deployment guide provides a comprehensive approach to running the system trading application in production environments.