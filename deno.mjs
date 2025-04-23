import { handleRequest } from './src/core.mjs';

const port = Deno.env.get("PORT") || 3000;

// Create HTTP server
const server = Deno.serve({ port }, async (request) => {
  const url = new URL(request.url);
  
  // Handle CORS preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  
  // Handle favicon
  if (url.pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }
  
  // Handle API requests
  if (url.pathname.startsWith('/v1/')) {
    try {
      // Parse request body
      let body = null;
      if (request.method !== 'GET') {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await request.json();
        }
      }
      
      // Process request
      const result = await handleRequest({
        method: request.method,
        path: url.pathname,
        headers: Object.fromEntries(request.headers.entries()),
        body
      });
      
      // Handle streaming response
      if (result.stream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        
        // Start streaming
        result.stream({
          enqueue: async (chunk) => {
            await writer.write(new TextEncoder().encode(chunk));
          },
          close: async () => {
            await writer.close();
          }
        });
        
        return new Response(readable, {
          status: result.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Regular response
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      console.error('Error handling request:', error);
      
      return new Response(JSON.stringify({
        error: {
          message: 'Internal server error',
          type: 'server_error'
        }
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
  
  // 404 for all other paths
  return new Response(JSON.stringify({
    error: {
      message: 'Not found',
      type: 'invalid_request_error'
    }
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
});

console.log(`GrokProxy server running on port ${port}`);

// Keep the server running
await server; 