#!/usr/bin/env node

/**
 * Quick test script to verify initialization fixes
 */

const { initializeAgentSystem } = require('./out/main/index.js').default || require('./out/main/index.js');

async function testInitialization() {
  console.log('🧪 Testing Agent System Initialization...')

  try {
    console.log('🚀 Starting initialization test...')

    // Test multiple rapid initialization calls (should not cause loops)
    const promises = [
      initializeAgentSystem(),
      initializeAgentSystem(),
      initializeAgentSystem(),
    ]

    const results = await Promise.all(promises)

    console.log('✅ All initialization calls completed')
    console.log(`📊 Results: ${results.length} successful initializations`)

    // Check if tools are available
    const agent = results[0].agent
    const tools = agent.getAvailableTools()

    console.log(`🔧 Available tools: ${tools.length}`)
    if (tools.length > 0) {
      console.log(`📋 Tool names: ${tools.map(t => t.name).join(', ')}`)
    }

    // Cleanup
    await agent.cleanup()
    console.log('🧹 Cleanup completed')

    console.log('✅ Test passed: No infinite loops detected!')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Only run if this is the main module
if (require.main === module) {
  testInitialization()
}