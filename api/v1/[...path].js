/**
 * GrokProxy - Vercel Edge handler
 * This handles all /api/v1/* paths
 */

import { handleRequest, getApiKey } from '../../src/core.mjs';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
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
  
  // Extract path from URL (remove /api)
  const path = url.pathname.replace(/^\/api/, '');
  
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
      path,
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
          'Access-Control-Allow-Origin': '*',
          ...(result.headers || {})
        }
      });
    }
    
    // Regular response
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(result.headers || {})
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