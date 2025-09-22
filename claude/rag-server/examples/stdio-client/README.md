# Stdio Client Example

TypeScript client for RAG MCP server using stdio transport.

## Setup

```bash
cd examples/stdio-client
yarn install
```

## Usage

```bash
yarn dev
```

## What it does

- Spawns RAG server as child process
- Tests available tools (`get_vectordb_info`, `search`)
- Runs predefined search queries
- Automatically disconnects when complete

## Requirements

- RAG server must be built (`yarn build` from project root)
- Node.js with child process permissions