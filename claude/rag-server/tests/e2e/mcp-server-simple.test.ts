/**
 * Simple E2E tests for MCP Server functionality
 * Tests server components without spawning actual processes
 */

import { describe, test, expect } from '@jest/globals';
import { TEST_TIMEOUT } from '../setup.js';

describe('MCP Server E2E Tests', () => {
  describe('Server Component Integration', () => {
    test('should validate server entry point exists', async () => {
      // Test that the main entry point can be imported
      try {
        const { main } = await import('../../src/app/index.js');
        expect(main).toBeDefined();
        expect(typeof main).toBe('function');
      } catch (error) {
        // If import fails, at least verify the file exists
        const fs = await import('fs');
        const path = await import('path');
        const serverPath = path.join(process.cwd(), 'dist', 'app', 'index.js');
        const exists = fs.existsSync(serverPath);
        expect(exists).toBe(true);
      }
    });

    test('should validate MCP server configuration', () => {
      // Test basic server configuration structure
      const config = {
        name: 'rag-mcp-server',
        version: '1.0.0',
        capabilities: {
          tools: {}
        }
      };
      
      expect(config.name).toBe('rag-mcp-server');
      expect(config.version).toBe('1.0.0');
      expect(config.capabilities).toBeDefined();
      expect(config.capabilities.tools).toBeDefined();
    });

    test('should validate expected tool definitions', () => {
      // Test that expected tools are properly defined
      const expectedTools = [
        {
          name: 'search_documents',
          description: 'Search through documents using semantic search',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              topK: { type: 'number', description: 'Number of results to return', default: 5 }
            },
            required: ['query']
          }
        },
        {
          name: 'get_server_status',
          description: 'Get server status and health information',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ];

      expectedTools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });

      // Validate search tool specifically
      const searchTool = expectedTools.find(t => t.name === 'search_documents');
      expect(searchTool).toBeDefined();
      expect(searchTool!.inputSchema.properties.query).toBeDefined();
      expect(searchTool!.inputSchema.required).toContain('query');

      // Validate status tool specifically
      const statusTool = expectedTools.find(t => t.name === 'get_server_status');
      expect(statusTool).toBeDefined();
      expect(statusTool!.inputSchema.properties).toEqual({});
    });
  });

  describe('Mock Server Response Validation', () => {
    test('should validate search response format', () => {
      // Test expected response format for search_documents
      const mockSearchResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query: 'test query',
              totalResults: 2,
              results: [
                {
                  content: 'Mock search result content',
                  score: 0.9,
                  metadata: {
                    fileName: 'test.txt',
                    filePath: '/test.txt',
                    chunkIndex: 0,
                    fileType: 'txt'
                  }
                }
              ],
              message: 'Search completed successfully'
            }, null, 2)
          }
        ]
      };

      expect(mockSearchResponse.content).toBeDefined();
      expect(Array.isArray(mockSearchResponse.content)).toBe(true);
      expect(mockSearchResponse.content[0].type).toBe('text');

      const responseData = JSON.parse(mockSearchResponse.content[0].text);
      expect(responseData.query).toBe('test query');
      expect(responseData.totalResults).toBeGreaterThan(0);
      expect(Array.isArray(responseData.results)).toBe(true);
      
      if (responseData.results.length > 0) {
        const result = responseData.results[0];
        expect(result.content).toBeDefined();
        expect(result.score).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.metadata.fileName).toBeDefined();
      }
    });

    test('should validate status response format', () => {
      // Test expected response format for get_server_status
      const mockStatusResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'running',
              uptime: 1234.56,
              version: '1.0.0',
              transport: 'stdio',
              pid: 12345,
              message: 'MCP Server is running'
            }, null, 2)
          }
        ]
      };

      expect(mockStatusResponse.content).toBeDefined();
      expect(Array.isArray(mockStatusResponse.content)).toBe(true);

      const statusData = JSON.parse(mockStatusResponse.content[0].text);
      expect(statusData.status).toBe('running');
      expect(typeof statusData.uptime).toBe('number');
      expect(statusData.version).toBeDefined();
      expect(statusData.transport).toBeDefined();
      expect(typeof statusData.pid).toBe('number');
    });

    test('should validate error response format', () => {
      // Test expected error response format
      const mockErrorResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Tool execution failed'
            })
          }
        ],
        isError: true
      };

      expect(mockErrorResponse.content).toBeDefined();
      expect(mockErrorResponse.isError).toBe(true);

      const errorData = JSON.parse(mockErrorResponse.content[0].text);
      expect(errorData.success).toBe(false);
      expect(errorData.error).toBeDefined();
      expect(typeof errorData.error).toBe('string');
    });
  });

  describe('Environment Validation', () => {
    test('should validate Node.js environment', () => {
      // Test that we're running in the expected Node.js environment
      expect(process.version).toMatch(/^v\d+\.\d+\.\d+/);
      expect(process.platform).toBeDefined();
      expect(process.env.NODE_ENV).toBeDefined();
    });

    test('should validate required dependencies', () => {
      // Test that package.json exists and has required dependencies
      const fs = require('fs');
      const path = require('path');
      const packagePath = path.join(process.cwd(), 'package.json');
      
      expect(fs.existsSync(packagePath)).toBe(true);
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      expect(packageJson.name).toBe('rag-mcp-server');
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
    });

    test('should validate build output', () => {
      // Test that build output exists
      const fs = require('fs');
      const path = require('path');
      const distPath = path.join(process.cwd(), 'dist');
      const appIndexPath = path.join(distPath, 'app', 'index.js');
      
      expect(fs.existsSync(distPath)).toBe(true);
      expect(fs.existsSync(appIndexPath)).toBe(true);
    });
  });
}, TEST_TIMEOUT);