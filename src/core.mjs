/**
 * Core functionality for GrokProxy - converting between OpenAI and Grok APIs
 */

const GROK_API_BASE = process.env.GROK_API_BASE || 'https://api.grok.ai';
const DEFAULT_MODEL = 'grok-1';

// Helper functions
function getApiKey(req) {
  return req.headers['authorization']?.replace('Bearer ', '') || process.env.GROK_API_KEY;
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
  const body = req.body || {};
  const endpoint = req.path;
  
  if (endpoint.includes('/chat/completions')) {
    return transformChatCompletions(body);
  } else if (endpoint.includes('/completions')) {
    return transformCompletions(body);
  } else if (endpoint.includes('/embeddings')) {
    return transformEmbeddings(body);
  }
  
  throw new Error(`Unsupported endpoint: ${endpoint}`);
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
  const endpoint = originalRequest.path;
  
  if (endpoint.includes('/chat/completions')) {
    return transformGrokChatToOpenAI(grokResponse, originalRequest);
  } else if (endpoint.includes('/completions')) {
    return transformGrokCompletionsToOpenAI(grokResponse, originalRequest);
  } else if (endpoint.includes('/embeddings')) {
    return transformGrokEmbeddingsToOpenAI(grokResponse, originalRequest);
  }
  
  throw new Error(`Unsupported endpoint: ${endpoint}`);
}

// Transform chat response from Grok to OpenAI format
function transformGrokChatToOpenAI(grokResponse, originalRequest) {
  // Handle streaming responses
  if (originalRequest.body.stream) {
    return transformGrokStreamToOpenAI(grokResponse);
  }
  
  // Format regular response
  const response = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: originalRequest.body.model || DEFAULT_MODEL,
    choices: [],
    usage: {
      prompt_tokens: grokResponse.usage?.promptTokens || 0,
      completion_tokens: grokResponse.usage?.completionTokens || 0,
      total_tokens: grokResponse.usage?.totalTokens || 0
    }
  };
  
  // Add choices from grokResponse
  if (grokResponse.choices && grokResponse.choices.length) {
    response.choices = grokResponse.choices.map((choice, index) => {
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
function transformGrokCompletionsToOpenAI(grokResponse, originalRequest) {
  // Handle streaming responses
  if (originalRequest.body.stream) {
    return transformGrokStreamToOpenAI(grokResponse);
  }
  
  // Format regular response
  const response = {
    id: `cmpl-${Date.now()}`,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: originalRequest.body.model || DEFAULT_MODEL,
    choices: [],
    usage: {
      prompt_tokens: grokResponse.usage?.promptTokens || 0,
      completion_tokens: grokResponse.usage?.completionTokens || 0,
      total_tokens: grokResponse.usage?.totalTokens || 0
    }
  };
  
  // Add choices from grokResponse
  if (grokResponse.choices && grokResponse.choices.length) {
    response.choices = grokResponse.choices.map((choice, index) => {
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
function transformGrokEmbeddingsToOpenAI(grokResponse, originalRequest) {
  const response = {
    object: 'list',
    data: [],
    model: originalRequest.body.model || DEFAULT_MODEL,
    usage: {
      prompt_tokens: grokResponse.usage?.promptTokens || 0,
      total_tokens: grokResponse.usage?.totalTokens || 0
    }
  };
  
  // Add embeddings from grokResponse
  if (grokResponse.data && grokResponse.data.length) {
    response.data = grokResponse.data.map((item, index) => {
      return {
        object: 'embedding',
        embedding: item.embedding,
        index
      };
    });
  }
  
  return response;
}

// Transform streaming responses
function transformGrokStreamToOpenAI(grokResponse) {
  // This function would handle transforming the streaming response
  // The actual implementation would depend on how Grok handles streaming
  // For now, we'll return the response as-is
  return grokResponse;
}

// Handle API request
async function handleRequest(req) {
  const apiKey = getApiKey(req);
  
  if (!apiKey) {
    return { 
      status: 401, 
      body: { 
        error: { 
          message: 'Missing API key. Please provide it in the Authorization header or as GROK_API_KEY environment variable.',
          type: 'authentication_error',
          code: 'invalid_api_key' 
        }
      }
    };
  }
  
  try {
    const endpoint = req.path;
    
    // Handle /models endpoint
    if (endpoint.includes('/models')) {
      return {
        status: 200,
        body: {
          object: 'list',
          data: [
            {
              id: 'grok-1',
              object: 'model',
              created: 1699488000, // placeholder timestamp
              owned_by: 'grok'
            }
          ]
        }
      };
    }
    
    // Transform request to Grok format
    const grokRequest = await transformOpenAIToGrok(req);
    
    // Prepare fetch options
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(grokRequest)
    };
    
    // Determine Grok endpoint
    let grokEndpoint;
    if (req.path.includes('/chat/completions')) {
      grokEndpoint = `${GROK_API_BASE}/v1/chat/completions`;
    } else if (req.path.includes('/completions')) {
      grokEndpoint = `${GROK_API_BASE}/v1/completions`;
    } else if (req.path.includes('/embeddings')) {
      grokEndpoint = `${GROK_API_BASE}/v1/embeddings`;
    } else {
      return { 
        status: 400, 
        body: { 
          error: { 
            message: `Unsupported endpoint: ${req.path}`,
            type: 'invalid_request_error' 
          }
        }
      };
    }
    
    // For streaming responses, we need to handle differently
    if (req.body.stream) {
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        stream: async (streamController) => {
          try {
            const response = await fetch(grokEndpoint, options);
            
            if (!response.ok) {
              const errorData = await response.json();
              streamController.enqueue(`data: ${JSON.stringify({ error: errorData })}\n\n`);
              streamController.close();
              return;
            }
            
            const reader = response.body.getReader();
            
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                streamController.enqueue('data: [DONE]\n\n');
                break;
              }
              
              // Transform and forward the chunk
              const chunk = new TextDecoder().decode(value);
              const transformedChunk = transformStreamChunk(chunk, req);
              streamController.enqueue(transformedChunk);
            }
            
            streamController.close();
          } catch (error) {
            streamController.enqueue(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`);
            streamController.close();
          }
        }
      };
    }
    
    // For non-streaming responses
    const response = await fetch(grokEndpoint, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      return { 
        status: response.status, 
        body: { 
          error: { 
            message: errorData.error?.message || 'Error from Grok API',
            type: 'api_error',
            code: errorData.error?.code || 'unknown_error'
          }
        }
      };
    }
    
    const grokResponse = await response.json();
    const openAIResponse = transformGrokToOpenAI(grokResponse, req);
    
    return { status: 200, body: openAIResponse };
  } catch (error) {
    return { 
      status: 500, 
      body: { 
        error: { 
          message: error.message,
          type: 'server_error' 
        }
      }
    };
  }
}

// Transform streaming chunks
function transformStreamChunk(chunk, originalRequest) {
  if (!chunk.trim()) return '';
  
  // Split the chunk into lines
  const lines = chunk.split('\n');
  let transformedLines = [];
  
  for (const line of lines) {
    if (!line.trim() || !line.startsWith('data: ')) {
      transformedLines.push(line);
      continue;
    }
    
    // Extract and process the data
    try {
      const data = JSON.parse(line.substring(6));
      
      // Skip [DONE] marker, we'll add it back later
      if (data === '[DONE]') continue;
      
      // Transform to OpenAI format
      const endpoint = originalRequest.path;
      let transformed;
      
      if (endpoint.includes('/chat/completions')) {
        transformed = transformGrokChatStreamToOpenAI(data, originalRequest);
      } else if (endpoint.includes('/completions')) {
        transformed = transformGrokCompletionStreamToOpenAI(data, originalRequest);
      } else {
        transformed = data;
      }
      
      transformedLines.push(`data: ${JSON.stringify(transformed)}`);
    } catch (error) {
      transformedLines.push(line);
    }
  }
  
  return transformedLines.join('\n') + '\n\n';
}

// Transform chat streaming from Grok to OpenAI format
function transformGrokChatStreamToOpenAI(data, originalRequest) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: originalRequest.body.model || DEFAULT_MODEL,
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
}

// Transform completion streaming from Grok to OpenAI format
function transformGrokCompletionStreamToOpenAI(data, originalRequest) {
  return {
    id: `cmpl-${Date.now()}`,
    object: 'text_completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: originalRequest.body.model || DEFAULT_MODEL,
    choices: [
      {
        index: 0,
        text: data.choices?.[0]?.text || '',
        finish_reason: data.choices?.[0]?.finish_reason || null
      }
    ]
  };
}

export { handleRequest, getApiKey }; 