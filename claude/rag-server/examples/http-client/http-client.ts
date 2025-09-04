#!/usr/bin/env node

/**
 * Streamable HTTP Transport MCP Client Example (TypeScript)
 *
 * This client connects to the MCP server using streamable HTTP transport.
 * The server should be running on HTTP before connecting.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function testStreamableHTTPClient(): Promise<void> {
  console.log('🔗 Starting streamable-http MCP client test...\n')

  let client: Client | null = null

  try {
    // 1. Create streamable HTTP transport
    const serverUrl = 'http://localhost:3000/mcp'
    console.log(`📡 Connecting to server: ${serverUrl}`)

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl))

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
    )

    console.log('🔌 Connecting to server...')
    await client.connect(transport)
    console.log('✅ Connected successfully!\n')

    // 3. Test list tools
    console.log('🔍 Testing tools/list...')
    const toolsResult = await client.listTools()
    console.log('📋 Available tools:', toolsResult.tools)
    console.log('')

    // 5. Test search tool if available
    if (toolsResult.tools.some((t) => t.name === 'search')) {
      console.log('🔎 Testing search tool...')
      try {
        const startTime = performance.now()
        const searchResult = await client.callTool({
          name: 'search',
          arguments: {
            query: 'python programming',
            limit: 3,
          },
        })
        const endTime = performance.now()
        const toolCallDuration = endTime - startTime

        console.log(`⏱️  Tool call duration: ${toolCallDuration.toFixed(2)}ms`)

        if (searchResult.content && searchResult.content[0] && 'text' in searchResult.content[0]) {
          const result = JSON.parse((searchResult.content[0] as any).text) as any
          console.log('🎯 Search results:', {
            totalResults: result.results?.length || 0,
            query: result.query,
            searchTime: result.searchTime,
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
            firstResult: [
              ...result.results.map((res) => ({
                filename: res.source?.filename,
                vector_score: res.vector_score,
                reranking_score: res.reranking_score,
              })),
            ],
          })
        }
      } catch (error) {
        console.log('⚠️  Search test failed:', (error as Error).message)
      }
      console.log('')
    }

    // 8. Test get_vectordb_info tool
    if (toolsResult.tools.some((t) => t.name === 'get_vectordb_info')) {
      console.log('🗄️  Testing get_vectordb_info tool...')
      try {
        const startTime = performance.now()
        const vectordbResult = await client.callTool({
          name: 'get_vectordb_info',
          arguments: {},
        })
        const endTime = performance.now()
        const toolCallDuration = endTime - startTime
        
        console.log(`⏱️  Tool call duration: ${toolCallDuration.toFixed(2)}ms`)
        console.log(vectordbResult)

        if (
          vectordbResult.content &&
          vectordbResult.content[0] &&
          'text' in vectordbResult.content[0]
        ) {
          const result = JSON.parse((vectordbResult.content[0] as any).text) as any
          console.log('🎯 VectorDB info results:', {
            vectordb: result.vectordb_info?.vectordb || 'unknown',
            totalFiles: result.vectordb_info?.totalFiles || 0,
            totalVectors: result.vectordb_info?.totalVectors || 0,
            dimensions: result.vectordb_info?.dimensions || 0,
            modelName: result.vectordb_info?.modelName || 'unknown',
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
          })
        }
      } catch (error) {
        console.log('⚠️  get_vectordb_info test failed:', (error as Error).message)
      }
      console.log('')
    }

    console.log('✅ streamable-http transport test completed successfully!')
  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message)
    console.error('💡 Make sure the server is running with:')
    console.error('   MCP_TRANSPORT=streamable-http yarn start')
    process.exit(1)
  } finally {
    // Cleanup
    if (client) {
      try {
        await client.close()
        console.log('🔌 Client disconnected')
      } catch (e) {
        console.log('⚠️  Error closing client:', (e as Error).message)
      }
    }
  }
}

// Run the test
testStreamableHTTPClient().catch(console.error)
