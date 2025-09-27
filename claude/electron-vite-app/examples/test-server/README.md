# Test Server

A simple Express.js server for testing the BaseApiClient implementation.

## Setup

```bash
cd examples/test-server
npm install
npm start
```

The server runs on `http://localhost:3001`

## Available Endpoints

### Health Check
- `GET /health` - Returns server status

### JSON API
- `GET /api/users` - Get list of users
- `POST /api/users` - Create a new user
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com"
  }
  ```

### Form Data API
- `POST /api/upload` - Upload single file with metadata
- `POST /api/upload-multiple` - Upload multiple files with metadata

### Authentication (Mock)
- `POST /auth/login` - Login with username/password
  ```json
  {
    "username": "admin",
    "password": "password"
  }
  ```
- `POST /auth/refresh` - Refresh access token
- `GET /api/protected` - Protected endpoint (requires Bearer token)

## Test Credentials

- Username: `admin`
- Password: `password`