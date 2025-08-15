#!/bin/bash

# RAG MCP Server Startup Script

echo "🚀 Starting RAG MCP Server with Vector Database..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start ChromaDB
echo "📦 Starting ChromaDB..."
docker-compose up -d chroma

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
sleep 5

# Check if ChromaDB is healthy
max_attempts=30
attempts=0
while [ $attempts -lt $max_attempts ]; do
    if curl -f http://localhost:8000/api/v1/heartbeat >/dev/null 2>&1; then
        echo "✅ ChromaDB is ready!"
        break
    fi
    attempts=$((attempts + 1))
    if [ $attempts -eq $max_attempts ]; then
        echo "❌ ChromaDB failed to start after $max_attempts attempts"
        exit 1
    fi
    echo "⏳ Waiting for ChromaDB... (attempt $attempts/$max_attempts)"
    sleep 2
done

# Check if .env exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "📝 Creating .env file from .env.example..."
        cp .env.example .env
        echo "⚠️  Please edit .env file with your settings, especially OPENAI_API_KEY for better embeddings"
    else
        echo "❌ No .env.example file found!"
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Build if needed
if [ ! -d dist ]; then
    echo "🔨 Building project..."
    pnpm build
fi

echo "🎯 Starting RAG MCP Server..."
echo "📊 Server will be available at: http://localhost:3000"
echo "🔍 Health check: http://localhost:3000/health"
echo "📈 ChromaDB UI: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
pnpm start