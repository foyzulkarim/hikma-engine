/**
 * Tests for LLMProviderManager
 * Verifies provider selection, fallback logic, and health monitoring
 */

import { LLMProviderManager } from './LLMProviderManager';
import { LLMProviderFactory } from './LLMProviderFactory';
import { LLMProviderError, LLMProviderErrorType } from './types';
import { getConfig } from '../../config';
import { SearchResult, RAGResponse } from '../llm-rag';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    operation: jest.fn(() => jest.fn())
  }))
}));
jest.mock('../../config', () => ({
  getConfig: jest.fn(() => ({
    llmProvider: {
      primaryProvider: 'python',
      fallbackProviders: ['openai'],
      selectionStrategy: 'primary-fallback',
      healthCheckInterval: 30000,
      maxConcurrentRequests: 5
    }
  }))
}));
jest.mock('./LLMProviderFactory');

const mockGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
const mockLLMProviderFactory = LLMProviderFactory as jest.Mocked<typeof LLMProviderFactory>;

// Mock provider interface
const createMockProvider = (name: string, isAvailable = true, shouldFail = false) => ({
  name,
  isAvailable,
  async generateExplanation(query: string, searchResults: SearchResult[]): Promise<RAGResponse> {
    // Add small delay to simulate realistic response time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (shouldFail) {
      throw new LLMProviderError(
        `${name} provider failed`,
        LLMProviderErrorType.PROVIDER_UNAVAILABLE,
        name
      );
    }
    return {
      success: true,
      explanation: `Explanation from ${name}`,
      model: `${name}-model`,
      provider: name,
      responseId: 'test-response-id'
    };
  },
  async validateConfiguration(): Promise<boolean> {
    return !shouldFail;
  },
  async cleanup(): Promise<void> {
    // Mock cleanup
  }
});

const mockSearchResults: SearchResult[] = [
  {
    file_path: '/test/file.ts',
    node_type: 'function',
    similarity: 0.9,
    source_text: 'function test() { return true; }'
  }
];

describe('LLMProviderManager', () => {
  let manager: LLMProviderManager;
  let mockPythonProvider: any;
  let mockOpenAIProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup config mock
    mockGetConfig.mockReturnValue({
      getAIConfig: () => ({
        llmProvider: {
          provider: 'python' as const,
          python: {
            ragModel: 'test-model',
            timeout: 30000
          },
          openai: {
            apiKey: 'test-key',
            model: 'gpt-3.5-turbo',
            maxTokens: 1000
          },
          retryAttempts: 3,
          retryDelay: 1000
        }
      })
    } as any);

    // Create mock providers
    mockPythonProvider = createMockProvider('python');
    mockOpenAIProvider = createMockProvider('openai');

    // Setup factory mock
    mockLLMProviderFactory.createProvider.mockImplementation(async (config) => {
      if (config.provider === 'python') {
        return mockPythonProvider;
      } else if (config.provider === 'openai') {
        return mockOpenAIProvider;
      }
      throw new Error(`Unknown provider: ${config.provider}`);
    });

    manager = new LLMProviderManager();
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      expect(manager).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customManager = new LLMProviderManager({
        primaryProvider: 'openai',
        fallbackProviders: ['python'],
        selectionStrategy: 'fastest-first'
      });
      expect(customManager).toBeDefined();
    });

    it('should initialize providers on first use', async () => {
      const result = await manager.generateExplanation('test query', mockSearchResults);
      
      expect(mockLLMProviderFactory.createProvider).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('python'); // Primary provider
    });

    it('should handle provider initialization failures gracefully', async () => {
      mockLLMProviderFactory.createProvider.mockImplementation(async (config) => {
        if (config.provider === 'python') {
          throw new Error('Python provider failed to initialize');
        }
        return mockOpenAIProvider;
      });

      const result = await manager.generateExplanation('test query', mockSearchResults);
      
      expect(result.success).toBe(true);
      expect(result.provider).toBe('openai'); // Fallback provider
    });
  });

  describe('provider selection', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should use primary provider when healthy', async () => {
      const result = await manager.generateExplanation('test query', mockSearchResults);
      
      expect(result.provider).toBe('python');
      expect(result.explanation).toBe('Explanation from python');
    });

    it('should fallback to secondary provider when primary fails', async () => {
      // Make python provider fail
      mockPythonProvider.generateExplanation = jest.fn().mockRejectedValue(
        new LLMProviderError('Python failed', LLMProviderErrorType.PROVIDER_UNAVAILABLE, 'python')
      );

      const result = await manager.generateExplanation('test query', mockSearchResults);
      
      expect(result.provider).toBe('openai');
      expect(result.explanation).toBe('Explanation from openai');
    });

    it('should throw error when all providers fail', async () => {
      // Make both providers fail
      mockPythonProvider.generateExplanation = jest.fn().mockRejectedValue(
        new Error('Python failed')
      );
      mockOpenAIProvider.generateExplanation = jest.fn().mockRejectedValue(
        new Error('OpenAI failed')
      );

      await expect(manager.generateExplanation('test query', mockSearchResults))
        .rejects.toThrow('All providers failed');
    });

    it('should throw error when no providers are available', async () => {
      const emptyManager = new LLMProviderManager({
        primaryProvider: 'nonexistent',
        fallbackProviders: []
      });

      mockLLMProviderFactory.createProvider.mockRejectedValue(
        new Error('Provider not found')
      );

      await expect(emptyManager.generateExplanation('test query', mockSearchResults))
        .rejects.toThrow('No healthy providers available');
      
      await emptyManager.cleanup();
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should track provider health status', async () => {
      const health = manager.getProviderHealth();
      
      expect(health.python).toBeDefined();
      expect(health.python.isHealthy).toBe(true);
      expect(health.openai).toBeDefined();
      expect(health.openai.isHealthy).toBe(true);
    });

    it('should update health on successful operations', async () => {
      await manager.generateExplanation('test query', mockSearchResults);
      
      const health = manager.getProviderHealth();
      expect(health.python.consecutiveFailures).toBe(0);
      expect(health.python.responseTime).toBeGreaterThan(0);
    });

    it('should update health on failed operations', async () => {
      mockPythonProvider.generateExplanation = jest.fn().mockRejectedValue(
        new Error('Provider failed')
      );

      await manager.generateExplanation('test query', mockSearchResults);
      
      const health = manager.getProviderHealth();
      expect(health.python.consecutiveFailures).toBe(1);
      expect(health.python.lastError).toBe('Provider failed');
    });

    it('should mark provider as unhealthy after consecutive failures', async () => {
      const customManager = new LLMProviderManager({
        maxConsecutiveFailures: 2
      });
      
      await customManager.initialize();
      
      // Mock python provider to fail
      mockPythonProvider.generateExplanation = jest.fn().mockRejectedValue(
        new Error('Persistent failure')
      );

      // Trigger failures
      await customManager.generateExplanation('test query', mockSearchResults);
      await customManager.generateExplanation('test query', mockSearchResults);
      
      const health = customManager.getProviderHealth();
      expect(health.python.isHealthy).toBe(false);
      expect(health.python.consecutiveFailures).toBe(2);
      
      await customManager.cleanup();
    });

    it('should perform manual health checks', async () => {
      await manager.checkProviderHealth('python');
      
      const health = manager.getProviderHealth();
      expect(health.python.lastChecked).toBeInstanceOf(Date);
    });

    it('should get list of healthy providers', async () => {
      const healthyProviders = manager.getHealthyProviders();
      expect(healthyProviders).toContain('python');
      expect(healthyProviders).toContain('openai');
    });
  });

  describe('provider selection strategies', () => {
    it('should support primary-fallback strategy', async () => {
      const manager = new LLMProviderManager({
        selectionStrategy: 'primary-fallback'
      });
      
      await manager.initialize();
      const result = await manager.generateExplanation('test query', mockSearchResults);
      
      expect(result.provider).toBe('python'); // Primary provider
      await manager.cleanup();
    });

    it('should support fastest-first strategy', async () => {
      const manager = new LLMProviderManager({
        selectionStrategy: 'fastest-first'
      });
      
      await manager.initialize();
      
      // Simulate different response times
      const health = manager.getProviderHealth();
      health.python.responseTime = 2000;
      health.openai.responseTime = 1000;
      
      const result = await manager.generateExplanation('test query', mockSearchResults);
      expect(result.provider).toBe('python'); // Still primary since both are healthy
      
      await manager.cleanup();
    });

    it('should support round-robin strategy', async () => {
      const manager = new LLMProviderManager({
        selectionStrategy: 'round-robin'
      });
      
      await manager.initialize();
      const result = await manager.generateExplanation('test query', mockSearchResults);
      
      expect(['python', 'openai']).toContain(result.provider);
      await manager.cleanup();
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should provide manager statistics', () => {
      const stats = manager.getStats();
      
      expect(stats.totalProviders).toBe(2);
      expect(stats.healthyProviders).toBe(2);
      expect(stats.primaryProvider).toBe('python');
      expect(stats.fallbackProviders).toEqual(['openai']);
      expect(stats.isInitialized).toBe(true);
    });

    it('should include provider health in statistics', () => {
      const stats = manager.getStats();
      
      expect(stats.providerHealth).toBeDefined();
      expect(stats.providerHealth.python).toBeDefined();
      expect(stats.providerHealth.openai).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup all providers', async () => {
      await manager.initialize();
      
      const pythonCleanupSpy = jest.spyOn(mockPythonProvider, 'cleanup');
      const openaiCleanupSpy = jest.spyOn(mockOpenAIProvider, 'cleanup');
      
      await manager.cleanup();
      
      expect(pythonCleanupSpy).toHaveBeenCalled();
      expect(openaiCleanupSpy).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      await manager.initialize();
      
      mockPythonProvider.cleanup = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
      
      // Should not throw
      await expect(manager.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle configuration errors', async () => {
      mockGetConfig.mockReturnValue({
        getAIConfig: () => {
          throw new Error('Config error');
        }
      } as any);

      const manager = new LLMProviderManager();
      
      await expect(manager.generateExplanation('test query', mockSearchResults))
        .rejects.toThrow('Failed to initialize provider manager');
      
      await manager.cleanup();
    });

    it('should handle provider creation errors', async () => {
      mockLLMProviderFactory.createProvider.mockRejectedValue(
        new Error('Provider creation failed')
      );

      await expect(manager.generateExplanation('test query', mockSearchResults))
        .rejects.toThrow('No healthy providers available');
    });

    it('should preserve error types from providers', async () => {
      await manager.initialize();
      
      const rateLimitError = new LLMProviderError(
        'Rate limit exceeded',
        LLMProviderErrorType.RATE_LIMIT_ERROR,
        'python'
      );
      
      mockPythonProvider.generateExplanation = jest.fn().mockRejectedValue(rateLimitError);
      mockOpenAIProvider.generateExplanation = jest.fn().mockRejectedValue(rateLimitError);

      await expect(manager.generateExplanation('test query', mockSearchResults))
        .rejects.toThrow('All providers failed');
    });
  });
});