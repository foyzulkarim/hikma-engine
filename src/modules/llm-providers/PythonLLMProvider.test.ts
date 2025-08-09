/**
 * Tests for PythonLLMProvider
 */

import { PythonLLMProvider } from './PythonLLMProvider';
import { LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';

// Mock the dependencies
jest.mock('../llm-rag', () => ({
  generateRAGExplanation: jest.fn(),
  cleanupRAGService: jest.fn()
}));

jest.mock('../../utils/python-dependency-checker', () => ({
  ensurePythonDependencies: jest.fn()
}));

jest.mock('../../config', () => ({
  getConfig: jest.fn(() => ({
    getAIConfig: () => ({
      rag: {
        model: 'test-model-from-config'
      }
    })
  }))
}));

import { generateRAGExplanation, cleanupRAGService } from '../llm-rag';
import { ensurePythonDependencies } from '../../utils/python-dependency-checker';

describe('PythonLLMProvider', () => {
  const validConfig: LLMProviderConfig = {
    provider: 'python',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    python: {
      model: 'test-python-model',
      maxResults: 10
    }
  };

  const mockSearchResults: SearchResult[] = [
    {
      file_path: 'test.ts',
      node_type: 'function',
      similarity: 0.9,
      source_text: 'function test() { return "hello"; }'
    },
    {
      file_path: 'utils.ts',
      node_type: 'class',
      similarity: 0.8,
      source_text: 'class Utils { static format() {} }'
    }
  ];

  const mockRAGResponse: RAGResponse = {
    success: true,
    explanation: 'This is a test explanation',
    model: 'test-python-model',
    device: 'cpu'
  };

  let provider: PythonLLMProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful Python dependencies by default
    (ensurePythonDependencies as jest.Mock).mockResolvedValue(undefined);
    
    // Mock successful RAG response by default
    (generateRAGExplanation as jest.Mock).mockResolvedValue(mockRAGResponse);
    
    provider = new PythonLLMProvider(validConfig);
  });

  describe('constructor', () => {
    it('should initialize with correct name', () => {
      expect(provider.name).toBe('python');
    });

    it('should initialize with provided config', () => {
      expect(provider['config']).toBe(validConfig);
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

    it('should return false when Python dependencies are not available', async () => {
      (ensurePythonDependencies as jest.Mock).mockRejectedValue(new Error('Python not found'));
      
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
        'test query',
        mockSearchResults,
        { model: 'custom-model' }
      );

      expect(result).toEqual(mockRAGResponse);
      expect(generateRAGExplanation).toHaveBeenCalledWith(
        'test query',
        mockSearchResults,
        expect.objectContaining({
          model: 'custom-model',
          timeout: 30000,
          maxResults: 10
        })
      );
    });

    it('should use provider config defaults when options not provided', async () => {
      await provider.generateExplanation('test query', mockSearchResults, {});

      expect(generateRAGExplanation).toHaveBeenCalledWith(
        'test query',
        mockSearchResults,
        expect.objectContaining({
          model: 'test-python-model',
          timeout: 30000,
          maxResults: 10
        })
      );
    });

    it('should use global config model when provider config not available', async () => {
      const configWithoutPython = { ...validConfig };
      delete configWithoutPython.python;
      
      const providerWithoutConfig = new PythonLLMProvider(configWithoutPython);
      await providerWithoutConfig.validateConfiguration();
      
      await providerWithoutConfig.generateExplanation('test query', mockSearchResults, {});

      expect(generateRAGExplanation).toHaveBeenCalledWith(
        'test query',
        mockSearchResults,
        expect.objectContaining({
          model: 'test-model-from-config',
          maxResults: 8 // default value
        })
      );
    });

    it('should throw error when provider is not available', async () => {
      (ensurePythonDependencies as jest.Mock).mockRejectedValue(new Error('Python not found'));
      const unavailableProvider = new PythonLLMProvider(validConfig);
      await unavailableProvider.validateConfiguration();

      await expect(unavailableProvider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('Python provider is not available');
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

    it('should handle RAG service errors', async () => {
      (generateRAGExplanation as jest.Mock).mockRejectedValue(new Error('RAG service failed'));

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('Python provider error: RAG service failed');
    });

    it('should handle timeout errors', async () => {
      (generateRAGExplanation as jest.Mock).mockRejectedValue(new Error('Request timed out'));

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.NETWORK_ERROR);
      }
    });

    it('should handle Python dependency errors', async () => {
      (generateRAGExplanation as jest.Mock).mockRejectedValue(new Error('Python dependencies not found'));

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.PROVIDER_UNAVAILABLE);
      }
    });

    it('should handle response format errors', async () => {
      (generateRAGExplanation as jest.Mock).mockRejectedValue(new Error('Failed to parse response'));

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.RESPONSE_FORMAT_ERROR);
      }
    });

    it('should handle null response from RAG service', async () => {
      (generateRAGExplanation as jest.Mock).mockResolvedValue(null);

      await expect(provider.generateExplanation('test query', mockSearchResults, {}))
        .rejects.toThrow('Python RAG service returned null response');
    });

    it('should normalize response structure', async () => {
      const incompleteResponse = {
        success: true,
        explanation: 'test explanation'
        // missing model and device
      };
      (generateRAGExplanation as jest.Mock).mockResolvedValue(incompleteResponse);

      const result = await provider.generateExplanation('test query', mockSearchResults, {});

      expect(result).toEqual({
        success: true,
        explanation: 'test explanation',
        error: undefined,
        model: 'test-python-model',
        device: undefined
      });
    });

    it('should add error message for failed responses without specific error', async () => {
      const failedResponse = {
        success: false,
        model: 'test-model'
        // missing error message
      };
      (generateRAGExplanation as jest.Mock).mockResolvedValue(failedResponse);

      const result = await provider.generateExplanation('test query', mockSearchResults, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Python RAG service failed without specific error message');
    });

    it('should use retry logic for failed requests', async () => {
      (generateRAGExplanation as jest.Mock)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue(mockRAGResponse);

      const result = await provider.generateExplanation('test query', mockSearchResults, {});

      expect(result).toEqual(mockRAGResponse);
      expect(generateRAGExplanation).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate successfully with valid configuration', async () => {
      const result = await provider.validateConfiguration();
      expect(result).toBe(true);
      expect(ensurePythonDependencies).toHaveBeenCalledWith(false, false);
    });

    it('should validate successfully without Python-specific config', async () => {
      const configWithoutPython = { ...validConfig };
      delete configWithoutPython.python;
      
      const providerWithoutConfig = new PythonLLMProvider(configWithoutPython);
      const result = await providerWithoutConfig.validateConfiguration();
      
      expect(result).toBe(true);
    });

    it('should throw error for invalid Python model', async () => {
      const invalidConfig = {
        ...validConfig,
        python: { ...validConfig.python!, model: '' }
      };
      
      const invalidProvider = new PythonLLMProvider(invalidConfig);
      
      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('Python model must be a non-empty string');
    });

    it('should throw error for invalid Python maxResults', async () => {
      const invalidConfig = {
        ...validConfig,
        python: { ...validConfig.python!, maxResults: 0 }
      };
      
      const invalidProvider = new PythonLLMProvider(invalidConfig);
      
      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('Python maxResults must be a positive number');
    });

    it('should handle Python dependency check failure gracefully', async () => {
      (ensurePythonDependencies as jest.Mock).mockRejectedValue(new Error('Python not found'));
      
      const result = await provider.validateConfiguration();
      
      expect(result).toBe(true); // Configuration is valid
      expect(provider.isAvailable).toBe(false); // But provider is not available
    });

    it('should throw error for invalid common configuration', async () => {
      const invalidConfig = { ...validConfig, timeout: -1 };
      const invalidProvider = new PythonLLMProvider(invalidConfig);
      
      await expect(invalidProvider.validateConfiguration())
        .rejects.toThrow('Invalid timeout configuration');
    });
  });

  describe('cleanup', () => {
    it('should cleanup successfully', async () => {
      await provider.cleanup();
      
      expect(cleanupRAGService).toHaveBeenCalled();
      expect(provider.isAvailable).toBe(false); // Availability cache should be reset
    });

    it('should handle cleanup errors gracefully', async () => {
      (cleanupRAGService as jest.Mock).mockRejectedValue(new Error('Cleanup failed'));
      
      // Should not throw, just log the error
      await expect(provider.cleanup()).resolves.toBeUndefined();
      expect(cleanupRAGService).toHaveBeenCalled();
    });
  });

  describe('refreshAvailability', () => {
    it('should refresh availability successfully', async () => {
      // Initially not available
      (ensurePythonDependencies as jest.Mock).mockRejectedValue(new Error('Python not found'));
      await provider.validateConfiguration();
      expect(provider.isAvailable).toBe(false);

      // Now make it available
      (ensurePythonDependencies as jest.Mock).mockResolvedValue(undefined);
      const result = await provider.refreshAvailability();
      
      expect(result).toBe(true);
      expect(provider.isAvailable).toBe(true);
    });

    it('should refresh availability when dependencies fail', async () => {
      // Initially available
      await provider.validateConfiguration();
      expect(provider.isAvailable).toBe(true);

      // Now make it unavailable
      (ensurePythonDependencies as jest.Mock).mockRejectedValue(new Error('Python not found'));
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
        name: 'python',
        type: 'local',
        description: 'Local Python-based LLM provider using the existing Python implementation',
        isAvailable: true,
        configuration: {
          model: 'test-python-model',
          maxResults: 10,
          timeout: 30000
        },
        capabilities: [
          'code-explanation',
          'context-aware-responses',
          'local-processing',
          'no-api-costs'
        ]
      });
    });

    it('should use default values when provider config is not available', async () => {
      const configWithoutPython = { ...validConfig };
      delete configWithoutPython.python;
      
      const providerWithoutConfig = new PythonLLMProvider(configWithoutPython);
      await providerWithoutConfig.validateConfiguration();
      
      const info = providerWithoutConfig.getProviderInfo();
      
      expect(info.configuration).toEqual({
        model: 'test-model-from-config',
        maxResults: 8,
        timeout: 30000
      });
    });
  });

  describe('error handling', () => {
    it('should create LLMProviderError with correct properties', async () => {
      (generateRAGExplanation as jest.Mock).mockRejectedValue(new Error('Test error'));
      await provider.validateConfiguration();

      try {
        await provider.generateExplanation('test query', mockSearchResults, {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).provider).toBe('python');
        expect((error as LLMProviderError).message).toContain('Python provider error: Test error');
      }
    });

    it('should preserve original error as cause', async () => {
      const originalError = new Error('Original error');
      (generateRAGExplanation as jest.Mock).mockRejectedValue(originalError);
      await provider.validateConfiguration();

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
