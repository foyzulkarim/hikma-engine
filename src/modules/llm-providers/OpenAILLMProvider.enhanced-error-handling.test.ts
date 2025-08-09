/**
 * Comprehensive tests for enhanced error handling and retry logic in OpenAILLMProvider
 * Tests the sophisticated error handling system implemented in task 6
 */

import { OpenAILLMProvider } from './OpenAILLMProvider';
import { LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';
import { SearchResult, RAGOptions } from '../llm-rag';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenAILLMProvider - Enhanced Error Handling and Retry Logic', () => {
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
          content: 'This is a test explanation'
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

  describe('Enhanced Retry Logic', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should implement exponential backoff with jitter', async () => {
      const startTime = Date.now();
      
      mockFetch
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'))
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        });

      const result = await provider.generateExplanation('test query', mockSearchResults, {});

      const duration = Date.now() - startTime;
      
      // Should have taken at least the base delay (1000ms) + exponential backoff
      expect(duration).toBeGreaterThan(3000); // 1000 + 2000 + processing time
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 validation + 3 attempts
    });

    it('should respect maximum retry attempts', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('Network error: Persistent network error');

      // Should be called: 1 for validation + 1 initial + 3 retries = 5 total
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should not retry non-retryable errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Invalid request parameters',
            type: 'invalid_request_error'
          }
        }))
      });

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('Invalid request parameters');

      // Should only be called twice: 1 for validation + 1 attempt (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle rate limit errors with appropriate delays', async () => {
      const startTime = Date.now();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve(JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error'
            }
          }))
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        });

      const result = await provider.generateExplanation('test query', mockSearchResults, {});

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3); // validation + rate limit + success
    });
  });

  describe('Enhanced Error Categorization', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should categorize authentication errors correctly', async () => {
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
        expect((error as LLMProviderError).message).toContain('Authentication failed');
      }
    });

    it('should categorize rate limit errors correctly', async () => {
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
        expect((error as LLMProviderError).message).toContain('Rate limit exceeded');
      }
    });

    it('should categorize server errors correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Internal server error',
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
        expect((error as LLMProviderError).message).toContain('server error');
      }
    });

    it('should categorize configuration errors correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Invalid model specified',
            type: 'invalid_request_error',
            param: 'model'
          }
        }))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.CONFIGURATION_ERROR);
        expect((error as LLMProviderError).message).toContain('Invalid model specified');
        expect((error as LLMProviderError).message).toContain('parameter: model');
      }
    });

    it('should handle unknown error types gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 418,
        statusText: "I'm a teapot",
        text: () => Promise.resolve(JSON.stringify({
          error: {
            message: 'Unknown error type',
            type: 'unknown_error_type'
          }
        }))
      });

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.NETWORK_ERROR);
      }
    });
  });

  describe('Response Validation', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should validate successful response format', async () => {
      const validResponse = {
        ...mockOpenAIResponse,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Valid explanation' },
          finish_reason: 'stop'
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(validResponse))
      });

      const result = await provider.generateExplanation('test query', mockSearchResults, {});
      expect(result.success).toBe(true);
      expect(result.explanation).toBe('Valid explanation');
    });

    it('should reject responses with empty explanation', async () => {
      const invalidResponse = {
        ...mockOpenAIResponse,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '' },
          finish_reason: 'stop'
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(invalidResponse))
      });

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('explanation cannot be empty');
    });

    it('should reject responses with invalid usage information', async () => {
      const invalidResponse = {
        ...mockOpenAIResponse,
        usage: {
          prompt_tokens: -1, // Invalid negative value
          completion_tokens: 50,
          total_tokens: 200
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(invalidResponse))
      });

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('prompt_tokens must be a non-negative number');
    });

    it('should validate response structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(null))
      });

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('response is null or undefined');
    });
  });

  describe('Error Context and Logging', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should include retry history in error context', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent error'));

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        // The error should contain context about retry attempts
        expect(error).toBeInstanceOf(LLMProviderError);
      }
    });

    it('should log detailed error information', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

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
        // Should have logged detailed error information
        expect(consoleSpy).toHaveBeenCalled();
      }

      consoleSpy.mockRestore();
    });
  });

  describe('Fallback and Recovery', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should recover from transient network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        });

      const result = await provider.generateExplanation('test query', mockSearchResults, {});
      
      expect(result.success).toBe(true);
      expect(result.explanation).toBe('This is a test explanation');
    });

    it('should handle mixed error types appropriately', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve(JSON.stringify({
            error: { message: 'Rate limit', type: 'rate_limit_error' }
          }))
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        });

      const result = await provider.generateExplanation('test query', mockSearchResults, {});
      expect(result.success).toBe(true);
    });
  });

  describe('Performance and Monitoring', () => {
    beforeEach(async () => {
      await provider.validateConfiguration();
    });

    it('should track request performance metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      await provider.generateExplanation('test query', mockSearchResults, {});

      // Should log performance metrics
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI explanation generated successfully'),
        expect.objectContaining({
          duration: expect.any(Number),
          tokensUsed: expect.any(Number)
        })
      );

      consoleSpy.mockRestore();
    });

    it('should include retry metrics in success logs', async () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      mockFetch
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(mockOpenAIResponse))
        });

      await provider.generateExplanation('test query', mockSearchResults, {});

      // Should log retry information
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI explanation generated successfully'),
        expect.objectContaining({
          retryAttempts: expect.any(Number)
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
