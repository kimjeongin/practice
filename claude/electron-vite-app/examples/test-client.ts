// test-client.ts
import { ExampleApiClient } from '../src/shared/http'

async function runTests() {
  console.log('🚀 Starting API client tests...\n')

  const client = new ExampleApiClient()

  try {
    // 1. Health check
    console.log('1. Testing health check...')
    const health = await client.healthCheck()
    console.log('✅ Health check:', health.success ? 'OK' : 'Failed')
    if (health.success) {
      console.log('   Status:', health.data.status)
    } else {
      console.log('   Error:', health.message)
    }
    console.log()

    // 2. Get users (without auth)
    console.log('2. Testing get users (no auth required)...')
    const users = await client.getUsers()
    console.log('✅ Get users:', users.success ? 'Success' : 'Failed')
    if (users.success) {
      console.log('   Users count:', users.data.length)
      console.log('   First user:', users.data[0])
    } else {
      console.log('   Error:', users.message)
    }
    console.log()

    // 3. Create user (JSON data)
    console.log('3. Testing create user (JSON data)...')
    const newUser = await client.createUser({
      name: 'Test User',
      email: 'test@example.com'
    })
    console.log('✅ Create user:', newUser.success ? 'Success' : 'Failed')
    if (newUser.success) {
      console.log('   Created user:', newUser.data)
    } else {
      console.log('   Error:', newUser.message)
    }
    console.log()

    // 4. Login
    console.log('4. Testing login...')
    const login = await client.login({
      username: 'admin',
      password: 'password'
    })
    console.log('✅ Login:', login.success ? 'Success' : 'Failed')
    if (login.success) {
      console.log('   User:', login.data.user)
      console.log('   Token received:', login.data.accessToken.substring(0, 20) + '...')
    } else {
      console.log('   Error:', login.message)
    }
    console.log()

    // 5. Protected endpoint
    console.log('5. Testing protected endpoint...')
    const protected = await client.getProtectedData()
    console.log('✅ Protected data:', protected.success ? 'Success' : 'Failed')
    if (protected.success) {
      console.log('   Message:', protected.data.message)
      console.log('   Data:', protected.data.data)
    } else {
      console.log('   Error:', protected.message)
    }
    console.log()

    // 6. File upload (Form data)
    console.log('6. Testing file upload (Form data)...')
    const testFile = ExampleApiClient.createTestFile('test-file.txt', 'This is a test file content')
    const upload = await client.uploadFile(testFile, 'Test Title', 'Test Description')
    console.log('✅ File upload:', upload.success ? 'Success' : 'Failed')
    if (upload.success) {
      console.log('   File:', upload.data.file.originalname)
      console.log('   Size:', upload.data.file.size, 'bytes')
      console.log('   Title:', upload.data.metadata.title)
    } else {
      console.log('   Error:', upload.message)
    }
    console.log()

    // 7. Multiple file upload
    console.log('7. Testing multiple file upload...')
    const testFiles = [
      ExampleApiClient.createTestFile('file1.txt', 'Content of file 1'),
      ExampleApiClient.createTestFile('file2.txt', 'Content of file 2'),
      ExampleApiClient.createTestFile('file3.txt', 'Content of file 3')
    ]
    const multiUpload = await client.uploadMultipleFiles(testFiles, 'test-category')
    console.log('✅ Multiple file upload:', multiUpload.success ? 'Success' : 'Failed')
    if (multiUpload.success) {
      console.log('   Files count:', multiUpload.data.files.length)
      console.log('   Category:', multiUpload.data.metadata.category)
      console.log('   Files:', multiUpload.data.files.map(f => f.originalname).join(', '))
    } else {
      console.log('   Error:', multiUpload.message)
    }
    console.log()

    console.log('🎉 All tests completed!')

  } catch (error) {
    console.error('❌ Test failed with error:', error)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
}

export { runTests }