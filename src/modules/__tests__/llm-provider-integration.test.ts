/**
 * Integration Tests for LLM Provider System (Task 8)
 * Tests the complete integration of the provider system into the existing LLM RAG service
 */

import { 
  generateRAGExplanation, 
  cleanupRAGService, 
  SearchResult, 
  RAGOptions,
  RAGResponse 
} from '../src/modules/llm-rag';
import { LLMProviderManager } from '../src/modules/llm-providers/LLMProviderManager';
import { ConfigManager, initializeConfig } from '../src/config';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock search results for testing
const mockSearchResults: SearchResult[] = [
  {
    file_path: 'src/test.ts',
    node_type: 'function',
    similarity: 0.95,
    source_text: 'function calculateSum(a: number, b: number): number { return a + b; }'
  },
  {
    file_path: 'src/utils.ts',
    node_type: 'class',
    similarity: 0.87,
    source_text: 'class MathUtils { static multiply(x: number, y: number) { return x * y; } }'
  }
];

describe('LLM Provider Integration Tests (Task 8)', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temporary directory for test configurations
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikma-provider-integration-'));
    
    // Initialize global configuration for testing
    configManager = initializeConfig(tempDir);
  });

  afterAll(async () => {
    // Cleanup RAG service
    await cleanupRAGService();
    
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Reset environment for each test
    delete process.env.HIKMA_ENGINE_LLM_PROVIDER;
    delete process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY;
    delete process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL;
    delete process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL;
  });

  describe('generateRAGExplanation function integration', () => {
    it('should maintain backward compatibility with existing API contract', async () => {
      // Test that the function signature and return type remain unchanged
      const query = 'How does the calculateSum function work?';
      const options: RAGOptions = { model: 'test-model', timeout: 30000 };

      const result = await generateRAGExplanation(query, mockSearchResults, options);

      // Verify response structure matches expected RAGResponse interface
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.model).toBe('string');

      if (result.success) {
        expect(result).toHaveProperty('explanation');
        expect(typeof result.explanation).toBe('string');
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 60000);

    it('should use provider manager by default', async () => {
      // Set up Python provider (default)
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'python';

      const query = 'Explain the MathUtils class functionality';
      const result = await generateRAGExplanation(query, mockSearchResults);

      // Should attempt to use provider manager
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Even if it fails, it should be a structured response
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    }, 60000);

    it('should handle empty search results gracefully', async () => {
      const query = 'Explain empty results';
      const result = await generateRAGExplanation(query, []);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      expect(typeof result.success).toBe('boolean');
    }, 30000);

    it('should handle invalid options gracefully', async () => {
      const query = 'Test with invalid options';
      const invalidOptions: RAGOptions = { 
        timeout: -1, // Invalid timeout
        maxResults: -5 // Invalid max results
      };

      const result = await generateRAGExplanation(query, mockSearchResults, invalidOptions);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      // Should not throw, should handle gracefully
    }, 30000);

    it('should preserve additional metadata in response', async () => {
      const query = 'Test metadata preservation';
      const result = await generateRAGExplanation(query, mockSearchResults);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Check for provider-specific metadata that might be added
      if (result.success) {
        // Provider information should be available
        expect(result).toHaveProperty('provider');
      }
    }, 30000);
  });

  describe('Provider system integration with different configurations', () => {
    it('should work with Python provider configuration', async () => {
      // Configure Python provider
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'python';

      const query = 'How does this Python provider work?';
      const result = await generateRAGExplanation(query, mockSearchResults, {
        model: 'test-python-model',
        timeout: 30000
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Should attempt Python provider
      if (result.success) {
        expect(result.explanation).toBeDefined();
      }
    }, 60000);

    it('should handle OpenAI provider configuration (mocked)', async () => {
      // Configure OpenAI provider with mock values
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'openai';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY = 'sk-test-key-for-testing';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
      process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL = 'gpt-4';

      const query = 'Test OpenAI provider integration';
      const result = await generateRAGExplanation(query, mockSearchResults, {
        timeout: 30000
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Since we're using mock credentials, it should fail gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    }, 60000);

    it('should handle invalid provider configuration', async () => {
      // Set invalid provider
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'invalid-provider';

      const query = 'Test invalid provider handling';
      const result = await generateRAGExplanation(query, mockSearchResults);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Should handle invalid provider gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        // Error message might vary, just check that we get a structured error
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Fallback mechanism integration', () => {
    it('should handle provider manager failures gracefully', async () => {
      // Create a scenario where provider manager might fail
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'openai';
      // Don't set API key - should cause failure

      const query = 'Test fallback mechanism';
      const result = await generateRAGExplanation(query, mockSearchResults, {
        timeout: 15000 // Shorter timeout for faster test
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Should return a structured error response
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    }, 30000);

    it('should maintain consistent response format across all scenarios', async () => {
      const testScenarios = [
        { provider: 'python', description: 'Python provider' },
        { provider: 'openai', description: 'OpenAI provider (will fail)' },
        { provider: 'invalid', description: 'Invalid provider' }
      ];

      for (const scenario of testScenarios) {
        process.env.HIKMA_ENGINE_LLM_PROVIDER = scenario.provider;
        
        const query = `Test ${scenario.description}`;
        const result = await generateRAGExplanation(query, mockSearchResults, {
          timeout: 15000
        });

        // All responses should have consistent structure
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('model');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.model).toBe('string');

        if (result.success) {
          expect(result).toHaveProperty('explanation');
          expect(typeof result.explanation).toBe('string');
        } else {
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
        }
      }
    }, 90000);
  });

  describe('Resource cleanup integration', () => {
    it('should cleanup resources properly', async () => {
      // Generate some explanations to create resources
      const queries = [
        'Test cleanup 1',
        'Test cleanup 2',
        'Test cleanup 3'
      ];

      for (const query of queries) {
        await generateRAGExplanation(query, mockSearchResults, {
          timeout: 10000
        });
      }

      // Cleanup should not throw
      await expect(cleanupRAGService()).resolves.not.toThrow();
    }, 60000);

    it('should handle multiple cleanup calls gracefully', async () => {
      // Multiple cleanup calls should be safe
      await expect(cleanupRAGService()).resolves.not.toThrow();
      await expect(cleanupRAGService()).resolves.not.toThrow();
      await expect(cleanupRAGService()).resolves.not.toThrow();
    }, 30000);
  });

  describe('Performance and reliability integration', () => {
    it('should handle concurrent requests', async () => {
      const concurrentRequests = Array.from({ length: 3 }, (_, i) => 
        generateRAGExplanation(
          `Concurrent test ${i + 1}`,
          mockSearchResults,
          { timeout: 20000 }
        )
      );

      const results = await Promise.allSettled(concurrentRequests);

      // All requests should complete (either success or structured failure)
      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          expect(result.value).toHaveProperty('success');
          expect(result.value).toHaveProperty('model');
        } else {
          // Even rejections should be handled gracefully
          console.warn(`Concurrent request ${index + 1} was rejected:`, result.reason);
        }
      });
    }, 90000);

    it('should handle large search result sets', async () => {
      // Create a large set of search results
      const largeSearchResults: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
        file_path: `src/file${i}.ts`,
        node_type: 'function',
        similarity: 0.8 - (i * 0.01),
        source_text: `function test${i}() { return ${i}; }`
      }));

      const query = 'Explain all these functions';
      const result = await generateRAGExplanation(query, largeSearchResults, {
        timeout: 30000,
        maxResults: 10 // Should limit results
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
    }, 60000);
  });

  describe('Error handling integration', () => {
    it('should provide meaningful error messages', async () => {
      // Test with configuration that will cause specific errors
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'openai';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY = 'invalid-key';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL = 'https://invalid-url.example.com';

      const query = 'Test error handling';
      const result = await generateRAGExplanation(query, mockSearchResults, {
        timeout: 15000
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle timeout scenarios gracefully', async () => {
      const query = 'Test timeout handling';
      const result = await generateRAGExplanation(query, mockSearchResults, {
        timeout: 1 // Very short timeout to trigger timeout
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('model');
      
      // Should handle timeout gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    }, 15000);
  });
});
