#!/bin/bash

# RAG MCP Server Startup Script

echo "🚀 Starting RAG MCP Server with Local Vector Database..."

# Check if .env exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "📝 Creating .env file from .env.example..."
        cp .env.example .env
        echo "⚠️  Please edit .env file with your settings"
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
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
pnpm start