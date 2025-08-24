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

    // 4. Test resources
    console.log('📚 Testing resources/list...')
    try {
      const resourcesResult = await client.listResources()
      console.log('📁 Available resources:', resourcesResult.resources?.length || 0)
      console.log(resourcesResult)
      if (resourcesResult.resources?.length > 0) {
        console.log('📄 First resource:', resourcesResult.resources[0].name)
      }
    } catch (error) {
      console.log('⚠️  Resources test failed:', (error as Error).message)
    }
    console.log('')

    // 5. Test search tool if available
    if (toolsResult.tools.some((t) => t.name === 'search')) {
      console.log('🔎 Testing search tool...')
      try {
        const searchResult = await client.callTool({
          name: 'search',
          arguments: {
            query: 'python programming',
            limit: 3,
          },
        })
        console.log(searchResult)

        if (searchResult.content && searchResult.content[0] && 'text' in searchResult.content[0]) {
          const result = JSON.parse((searchResult.content[0] as any).text) as any
          console.log('🎯 Search results:', {
            totalResults: result.results?.length || 0,
            query: result.query,
            searchTime: result.searchTime,
            firstResult: result.results?.[0]
              ? {
                  filename: result.results[0].source?.filename,
                  score: result.results[0].relevance_score,
                }
              : 'No results',
          })
        }
      } catch (error) {
        console.log('⚠️  Search test failed:', (error as Error).message)
      }
      console.log('')
    }

    // 6. Test search_similar tool
    if (toolsResult.tools.some((t) => t.name === 'search_similar')) {
      console.log('🔍 Testing search_similar tool...')
      try {
        const similarResult = await client.callTool({
          name: 'search_similar',
          arguments: {
            reference_text: 'deep learning neural networks',
            limit: 2,
          },
        })
        console.log(similarResult)

        if (
          similarResult.content &&
          similarResult.content[0] &&
          'text' in similarResult.content[0]
        ) {
          const result = JSON.parse((similarResult.content[0] as any).text) as any
          console.log('🎯 Similar search results:', {
            totalResults: result.similar_documents?.length || 0,
            referenceText: result.reference_text,
            firstResult: result.similar_documents?.[0]?.source?.filename || 'No results',
          })
        }
      } catch (error) {
        console.log('⚠️  search_similar test failed:', (error as Error).message)
      }
      console.log('')
    }

    // 7. Test search_by_question tool
    if (toolsResult.tools.some((t) => t.name === 'search_by_question')) {
      console.log('❓ Testing search_by_question tool...')
      try {
        const questionResult = await client.callTool({
          name: 'search_by_question',
          arguments: {
            question: 'What are the key components of neural networks?',
            context_limit: 3,
          },
        })
        console.log(questionResult)

        if (
          questionResult.content &&
          questionResult.content[0] &&
          'text' in questionResult.content[0]
        ) {
          const result = JSON.parse((questionResult.content[0] as any).text) as any
          console.log('🎯 Question-based search results:', {
            question: result.question,
            confidence: result.confidence,
            contextChunks: result.context_chunks?.length || 0,
            contextFound: result.context_found,
            firstChunk: result.context_chunks?.[0]?.source?.filename || 'No context',
          })
        }
      } catch (error) {
        console.log('⚠️  search_by_question test failed:', (error as Error).message)
      }
      console.log('')
    }

    // 8. Test list_sources tool
    if (toolsResult.tools.some((t) => t.name === 'list_sources')) {
      console.log('📂 Testing list_sources tool...')
      try {
        const sourcesResult = await client.callTool({
          name: 'list_sources',
          arguments: {
            group_by: 'file_type',
            include_stats: true,
          },
        })
        console.log(sourcesResult)

        if (
          sourcesResult.content &&
          sourcesResult.content[0] &&
          'text' in sourcesResult.content[0]
        ) {
          const result = JSON.parse((sourcesResult.content[0] as any).text) as any
          console.log('🎯 Sources list results:', {
            totalSources: result.total_sources,
            fileTypes: Object.keys(result.sources_by_type || {}),
            firstSource: result.sources?.[0]?.name || 'No sources',
          })
        }
      } catch (error) {
        console.log('⚠️  list_sources test failed:', (error as Error).message)
      }
      console.log('')
    }

    // 9. Test prompts
    console.log('💬 Testing prompts/list...')
    try {
      const promptsResult = await client.listPrompts()
      console.log('📝 Available prompts:', promptsResult.prompts?.map((p) => p.name) || [])

      if (promptsResult.prompts?.length > 0) {
        const promptName = promptsResult.prompts[0].name
        console.log(`🎭 Testing prompt: ${promptName}...`)

        const promptResult = await client.getPrompt({
          name: promptName,
          arguments: {
            query: 'What is machine learning?',
          },
        })
        console.log('💡 Prompt result messages:', promptResult.messages?.length || 0)
      }
    } catch (error) {
      console.log('⚠️  Prompts test failed:', (error as Error).message)
    }
    console.log('')

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
