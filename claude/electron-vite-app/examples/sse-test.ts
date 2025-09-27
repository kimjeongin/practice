// SSE (Server-Sent Events) Test Examples
import { ExampleApiClient } from '../src/shared/http/example-client'

const client = new ExampleApiClient('http://localhost:3001')

async function testBasicSSE() {
  console.log('\n=== Testing Basic SSE ===')

  const eventSource = client.connectToEvents({
    onMessage: (event) => {
      console.log('📨 Received:', event)
    },
    onOpen: () => {
      console.log('✅ SSE connection opened')
    },
    onError: (error) => {
      console.log('❌ SSE error:', error)
    },
    onClose: () => {
      console.log('🔌 SSE connection closed')
    }
  })

  // Close connection after 10 seconds
  setTimeout(() => {
    ExampleApiClient.closeSSEConnection(eventSource)
  }, 10000)
}

async function testCustomSSE() {
  console.log('\n=== Testing Custom SSE ===')

  const eventSource = client.connectToCustomEvents(
    'Hello from custom SSE!', // custom message
    1000, // 1 second interval
    {
      onMessage: (event) => {
        console.log('📨 Custom received:', event)
      },
      onOpen: () => {
        console.log('✅ Custom SSE connection opened')
      },
      onError: (error) => {
        console.log('❌ Custom SSE error:', error)
      }
    }
  )

  // Close connection after 8 seconds
  setTimeout(() => {
    ExampleApiClient.closeSSEConnection(eventSource)
  }, 8000)
}

async function testProtectedSSE() {
  console.log('\n=== Testing Protected SSE ===')

  try {
    // First, login to get token
    const loginResult = await client.login({
      username: 'admin',
      password: 'password'
    })

    if (!loginResult.success) {
      console.log('❌ Login failed:', loginResult.error)
      return
    }

    console.log('✅ Login successful, connecting to protected SSE...')

    const eventSource = await client.connectToProtectedEvents({
      onMessage: (event) => {
        console.log('🔐 Protected received:', event)
      },
      onOpen: () => {
        console.log('✅ Protected SSE connection opened')
      },
      onError: (error) => {
        console.log('❌ Protected SSE error:', error)
      },
      onClose: () => {
        console.log('🔌 Protected SSE connection closed')
      }
    })

    if (eventSource) {
      // Close connection after 12 seconds
      setTimeout(() => {
        ExampleApiClient.closeSSEConnection(eventSource)
      }, 12000)
    }

  } catch (error) {
    console.error('❌ Protected SSE test failed:', error)
  }
}

async function runAllTests() {
  console.log('🚀 Starting SSE Tests...')
  console.log('Make sure the test server is running: npm run start-test-server')

  // Run tests sequentially with delays
  await testBasicSSE()

  setTimeout(async () => {
    await testCustomSSE()

    setTimeout(async () => {
      await testProtectedSSE()
    }, 2000)
  }, 2000)
}

// Export for use in other files
export {
  testBasicSSE,
  testCustomSSE,
  testProtectedSSE,
  runAllTests
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error)
}