#!/usr/bin/env node

/**
 * Stdio Transport MCP Client Example (TypeScript)
 * 
 * This client connects to the MCP server using stdio transport.
 * The server will be spawned as a child process and includes interactive search.
 */

import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import * as process from 'process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function testStdioClient(): Promise<void> {
  console.log('🔗 Starting stdio MCP client test...\n')

  let client: Client | null = null

  try {
    // 1. Create stdio transport
    console.log('📡 Creating stdio transport...')
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../../../dist/app/index.js'],
      cwd: __dirname,
      env: {
        ...process.env,
        MCP_TRANSPORT: 'stdio'
      }
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
    await client.connect(transport)
    console.log('✅ Connected successfully!\n')

    // 3. Test list tools
    console.log('🔍 Testing tools/list...')
    const toolsResult = await client.listTools()
    console.log('📋 Available tools:', toolsResult.tools)
    console.log('')

    // 4. Test get_vectordb_info tool
    if (toolsResult.tools.some((t) => t.name === 'get_vectordb_info')) {
      console.log('🗄️  Testing get_vectordb_info tool...')
      console.log('📝 Tool description:', toolsResult.tools.find(t => t.name === 'get_vectordb_info')?.description)
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
              vectorStore: result.rag_system_info.vectorStore?.isHealthy ? '✅ healthy' : '❌ unhealthy',
              embeddingService: result.rag_system_info.embeddingService?.isHealthy ? '✅ healthy' : '❌ unhealthy',
              rerankingService: result.rag_system_info.rerankingService?.isHealthy ? '✅ healthy' : '❌ unhealthy',
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
      console.log('📝 Tool description:', toolsResult.tools.find(t => t.name === 'search')?.description)
      
      // Test basic search first
      console.log('🔍 Running basic search test...')
      try {
        const startTime = performance.now()
        const searchResult = await client.callTool({
          name: 'search',
          arguments: {
            query: 'configuration settings',
            topK: 3,
            enableReranking: false,
            scoreThreshold: 0.3,
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
            searchMethod: result.search_info?.search_method || 'unknown',
            scoreThreshold: result.search_info?.score_threshold || 0,
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
          })
          
          if (result.results && result.results.length > 0) {
            console.log('📄 Sample result:', {
              rank: result.results[0].rank,
              filename: result.results[0].source?.filename,
              vectorScore: result.results[0].vector_score,
              rerankingScore: result.results[0].reranking_score,
              contentPreview: result.results[0].content?.substring(0, 100) + '...',
            })
          }
        }
      } catch (error) {
        console.log('⚠️  Basic search test failed:', (error as Error).message)
      }
      
      // Test reranking search
      console.log('🔍 Running reranking search test...')
      try {
        const startTime = performance.now()
        const searchResult = await client.callTool({
          name: 'search',
          arguments: {
            query: 'error handling patterns',
            topK: 5,
            enableReranking: true,
            scoreThreshold: 0.2,
          },
        })
        const endTime = performance.now()
        const toolCallDuration = endTime - startTime

        console.log(`⏱️  Reranking tool call duration: ${toolCallDuration.toFixed(2)}ms`)

        if (searchResult.content && searchResult.content[0] && 'text' in searchResult.content[0]) {
          const result = JSON.parse((searchResult.content[0] as any).text) as any
          console.log('🎯 Reranking search results:', {
            query: result.query,
            totalResults: result.results_count || 0,
            searchMethod: result.search_info?.search_method || 'unknown',
            rerankingEnabled: result.search_info?.reranking_enabled || false,
            toolCallTime: `${toolCallDuration.toFixed(2)}ms`,
          })
          
          if (result.results && result.results.length > 0) {
            console.log('📄 Top reranked result:', {
              rank: result.results[0].rank,
              filename: result.results[0].source?.filename,
              vectorScore: result.results[0].vector_score,
              rerankingScore: result.results[0].reranking_score,
            })
          }
        }
      } catch (error) {
        console.log('⚠️  Reranking search test failed:', (error as Error).message)
      }
      console.log('')
    }


    console.log('✅ stdio transport test completed successfully!')
    
    // Start interactive search if search tool is available
    if (toolsResult.tools.some((t) => t.name === 'search')) {
      console.log('\n🔍 Starting interactive search mode...')
      console.log('💡 Commands:')
      console.log('   • Type a search query to search')
      console.log('   • Type "help" for more information') 
      console.log('   • Type "exit" to quit')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      await startInteractiveSearch(client)
    }
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

async function startInteractiveSearch(client: Client): Promise<void> {
  const searchOptions = {
    topK: 5,
    enableReranking: false,
    scoreThreshold: 0.3,
  }

  const askQuestion = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      process.stdout.write(question)
      
      const onData = (data: string) => {
        const input = data.toString().trim()
        process.stdin.removeListener('data', onData)
        resolve(input)
      }
      
      process.stdin.on('data', onData)
    })
  }

  const performSearch = async (query: string): Promise<void> => {
    console.log(`🔍 Searching for: "${query}"`)
    console.log('⏳ Processing...')

    try {
      const startTime = performance.now()
      const searchResult = await client.callTool({
        name: 'search',
        arguments: {
          query: query.trim(),
          topK: searchOptions.topK,
          enableReranking: searchOptions.enableReranking,
          scoreThreshold: searchOptions.scoreThreshold,
        },
      })
      const endTime = performance.now()
      const duration = endTime - startTime

      if (searchResult.content && searchResult.content[0] && 'text' in searchResult.content[0]) {
        const result = JSON.parse((searchResult.content[0] as any).text) as any

        console.log(`\n🎯 Search Results (${duration.toFixed(2)}ms):`)
        console.log(`   Query: "${result.query}"`)
        console.log(`   Results: ${result.results_count || 0}`)
        console.log(`   Method: ${result.search_info?.search_method || 'unknown'}`)

        if (result.results && result.results.length > 0) {
          console.log('\n📄 Results:')
          result.results.forEach((res: any, index: number) => {
            console.log(`\n${index + 1}. ${res.source?.filename || 'Unknown file'}`)
            console.log(`   Score: ${res.vector_score?.toFixed(3) || 'N/A'}`)
            if (res.reranking_score !== undefined) {
              console.log(`   Rerank: ${res.reranking_score.toFixed(3)}`)
            }
            console.log(`   Content: ${res.content?.substring(0, 150)}${res.content?.length > 150 ? '...' : ''}`)
          })
        } else {
          console.log('\n📄 No results found')
        }
      }
    } catch (error) {
      console.log(`❌ Search failed: ${(error as Error).message}`)
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }

  const showHelp = (): void => {
    console.log('\n🔍 Interactive Search Help:')
    console.log('   • [query text] - Perform semantic search')
    console.log('   • help         - Show this help message')  
    console.log('   • exit         - Quit the application')
    console.log('\n💡 Current settings:')
    console.log(`   • topK: ${searchOptions.topK}`)
    console.log(`   • reranking: ${searchOptions.enableReranking}`)
    console.log(`   • threshold: ${searchOptions.scoreThreshold}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }

  process.stdin.setEncoding('utf8')

  while (true) {
    const input = await askQuestion('\n🔍 Enter search query (or "help", "exit"): ')
    const trimmedInput = input.trim().toLowerCase()

    if (trimmedInput === 'exit') {
      console.log('\n👋 Goodbye!')
      break
    } else if (trimmedInput === 'help') {
      showHelp()
    } else if (trimmedInput === '') {
      console.log('⚠️  Please enter a search query or command')
    } else {
      await performSearch(input.trim())
    }
  }
}

// Run the test
testStdioClient().catch(console.error)