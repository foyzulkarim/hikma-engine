/**
 * Tests for BaseProvider abstract class
 */

import { BaseProvider } from './BaseProvider';
import { LLMProviderConfig, LLMProviderErrorType } from './types';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';

// Mock implementation for testing
class TestProvider extends BaseProvider {
  readonly name = 'test';
  readonly isAvailable = true;

  async generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse> {
    return {
      success: true,
      explanation: 'Test explanation',
      model: 'test-model'
    };
  }

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for test
  }
}

describe('BaseProvider', () => {
  const mockConfig: LLMProviderConfig = {
    provider: 'python',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  };

  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(provider['config']).toBe(mockConfig);
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('test');
    });

    it('should be available', () => {
      expect(provider.isAvailable).toBe(true);
    });
  });

  describe('logger', () => {
    it('should create logger with provider name', () => {
      const logger = provider['logger'];
      expect(logger).toBeDefined();
    });
  });

  describe('createError', () => {
    it('should create provider-specific error', () => {
      const error = provider['createError']('Test error', LLMProviderErrorType.CONFIGURATION_ERROR);
      
      expect(error.message).toBe('Test error');
      expect(error.type).toBe(LLMProviderErrorType.CONFIGURATION_ERROR);
      expect(error.provider).toBe('test');
      expect(error.name).toBe('LLMProviderError');
    });

    it('should include cause if provided', () => {
      const cause = new Error('Original error');
      const error = provider['createError']('Test error', LLMProviderErrorType.NETWORK_ERROR, cause);
      
      expect(error.cause).toBe(cause);
    });
  });

  describe('validateCommonConfig', () => {
    it('should pass with valid config', () => {
      expect(() => provider['validateCommonConfig']()).not.toThrow();
    });

    it('should throw for invalid timeout', () => {
      provider['config'].timeout = -1;
      expect(() => provider['validateCommonConfig']()).toThrow('Invalid timeout configuration');
    });

    it('should throw for invalid retry attempts when timeout is valid', () => {
      const invalidConfig: LLMProviderConfig = {
        provider: 'python',
        timeout: 30000, // valid
        retryAttempts: -1, // invalid
        retryDelay: 1000 // valid
      };
      const testProvider = new TestProvider(invalidConfig);
      expect(() => testProvider['validateCommonConfig']()).toThrow('Invalid retry attempts configuration');
    });

    it('should throw for invalid retry delay when timeout and retry attempts are valid', () => {
      const invalidConfig: LLMProviderConfig = {
        provider: 'python',
        timeout: 30000, // valid
        retryAttempts: 3, // valid
        retryDelay: -1 // invalid
      };
      const testProvider = new TestProvider(invalidConfig);
      expect(() => testProvider['validateCommonConfig']()).toThrow('Invalid retry delay configuration');
    });
  });

  describe('validateSearchResults', () => {
    it('should pass with valid search results', () => {
      const searchResults: SearchResult[] = [
        {
          file_path: 'test.ts',
          node_type: 'function',
          similarity: 0.8,
          source_text: 'function test() {}'
        }
      ];
      
      expect(() => provider['validateSearchResults'](searchResults)).not.toThrow();
    });

    it('should throw for non-array input', () => {
      expect(() => provider['validateSearchResults']('invalid' as any)).toThrow('Search results must be an array');
    });

    it('should throw for invalid search result format', () => {
      const invalidResults = [{ invalid: 'result' }] as any;
      expect(() => provider['validateSearchResults'](invalidResults)).toThrow('Invalid search result format');
    });
  });

  describe('validateQuery', () => {
    it('should pass with valid query', () => {
      expect(() => provider['validateQuery']('test query')).not.toThrow();
    });

    it('should throw for empty query', () => {
      expect(() => provider['validateQuery']('')).toThrow('Query must be a non-empty string');
    });

    it('should throw for whitespace-only query', () => {
      expect(() => provider['validateQuery']('   ')).toThrow('Query must be a non-empty string');
    });

    it('should throw for non-string query', () => {
      expect(() => provider['validateQuery'](123 as any)).toThrow('Query must be a non-empty string');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await provider['withRetry'](operation, 'test operation');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      const result = await provider['withRetry'](operation, 'test operation');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(provider['withRetry'](operation, 'test operation')).rejects.toThrow('Persistent failure');
      expect(operation).toHaveBeenCalledTimes(4); // Initial attempt + 3 retries
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await provider['sleep'](100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });
});
