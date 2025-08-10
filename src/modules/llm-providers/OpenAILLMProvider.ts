/**
 * OpenAI LLM Provider implementation
 * Sophisticated provider for external OpenAI-compatible API integration
 * Serves as the heart of the external API system with advanced payload transformation
 */

import { BaseProvider } from './BaseProvider';
import { LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';

/**
 * Request context for tracking operations
 */
interface RequestContext {
  requestId: string;
  startTime: number;
  attempt: number;
  query: string;
  resultCount: number;
}

/**
 * OpenAI API request interfaces
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * HTTP client configuration
 */
interface HTTPClientConfig {
  timeout: number;
  retries: number;
  retryDelay: number;
  maxRetryDelay: number;
  userAgent: string;
}

/**
 * Enhanced retry strategy configuration
 */
interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableErrors: LLMProviderErrorType[];
}

/**
 * Rate limiting information
 */
interface RateLimitInfo {
  requestsRemaining?: number;
  requestsReset?: Date;
  tokensRemaining?: number;
  tokensReset?: Date;
}

/**
 * Enhanced request context with retry information
 */
interface EnhancedRequestContext extends RequestContext {
  retryStrategy: RetryStrategy;
  rateLimitInfo?: RateLimitInfo;
  lastError?: LLMProviderError;
  retryHistory: Array<{
    attempt: number;
    error: string;
    delay: number;
    timestamp: Date;
  }>;
}

/**
 * Sophisticated OpenAI LLM Provider with advanced features
 */
export class OpenAILLMProvider extends BaseProvider {
  readonly name = 'server';
  private httpClient: HTTPClient;
  private _isAvailable: boolean | null = null;
  private _availabilityChecked = false;

  // Advanced prompt templates for different scenarios
  private static readonly SYSTEM_PROMPTS = {
    default: `You are a senior software engineer and code analysis expert. Your task is to provide clear, accurate, and helpful explanations of code based on search results from a codebase.

Guidelines:
- Analyze the provided code snippets in context
- Explain functionality, purpose, and relationships between code elements
- Use technical language appropriate for developers
- Be concise but comprehensive
- Focus on practical insights and implementation details
- If code appears incomplete, explain what you can determine from the available context
- Highlight important patterns, best practices, or potential issues`,

    debugging: `You are an expert debugging assistant. Analyze the provided code snippets to help identify potential issues, explain behavior, and suggest improvements.

Focus on:
- Identifying potential bugs or issues
- Explaining error conditions and edge cases
- Suggesting debugging approaches
- Highlighting code smells or anti-patterns`,

    architecture: `You are a software architecture expert. Analyze the provided code snippets to explain architectural patterns, design decisions, and system structure.

Focus on:
- Architectural patterns and design principles
- Component relationships and dependencies
- System structure and organization
- Design trade-offs and implications`
  };

  constructor(config: LLMProviderConfig) {
    super(config);
    
    if (!config.server) {
      throw this.createError(
        'Server configuration is required for server provider',
        LLMProviderErrorType.CONFIGURATION_ERROR
      );
    }

    this.httpClient = new HTTPClient({
      timeout: config.timeout,
      retries: config.retryAttempts,
      retryDelay: config.retryDelay,
      maxRetryDelay: Math.min(config.retryDelay * 8, 30000), // Cap at 30 seconds
      userAgent: 'hikma-engine/1.0.0 (OpenAI Provider)'
    });

      this.logger.debug('Server LLM Provider initialized', {
      apiUrl: config.server.apiUrl,
      model: config.server.model,
      maxTokens: config.server.maxTokens,
      temperature: config.server.temperature
    });
  }

  /**
   * Check if the OpenAI provider is available
   */
  get isAvailable(): boolean {
    if (!this._availabilityChecked) {
      return this._isAvailable ?? false;
    }
    return this._isAvailable ?? false;
  }
  /**
   * Enhanced retry logic with exponential backoff, jitter, and smart error handling
   */
  private async withEnhancedRetry<T>(
    operation: () => Promise<T>,
    context: EnhancedRequestContext,
    operationName: string
  ): Promise<T> {
    const { retryStrategy } = context;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retryStrategy.maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          const delay = this.calculateRetryDelay(attempt - 1, retryStrategy, context.rateLimitInfo);
          
          // Record retry attempt
          context.retryHistory.push({
            attempt: attempt - 1,
            error: lastError?.message || 'Unknown error',
            delay,
            timestamp: new Date()
          });

          this.logger.info(`Retrying ${operationName} (attempt ${attempt}/${retryStrategy.maxAttempts}) after ${delay}ms`, {
            requestId: context.requestId,
            previousError: lastError?.message,
            rateLimitInfo: context.rateLimitInfo
          });

          await this.sleep(delay);
        }

        const result = await operation();
        
        if (attempt > 1) {
          this.logger.info(`${operationName} succeeded after ${attempt} attempts`, {
            requestId: context.requestId,
            totalAttempts: attempt,
            retryHistory: context.retryHistory
          });
        }

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if this error type is retryable
        if (error instanceof LLMProviderError) {
          context.lastError = error;
          
          // Update rate limit info if available
          if (error.type === LLMProviderErrorType.RATE_LIMIT_ERROR) {
            this.updateRateLimitInfo(context, error);
          }

          // Check if error is retryable
          if (!retryStrategy.retryableErrors.includes(error.type)) {
            this.logger.error(`${operationName} failed with non-retryable error`, {
              requestId: context.requestId,
              error: error.message,
              type: error.type,
              attempt
            });
            throw error;
          }
        }

        if (attempt === retryStrategy.maxAttempts) {
          this.logger.error(`${operationName} failed after ${attempt} attempts`, {
            requestId: context.requestId,
            error: lastError.message,
            retryHistory: context.retryHistory
          });
          throw lastError;
        }

        this.logger.warn(`${operationName} failed on attempt ${attempt}`, {
          requestId: context.requestId,
          error: lastError.message,
          willRetry: true,
          nextAttempt: attempt + 1
        });
      }
    }

    throw lastError || new Error(`${operationName} failed after retries`);
  }

  /**
   * Calculate retry delay with exponential backoff, jitter, and rate limit awareness
   */
  private calculateRetryDelay(
    attemptNumber: number,
    strategy: RetryStrategy,
    rateLimitInfo?: RateLimitInfo
  ): number {
    // Base exponential backoff
    let delay = Math.min(
      strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attemptNumber),
      strategy.maxDelay
    );

    // Add jitter to prevent thundering herd
    if (strategy.jitterEnabled) {
      const jitter = Math.random() * 0.1 * delay; // 10% jitter
      delay += jitter;
    }

    // Respect rate limit reset time if available
    if (rateLimitInfo?.requestsReset) {
      const resetDelay = rateLimitInfo.requestsReset.getTime() - Date.now();
      if (resetDelay > 0 && resetDelay < delay * 2) {
        delay = Math.max(delay, resetDelay + 1000); // Add 1 second buffer
      }
    }

    return Math.round(delay);
  }

  /**
   * Update rate limit information from error response
   */
  private updateRateLimitInfo(context: EnhancedRequestContext, error: LLMProviderError): void {
    // Extract rate limit info from error if available
    // This would typically come from response headers in a real implementation
    const now = new Date();
    context.rateLimitInfo = {
      requestsRemaining: 0,
      requestsReset: new Date(now.getTime() + 60000), // Assume 1 minute reset
      tokensRemaining: 0,
      tokensReset: new Date(now.getTime() + 60000)
    };
  }

  /**
   * Generate explanation using OpenAI API with sophisticated payload transformation
   */
  async generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse> {
    const context = this.createEnhancedRequestContext(query, searchResults);
    const logEnd = this.logOperation('generateExplanation', {
      requestId: context.requestId,
      queryLength: query.length,
      resultCount: searchResults.length,
      model: options.model || this.config.server?.model
    });

    try {
      // Validate inputs
      this.validateQuery(query);
      this.validateSearchResults(searchResults);

      // Check if provider is available
      if (!this.isAvailable) {
        throw this.createError(
          'OpenAI provider is not available. Please check configuration and connectivity.',
          LLMProviderErrorType.PROVIDER_UNAVAILABLE
        );
      }

      // Transform payload with sophisticated context building
      const openaiRequest = this.transformToOpenAIRequest(query, searchResults, options, context);
      
      this.logger.debug('Sending request to OpenAI API', {
        requestId: context.requestId,
        model: openaiRequest.model,
        messageCount: openaiRequest.messages.length,
        maxTokens: openaiRequest.max_tokens,
        temperature: openaiRequest.temperature,
        retryStrategy: context.retryStrategy
      });

      // Make API request with enhanced retry logic
      const response = await this.withEnhancedRetry(
        () => this.makeOpenAIRequest(openaiRequest, context),
        context,
        `OpenAI API request (${context.requestId})`
      );

      // Transform response back to RAG format with validation
      const ragResponse = this.transformFromOpenAIResponse(response, openaiRequest, context);

      // Validate response format
      this.validateRAGResponse(ragResponse);

      logEnd();
      
      this.logger.info('OpenAI explanation generated successfully', {
        requestId: context.requestId,
        model: ragResponse.model,
        explanationLength: ragResponse.explanation?.length || 0,
        tokensUsed: response.usage?.total_tokens,
        duration: Date.now() - context.startTime,
        retryAttempts: context.retryHistory.length
      });

      return ragResponse;

    } catch (error) {
      logEnd();

      if (error instanceof LLMProviderError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = this.categorizeError(errorMessage);

      this.logger.error('OpenAI explanation failed', {
        requestId: context.requestId,
        error: errorMessage,
        type: errorType,
        duration: Date.now() - context.startTime,
        retryHistory: context.retryHistory
      });

      throw this.createError(
        `OpenAI provider error: ${errorMessage}`,
        errorType,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate the provider's configuration
   */
  async validateConfiguration(): Promise<boolean> {
    const logEnd = this.logOperation('validateConfiguration');

    try {
      // Validate common configuration
      this.validateCommonConfig();

      // Validate server-specific configuration
      if (!this.config.server) {
        throw this.createError(
          'Server configuration is required',
          LLMProviderErrorType.CONFIGURATION_ERROR
        );
      }

      const serverConfig = this.config.server;

      // Validate required fields
      if (!serverConfig.apiUrl || typeof serverConfig.apiUrl !== 'string') {
        throw this.createError(
          'Server API URL is required and must be a valid string',
          LLMProviderErrorType.CONFIGURATION_ERROR
        );
      }

      if (!serverConfig.apiKey || typeof serverConfig.apiKey !== 'string') {
        throw this.createError(
          'Server API key is required and must be a valid string',
          LLMProviderErrorType.CONFIGURATION_ERROR
        );
      }

      if (!serverConfig.model || typeof serverConfig.model !== 'string') {
        throw this.createError(
          'Server model is required and must be a valid string',
          LLMProviderErrorType.CONFIGURATION_ERROR
        );
      }

      // Validate URL format
      try {
        new URL(serverConfig.apiUrl);
      } catch {
        throw this.createError(
          'Server API URL must be a valid URL',
          LLMProviderErrorType.CONFIGURATION_ERROR
        );
      }

      // Validate API key format (relaxed for local/self-hosted endpoints)
      const isLocalEndpoint = serverConfig.apiUrl.includes('localhost') || 
                             serverConfig.apiUrl.includes('127.0.0.1') || 
                             serverConfig.apiUrl.includes('0.0.0.0');
      
      if (!isLocalEndpoint && !serverConfig.apiKey.startsWith('sk-') && !serverConfig.apiKey.startsWith('org-')) {
        this.logger.warn('Server API key format may be invalid for external APIs', {
          keyPrefix: serverConfig.apiKey.substring(0, 4)
        });
      }

      // Validate optional parameters
      if (serverConfig.maxTokens !== undefined) {
        if (typeof serverConfig.maxTokens !== 'number' || serverConfig.maxTokens <= 0) {
          throw this.createError(
            'Server maxTokens must be a positive number',
            LLMProviderErrorType.CONFIGURATION_ERROR
          );
        }
      }

      if (serverConfig.temperature !== undefined) {
        if (typeof serverConfig.temperature !== 'number' || 
            serverConfig.temperature < 0 || 
            serverConfig.temperature > 2) {
          throw this.createError(
            'Server temperature must be a number between 0 and 2',
            LLMProviderErrorType.CONFIGURATION_ERROR
          );
        }
      }

      // Test connectivity with a lightweight request
      try {
        await this.testConnectivity();
        this._isAvailable = true;
        this.logger.info('OpenAI API connectivity verified');
      } catch (error) {
        this._isAvailable = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn('OpenAI API connectivity test failed', { error: errorMessage });
        
        // Configuration is valid, but service is not available
        // This is not a configuration error, just a runtime availability issue
      }

      this._availabilityChecked = true;
      logEnd();

      this.logger.debug('Server provider configuration validated', {
        isAvailable: this._isAvailable,
        apiUrl: serverConfig.apiUrl,
        model: serverConfig.model
      });

      return true;

    } catch (error) {
      logEnd();
      
      if (error instanceof LLMProviderError) {
        throw error;
      }

      throw this.createError(
        `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cleanup any resources used by the provider
   */
  async cleanup(): Promise<void> {
    const logEnd = this.logOperation('cleanup');

    try {
      this.logger.info('Cleaning up OpenAI provider resources');
      
      // Cleanup HTTP client resources
      await this.httpClient.cleanup();
      
      // Reset availability cache
      this._isAvailable = null;
      this._availabilityChecked = false;

      logEnd();
      this.logger.debug('OpenAI provider cleanup completed');

    } catch (error) {
      logEnd();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Error during OpenAI provider cleanup', { error: errorMessage });
      
      // Don't throw errors during cleanup, just log them
    }
  }
  /**
   * Transform search results and query into OpenAI API request format
   */
  private transformToOpenAIRequest(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions,
    context: EnhancedRequestContext
  ): OpenAIRequest {
    const serverConfig = this.config.server!;
    
    // Select appropriate system prompt based on query context
    const systemPrompt = this.selectSystemPrompt(query);
    
    // Build context from search results with intelligent truncation
    const contextText = this.buildContextFromResults(searchResults, context);
    
    // Create user message with structured format
    const userMessage = this.buildUserMessage(query, contextText, context);

    const request: OpenAIRequest = {
      model: options.model || serverConfig.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: options.maxTokens || serverConfig.maxTokens || 2000,
      temperature: serverConfig.temperature ?? 0.6,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    };

    this.logger.debug('Transformed to OpenAI request', {
      requestId: context.requestId,
      systemPromptLength: systemPrompt.length,
      userMessageLength: userMessage.length,
      totalTokensEstimate: this.estimateTokens(request)
    });

    return request;
  }

  /**
   * Select appropriate system prompt based on query analysis
   */
  private selectSystemPrompt(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('debug') || lowerQuery.includes('error') || lowerQuery.includes('bug')) {
      return OpenAILLMProvider.SYSTEM_PROMPTS.debugging;
    }
    
    if (lowerQuery.includes('architecture') || lowerQuery.includes('design') || lowerQuery.includes('pattern')) {
      return OpenAILLMProvider.SYSTEM_PROMPTS.architecture;
    }
    
    return OpenAILLMProvider.SYSTEM_PROMPTS.default;
  }

  /**
   * Build intelligent context from search results with smart truncation
   */
  private buildContextFromResults(searchResults: SearchResult[], context: RequestContext): string {
    const maxContextLength = 8000; // Conservative limit for context
    let contextParts: string[] = [];
    let currentLength = 0;

    // Sort results by similarity (highest first)
    const sortedResults = [...searchResults].sort((a, b) => b.similarity - a.similarity);

    for (const result of sortedResults) {
      const resultText = this.formatSearchResult(result);
      
      if (currentLength + resultText.length > maxContextLength) {
        // Try to fit a truncated version
        const remainingSpace = maxContextLength - currentLength - 100; // Leave some buffer
        if (remainingSpace > 200) { // Only if we have meaningful space left
          const truncated = this.truncateSearchResult(result, remainingSpace);
          contextParts.push(truncated);
        }
        break;
      }
      
      contextParts.push(resultText);
      currentLength += resultText.length;
    }

    this.logger.debug('Built context from search results', {
      requestId: context.requestId,
      originalResults: searchResults.length,
      includedResults: contextParts.length,
      contextLength: currentLength
    });

    return contextParts.join('\n\n');
  }

  /**
   * Format a search result for inclusion in context
   */
  private formatSearchResult(result: SearchResult): string {
    const similarity = (result.similarity * 100).toFixed(1);
    return `File: ${result.file_path}\nType: ${result.node_type}\nSimilarity: ${similarity}%\n\n\`\`\`\n${result.source_text.trim()}\n\`\`\``;
  }

  /**
   * Truncate a search result to fit within space constraints
   */
  private truncateSearchResult(result: SearchResult, maxLength: number): string {
    const headerLength = `File: ${result.file_path}\nType: ${result.node_type}\nSimilarity: ${(result.similarity * 100).toFixed(1)}%\n\n\`\`\`\n\`\`\``.length;
    const availableForCode = maxLength - headerLength - 20; // Buffer for truncation indicator
    
    if (availableForCode <= 0) return '';
    
    const truncatedCode = result.source_text.length > availableForCode 
      ? result.source_text.substring(0, availableForCode) + '\n... [truncated]'
      : result.source_text;
    
    return this.formatSearchResult({ ...result, source_text: truncatedCode });
  }

  /**
   * Build structured user message
   */
  private buildUserMessage(query: string, contextText: string, context: RequestContext): string {
    return `Query: ${query}

Based on the following code search results from the codebase, please provide a comprehensive explanation:

${contextText}

Please analyze the code and provide a clear explanation that addresses the query. Focus on:
1. What the code does and how it works
2. Key components and their relationships
3. Important implementation details
4. Any patterns or best practices demonstrated
5. Context within the larger codebase (if apparent)

Keep your response focused, technical, and helpful for a developer trying to understand this code.`;
  }

  /**
   * Estimate token count for request (rough approximation)
   */
  private estimateTokens(request: OpenAIRequest): number {
    const text = request.messages.map(m => m.content).join(' ');
    return Math.ceil(text.length / 4); // Rough approximation: 1 token ≈ 4 characters
  }

  /**
   * Make HTTP request to OpenAI API with enhanced error handling
   */
  private async makeOpenAIRequest(request: OpenAIRequest, context: EnhancedRequestContext): Promise<OpenAIResponse> {
    const serverConfig = this.config.server!;
    const endpoint = this.normalizeChatCompletionsUrl(serverConfig.apiUrl);

    const headers = {
      'Authorization': `Bearer ${serverConfig.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'hikma-engine/1.0.0',
      'X-Request-ID': context.requestId
    };

    try {
      const response = await this.httpClient.post<OpenAIResponse>(
        endpoint,
        request,
        headers,
        context
      );

      this.logger.debug('OpenAI API response received', {
        requestId: context.requestId,
        responseId: response.id,
        model: response.model,
        choices: response.choices?.length || 0,
        usage: response.usage,
        finishReason: response.choices?.[0]?.finish_reason
      });

      return response;

    } catch (error) {
      // Enhanced error handling for OpenAI-specific errors
      if (error instanceof HTTPError) {
        const openaiError = this.parseOpenAIError(error);
        
        const providerError = this.createError(
          openaiError.message,
          openaiError.type,
          error
        );

        // Add additional context to the error
        this.logger.error('OpenAI API request failed', {
          requestId: context.requestId,
          status: error.status,
          errorType: openaiError.type,
          message: openaiError.message,
          responseBody: error.responseBody?.substring(0, 200)
        });

        throw providerError;
      }
      
      throw error;
    }
  }

  /**
   * Enhanced OpenAI API error parsing with detailed error information
   */
  private parseOpenAIError(httpError: HTTPError): { message: string; type: LLMProviderErrorType } {
    try {
      const errorResponse: OpenAIErrorResponse = JSON.parse(httpError.responseBody || '{}');
      const openaiError = errorResponse.error;
      
      if (openaiError) {
        let providerErrorType: LLMProviderErrorType;
        let enhancedMessage = openaiError.message;
        
        switch (openaiError.type) {
          case 'invalid_request_error':
            providerErrorType = LLMProviderErrorType.CONFIGURATION_ERROR;
            if (openaiError.param) {
              enhancedMessage += ` (parameter: ${openaiError.param})`;
            }
            break;
            
          case 'authentication_error':
            providerErrorType = LLMProviderErrorType.AUTHENTICATION_ERROR;
            enhancedMessage = 'Authentication failed. Please check your API key and ensure it has the necessary permissions.';
            break;
            
          case 'permission_error':
            providerErrorType = LLMProviderErrorType.AUTHENTICATION_ERROR;
            enhancedMessage = 'Permission denied. Your API key may not have access to the requested model or feature.';
            break;
            
          case 'rate_limit_error':
            providerErrorType = LLMProviderErrorType.RATE_LIMIT_ERROR;
            enhancedMessage = 'Rate limit exceeded. Please reduce your request frequency or upgrade your plan.';
            break;
            
          case 'server_error':
            providerErrorType = LLMProviderErrorType.PROVIDER_UNAVAILABLE;
            enhancedMessage = 'OpenAI server error. The service is temporarily unavailable.';
            break;
            
          case 'service_unavailable':
            providerErrorType = LLMProviderErrorType.PROVIDER_UNAVAILABLE;
            enhancedMessage = 'OpenAI service is currently unavailable. Please try again later.';
            break;
            
          case 'insufficient_quota':
            providerErrorType = LLMProviderErrorType.RATE_LIMIT_ERROR;
            enhancedMessage = 'Insufficient quota. Please check your billing details or upgrade your plan.';
            break;
            
          case 'model_not_found':
            providerErrorType = LLMProviderErrorType.CONFIGURATION_ERROR;
            enhancedMessage = `Model not found. Please check that the model name is correct and you have access to it.`;
            break;
            
          default:
            providerErrorType = LLMProviderErrorType.NETWORK_ERROR;
            this.logger.warn('Unknown OpenAI error type', { 
              type: openaiError.type, 
              message: openaiError.message 
            });
        }
        
        return {
          message: `OpenAI API error: ${enhancedMessage}`,
          type: providerErrorType
        };
      }
    } catch (parseError) {
      this.logger.warn('Failed to parse OpenAI error response', { 
        error: parseError instanceof Error ? parseError.message : String(parseError),
        responseBody: httpError.responseBody?.substring(0, 500)
      });
    }
    
    // Enhanced fallback based on HTTP status with more specific messages
    if (httpError.status === 400) {
      return {
        message: 'Bad request. Please check your request parameters and try again.',
        type: LLMProviderErrorType.CONFIGURATION_ERROR
      };
    } else if (httpError.status === 401) {
      return {
        message: 'Authentication failed. Please verify your API key is correct and active.',
        type: LLMProviderErrorType.AUTHENTICATION_ERROR
      };
    } else if (httpError.status === 403) {
      return {
        message: 'Access forbidden. Your API key may not have permission to access this resource.',
        type: LLMProviderErrorType.AUTHENTICATION_ERROR
      };
    } else if (httpError.status === 404) {
      return {
        message: 'Resource not found. Please check the API endpoint and model name.',
        type: LLMProviderErrorType.CONFIGURATION_ERROR
      };
    } else if (httpError.status === 429) {
      return {
        message: 'Rate limit exceeded. Please reduce request frequency or upgrade your plan.',
        type: LLMProviderErrorType.RATE_LIMIT_ERROR
      };
    } else if (httpError.status >= 500) {
      return {
        message: `OpenAI server error (${httpError.status}). The service is temporarily unavailable.`,
        type: LLMProviderErrorType.PROVIDER_UNAVAILABLE
      };
    }
    
    return {
      message: `OpenAI API request failed: ${httpError.message}`,
      type: LLMProviderErrorType.NETWORK_ERROR
    };
  }
  /**
   * Transform OpenAI response back to RAG format with enhanced validation
   */
  private transformFromOpenAIResponse(
    response: OpenAIResponse,
    request: OpenAIRequest,
    context: EnhancedRequestContext
  ): RAGResponse {
    if (!response.choices || response.choices.length === 0) {
      throw this.createError(
        'OpenAI API returned no choices in response',
        LLMProviderErrorType.RESPONSE_FORMAT_ERROR
      );
    }

    const choice = response.choices[0];
    if (!choice.message || !choice.message.content) {
      throw this.createError(
        'OpenAI API returned empty response content',
        LLMProviderErrorType.RESPONSE_FORMAT_ERROR
      );
    }

    const ragResponse: RAGResponse = {
      success: true,
      explanation: choice.message.content.trim(),
      model: response.model || request.model,
      // Add OpenAI-specific metadata
      usage: response.usage,
      responseId: response.id,
      finishReason: choice.finish_reason
    };

    this.logger.debug('Transformed OpenAI response to RAG format', {
      requestId: context.requestId,
      explanationLength: ragResponse.explanation?.length || 0,
      finishReason: choice.finish_reason,
      tokensUsed: response.usage?.total_tokens
    });

    return ragResponse;
  }

  /**
   * Test connectivity to OpenAI API
   */
  private async testConnectivity(): Promise<void> {
    const serverConfig = this.config.server!;
    const endpoint = this.normalizeChatCompletionsUrl(serverConfig.apiUrl);

    // Simple test request to validate connectivity and authentication
    const testRequest: OpenAIRequest = {
      model: serverConfig.model,
      messages: [
        {
          role: 'user',
          content: 'Test connectivity'
        }
      ],
      max_tokens: 1
    };

    const headers = {
      'Authorization': `Bearer ${serverConfig.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'hikma-engine/1.0.0 (connectivity-test)'
    };

    try {
      await this.httpClient.post<OpenAIResponse>(
        endpoint,
        testRequest,
        headers,
        { requestId: 'connectivity-test', startTime: Date.now(), attempt: 1, query: 'test', resultCount: 0 }
      );
    } catch (error) {
      if (error instanceof HTTPError && error.status === 401) {
        throw this.createError(
          'OpenAI API authentication failed during connectivity test',
          LLMProviderErrorType.AUTHENTICATION_ERROR,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Create enhanced request context with retry strategy
   */
  private createEnhancedRequestContext(query: string, searchResults: SearchResult[]): EnhancedRequestContext {
    return {
      requestId: this.generateRequestId(),
      startTime: Date.now(),
      attempt: 1,
      query: query.substring(0, 100), // Truncate for logging
      resultCount: searchResults.length,
      retryStrategy: {
        maxAttempts: this.config.retryAttempts + 1, // Include initial attempt
        baseDelay: this.config.retryDelay,
        maxDelay: Math.min(this.config.retryDelay * 16, 60000), // Cap at 1 minute
        backoffMultiplier: 2,
        jitterEnabled: true,
        retryableErrors: [
          LLMProviderErrorType.NETWORK_ERROR,
          LLMProviderErrorType.RATE_LIMIT_ERROR,
          LLMProviderErrorType.PROVIDER_UNAVAILABLE
        ]
      },
      retryHistory: []
    };
  }

  /**
   * Normalize a provided API base or full URL to the chat completions endpoint
   * Accepts inputs like base or full paths and returns a clean endpoint such as http://host:port/v1/chat/completions
   */
  private normalizeChatCompletionsUrl(rawUrl: string): string {
    try {
      let url = (rawUrl || '').trim();
      url = url.replace(/\/+$/, '');
      // If it already ends with /v1/chat/completions, keep it
      if (/\/v1\/chat\/completions$/i.test(url)) {
        return url;
      }
      // Strip trailing /v1 if present, then append full endpoint
      url = url.replace(/\/v1$/i, '').replace(/\/+$/, '');
      return `${url}/v1/chat/completions`;
    } catch {
      return rawUrl;
    }
  }

  /**
   * Validate RAG response format and content
   */
  private validateRAGResponse(response: RAGResponse): void {
    if (!response) {
      throw this.createError(
        'Invalid response: response is null or undefined',
        LLMProviderErrorType.RESPONSE_FORMAT_ERROR
      );
    }

    if (typeof response.success !== 'boolean') {
      throw this.createError(
        'Invalid response: success field must be a boolean',
        LLMProviderErrorType.RESPONSE_FORMAT_ERROR
      );
    }

    if (!response.model || typeof response.model !== 'string') {
      throw this.createError(
        'Invalid response: model field is required and must be a string',
        LLMProviderErrorType.RESPONSE_FORMAT_ERROR
      );
    }

    if (response.success) {
      if (!response.explanation || typeof response.explanation !== 'string') {
        throw this.createError(
          'Invalid response: explanation is required for successful responses',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }

      if (response.explanation.trim().length === 0) {
        throw this.createError(
          'Invalid response: explanation cannot be empty',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }
    } else {
      if (!response.error || typeof response.error !== 'string') {
        throw this.createError(
          'Invalid response: error message is required for failed responses',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }
    }

    // Validate usage information if present
    if (response.usage) {
      if (typeof response.usage !== 'object') {
        throw this.createError(
          'Invalid response: usage must be an object',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }

      const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
      
      if (prompt_tokens !== undefined && (typeof prompt_tokens !== 'number' || prompt_tokens < 0)) {
        throw this.createError(
          'Invalid response: prompt_tokens must be a non-negative number',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }

      if (completion_tokens !== undefined && (typeof completion_tokens !== 'number' || completion_tokens < 0)) {
        throw this.createError(
          'Invalid response: completion_tokens must be a non-negative number',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }

      if (total_tokens !== undefined && (typeof total_tokens !== 'number' || total_tokens < 0)) {
        throw this.createError(
          'Invalid response: total_tokens must be a non-negative number',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Categorize error types for proper handling
   */
  private categorizeError(errorMessage: string): LLMProviderErrorType {
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return LLMProviderErrorType.NETWORK_ERROR;
    } else if (lowerMessage.includes('authentication') || lowerMessage.includes('unauthorized')) {
      return LLMProviderErrorType.AUTHENTICATION_ERROR;
    } else if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
      return LLMProviderErrorType.RATE_LIMIT_ERROR;
    } else if (lowerMessage.includes('parse') || lowerMessage.includes('format')) {
      return LLMProviderErrorType.RESPONSE_FORMAT_ERROR;
    } else if (lowerMessage.includes('configuration') || lowerMessage.includes('config')) {
      return LLMProviderErrorType.CONFIGURATION_ERROR;
    } else if (lowerMessage.includes('unavailable') || lowerMessage.includes('server error')) {
      return LLMProviderErrorType.PROVIDER_UNAVAILABLE;
    }
    
    return LLMProviderErrorType.NETWORK_ERROR;
  }

  /**
   * Force refresh the availability check
   */
  async refreshAvailability(): Promise<boolean> {
    this._availabilityChecked = false;
    this._isAvailable = null;
    
    try {
      await this.testConnectivity();
      this._isAvailable = true;
    } catch {
      this._isAvailable = false;
    }
    
    this._availabilityChecked = true;
    return this._isAvailable;
  }

  /**
   * Get provider-specific information
   */
  getProviderInfo(): Record<string, any> {
    return {
      name: this.name,
      type: 'external',
      description: 'OpenAI-compatible API provider for external LLM services',
      isAvailable: this.isAvailable,
      configuration: {
        apiUrl: this.config.server?.apiUrl,
        model: this.config.server?.model,
        maxTokens: this.config.server?.maxTokens,
        temperature: this.config.server?.temperature,
        timeout: this.config.timeout
      },
      capabilities: [
        'code-explanation',
        'context-aware-responses',
        'external-api-integration',
        'advanced-language-models',
        'token-usage-tracking',
        'sophisticated-prompting'
      ]
    };
  }
}

/**
 * HTTP Error class for network-related errors
 */
class HTTPError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

/**
 * Sophisticated HTTP client for OpenAI API requests
 */
class HTTPClient {
  private config: HTTPClientConfig;

  constructor(config: HTTPClientConfig) {
    this.config = config;
  }

  async post<T>(
    url: string,
    data: any,
    headers: Record<string, string>,
    context: RequestContext
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(JSON.stringify(data)).toString()
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok) {
        throw new HTTPError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          responseText
        );
      }

      try {
        return JSON.parse(responseText) as T;
      } catch (parseError) {
        throw new HTTPError(
          `Failed to parse response JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          response.status,
          responseText
        );
      }

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HTTPError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new HTTPError(`Request timeout after ${this.config.timeout}ms`, 408);
      }

      throw new HTTPError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }
  }

  async cleanup(): Promise<void> {
    // Cleanup any persistent connections or resources
    // In this implementation, we're using fetch which doesn't require explicit cleanup
  }
}
