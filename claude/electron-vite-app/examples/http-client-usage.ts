import httpClient, { HttpClient } from '../src/shared/http';

// Example 1: Basic usage with default client
interface User {
  id: number;
  name: string;
  email: string;
}

interface CreateUserRequest {
  name: string;
  email: string;
}

async function basicUsage() {
  try {
    // GET request with typed response
    const userResponse = await httpClient.get<User>('/api/users/1');
    console.log('User:', userResponse.data);

    // POST request with typed request and response
    const newUser: CreateUserRequest = {
      name: 'John Doe',
      email: 'john@example.com'
    };
    const createResponse = await httpClient.post<User, CreateUserRequest>('/api/users', newUser);
    console.log('Created user:', createResponse.data);

    // GET with query parameters
    const usersResponse = await httpClient.get<User[]>('/api/users', {
      params: { page: 1, limit: 10 }
    });
    console.log('Users list:', usersResponse.data);

  } catch (error) {
    console.error('API Error:', error);
  }
}

// Example 2: Form data upload
async function fileUploadExample() {
  try {
    const formData = new FormData();
    formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');
    formData.append('description', 'Test file upload');

    const uploadResponse = await httpClient.postFormData<{ fileId: string; url: string }>(
      '/api/upload',
      formData
    );
    console.log('Upload result:', uploadResponse.data);
  } catch (error) {
    console.error('Upload error:', error);
  }
}

// Example 3: Custom client with specific configuration
async function customClientExample() {
  const customClient = new HttpClient({
    baseURL: 'https://jsonplaceholder.typicode.com',
    timeout: 5000,
    headers: {
      'X-Custom-Header': 'MyApp/1.0'
    },
    interceptors: {
      request: [
        (config) => {
          console.log('Custom request interceptor:', config.url);
          return config;
        }
      ],
      response: [
        {
          onFulfilled: (response) => {
            console.log('Custom response interceptor:', response.status);
            return response;
          },
          onRejected: (error) => {
            console.error('Custom error interceptor:', error.message);
            return Promise.reject(error);
          }
        }
      ]
    }
  });

  try {
    const response = await customClient.get<any[]>('/posts');
    console.log('Posts:', response.data.slice(0, 3)); // Show first 3 posts
  } catch (error) {
    console.error('Custom client error:', error);
  }
}

// Example 4: Authentication handling
async function authenticationExample() {
  try {
    // Set auth token
    httpClient.setAuthToken('your-jwt-token-here');

    // Make authenticated request
    const profileResponse = await httpClient.get<User>('/api/profile');
    console.log('Profile:', profileResponse.data);

    // Clear auth token
    httpClient.setAuthToken(null);
  } catch (error) {
    console.error('Auth error:', error);
  }
}

// Example 5: Error handling
async function errorHandlingExample() {
  try {
    // This will likely fail with 404
    const response = await httpClient.get('/api/nonexistent-endpoint');
    console.log('Unexpected success:', response);
  } catch (error: any) {
    if (error.success === false) {
      console.log('API Error Details:', {
        message: error.message,
        code: error.code,
        timestamp: error.timestamp,
        details: error.details
      });
    }
  }
}

// Example 6: Dynamic interceptor management
async function dynamicInterceptorExample() {
  // Add request interceptor
  const requestInterceptorId = httpClient.addRequestInterceptor((config) => {
    config.headers['X-Request-Time'] = new Date().toISOString();
    return config;
  });

  // Add response interceptor
  const responseInterceptorId = httpClient.addResponseInterceptor({
    onFulfilled: (response) => {
      console.log(`Response time: ${new Date().toISOString()}`);
      return response;
    }
  });

  try {
    await httpClient.get('/api/test');
  } catch (error) {
    console.error('Error with interceptors:', error);
  } finally {
    // Remove interceptors when done
    httpClient.removeInterceptor('request', requestInterceptorId);
    httpClient.removeInterceptor('response', responseInterceptorId);
  }
}

// Run examples (uncomment to test)
// basicUsage();
// fileUploadExample();
// customClientExample();
// authenticationExample();
// errorHandlingExample();
// dynamicInterceptorExample();

export {
  basicUsage,
  fileUploadExample,
  customClientExample,
  authenticationExample,
  errorHandlingExample,
  dynamicInterceptorExample
};