#!/usr/bin/env node

/**
 * SSE Transport MCP Client Example
 * 
 * This client connects to the MCP server using SSE (Server-Sent Events) transport.
 * The server should be running in SSE mode before connecting.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function testSSEClient() {
  console.log('🔗 Starting SSE MCP client test...\n');

  let client = null;

  try {
    // 1. Create SSE transport
    const serverUrl = 'http://localhost:3000';
    console.log(`📡 Connecting to server: ${serverUrl}`);
    
    const transport = new SSEClientTransport(serverUrl);

    // 2. Create and connect client
    client = new Client(
      {
        name: 'sse-test-client',
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

    // 4. Test search_by_question tool if available
    if (toolsResult.tools.some(t => t.name === 'search_by_question')) {
      console.log('❓ Testing search_by_question tool...');
      try {
        const questionResult = await client.callTool('search_by_question', {
          question: 'What are the basics of machine learning?',
          limit: 2
        });
        
        if (questionResult.content && questionResult.content[0]) {
          const result = JSON.parse(questionResult.content[0].text);
          console.log('🎯 Question-based search results:', {
            totalResults: result.results?.length || 0,
            question: result.question,
            firstResult: result.results?.[0] ? {
              filename: result.results[0].source?.filename,
              snippet: result.results[0].content?.substring(0, 100) + '...'
            } : 'No results'
          });
        }
      } catch (error) {
        console.log('⚠️  search_by_question test failed:', error.message);
      }
      console.log('');
    }

    // 5. Test list_sources tool
    if (toolsResult.tools.some(t => t.name === 'list_sources')) {
      console.log('📚 Testing list_sources tool...');
      try {
        const sourcesResult = await client.callTool('list_sources', {
          fileType: 'md'
        });
        
        if (sourcesResult.content && sourcesResult.content[0]) {
          const result = JSON.parse(sourcesResult.content[0].text);
          console.log('📁 Available sources (md files):', {
            totalSources: result.sources?.length || 0,
            firstSource: result.sources?.[0] ? {
              filename: result.sources[0].filename,
              type: result.sources[0].fileType
            } : 'No sources'
          });
        }
      } catch (error) {
        console.log('⚠️  list_sources test failed:', error.message);
      }
      console.log('');
    }

    // 6. Test regular search tool
    if (toolsResult.tools.some(t => t.name === 'search')) {
      console.log('🔎 Testing basic search tool...');
      try {
        const searchResult = await client.callTool('search', {
          query: 'data structures',
          limit: 1
        });
        
        if (searchResult.content && searchResult.content[0]) {
          const result = JSON.parse(searchResult.content[0].text);
          console.log('🎯 Basic search results:', {
            query: result.query,
            totalResults: result.results?.length || 0,
            executionTime: result.searchTime
          });
        }
      } catch (error) {
        console.log('⚠️  Basic search test failed:', error.message);
      }
      console.log('');
    }

    // 7. Test resources functionality
    console.log('📚 Testing resources/list...');
    try {
      const resourcesResult = await client.listResources();
      console.log('📁 Available resources:', resourcesResult.resources?.length || 0);
      
      if (resourcesResult.resources?.length > 0) {
        const firstResource = resourcesResult.resources[0];
        console.log('📄 Reading first resource:', firstResource.name);
        
        const resourceContent = await client.readResource(firstResource.uri);
        console.log('📖 Resource content length:', resourceContent.contents?.[0]?.text?.length || 0);
      }
    } catch (error) {
      console.log('⚠️  Resources test failed:', error.message);
    }
    console.log('');

    console.log('✅ SSE transport test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('💡 Make sure the server is running with:');
    console.error('   MCP_TRANSPORT=sse yarn start');
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
testSSEClient().catch(console.error);