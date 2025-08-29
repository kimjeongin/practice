#!/usr/bin/env node

/**
 * Simple test for list_sources functionality
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function testListSources() {
  console.log('🔗 Testing list_sources functionality...\n');

  let client = null;

  try {
    const serverUrl = 'http://localhost:3000/mcp';
    console.log(`📡 Connecting to server: ${serverUrl}`);

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    
    client = new Client(
      { name: 'sources-test-client', version: '1.0.0' },
      { capabilities: { roots: { listChanged: false }, sampling: {} } }
    );

    console.log('🔌 Connecting...');
    await client.connect(transport);
    console.log('✅ Connected!\n');

    // Test list_sources
    console.log('📂 Testing list_sources...');
    try {
      const sourcesResult = await client.callTool({
        name: 'list_sources',
        arguments: {
          include_stats: true,
          limit: 50
        }
      });

      if (sourcesResult.content && sourcesResult.content[0] && 'text' in sourcesResult.content[0]) {
        const result = JSON.parse(sourcesResult.content[0].text);
        
        console.log('🎯 Sources Results:');
        console.log(`   Total Sources: ${result.total_sources || 'Unknown'}`);
        
        if (result.sources && result.sources.length > 0) {
          console.log(`   First few sources:`);
          result.sources.slice(0, 5).forEach((source, i) => {
            console.log(`     ${i + 1}. ${source.name} (${source.file_type})`);
          });
        }
        
        if (result.stats) {
          console.log(`   Statistics:`);
          console.log(`     Total Files: ${result.stats.total_files}`);
          console.log(`     File Types: ${JSON.stringify(result.stats.file_types)}`);
        }
      } else {
        console.log('❌ Unexpected response format:', sourcesResult);
      }
      
    } catch (error) {
      console.log('❌ list_sources failed:', error.message);
    }

    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('🔌 Disconnected');
      } catch (e) {
        console.log('⚠️  Error closing:', e.message);
      }
    }
  }
}

testListSources().catch(console.error);