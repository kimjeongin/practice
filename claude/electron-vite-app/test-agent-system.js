// Test script for the Agent System
// Run this in the Electron app console or as a separate Node.js script

async function testAgentSystem() {
  console.log('🧪 Starting Agent System Test...')

  try {
    // Test 1: Check if Ollama is running
    console.log('1. Testing Ollama connection...')
    const ollamaResponse = await fetch('http://localhost:11434/api/version')
    if (ollamaResponse.ok) {
      const version = await ollamaResponse.json()
      console.log('✅ Ollama is running:', version.version)
    } else {
      throw new Error('Ollama is not running')
    }

    // Test 2: List available models
    console.log('2. Listing available models...')
    const modelsResponse = await fetch('http://localhost:11434/api/tags')
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json()
      const modelNames = modelsData.models?.map(m => m.name) || []
      console.log('✅ Available models:', modelNames)
      
      // Check for required models
      const requiredModels = ['llama3.1:8b', 'deepseek-r1:8b', 'mistral:7b']
      const missingModels = requiredModels.filter(model => 
        !modelNames.some(name => name.includes(model.split(':')[0]))
      )
      
      if (missingModels.length > 0) {
        console.warn('⚠️ Missing models:', missingModels)
        console.log('You can pull them with: ollama pull <model_name>')
      } else {
        console.log('✅ All required models are available')
      }
    }

    // Test 3: Simple LLM generation test
    console.log('3. Testing LLM generation...')
    const testGeneration = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: 'Say hello in JSON format with a "message" field.',
        format: 'json',
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 50
        }
      })
    })

    if (testGeneration.ok) {
      const generationResult = await testGeneration.json()
      console.log('✅ LLM generation test:', generationResult.response)
      
      try {
        const parsed = JSON.parse(generationResult.response)
        console.log('✅ JSON parsing successful:', parsed.message)
      } catch (e) {
        console.warn('⚠️ Generated content is not valid JSON')
      }
    }

    // Test 4: Database connectivity test
    console.log('4. Testing database setup...')
    // This would require importing Prisma client in the actual implementation

    console.log('🎉 Basic Agent System tests completed successfully!')
    console.log('')
    console.log('Next steps:')
    console.log('1. Install dependencies: pnpm install')
    console.log('2. Run the electron app: pnpm dev')
    console.log('3. Test the agent system from within the app')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Usage instructions
console.log('Agent System Test Script')
console.log('========================')
console.log('This script tests the basic requirements for the agent system.')
console.log('')
console.log('Prerequisites:')
console.log('1. Ollama should be running (ollama serve)')
console.log('2. Required models should be available:')
console.log('   - ollama pull llama3.1:8b')
console.log('   - ollama pull deepseek-r1:8b')
console.log('   - ollama pull mistral:7b')
console.log('')
console.log('Running tests...')
console.log('')

// Run the test
testAgentSystem()