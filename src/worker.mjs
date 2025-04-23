/**
 * GrokProxy - Cloudflare Worker entry point
 */

// Core logic imported from core.mjs
// For Cloudflare Workers, we'll inline the core functions to avoid import issues

const GROK_API_BASE = 'https://api.grok.ai';
const DEFAULT_MODEL = 'grok-1';

// Helper functions
function getApiKey(req) {
  return req.headers.get('authorization')?.replace('Bearer ', '') || 
         req.headers.get('x-api-key') ||
         (typeof GROK_API_KEY !== 'undefined' ? GROK_API_KEY : null);
}

// Model mapping from OpenAI to Grok
function mapModelToGrok(model) {
  if (model?.startsWith('grok-')) {
    return model;
  }
  return DEFAULT_MODEL;
}

// Transform OpenAI request to Grok format
async function transformOpenAIToGrok(req) {
  const body = await req.json();
  const url = new URL(req.url);
  const path = url.pathname;
  
  if (path.includes('/chat/completions')) {
    return transformChatCompletions(body);
  } else if (path.includes('/completions')) {
    return transformCompletions(body);
  } else if (path.includes('/embeddings')) {
    return transformEmbeddings(body);
  }
  
  throw new Error(`Unsupported endpoint: ${path}`);
}

// Transform chat completions from OpenAI format to Grok
function transformChatCompletions(body) {
  const model = mapModelToGrok(body.model);
  
  // Extract and format messages
  const messages = body.messages.map(msg => {
    const role = msg.role === 'system' ? 'system' : 
                 msg.role === 'assistant' ? 'model' : 'user';
    
    return {
      role,
      content: msg.content || ''
    };
  });
  
  // Build Grok request
  const grokRequest = {
    model,
    messages,
    temperature: body.temperature || 1.0,
    maxTokens: body.max_tokens || 1024,
    topP: body.top_p || 1,
    stream: body.stream || false
  };
  
  // Handle stop sequences if provided
  if (body.stop) {
    grokRequest.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }
  
  return grokRequest;
}

// Transform completions from OpenAI format to Grok
function transformCompletions(body) {
  const model = mapModelToGrok(body.model);
  
  // Build Grok request
  const grokRequest = {
    model,
    prompt: body.prompt,
    temperature: body.temperature || 1.0,
    maxTokens: body.max_tokens || 1024,
    topP: body.top_p || 1,
    stream: body.stream || false
  };
  
  // Handle stop sequences if provided
  if (body.stop) {
    grokRequest.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }
  
  return grokRequest;
}

// Transform embeddings from OpenAI format to Grok
function transformEmbeddings(body) {
  const model = mapModelToGrok(body.model);
  
  // Build Grok request
  const grokRequest = {
    model,
    input: Array.isArray(body.input) ? body.input : [body.input]
  };
  
  return grokRequest;
}

// Transform Grok response to OpenAI format
function transformGrokToOpenAI(grokResponse, originalRequest) {
  const url = new URL(originalRequest.url);
  const path = url.pathname;
  
  if (path.includes('/chat/completions')) {
    return transformGrokChatToOpenAI(grokResponse, originalRequest);
  } else if (path.includes('/completions')) {
    return transformGrokCompletionsToOpenAI(grokResponse, originalRequest);
  } else if (path.includes('/embeddings')) {
    return transformGrokEmbeddingsToOpenAI(grokResponse, originalRequest);
  }
  
  throw new Error(`Unsupported endpoint: ${path}`);
}

// Transform chat response from Grok to OpenAI format
async function transformGrokChatToOpenAI(grokResponse, originalRequest) {
  // We'll assume this is a non-streaming response as streaming is handled differently
  const responseBody = await grokResponse.json();
  
  const response = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: DEFAULT_MODEL,
    choices: [],
    usage: {
      prompt_tokens: responseBody.usage?.promptTokens || 0,
      completion_tokens: responseBody.usage?.completionTokens || 0,
      total_tokens: responseBody.usage?.totalTokens || 0
    }
  };
  
  // Add choices from grokResponse
  if (responseBody.choices && responseBody.choices.length) {
    response.choices = responseBody.choices.map((choice, index) => {
      return {
        index,
        message: {
          role: 'assistant',
          content: choice.message.content
        },
        finish_reason: choice.finishReason || 'stop'
      };
    });
  }
  
  return response;
}

// Transform completions from Grok to OpenAI format
async function transformGrokCompletionsToOpenAI(grokResponse, originalRequest) {
  const responseBody = await grokResponse.json();
  
  const response = {
    id: `cmpl-${Date.now()}`,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: DEFAULT_MODEL,
    choices: [],
    usage: {
      prompt_tokens: responseBody.usage?.promptTokens || 0,
      completion_tokens: responseBody.usage?.completionTokens || 0,
      total_tokens: responseBody.usage?.totalTokens || 0
    }
  };
  
  // Add choices from grokResponse
  if (responseBody.choices && responseBody.choices.length) {
    response.choices = responseBody.choices.map((choice, index) => {
      return {
        index,
        text: choice.text,
        finish_reason: choice.finishReason || 'stop'
      };
    });
  }
  
  return response;
}

// Transform embeddings from Grok to OpenAI format
async function transformGrokEmbeddingsToOpenAI(grokResponse, originalRequest) {
  const responseBody = await grokResponse.json();
  
  const response = {
    object: 'list',
    data: [],
    model: DEFAULT_MODEL,
    usage: {
      prompt_tokens: responseBody.usage?.promptTokens || 0,
      total_tokens: responseBody.usage?.totalTokens || 0
    }
  };
  
  // Add embeddings from grokResponse
  if (responseBody.data && responseBody.data.length) {
    response.data = responseBody.data.map((item, index) => {
      return {
        object: 'embedding',
        embedding: item.embedding,
        index
      };
    });
  }
  
  return response;
}

// Handle streaming responses
async function handleStreamingResponse(response, originalRequest, env, ctx) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  // Process the stream
  ctx.waitUntil((async () => {
    try {
      const reader = response.body.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          await writer.write(encoder.encode('data: [DONE]\n\n'));
          break;
        }
        
        // Process and transform chunks
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              // Transform to OpenAI format
              const url = new URL(originalRequest.url);
              let transformed;
              
              if (url.pathname.includes('/chat/completions')) {
                transformed = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: DEFAULT_MODEL,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content: data.choices?.[0]?.delta?.content || ''
                      },
                      finish_reason: data.choices?.[0]?.finish_reason || null
                    }
                  ]
                };
              } else {
                transformed = {
                  id: `cmpl-${Date.now()}`,
                  object: 'text_completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: DEFAULT_MODEL,
                  choices: [
                    {
                      index: 0,
                      text: data.choices?.[0]?.text || '',
                      finish_reason: data.choices?.[0]?.finish_reason || null
                    }
                  ]
                };
              }
              
              await writer.write(encoder.encode(`data: ${JSON.stringify(transformed)}\n\n`));
            } catch (e) {
              // Pass through any unprocessable lines
              await writer.write(encoder.encode(`${line}\n\n`));
            }
          }
        }
      }
    } catch (error) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`));
    } finally {
      await writer.close();
    }
  })());
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Main handler function for Cloudflare Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    
    // Handle favicon
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }
    
    // Only handle /v1/* paths
    if (!url.pathname.startsWith('/v1/')) {
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
    }
    
    try {
      // Handle models endpoint
      if (url.pathname === '/v1/models') {
        return new Response(JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'grok-1',
              object: 'model',
              created: 1699488000, // placeholder timestamp
              owned_by: 'grok'
            }
          ]
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Get API key
      const apiKey = getApiKey(request);
      
      if (!apiKey) {
        return new Response(JSON.stringify({
          error: {
            message: 'Missing API key. Please provide it in the Authorization header or as GROK_API_KEY environment variable.',
            type: 'authentication_error',
            code: 'invalid_api_key'
          }
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Only process POST requests for the API endpoints
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({
          error: {
            message: 'Method not allowed',
            type: 'invalid_request_error'
          }
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Clone the request for multiple reads
      const requestClone = request.clone();
      
      // Transform request body to Grok format
      const grokRequest = await transformOpenAIToGrok(requestClone);
      
      // Check if it's a streaming request
      const isStreaming = grokRequest.stream === true;
      
      // Determine Grok endpoint
      let grokEndpoint;
      if (url.pathname.includes('/chat/completions')) {
        grokEndpoint = `${GROK_API_BASE}/v1/chat/completions`;
      } else if (url.pathname.includes('/completions')) {
        grokEndpoint = `${GROK_API_BASE}/v1/completions`;
      } else if (url.pathname.includes('/embeddings')) {
        grokEndpoint = `${GROK_API_BASE}/v1/embeddings`;
      } else {
        return new Response(JSON.stringify({
          error: {
            message: `Unsupported endpoint: ${url.pathname}`,
            type: 'invalid_request_error'
          }
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Make request to Grok API
      const grokResponse = await fetch(grokEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(grokRequest)
      });
      
      // Handle error responses
      if (!grokResponse.ok) {
        const errorData = await grokResponse.json();
        return new Response(JSON.stringify({
          error: {
            message: errorData.error?.message || 'Error from Grok API',
            type: 'api_error',
            code: errorData.error?.code || 'unknown_error'
          }
        }), {
          status: grokResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // For streaming responses
      if (isStreaming) {
        return handleStreamingResponse(grokResponse, request, env, ctx);
      }
      
      // For regular responses
      const openAIResponse = await transformGrokToOpenAI(grokResponse, request);
      
      return new Response(JSON.stringify(openAIResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: {
          message: error.message,
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
}; 