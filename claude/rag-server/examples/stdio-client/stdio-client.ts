#!/usr/bin/env node

/**
 * Stdio Transport MCP Client Example (TypeScript)
 *
 * This client connects to the MCP server using stdio transport.
 * The server will be spawned as a child process for testing tools.
 */

import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function testStdioClient(): Promise<void> {
  console.log('🔗 Starting stdio MCP client test...\n')

  let client: Client | null = null

  try {
    // 1. Create stdio transport
    console.log('📡 Creating stdio transport...')

    // Resolve absolute path to the server entry point
    const serverPath = resolve(__dirname, '../../../dist/app/index.js')
    console.log('📁 Server path:', serverPath)

    // Check if server file exists
    try {
      await import('fs/promises').then((fs) => fs.access(serverPath))
    } catch (error) {
      throw new Error(
        `Server file not found: ${serverPath}\nPlease run 'yarn build' from the project root first.`
      )
    }

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        NODE_ENV: 'development',
        DATA_DIR: '/Users/jeongin/workspace/practice/claude/rag-server/.data',
        DOCUMENTS_DIR: '/Users/jeongin/workspace/practice/claude/rag-server/documents',
        LOG_LEVEL: 'info',
        CHUNK_SIZE: '400',
        CHUNK_OVERLAP: '100',
        CHUNKING_STRATEGY: 'normal',
        CONTEXTUAL_CHUNKING_MODEL: 'qwen3:0.6b',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        EMBEDDING_MODEL: 'qllama/multilingual-e5-large-instruct:latest',
        LANCEDB_URI: '/Users/jeongin/workspace/practice/claude/rag-server/.data/lancedb',
        MCP_TRANSPORT: 'stdio',
        MAX_CONCURRENT_PROCESSING: '3',
        MIN_CHUNK_SIZE: '300',
        MAX_ERROR_HISTORY: '1000',
      },
    })

    // 2. Create and connect client
    client = new Client(
      {
        name: 'stdio-test-client',
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

    // Set connection timeout
    const connectTimeout = setTimeout(() => {
      throw new Error('Connection timeout after 10 seconds. Server may not be starting properly.')
    }, 100000)

    try {
      await client.connect(transport)
      clearTimeout(connectTimeout)
      console.log('✅ Connected successfully!\n')
    } catch (error) {
      clearTimeout(connectTimeout)
      throw error
    }

    // 3. Test list tools
    console.log('🔍 Testing tools/list...')
    const toolsResult = await client.listTools()
    console.log('📋 Available tools:', toolsResult.tools)
    console.log('')

    // 4. Test get_vectordb_info tool
    if (toolsResult.tools.some((t) => t.name === 'get_vectordb_info')) {
      console.log('🗄️  Testing get_vectordb_info tool...')
      console.log(
        '📝 Tool description:',
        toolsResult.tools.find((t) => t.name === 'get_vectordb_info')?.description
      )
      try {
        const startTime = performance.now()
        const vectordbResult = await client.callTool({
          name: 'get_vectordb_info',
          arguments: {},
        })
        const endTime = performance.now()
        const toolCallDuration = endTime - startTime

        console.log(`⏱️  Tool call duration: ${toolCallDuration.toFixed(2)}ms`)

        if (
          vectordbResult.content &&
          vectordbResult.content[0] &&
          'text' in vectordbResult.content[0]
        ) {
          const result = JSON.parse((vectordbResult.content[0] as any).text) as any
          console.log('🎯 RAG System Info:', {
            provider: result.vectordb_info?.provider || 'unknown',
            isHealthy: result.vectordb_info?.isHealthy || false,
            documentCount: result.vectordb_info?.documentCount || 0,
            ragSystemInfo: result.rag_system_info ? 'available' : 'unavailable',
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
          })

          if (result.rag_system_info) {
            console.log('📊 RAG Components:', {
              vectorStore: result.rag_system_info.vectorStore?.isHealthy
                ? '✅ healthy'
                : '❌ unhealthy',
            })
          }
        }
      } catch (error) {
        console.log('⚠️  get_vectordb_info test failed:', (error as Error).message)
      }
      console.log('')
    }

    // 5. Test search tool if available
    if (toolsResult.tools.some((t) => t.name === 'search')) {
      console.log('🔎 Testing search tool...')
      console.log(
        '📝 Tool description:',
        toolsResult.tools.find((t) => t.name === 'search')?.description
      )

      // Test basic search first
      console.log('🔍 Running basic search test...')
      try {
        const startTime = performance.now()
        const searchResult = await client.callTool({
          name: 'search',
          arguments: {
            query: 'python programming',
            topK: 3,
            searchType: 'semantic',
          },
        })
        const endTime = performance.now()
        const toolCallDuration = endTime - startTime

        console.log(`⏱️  Tool call duration: ${toolCallDuration.toFixed(2)}ms`)

        if (searchResult.content && searchResult.content[0] && 'text' in searchResult.content[0]) {
          const result = JSON.parse((searchResult.content[0] as any).text) as any
          console.log('🎯 Search results:', {
            query: result.query,
            totalResults: result.results_count || 0,
            searchType: result.search_info?.search_type || 'unknown',
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
          })

          if (result.results && result.results.length > 0) {
            console.log('📄 Sample result:', {
              rank: result.results[0].rank,
              filename: result.results[0].source?.filename,
              searchType: result.results[0].search_type,
              contentPreview: result.results[0].content?.substring(0, 100) + '...',
            })
          }
        }
      } catch (error) {
        console.log('⚠️  Basic search test failed:', (error as Error).message)
      }

      try {
        // Test semantic search
        console.log('🔍 Running semantic search test...')
        const startTime = performance.now()
        const searchResult = await client.callTool({
          name: 'search',
          arguments: {
            query: 'error handling patterns',
            topK: 5,
            searchType: 'semantic',
          },
        })
        const endTime = performance.now()
        const toolCallDuration = endTime - startTime

        console.log(`⏱️  Search tool call duration: ${toolCallDuration.toFixed(2)}ms`)

        if (searchResult.content && searchResult.content[0] && 'text' in searchResult.content[0]) {
          const result = JSON.parse((searchResult.content[0] as any).text) as any
          console.log('🎯 Search results:', {
            query: result.query,
            totalResults: result.results_count || 0,
            searchType: result.search_info?.search_type || 'unknown',
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
          })

          if (result.results && result.results.length > 0) {
            console.log('📄 Sample result:', {
              rank: result.results[0].rank,
              filename: result.results[0].source?.filename,
              searchType: result.results[0].search_type,
            })
          }
        }
      } catch (error) {
        console.log('⚠️  Search test failed:', (error as Error).message)
      }
      console.log('')
    }

    console.log('✅ stdio transport test completed successfully!')

    // Additional search tests with predefined queries
    if (toolsResult.tools.some((t) => t.name === 'search')) {
      console.log('\n🔍 Running additional search tests with predefined queries...')

      const testQueries = [
        'machine learning algorithms',
        'database configuration',
        'API documentation',
        'error handling best practices',
        'security guidelines',
      ]

      for (let i = 0; i < testQueries.length; i++) {
        const query = testQueries[i]
        console.log(`\n📝 Test ${i + 1}/${testQueries.length}: "${query}"`)

        try {
          const startTime = performance.now()
          const searchResult = await client.callTool({
            name: 'search',
            arguments: {
              query,
              topK: 3,
              searchType: 'semantic',
            },
          })
          const endTime = performance.now()
          const duration = endTime - startTime

          if (
            searchResult.content &&
            searchResult.content[0] &&
            'text' in searchResult.content[0]
          ) {
            const result = JSON.parse((searchResult.content[0] as any).text) as any

            console.log(`   ⏱️  Duration: ${duration.toFixed(2)}ms`)
            console.log(`   📊 Results: ${result.results_count || 0}`)
            console.log(`   🔍 Type: ${result.search_info?.search_type || 'unknown'}`)

            if (result.results && result.results.length > 0) {
              const topResult = result.results[0]
              console.log(
                `   🎯 Top match: ${topResult.source?.filename || 'Unknown'} (Type: ${
                  topResult.search_type || 'N/A'
                })`
              )
            } else {
              console.log(`   📄 No results found`)
            }
          }
        } catch (error) {
          console.log(`   ❌ Search failed: ${(error as Error).message}`)
        }
      }

      console.log('\n✅ Additional search tests completed!')
    }

    console.log('\n💡 For interactive search, use the HTTP client instead:')
    console.log('   cd ../http-client && yarn dev')
  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message)
    console.error('💡 Make sure the server is built with:')
    console.error('   yarn build')
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
testStdioClient().catch(console.error)
