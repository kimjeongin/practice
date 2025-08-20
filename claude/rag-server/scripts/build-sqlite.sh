#!/bin/bash

# Build script for better-sqlite3 native bindings
# This script ensures that better-sqlite3 native bindings are properly built
# after package installation, especially useful for clean installs.

set -e  # Exit on any error

echo "🚀 Better SQLite3 Build Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}📍${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_building() {
    echo -e "${YELLOW}🔨${NC} $1"
}

# Find better-sqlite3 package directory
find_sqlite_dir() {
    local sqlite_dir=""
    
    # Check pnpm structure first
    if [ -d "node_modules/.pnpm" ]; then
        sqlite_dir=$(find node_modules/.pnpm -name "better-sqlite3@*" -type d 2>/dev/null | head -1)
        if [ -n "$sqlite_dir" ]; then
            sqlite_dir="$sqlite_dir/node_modules/better-sqlite3"
        fi
    fi
    
    # Fallback to standard npm/yarn structure
    if [ -z "$sqlite_dir" ] || [ ! -d "$sqlite_dir" ]; then
        if [ -d "node_modules/better-sqlite3" ]; then
            sqlite_dir="node_modules/better-sqlite3"
        fi
    fi
    
    echo "$sqlite_dir"
}

# Check if native bindings exist
check_bindings() {
    local sqlite_dir="$1"
    
    if [ -f "$sqlite_dir/build/Release/better_sqlite3.node" ] || [ -f "$sqlite_dir/build/better_sqlite3.node" ]; then
        return 0  # bindings exist
    else
        return 1  # bindings don't exist
    fi
}

# Build native bindings
build_bindings() {
    local sqlite_dir="$1"
    local original_dir=$(pwd)
    
    print_building "Building better-sqlite3 native bindings in: $sqlite_dir"
    
    # Change to sqlite directory
    cd "$sqlite_dir" || {
        print_error "Failed to change to directory: $sqlite_dir"
        return 1
    }
    
    # Build the native module
    if npm run build-release; then
        print_success "Build completed successfully!"
        cd "$original_dir"
        return 0
    else
        print_error "Build failed!"
        cd "$original_dir"
        return 1
    fi
}

# Main execution
main() {
    # Find better-sqlite3 directory
    local sqlite_dir=$(find_sqlite_dir)
    
    if [ -z "$sqlite_dir" ] || [ ! -d "$sqlite_dir" ]; then
        print_error "Could not find better-sqlite3 package directory"
        print_error "Make sure better-sqlite3 is installed"
        exit 1
    fi
    
    print_status "Found better-sqlite3 at: $sqlite_dir"
    
    # Check if bindings already exist
    if check_bindings "$sqlite_dir"; then
        print_success "Native bindings already exist, no build needed"
        if [ -f "$sqlite_dir/build/Release/better_sqlite3.node" ]; then
            print_status "Binary location: $sqlite_dir/build/Release/better_sqlite3.node"
        elif [ -f "$sqlite_dir/build/better_sqlite3.node" ]; then
            print_status "Binary location: $sqlite_dir/build/better_sqlite3.node"
        fi
        exit 0
    fi
    
    print_warning "Native bindings not found, building..."
    
    # Build native bindings
    if build_bindings "$sqlite_dir"; then
        # Verify build
        if check_bindings "$sqlite_dir"; then
            print_success "Build verification successful!"
            exit 0
        else
            print_error "Build verification failed - binaries not found"
            exit 1
        fi
    else
        print_error "Build process failed"
        exit 1
    fi
}

# Run main function
main "$@"