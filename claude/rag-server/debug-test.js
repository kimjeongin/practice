#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function testWithTimeout() {
  console.log('🔗 Testing with custom timeout...\n');

  let client = null;

  try {
    const serverUrl = 'http://localhost:3000/mcp';
    console.log(`📡 Connecting to server: ${serverUrl}`);

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    
    client = new Client(
      { name: 'debug-test-client', version: '1.0.0' },
      { capabilities: { roots: { listChanged: false }, sampling: {} } }
    );

    console.log('🔌 Connecting...');
    await client.connect(transport);
    console.log('✅ Connected!\n');

    // Test with very simple list_sources call first
    console.log('📂 Testing simple list_sources (no stats, limit 5)...');
    console.time('list_sources_simple');
    try {
      const sourcesResult = await client.callTool({
        name: 'list_sources',
        arguments: {
          limit: 5,
          include_stats: false
        }
      });

      console.timeEnd('list_sources_simple');
      
      if (sourcesResult.content && sourcesResult.content[0] && 'text' in sourcesResult.content[0]) {
        const result = JSON.parse(sourcesResult.content[0].text);
        console.log('✅ Simple list_sources succeeded:');
        console.log(`   Total Sources: ${result.total_sources}`);
        console.log(`   Returned: ${result.sources?.length || 0} sources`);
      } else {
        console.log('❌ Unexpected response format');
      }
      
    } catch (error) {
      console.timeEnd('list_sources_simple');
      console.log('❌ Simple list_sources failed:', error.message);
    }

    console.log('\n📊 Testing with stats (might be slower)...');
    console.time('list_sources_stats');
    try {
      const sourcesResult = await client.callTool({
        name: 'list_sources',
        arguments: {
          limit: 5,
          include_stats: true
        }
      });

      console.timeEnd('list_sources_stats');
      
      if (sourcesResult.content && sourcesResult.content[0] && 'text' in sourcesResult.content[0]) {
        const result = JSON.parse(sourcesResult.content[0].text);
        console.log('✅ Stats list_sources succeeded:');
        console.log(`   Total Sources: ${result.total_sources}`);
        console.log(`   Stats: ${result.stats ? 'Yes' : 'No'}`);
      }
      
    } catch (error) {
      console.timeEnd('list_sources_stats');
      console.log('❌ Stats list_sources failed:', error.message);
    }

    console.log('\n✅ Debug test completed!');
    
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

testWithTimeout().catch(console.error);