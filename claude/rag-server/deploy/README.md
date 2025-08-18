# 🚀 RAG Server Deployment

This directory contains all deployment and distribution files for creating cross-platform executables and installers.

## 📋 Quick Commands

```bash
# Build all platform executables  
npm run build:executable

# Create all distribution packages
npm run package:all

# Complete release build
npm run release:build
```

## 📁 Structure

- `scripts/` - Build automation scripts
- `packaging/` - Platform-specific packaging scripts
- `docker/` - Docker deployment configurations  
- `docs/` - Detailed deployment documentation

📖 **See [docs/README.md](docs/README.md) for complete documentation**

## 🎯 Output

- **Executables**: `../dist/executables/`
- **Packages**: `../packages/`