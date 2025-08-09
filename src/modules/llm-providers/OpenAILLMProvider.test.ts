/**
 * Comprehensive tests for OpenAILLMProvider
 * Tests the sophisticated external API integration system
 */

import { OpenAILLMProvider } from './OpenAILLMProvider';
import { LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenAILLMProvider', () => {
  const validConfig: LLMProviderConfig = {
    provider: 'openai',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    openai: {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-test123456789',
      model: 'gpt-4',
      maxTokens: 400,
      temperature: 0.6
    }
  };

  const mockSearchResults: SearchResult[] = [
    {
      file_path: 'src/utils/helper.ts',
      node_type: 'function',
      similarity: 0.95,
      source_text: 'export function formatDate(date: Date): string {\n  return date.toISOString().split("T")[0];\n}'
    },
    {
      file_path: 'src/models/User.ts',
      node_type: 'class',
      similarity: 0.87,
      source_text: 'class User {\n  constructor(public name: string, public email: string) {}\n  \n  validate(): boolean {\n    return this.email.includes("@");\n  }\n}'
    }
  ];

  const mockOpenAIResponse = {
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: 1699000000,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'This code demonstrates a date formatting utility function and a User class with validation.'
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 150,
      completion_tokens: 50,
      total_tokens: 200
    }
  };

  let provider: OpenAILLMProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful fetch by default
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
    });
    
    provider = new OpenAILLMProvider(validConfig);
  });

  describe('constructor', () => {
    it('should initialize with correct name', () => {
      expect(provider.name).toBe('openai');
    });

    it('should throw error when OpenAI config is missing', () => {
      const configWithoutOpenAI = { ...validConfig };
      delete configWithoutOpenAI.openai;
      
      expect(() => new OpenAILLMProvider(configWithoutOpenAI))
        .toThrow('OpenAI configuration is required for OpenAI provider');
    });

    it('should initialize HTTP client with correct configuration', () => {
      expect(provider['httpClient']).toBeDefined();
      expect(provider['httpClient']['config']).toEqual({
        timeout: 30000,
        retries: 3,
        retryDelay: 1000,
        maxRetryDelay: 8000,
        userAgent: 'hikma-engine/1.0.0 (OpenAI Provider)'
      });
    });
  });

  describe('isAvailable', () => {
    it('should return false initially before validation', () => {
      expect(provider.isAvailable).toBe(false);
    });

    it('should return true after successful validation', async () => {
      await provider.validateConfiguration();
      expect(provider.isAvailable).toBe(true);
    });

    it('should return false when API is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      await provider.validateConfiguration();
      expect(provider.isAvailable).toBe(false);
    });
  });

  describe('generateExplanation', () => {
    beforeEach(async () => {
      // Ensure provider is available for these tests
      await provider.validateConfiguration();
    });

    it('should generate explanation successfully', async () => {
      const result = await provider.generateExplanation(
        'How does the date formatting work?',
        mockSearchResults,
        { model: 'gpt-3.5-turbo' }
      );

      expect(result).toEqual({
        success: true,
        explanation: 'This code demonstrates a date formatting utility function and a User class with validation.',
        model: 'gpt-4',
        usage: {
          prompt_tokens: 150,
          completion_tokens: 50,
          total_tokens: 200
        },
        responseId: 'chatcmpl-test123',
        finishReason: 'stop'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test123456789',
            'Content-Type': 'application/json',
            'User-Agent': 'hikma-engine/1.0.0'
          }),
          body: expect.stringContaining('How does the date formatting work?')
        })
      );
    });

    it('should use provider config defaults when options not provided', async () => {
      await provider.generateExplanation('test query', mockSearchResults, {});

      const requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(requestBody.model).toBe('gpt-4');
      expect(requestBody.max_tokens).toBe(400);
      expect(requestBody.temperature).toBe(0.6);
    });

    it('should override config with provided options', async () => {
      await provider.generateExplanation('test query', mockSearchResults, {
        model: 'gpt-3.5-turbo',
        maxTokens: 200
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(requestBody.model).toBe('gpt-3.5-turbo');
      expect(requestBody.max_tokens).toBe(200);
    });

    it('should build sophisticated context from search results', async () => {
      await provider.generateExplanation('test query', mockSearchResults, {});

      const requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      const userMessage = requestBody.messages[1].content;
      
      expect(userMessage).toContain('File: src/utils/helper.ts');
      expect(userMessage).toContain('Type: function');
      expect(userMessage).toContain('Similarity: 95.0%');
      expect(userMessage).toContain('formatDate');
      expect(userMessage).toContain('File: src/models/User.ts');
      expect(userMessage).toContain('Type: class');
      expect(userMessage).toContain('Similarity: 87.0%');
    });

    it('should select appropriate system prompt based on query', async () => {
      // Test debugging prompt selection
      await provider.generateExplanation('debug this error', mockSearchResults, {});
      let requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(requestBody.messages[0].content).toContain('debugging assistant');

      // Test architecture prompt selection
      mockFetch.mockClear();
      // Reset mock to successful response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
      });
      await provider.generateExplanation('explain the architecture pattern', mockSearchResults, {});
      requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(requestBody.messages[0].content).toContain('architecture expert');

      // Test default prompt selection
      mockFetch.mockClear();
      // Reset mock to successful response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
      });
      await provider.generateExplanation('how does this work', mockSearchResults, {});
      requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(requestBody.messages[0].content).toContain('senior software engineer');
    });

    it('should handle large context with intelligent truncation', async () => {
      const largeResults: SearchResult[] = Array.from({ length: 20 }, (_, i) => ({
        file_path: `src/file${i}.ts`,
        node_type: 'function',
        similarity: 0.9 - (i * 0.01),
        source_text: 'x'.repeat(1000) // Large source text
      }));

      await provider.generateExplanation('test query', largeResults, {});

      const requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      const userMessage = requestBody.messages[1].content;
      
      // Should not exceed reasonable length
      expect(userMessage.length).toBeLessThan(15000);
      // Should include highest similarity results first
      expect(userMessage).toContain('src/file0.ts');
    });

    it('should throw error when provider is not available', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const unavailableProvider = new OpenAILLMProvider(validConfig);
      await unavailableProvider.validateConfiguration();

      await expect(unavailableProvider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('OpenAI provider is not available');
    });

    it('should validate query input', async () => {
      await expect(provider.generateExplanation('', mockSearchResults, {}))
        .rejects.toThrow('Query must be a non-empty string');

      await expect(provider.generateExplanation('   ', mockSearchResults, {}))
        .rejects.toThrow('Query must be a non-empty string');
    });

    it('should validate search results input', async () => {
      await expect(provider.generateExplanation('test query', 'invalid' as any, {}))
        .rejects.toThrow('Search results must be an array');

      const invalidResults = [{ invalid: 'result' }] as any;
      await expect(provider.generateExplanation('test query', invalidResults, {}))
        .rejects.toThrow('Invalid search result format');
    });

    it('should handle OpenAI API authentication errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Invalid API key',
            type: 'authentication_error'
          }
        }))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.AUTHENTICATION_ERROR);
        expect((error as LLMProviderError).message).toContain('Invalid API key');
      }
    });

    it('should handle OpenAI API rate limit errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_error'
          }
        }))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.RATE_LIMIT_ERROR);
      }
    });

    it('should handle OpenAI API server errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Server error',
            type: 'server_error'
          }
        }))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.PROVIDER_UNAVAILABLE);
      }
    });

    it('should handle network timeout errors', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        })
      );

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.NETWORK_ERROR);
      }
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('invalid json')
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.NETWORK_ERROR);
      }
    });

    it('should handle empty response choices', async () => {
      const emptyResponse = { ...mockOpenAIResponse, choices: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(emptyResponse))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.RESPONSE_FORMAT_ERROR);
        expect((error as LLMProviderError).message).toContain('no choices in response');
      }
    });

    it('should handle empty response content', async () => {
      const emptyContentResponse = {
        ...mockOpenAIResponse,
        choices: [{ ...mockOpenAIResponse.choices[0], message: { role: 'assistant', content: '' } }]
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(emptyContentResponse))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.RESPONSE_FORMAT_ERROR);
        expect((error as LLMProviderError).message).toContain('empty response content');
      }
    });

    it('should use retry logic for failed requests', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        });

      const result = await provider.generateExplanation('test query', mockSearchResults, {});

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 for validation + 2 for retry
    });

    it('should include request tracking information', async () => {
      await provider.generateExplanation('test query', mockSearchResults, {});

      const requestHeaders = mockFetch.mock.calls[1][1].headers;
      expect(requestHeaders['X-Request-ID']).toMatch(/^openai-\d+-[a-z0-9]+$/);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate successfully with valid configuration', async () => {
      const result = await provider.validateConfiguration();
      expect(result).toBe(true);
      expect(provider.isAvailable).toBe(true);
    });

    it('should throw error for missing OpenAI configuration', async () => {
      const configWithoutOpenAI = { ...validConfig };
      delete configWithoutOpenAI.openai;
      
      // This should throw in constructor, not in validateConfiguration
      expect(() => new OpenAILLMProvider(configWithoutOpenAI))
        .toThrow('OpenAI configuration is required for OpenAI provider');
    });

    it('should throw error for invalid API URL', async () => {
      const invalidConfig = {
        ...validConfig,
        openai: { ...validConfig.openai!, apiUrl: 'invalid-url' }
      };
      const invalidProvider = new OpenAILLMProvider(invalidConfig);

      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('OpenAI API URL must be a valid URL');
    });

    it('should throw error for missing API key', async () => {
      const invalidConfig = {
        ...validConfig,
        openai: { ...validConfig.openai!, apiKey: '' }
      };
      const invalidProvider = new OpenAILLMProvider(invalidConfig);

      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('OpenAI API key is required');
    });

    it('should throw error for missing model', async () => {
      const invalidConfig = {
        ...validConfig,
        openai: { ...validConfig.openai!, model: '' }
      };
      const invalidProvider = new OpenAILLMProvider(invalidConfig);

      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('OpenAI model is required');
    });

    it('should throw error for invalid maxTokens', async () => {
      const invalidConfig = {
        ...validConfig,
        openai: { ...validConfig.openai!, maxTokens: -1 }
      };
      const invalidProvider = new OpenAILLMProvider(invalidConfig);

      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('OpenAI maxTokens must be a positive number');
    });

    it('should throw error for invalid temperature', async () => {
      const invalidConfig = {
        ...validConfig,
        openai: { ...validConfig.openai!, temperature: 3.0 }
      };
      const invalidProvider = new OpenAILLMProvider(invalidConfig);

      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('OpenAI temperature must be a number between 0 and 2');
    });

    it('should warn for potentially invalid API key format', async () => {
      const warnConfig = {
        ...validConfig,
        openai: { ...validConfig.openai!, apiKey: 'invalid-key-format' }
      };
      const warnProvider = new OpenAILLMProvider(warnConfig);

      // Should not throw, but should log warning
      const result = await warnProvider.validateConfiguration();
      expect(result).toBe(true);
    });

    it('should handle connectivity test failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await provider.validateConfiguration();
      
      expect(result).toBe(true); // Configuration is valid
      expect(provider.isAvailable).toBe(false); // But service is not available
    });

    it('should handle authentication errors during connectivity test', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('{"error": {"message": "Invalid API key"}}')
      });

      // The connectivity test should throw an error, which should be caught and re-thrown
      await expect(provider.validateConfiguration())
        .rejects.toThrow('OpenAI API authentication failed during connectivity test');
    });

    it('should throw error for invalid common configuration', async () => {
      const invalidConfig = { ...validConfig, timeout: -1 };
      const invalidProvider = new OpenAILLMProvider(invalidConfig);

      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('Invalid timeout configuration');
    });
  });

  describe('cleanup', () => {
    it('should cleanup successfully', async () => {
      await provider.cleanup();
      
      expect(provider.isAvailable).toBe(false); // Availability cache should be reset
    });

    it('should handle cleanup errors gracefully', async () => {
      // Mock HTTP client cleanup to throw error
      provider['httpClient'].cleanup = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
      
      // Should not throw, just log the error
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('refreshAvailability', () => {
    it('should refresh availability successfully', async () => {
      // Initially not available
      mockFetch.mockRejectedValue(new Error('Network error'));
      await provider.validateConfiguration();
      expect(provider.isAvailable).toBe(false);

      // Now make it available
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
      });
      
      const result = await provider.refreshAvailability();
      
      expect(result).toBe(true);
      expect(provider.isAvailable).toBe(true);
    });

    it('should refresh availability when API becomes unavailable', async () => {
      // Initially available
      await provider.validateConfiguration();
      expect(provider.isAvailable).toBe(true);

      // Now make it unavailable
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await provider.refreshAvailability();
      
      expect(result).toBe(false);
      expect(provider.isAvailable).toBe(false);
    });
  });

  describe('getProviderInfo', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should return comprehensive provider information', () => {
      const info = provider.getProviderInfo();
      
      expect(info).toEqual({
        name: 'openai',
        type: 'external',
        description: 'OpenAI-compatible API provider for external LLM services',
        isAvailable: true,
        configuration: {
          apiUrl: 'https://api.openai.com/v1/chat/completions',
          model: 'gpt-4',
          maxTokens: 400,
          temperature: 0.6,
          timeout: 30000
        },
        capabilities: [
          'code-explanation',
          'context-aware-responses',
          'external-api-integration',
          'advanced-language-models',
          'token-usage-tracking',
          'sophisticated-prompting'
        ]
      });
    });
  });

  describe('advanced features', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should generate unique request IDs', async () => {
      const requestId1 = provider['generateRequestId']();
      const requestId2 = provider['generateRequestId']();
      
      expect(requestId1).toMatch(/^openai-\d+-[a-z0-9]+$/);
      expect(requestId2).toMatch(/^openai-\d+-[a-z0-9]+$/);
      expect(requestId1).not.toBe(requestId2);
    });

    it('should estimate token counts reasonably', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          { role: 'system' as const, content: 'You are a helpful assistant.' },
          { role: 'user' as const, content: 'Hello, how are you?' }
        ]
      };
      
      const estimate = provider['estimateTokens'](request);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(100); // Should be reasonable for short text
    });

    it('should format search results with proper structure', async () => {
      const result: SearchResult = {
        file_path: 'test.ts',
        node_type: 'function',
        similarity: 0.85,
        source_text: 'function test() { return true; }'
      };
      
      const formatted = provider['formatSearchResult'](result);
      
      expect(formatted).toContain('File: test.ts');
      expect(formatted).toContain('Type: function');
      expect(formatted).toContain('Similarity: 85.0%');
      expect(formatted).toContain('function test() { return true; }');
    });

    it('should truncate search results when necessary', async () => {
      const result: SearchResult = {
        file_path: 'test.ts',
        node_type: 'function',
        similarity: 0.85,
        source_text: 'x'.repeat(1000)
      };
      
      const truncated = provider['truncateSearchResult'](result, 200);
      
      expect(truncated.length).toBeLessThanOrEqual(200);
      expect(truncated).toContain('[truncated]');
    });

    it('should categorize errors correctly', async () => {
      expect(provider['categorizeError']('timeout error')).toBe(LLMProviderErrorType.NETWORK_ERROR);
      expect(provider['categorizeError']('authentication failed')).toBe(LLMProviderErrorType.AUTHENTICATION_ERROR);
      expect(provider['categorizeError']('rate limit exceeded')).toBe(LLMProviderErrorType.RATE_LIMIT_ERROR);
      expect(provider['categorizeError']('parse error')).toBe(LLMProviderErrorType.RESPONSE_FORMAT_ERROR);
      expect(provider['categorizeError']('configuration invalid')).toBe(LLMProviderErrorType.CONFIGURATION_ERROR);
      expect(provider['categorizeError']('service unavailable')).toBe(LLMProviderErrorType.PROVIDER_UNAVAILABLE);
      expect(provider['categorizeError']('unknown error')).toBe(LLMProviderErrorType.NETWORK_ERROR);
    });
  });

  describe('error handling', () => {
    it('should create LLMProviderError with correct properties', async () => {
      // First make provider available
      await provider.validateConfiguration();
      
      // Then mock error for the actual request
      mockFetch.mockRejectedValue(new Error('Test error'));

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).provider).toBe('openai');
        expect((error as LLMProviderError).message).toContain('OpenAI provider error: Test error');
      }
    });

    it('should preserve original error as cause', async () => {
      // First make provider available
      await provider.validateConfiguration();
      
      const originalError = new Error('Original error');
      mockFetch.mockRejectedValue(originalError);

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).cause).toBe(originalError);
      }
    });
  });
});
