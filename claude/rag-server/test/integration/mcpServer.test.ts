import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { MCPServer } from '../../src/mcp/server/mcpServer.js';
import { createMockConfig, createMockFile, removeMockFile } from '../helpers/testHelpers.js';
import { SAMPLE_DOCUMENTS } from '../fixtures/sample-documents.js';

describe('MCP Server Integration Tests', () => {
  let mcpServer: MCPServer;
  let testConfig: any;
  let testFiles: string[] = [];

  beforeEach(async () => {
    testConfig = {
      ...createMockConfig(),
      database: {
        path: ':memory:'
      }
    };

    mcpServer = new MCPServer(testConfig);
    await mcpServer.initialize();
  });

  afterEach(async () => {
    await mcpServer.shutdown();
    
    // Clean up test files
    testFiles.forEach(filePath => {
      removeMockFile(filePath);
    });
    testFiles = [];
  });

  describe('MCP protocol compliance', () => {
    test('should initialize MCP server properly', async () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer.server).toBeInstanceOf(Server);
    });

    test('should list available tools', async () => {
      const tools = await mcpServer.listTools();
      
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('search_documents');
      expect(toolNames).toContain('add_document');
      expect(toolNames).toContain('remove_document');
      expect(toolNames).toContain('list_documents');
    });

    test('should provide tool schemas', async () => {
      const tools = await mcpServer.listTools();
      
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      });
    });
  });

  describe('document management tools', () => {
    test('should add document via MCP tool', async () => {
      const testFile = createMockFile('mcp-test.txt', SAMPLE_DOCUMENTS.simple.content);
      testFiles.push(testFile);

      const result = await mcpServer.callTool('add_document', {
        filePath: testFile
      });

      expect(result.isError).toBe(false);
      expect(result.content).toContain('successfully');
    });

    test('should list documents via MCP tool', async () => {
      // Add a test document first
      const testFile = createMockFile('list-test.txt', SAMPLE_DOCUMENTS.technical.content);
      testFiles.push(testFile);

      await mcpServer.callTool('add_document', {
        filePath: testFile
      });

      // List documents
      const result = await mcpServer.callTool('list_documents', {});

      expect(result.isError).toBe(false);
      expect(result.content).toContain('list-test.txt');
    });

    test('should remove document via MCP tool', async () => {
      // Add a test document first
      const testFile = createMockFile('remove-test.txt', SAMPLE_DOCUMENTS.simple.content);
      testFiles.push(testFile);

      await mcpServer.callTool('add_document', {
        filePath: testFile
      });

      // Remove the document
      const result = await mcpServer.callTool('remove_document', {
        filePath: testFile
      });

      expect(result.isError).toBe(false);
      expect(result.content).toContain('removed');

      // Verify it's no longer listed
      const listResult = await mcpServer.callTool('list_documents', {});
      expect(listResult.content).not.toContain('remove-test.txt');
    });
  });

  describe('search tools', () => {
    beforeEach(async () => {
      // Set up test documents
      const files = [
        createMockFile('search1.txt', SAMPLE_DOCUMENTS.technical.content),
        createMockFile('search2.txt', SAMPLE_DOCUMENTS.simple.content)
      ];
      
      testFiles.push(...files);

      for (const file of files) {
        await mcpServer.callTool('add_document', { filePath: file });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    test('should search documents via MCP tool', async () => {
      const result = await mcpServer.callTool('search_documents', {
        query: 'vector databases',
        topK: 3
      });

      expect(result.isError).toBe(false);
      
      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveProperty('results');
      expect(content.results).toBeInstanceOf(Array);
      expect(content.results.length).toBeGreaterThan(0);
      expect(content.results[0]).toHaveProperty('content');
      expect(content.results[0]).toHaveProperty('score');
    });

    test('should handle different search options', async () => {
      const result = await mcpServer.callTool('search_documents', {
        query: 'simple test',
        topK: 5,
        useSemanticSearch: false,
        fileTypes: ['text/plain']
      });

      expect(result.isError).toBe(false);
      
      const content = JSON.parse(result.content[0].text);
      expect(content.results).toBeInstanceOf(Array);
    });

    test('should handle empty search results', async () => {
      const result = await mcpServer.callTool('search_documents', {
        query: 'nonexistent content xyz123',
        topK: 5
      });

      expect(result.isError).toBe(false);
      
      const content = JSON.parse(result.content[0].text);
      expect(content.results).toBeInstanceOf(Array);
      expect(content.results.length).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle invalid tool names', async () => {
      const result = await mcpServer.callTool('invalid_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    test('should handle missing required parameters', async () => {
      const result = await mcpServer.callTool('add_document', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('filePath');
    });

    test('should handle invalid file paths', async () => {
      const result = await mcpServer.callTool('add_document', {
        filePath: '/nonexistent/path/file.txt'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
    });

    test('should handle malformed search parameters', async () => {
      const result = await mcpServer.callTool('search_documents', {
        query: 'test',
        topK: 'invalid'
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('system tools', () => {
    test('should get system status', async () => {
      const result = await mcpServer.callTool('get_system_status', {});

      expect(result.isError).toBe(false);
      
      const status = JSON.parse(result.content[0].text);
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('documents');
      expect(status).toHaveProperty('embedding_provider');
      expect(status).toHaveProperty('vector_store');
    });

    test('should get model information', async () => {
      const result = await mcpServer.callTool('get_model_info', {});

      expect(result.isError).toBe(false);
      
      const info = JSON.parse(result.content[0].text);
      expect(info).toHaveProperty('embedding_model');
      expect(info).toHaveProperty('embedding_provider');
    });
  });

  describe('concurrent operations', () => {
    test('should handle concurrent tool calls', async () => {
      const testFiles = Array.from({ length: 3 }, (_, i) => 
        createMockFile(`concurrent-mcp-${i}.txt`, `Content ${i}`)
      );
      
      this.testFiles.push(...testFiles);

      // Execute multiple tool calls concurrently
      const promises = testFiles.map(file => 
        mcpServer.callTool('add_document', { filePath: file })
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.isError).toBe(false);
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // All documents should be searchable
      for (let i = 0; i < testFiles.length; i++) {
        const searchResult = await mcpServer.callTool('search_documents', {
          query: `Content ${i}`,
          topK: 1
        });

        expect(searchResult.isError).toBe(false);
        const content = JSON.parse(searchResult.content[0].text);
        expect(content.results.length).toBeGreaterThan(0);
      }
    }, 30000);

    test('should handle rapid search requests', async () => {
      // Add a test document
      const testFile = createMockFile('rapid-search.txt', SAMPLE_DOCUMENTS.technical.content);
      testFiles.push(testFile);

      await mcpServer.callTool('add_document', { filePath: testFile });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Execute multiple search requests rapidly
      const searchPromises = Array.from({ length: 5 }, () =>
        mcpServer.callTool('search_documents', {
          query: 'vector',
          topK: 3
        })
      );

      const results = await Promise.all(searchPromises);

      // All searches should succeed
      results.forEach(result => {
        expect(result.isError).toBe(false);
      });
    });
  });
});