const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Ensure uploads directory exists
const fs = require('fs');
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// JSON endpoint - GET
app.get('/api/users', (req, res) => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ];
  res.json(users);
});

// JSON endpoint - POST
app.post('/api/users', (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: 'Name and email are required'
    });
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    createdAt: new Date().toISOString()
  };

  res.status(201).json(newUser);
});

// Form data endpoint - single file upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { title, description } = req.body;

  res.json({
    message: 'File uploaded successfully',
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    },
    metadata: {
      title: title || 'No title',
      description: description || 'No description'
    }
  });
});

// Form data endpoint - multiple files
app.post('/api/upload-multiple', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const { category } = req.body;

  res.json({
    message: 'Files uploaded successfully',
    files: req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    })),
    metadata: {
      category: category || 'uncategorized',
      uploadedAt: new Date().toISOString()
    }
  });
});

// Auth endpoints (mock)
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'admin' && password === 'password') {
    res.json({
      accessToken: 'mock-access-token-' + Date.now(),
      refreshToken: 'mock-refresh-token-' + Date.now(),
      user: { id: 1, username: 'admin' }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken && refreshToken.startsWith('mock-refresh-token')) {
    res.json({
      accessToken: 'new-mock-access-token-' + Date.now(),
      refreshToken: 'new-mock-refresh-token-' + Date.now()
    });
  } else {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Protected endpoint (requires Authorization header)
app.get('/api/protected', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  if (!token.startsWith('mock-access-token') && !token.startsWith('new-mock-access-token')) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.json({
    message: 'Access granted',
    data: 'This is protected data',
    user: { id: 1, username: 'admin' }
  });
});

// SSE endpoints
app.get('/api/events', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection event
  res.write('data: {"type": "connected", "message": "SSE connection established", "timestamp": "' + new Date().toISOString() + '"}\n\n');

  // Send periodic events
  const interval = setInterval(() => {
    const data = {
      type: 'heartbeat',
      message: 'Server heartbeat',
      timestamp: new Date().toISOString(),
      counter: Math.floor(Math.random() * 1000)
    };
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 2000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(interval);
    console.log('SSE client disconnected');
  });
});

// SSE with custom messages
app.get('/api/events/custom', (req, res) => {
  const { message, interval: customInterval } = req.query;
  const intervalTime = parseInt(customInterval) || 3000;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  res.write('data: {"type": "connected", "message": "Custom SSE connection established"}\n\n');

  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    const data = {
      type: 'custom',
      message: message || `Custom message ${counter}`,
      timestamp: new Date().toISOString(),
      counter
    };
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, intervalTime);

  req.on('close', () => {
    clearInterval(interval);
    console.log('Custom SSE client disconnected');
  });
});

// SSE with authentication
app.get('/api/events/protected', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  if (!token.startsWith('mock-access-token') && !token.startsWith('new-mock-access-token')) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control, Authorization'
  });

  res.write('data: {"type": "connected", "message": "Protected SSE connection established", "user": "admin"}\n\n');

  const interval = setInterval(() => {
    const data = {
      type: 'protected_data',
      message: 'This is protected real-time data',
      timestamp: new Date().toISOString(),
      user: 'admin',
      secretData: `Secret-${Math.random().toString(36).substr(2, 9)}`
    };
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 1500);

  req.on('close', () => {
    clearInterval(interval);
    console.log('Protected SSE client disconnected');
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  /api/users - Get users (JSON)');
  console.log('  POST /api/users - Create user (JSON)');
  console.log('  POST /api/upload - Upload single file (Form data)');
  console.log('  POST /api/upload-multiple - Upload multiple files (Form data)');
  console.log('  POST /auth/login - Login (mock auth)');
  console.log('  POST /auth/refresh - Refresh token');
  console.log('  GET  /api/protected - Protected endpoint');
  console.log('  GET  /api/events - SSE basic events');
  console.log('  GET  /api/events/custom - SSE with custom messages');
  console.log('  GET  /api/events/protected - SSE with authentication');
});