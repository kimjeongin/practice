#!/usr/bin/env node

/**
 * Test script for the new LangGraph Agent system
 * Run this to verify the refactoring worked correctly
 */

const { testAgentSystem, demoAgentCapabilities } = require('./src/lib/agent/index')

async function runTests() {
  console.log('🧪 Starting LangGraph Agent System Tests...\n')

  try {
    // Test 1: Basic system test
    console.log('=== Test 1: Basic System Test ===')
    await testAgentSystem()
    console.log('✅ Basic system test passed\n')

    // Test 2: Demo capabilities
    console.log('=== Test 2: Agent Capabilities Demo ===')
    await demoAgentCapabilities()
    console.log('✅ Agent capabilities demo passed\n')

    console.log('🎉 All tests passed! LangGraph Agent system is working correctly.')
  } catch (error) {
    console.error('❌ Tests failed:', error)
    process.exit(1)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Test execution failed:', error)
    process.exit(1)
  })
}

module.exports = { runTests }
