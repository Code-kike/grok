import { handleRequest } from '../../src/core.mjs';

export async function handler(event, context) {
  try {
    // Parse path
    const path = `/v1${event.path.replace('/.netlify/functions/api', '')}`;
    
    // Parse body
    let body = null;
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: {
              message: 'Invalid request body',
              type: 'invalid_request_error'
            }
          }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
      }
    }
    
    // Process request
    const result = await handleRequest({
      method: event.httpMethod,
      path,
      headers: event.headers,
      body
    });
    
    // Handle streaming (not supported in regular Netlify Functions)
    if (result.stream) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: {
            message: 'Streaming is not supported in regular Netlify Functions. Please use the /edge/v1 endpoint instead.',
            type: 'unsupported_operation'
          }
        }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }
    
    // Return response
    return {
      statusCode: result.status,
      body: JSON.stringify(result.body),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(result.headers || {})
      }
    };
  } catch (error) {
    console.error('Error handling request:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: {
          message: 'Internal server error',
          type: 'server_error'
        }
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
} 