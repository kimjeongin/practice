#!/bin/bash

# ====================================================================
# RAG Server Database Setup Script
# ====================================================================

set -e  # Exit on any error

echo "🚀 Setting up RAG Server database..."

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

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p .data
mkdir -p .data/vectors
mkdir -p .data/.cache
mkdir -p documents
mkdir -p logs

# Check if Prisma client is generated
echo "🔧 Generating Prisma client..."
yarn db:generate

# Check if database exists and has tables
echo "🗄️  Checking database status..."
if [ ! -f "prisma/database.db" ] || [ ! -s "prisma/database.db" ]; then
    echo "📦 Database not found or empty, creating new database..."
    yarn db:push
else
    echo "✅ Database file exists, checking tables..."
    # Check if tables exist by trying a simple query
    if ! npx prisma db execute --stdin <<< "SELECT name FROM sqlite_master WHERE type='table';" > /dev/null 2>&1; then
        echo "📦 Tables not found, pushing schema..."
        yarn db:push
    else
        echo "✅ Database tables exist"
    fi
fi

echo "🎉 Setup complete! You can now run the server with 'yarn dev' or 'yarn start'"