#!/usr/bin/env node

/**
 * Streamable HTTP Transport MCP Client Example
 * 
 * This client connects to the MCP server using streamable HTTP transport.
 * The server should be running on HTTP before connecting.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function testStreamableHTTPClient() {
  console.log('🔗 Starting streamable-http MCP client test...\n');

  let client = null;

  try {
    // 1. Create streamable HTTP transport
    const serverUrl = 'http://localhost:3000/mcp';
    console.log(`📡 Connecting to server: ${serverUrl}`);
    
    const transport = new StreamableHTTPClientTransport(serverUrl);

    // 2. Create and connect client
    client = new Client(
      {
        name: 'http-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          roots: { listChanged: false },
          sampling: {},
        },
      }
    );

    console.log('🔌 Connecting to server...');
    await client.connect(transport);
    console.log('✅ Connected successfully!\n');

    // 3. Test list tools
    console.log('🔍 Testing tools/list...');
    const toolsResult = await client.listTools();
    console.log('📋 Available tools:', toolsResult.tools.map(t => t.name));
    console.log('');

    // 4. Test resources
    console.log('📚 Testing resources/list...');
    try {
      const resourcesResult = await client.listResources();
      console.log('📁 Available resources:', resourcesResult.resources?.length || 0);
      if (resourcesResult.resources?.length > 0) {
        console.log('📄 First resource:', resourcesResult.resources[0].name);
      }
    } catch (error) {
      console.log('⚠️  Resources test failed:', error.message);
    }
    console.log('');

    // 5. Test search tool if available
    if (toolsResult.tools.some(t => t.name === 'search')) {
      console.log('🔎 Testing search tool...');
      try {
        const searchResult = await client.callTool('search', {
          query: 'python programming',
          limit: 3
        });
        
        if (searchResult.content && searchResult.content[0]) {
          const result = JSON.parse(searchResult.content[0].text);
          console.log('🎯 Search results:', {
            totalResults: result.results?.length || 0,
            query: result.query,
            searchTime: result.searchTime,
            firstResult: result.results?.[0] ? {
              filename: result.results[0].source?.filename,
              score: result.results[0].relevance_score
            } : 'No results'
          });
        }
      } catch (error) {
        console.log('⚠️  Search test failed:', error.message);
      }
      console.log('');
    }

    // 6. Test search_similar tool
    if (toolsResult.tools.some(t => t.name === 'search_similar')) {
      console.log('🔍 Testing search_similar tool...');
      try {
        const similarResult = await client.callTool('search_similar', {
          text: 'deep learning neural networks',
          limit: 2
        });
        
        if (similarResult.content && similarResult.content[0]) {
          const result = JSON.parse(similarResult.content[0].text);
          console.log('🎯 Similar search results:', {
            totalResults: result.results?.length || 0,
            inputText: result.text,
            firstResult: result.results?.[0]?.source?.filename || 'No results'
          });
        }
      } catch (error) {
        console.log('⚠️  search_similar test failed:', error.message);
      }
      console.log('');
    }

    // 7. Test prompts
    console.log('💬 Testing prompts/list...');
    try {
      const promptsResult = await client.listPrompts();
      console.log('📝 Available prompts:', promptsResult.prompts?.map(p => p.name) || []);
      
      if (promptsResult.prompts?.length > 0) {
        const promptName = promptsResult.prompts[0].name;
        console.log(`🎭 Testing prompt: ${promptName}...`);
        
        const promptResult = await client.getPrompt(promptName, {
          query: 'What is machine learning?'
        });
        console.log('💡 Prompt result messages:', promptResult.messages?.length || 0);
      }
    } catch (error) {
      console.log('⚠️  Prompts test failed:', error.message);
    }
    console.log('');

    console.log('✅ streamable-http transport test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('💡 Make sure the server is running with:');
    console.error('   MCP_TRANSPORT=streamable-http yarn start');
    process.exit(1);
  } finally {
    // Cleanup
    if (client) {
      try {
        await client.close();
        console.log('🔌 Client disconnected');
      } catch (e) {
        console.log('⚠️  Error closing client:', e.message);
      }
    }
  }
}

// Run the test
testStreamableHTTPClient().catch(console.error);