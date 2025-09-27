// test-node.js - Node.js compatible test using fetch
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

// Simple Node.js client for testing
class SimpleTestClient {
  constructor(baseURL = 'http://localhost:3001') {
    this.baseURL = baseURL;
    this.accessToken = null;
  }

  async request(options) {
    const url = this.baseURL + options.url;
    const headers = {
      ...options.headers,
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {})
    };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, data };
      } else {
        return { success: false, errorCode: response.status.toString(), message: data.error || 'Request failed' };
      }
    } catch (error) {
      return { success: false, errorCode: 'NETWORK_ERROR', message: error.message };
    }
  }

  async healthCheck() {
    return this.request({ url: '/health' });
  }

  async getUsers() {
    return this.request({ url: '/api/users' });
  }

  async createUser(userData) {
    return this.request({
      url: '/api/users',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  }

  async login(credentials) {
    const result = await this.request({
      url: '/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (result.success) {
      this.accessToken = result.data.accessToken;
    }

    return result;
  }

  async getProtectedData() {
    return this.request({ url: '/api/protected' });
  }

  async uploadFile(filename, content, title, description) {
    const form = new FormData();

    // Create a temporary file
    const tempFile = `/tmp/${filename}`;
    fs.writeFileSync(tempFile, content);

    form.append('file', fs.createReadStream(tempFile));
    if (title) form.append('title', title);
    if (description) form.append('description', description);

    const result = await this.request({
      url: '/api/upload',
      method: 'POST',
      body: form
    });

    // Clean up temp file
    fs.unlinkSync(tempFile);

    return result;
  }
}

async function runTests() {
  console.log('🚀 Starting Node.js API client tests...\n');

  const client = new SimpleTestClient();

  try {
    // 1. Health check
    console.log('1. Testing health check...');
    const health = await client.healthCheck();
    console.log('✅ Health check:', health.success ? 'OK' : 'Failed');
    if (health.success) {
      console.log('   Status:', health.data.status);
    } else {
      console.log('   Error:', health.message);
    }
    console.log();

    // 2. Get users (without auth)
    console.log('2. Testing get users (no auth required)...');
    const users = await client.getUsers();
    console.log('✅ Get users:', users.success ? 'Success' : 'Failed');
    if (users.success) {
      console.log('   Users count:', users.data.length);
      console.log('   First user:', users.data[0]);
    } else {
      console.log('   Error:', users.message);
    }
    console.log();

    // 3. Create user (JSON data)
    console.log('3. Testing create user (JSON data)...');
    const newUser = await client.createUser({
      name: 'Test User',
      email: 'test@example.com'
    });
    console.log('✅ Create user:', newUser.success ? 'Success' : 'Failed');
    if (newUser.success) {
      console.log('   Created user:', newUser.data);
    } else {
      console.log('   Error:', newUser.message);
    }
    console.log();

    // 4. Login
    console.log('4. Testing login...');
    const login = await client.login({
      username: 'admin',
      password: 'password'
    });
    console.log('✅ Login:', login.success ? 'Success' : 'Failed');
    if (login.success) {
      console.log('   User:', login.data.user);
      console.log('   Token received:', login.data.accessToken.substring(0, 20) + '...');
    } else {
      console.log('   Error:', login.message);
    }
    console.log();

    // 5. Protected endpoint
    console.log('5. Testing protected endpoint...');
    const protected = await client.getProtectedData();
    console.log('✅ Protected data:', protected.success ? 'Success' : 'Failed');
    if (protected.success) {
      console.log('   Message:', protected.data.message);
      console.log('   Data:', protected.data.data);
    } else {
      console.log('   Error:', protected.message);
    }
    console.log();

    // 6. File upload (Form data)
    console.log('6. Testing file upload (Form data)...');
    const upload = await client.uploadFile('test-file.txt', 'This is a test file content', 'Test Title', 'Test Description');
    console.log('✅ File upload:', upload.success ? 'Success' : 'Failed');
    if (upload.success) {
      console.log('   File:', upload.data.file.originalname);
      console.log('   Size:', upload.data.file.size, 'bytes');
      console.log('   Title:', upload.data.metadata.title);
    } else {
      console.log('   Error:', upload.message);
    }
    console.log();

    console.log('🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Install required dependencies if not present
async function checkDependencies() {
  try {
    require('node-fetch');
    require('form-data');
  } catch (error) {
    console.log('Installing required dependencies...');
    const { execSync } = require('child_process');
    execSync('npm install node-fetch@2 form-data', { stdio: 'inherit' });
  }
}

// Run tests
checkDependencies().then(() => {
  runTests();
});