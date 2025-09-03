#!/bin/bash

# ====================================================================
# RAG Server Data Reset Script (LanceDB)
# ====================================================================

set -e  # Exit on any error

echo "🔄 Resetting RAG Server data..."

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Clean LanceDB data
echo "🧹 Cleaning LanceDB data..."
if [ -d ".data/lancedb" ]; then
    rm -rf .data/lancedb/*
    echo "✅ LanceDB data cleared"
else
    echo "ℹ️  No LanceDB data to remove"
fi

# Clean cache
echo "🧹 Cleaning cache..."
if [ -d ".data/.cache" ]; then
    rm -rf .data/.cache/*
    echo "✅ Cache cleared"
fi

# Clean transformers cache
echo "🧹 Cleaning transformers cache..."
if [ -d ".data/.cache" ]; then
    rm -rf .data/.cache/*
    echo "✅ Transformers cache cleared"
fi

# Clean logs
echo "🧹 Cleaning logs..."
if [ -d "logs" ]; then
    rm -f logs/*.log
    echo "✅ Logs cleared"
fi

echo "🎉 Data reset complete! Run 'yarn dev' to restart the server."