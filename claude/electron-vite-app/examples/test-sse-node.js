// Node.js SSE Test
// Run with: node examples/test-sse-node.js

// Use built-in fetch (Node.js 18+)

const baseURL = 'http://localhost:3001'
let accessToken = null

// Test basic SSE connection
async function testBasicSSE() {
  console.log('\n=== Testing Basic SSE (Node.js) ===')

  try {
    const response = await fetch(`${baseURL}/api/events`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    console.log('✅ SSE connection established')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    let buffer = ''

    const readStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.substring(6))
                console.log('📨 Received:', event)
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        console.log('❌ SSE error:', error)
      }
    }

    readStream()

    // Close after 10 seconds
    setTimeout(() => {
      reader.cancel()
      console.log('🔌 Basic SSE connection closed')
    }, 10000)

  } catch (error) {
    console.error('❌ Basic SSE test failed:', error.message)
  }
}

// Test custom SSE with parameters
async function testCustomSSE() {
  console.log('\n=== Testing Custom SSE (Node.js) ===')

  try {
    const params = new URLSearchParams({
      message: 'Hello from Node.js!',
      interval: '1500'
    })

    const response = await fetch(`${baseURL}/api/events/custom?${params}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    console.log('✅ Custom SSE connection established')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    let buffer = ''

    const readStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.substring(6))
                console.log('📨 Custom received:', event)
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        console.log('❌ Custom SSE error:', error)
      }
    }

    readStream()

    // Close after 8 seconds
    setTimeout(() => {
      reader.cancel()
      console.log('🔌 Custom SSE connection closed')
    }, 8000)

  } catch (error) {
    console.error('❌ Custom SSE test failed:', error.message)
  }
}

// Login to get access token
async function login() {
  try {
    const response = await fetch(`${baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'password'
      })
    })

    if (!response.ok) {
      throw new Error(`Login failed: HTTP ${response.status}`)
    }

    const data = await response.json()
    accessToken = data.accessToken
    console.log('✅ Login successful')
    return true

  } catch (error) {
    console.error('❌ Login failed:', error.message)
    return false
  }
}

// Test protected SSE with authentication
async function testProtectedSSE() {
  console.log('\n=== Testing Protected SSE (Node.js) ===')

  if (!accessToken) {
    console.log('❌ No access token available')
    return
  }

  try {
    const response = await fetch(`${baseURL}/api/events/protected`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    console.log('✅ Protected SSE connection established')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    let buffer = ''

    const readStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.substring(6))
                console.log('🔐 Protected received:', event)
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        console.log('❌ Protected SSE error:', error)
      }
    }

    readStream()

    // Close after 12 seconds
    setTimeout(() => {
      reader.cancel()
      console.log('🔌 Protected SSE connection closed')
    }, 12000)

  } catch (error) {
    console.error('❌ Protected SSE test failed:', error.message)
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Node.js SSE Tests...')
  console.log('Make sure the test server is running: cd examples/test-server && npm start')

  // Test basic SSE
  await testBasicSSE()

  // Wait and test custom SSE
  setTimeout(async () => {
    await testCustomSSE()

    // Wait, login, and test protected SSE
    setTimeout(async () => {
      const loginSuccess = await login()
      if (loginSuccess) {
        setTimeout(() => {
          testProtectedSSE()
        }, 1000)
      }
    }, 2000)
  }, 2000)
}

// Run tests
runAllTests().catch(console.error)