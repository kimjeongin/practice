#!/bin/bash

# ====================================================================
# RAG Server Setup Script (LanceDB)
# ====================================================================

set -e  # Exit on any error

echo "🚀 Setting up RAG Server (LanceDB)..."

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if .env file exists, create from .env.example if not
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "📋 Creating .env from .env.example..."
        cp .env.example .env
    else
        echo "❌ .env.example not found. Please create .env file manually."
        exit 1
    fi
fi

# Create necessary directories for LanceDB
echo "📁 Creating necessary directories..."
mkdir -p .data
mkdir -p .data/lancedb
mkdir -p .data/.cache
mkdir -p documents
mkdir -p logs

echo "🎉 Setup complete! You can now run the server with 'yarn dev' or 'yarn start'"
echo "📝 로그 파일 저장 위치:"
echo "   - 전체 로그: $PROJECT_ROOT/logs/rag-server.log"
echo "   - 에러 로그: $PROJECT_ROOT/logs/rag-server-error.log"