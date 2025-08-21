#!/bin/bash

# ====================================================================
# RAG Server Database Reset Script
# ====================================================================

set -e  # Exit on any error

echo "🔄 Resetting RAG Server database..."

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Remove existing database
echo "🗑️  Removing existing database..."
if [ -f "prisma/database.db" ]; then
    rm prisma/database.db
    echo "✅ Database file removed"
else
    echo "ℹ️  No database file to remove"
fi

# Clean vector store data
echo "🧹 Cleaning vector store data..."
if [ -d ".data/vectors" ]; then
    rm -rf .data/vectors/*
    echo "✅ Vector store data cleared"
fi

# Clean cache
echo "🧹 Cleaning cache..."
if [ -d ".data/.cache" ]; then
    rm -rf .data/.cache/*
    echo "✅ Cache cleared"
fi

# Recreate database
echo "📦 Recreating database..."
yarn db:push

echo "🎉 Database reset complete!"