# Development Guide

## Getting Started

### Prerequisites
- Node.js 22+
- yarn package manager
- Git

### Setup Development Environment

```bash
# Clone repository
git clone <repository-url>
cd rag-server

# Install dependencies
yarn install

# Setup database
yarn db:setup

# Build project
yarn build

# Start development server
yarn dev
```

## Project Structure

```
src/
├── app/                    # Application entry point
│   ├── app.ts             # Main application class
│   ├── index.ts           # Server startup
│   ├── factories/         # Component factories
│   └── orchestrator/      # Application orchestrator
├── domains/
│   ├── mcp/              # Model Context Protocol
│   │   ├── handlers/     # MCP tool handlers
│   │   └── server/       # MCP server implementation
│   └── rag/              # RAG domain logic
│       ├── services/     # Core business logic
│       ├── repositories/ # Data access layer
│       ├── workflows/    # RAG orchestration
│       └── integrations/ # External integrations
└── shared/               # Shared utilities
    ├── config/           # Configuration management
    ├── database/         # Database connection
    ├── logger/           # Structured logging
    ├── monitoring/       # System monitoring
    └── types/            # TypeScript definitions
```

## Development Workflow

### Running the Application

```bash
# Development mode with hot reload
yarn dev

# Production mode
yarn start

# Build only
yarn build

# Type checking
yarn typecheck

# Linting
yarn lint
```

### Database Operations

```bash
# Setup database from scratch
yarn db:setup

# Reset database (clears all data)
yarn db:reset

# Generate Prisma client
yarn db:generate

# Run migrations
yarn db:migrate

# Open Prisma Studio
yarn db:studio
```

### Testing

```bash
# Run all tests
yarn test:all

# Run specific test types
yarn test:unit
yarn test:integration
yarn test:e2e

# Test with coverage
yarn test:coverage

# Watch mode for development
yarn test:watch
```

## Architecture Patterns

### Domain-Driven Design
The application follows domain-driven design principles:

- **Domains**: Separate business logic areas (MCP, RAG)
- **Services**: Core business logic
- **Repositories**: Data access abstraction
- **Integrations**: External service adapters

### Dependency Injection
Services are registered and resolved through a service registry:

```typescript
// Register service
serviceRegistry.register('embeddingService', embeddingService);

// Resolve service
const embeddingService = serviceRegistry.resolve<EmbeddingService>('embeddingService');
```

### Error Handling
Structured error handling with custom error types:

```typescript
import { AppError } from '@/shared/errors/index.js';

throw new AppError('Search failed', 'SEARCH_ERROR', 500, {
  query: searchQuery,
  operation: 'semantic_search'
});
```

## Adding New Features

### 1. Adding New MCP Tools

Create a new handler in `src/domains/mcp/handlers/`:

```typescript
// src/domains/mcp/handlers/my-tool.ts
export async function handleMyTool(
  args: MyToolArgs,
  context: MCPContext
): Promise<MyToolResult> {
  // Implementation
  return { success: true };
}
```

Register in the MCP server:

```typescript
// src/domains/mcp/server/server.ts
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'my_tool') {
    return handleMyTool(request.params.arguments, context);
  }
});
```

### 2. Adding New Embedding Providers

Create a provider in `src/domains/rag/integrations/embeddings/providers/`:

```typescript
// src/domains/rag/integrations/embeddings/providers/my-provider.ts
export class MyEmbeddingProvider implements EmbeddingProvider {
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Implementation
  }
}
```

Register in the embedding adapter:

```typescript
// src/domains/rag/integrations/embeddings/adapter.ts
case 'my-provider':
  return new MyEmbeddingProvider(config);
```

### 3. Adding New Vector Stores

Implement the `VectorStoreProvider` interface:

```typescript
// src/domains/rag/integrations/vectorstores/providers/my-store.ts
export class MyVectorStore implements VectorStoreProvider {
  async addDocuments(documents: Document[]): Promise<void> {
    // Implementation
  }

  async similaritySearch(query: number[], k: number): Promise<SearchResult[]> {
    // Implementation
  }
}
```

### 4. Adding New File Processors

Add processor to the document service:

```typescript
// src/domains/rag/services/document/processor.ts
async processFile(filePath: string): Promise<string> {
  const extension = path.extname(filePath);
  
  switch (extension) {
    case '.myformat':
      return this.processMyFormat(filePath);
    default:
      return this.processText(filePath);
  }
}
```

## Configuration

### Environment Variables

Create environment-specific configuration:

```typescript
// src/shared/config/config.ts
export interface Config {
  myNewFeature: {
    enabled: boolean;
    apiKey: string;
  };
}

export const config: Config = {
  myNewFeature: {
    enabled: process.env.MY_FEATURE_ENABLED === 'true',
    apiKey: process.env.MY_FEATURE_API_KEY || ''
  }
};
```

### Validation

Add configuration validation:

```typescript
if (config.myNewFeature.enabled && !config.myNewFeature.apiKey) {
  throw new Error('MY_FEATURE_API_KEY is required when feature is enabled');
}
```

## Testing Guidelines

### Unit Tests
Test individual functions and classes:

```typescript
// tests/unit/my-service.test.ts
import { MyService } from '@/domains/rag/services/my-service.js';

describe('MyService', () => {
  test('should process data correctly', () => {
    const service = new MyService();
    const result = service.processData('input');
    expect(result).toBe('expected');
  });
});
```

### Integration Tests
Test component interactions:

```typescript
// tests/integration/my-integration.test.ts
describe('MyIntegration', () => {
  test('should integrate components', async () => {
    // Setup components
    // Test integration
    // Assert results
  });
});
```

### E2E Tests
Test complete workflows:

```typescript
// tests/e2e/my-workflow.test.ts
describe('MyWorkflow', () => {
  test('should complete end-to-end workflow', async () => {
    // Start application
    // Execute workflow
    // Verify results
  });
});
```

## Code Style

### TypeScript
- Use strict mode
- Prefer interfaces over types for object shapes
- Use explicit return types for public methods
- Use meaningful variable and function names

### Imports
```typescript
// Absolute imports from src
import { MyService } from '@/domains/rag/services/my-service.js';

// Always include .js extension for local files
import { utils } from './utils.js';
```

### Error Handling
```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error instanceof Error ? error : new Error(String(error)));
  throw new AppError('Operation failed', 'OPERATION_ERROR', 500);
}
```

### Logging
```typescript
import { logger } from '@/shared/logger/index.js';

logger.info('Operation started', {
  component: 'MyService',
  operation: 'processData',
  input: data
});
```

## Debugging

### Enable Debug Logging
```bash
export LOG_LEVEL=debug
yarn dev
```

### VS Code Debugging
Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug RAG Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/app/index.js",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "preLaunchTask": "yarn build"
    }
  ]
}
```

### Performance Profiling
```bash
# Enable profiling
export NODE_OPTIONS="--prof"
yarn start

# Generate profile report
node --prof-process isolate-*.log > profile.txt
```

## Contributing

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run the full test suite
5. Submit pull request

### Code Review Checklist
- [ ] Tests added for new functionality
- [ ] Documentation updated
- [ ] TypeScript types are correct
- [ ] Error handling is appropriate
- [ ] Logging is meaningful
- [ ] Performance impact considered

### Commit Messages
Use conventional commit format:
```
feat: add new embedding provider
fix: resolve search performance issue
docs: update API documentation
test: add integration tests for MCP server
```

---

**Happy coding!** Check the [API Reference](API_REFERENCE.md) for implementation details.