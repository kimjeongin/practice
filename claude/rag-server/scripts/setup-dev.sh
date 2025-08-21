#!/bin/bash

# ====================================================================
# RAG Server Development Setup Script
# ====================================================================

set -e  # Exit on any error

echo "🚀 Setting up RAG Server for development..."

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Install dependencies
echo "📦 Installing dependencies..."
yarn install

# Run database setup
echo "🗄️  Setting up database..."
./scripts/setup-database.sh

# Build the project
echo "🔨 Building project..."
yarn build

echo "🎉 Development setup complete!"
echo ""
echo "Available commands:"
echo "  yarn dev         - Start development server with watch mode"
echo "  yarn start       - Start production server"
echo "  yarn test        - Run all tests"
echo "  yarn test:unit   - Run unit tests only"
echo "  yarn typecheck   - Run TypeScript type checking"
echo "  yarn db:studio   - Open Prisma Studio for database management"