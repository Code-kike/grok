import express from 'express';
import { handleRequest } from './src/core.mjs';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Set CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Handle favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Proxy all /v1/* requests to Grok
app.all('/v1/*', async (req, res) => {
  try {
    const result = await handleRequest({
      method: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body
    });
    
    // Set response status
    res.status(result.status);
    
    // Set headers if provided
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    
    // Handle streaming response
    if (result.stream) {
      res.flushHeaders();
      
      // Call the stream function with a controller that forwards to the response
      await result.stream({
        enqueue: (chunk) => {
          res.write(chunk);
        },
        close: () => {
          res.end();
        }
      });
    } else {
      // Regular JSON response
      res.json(result.body);
    }
  } catch (error) {
    console.error('Error handling request:', error);
    
    res.status(500).json({
      error: {
        message: 'Internal server error',
        type: 'server_error'
      }
    });
  }
});

// Default 404 response for all other routes
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      type: 'invalid_request_error'
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`GrokProxy server running on port ${port}`);
}); 