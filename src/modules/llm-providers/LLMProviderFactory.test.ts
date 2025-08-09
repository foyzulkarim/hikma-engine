/**
 * Tests for LLMProviderFactory
 */

import { LLMProviderFactory } from './LLMProviderFactory';
import { LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';

// Mock the provider imports to avoid actual implementation dependencies
jest.mock('./PythonLLMProvider', () => ({
  PythonLLMProvider: jest.fn().mockImplementation((config) => ({
    name: 'python',
    isAvailable: true,
    config,
    validateConfiguration: jest.fn().mockResolvedValue(true),
    generateExplanation: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('./OpenAILLMProvider', () => ({
  OpenAILLMProvider: jest.fn().mockImplementation((config) => ({
    name: 'openai',
    isAvailable: true,
    config,
    validateConfiguration: jest.fn().mockResolvedValue(true),
    generateExplanation: jest.fn(),
    cleanup: jest.fn()
  }))
}));

describe('LLMProviderFactory', () => {
  const validPythonConfig: LLMProviderConfig = {
    provider: 'python',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    python: {
      model: 'test-model',
      maxResults: 10
    }
  };

  const validOpenAIConfig: LLMProviderConfig = {
    provider: 'openai',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    openai: {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-test123456789',
      model: 'gpt-4'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createProvider', () => {
    it('should create Python provider successfully', async () => {
      const provider = await LLMProviderFactory.createProvider(validPythonConfig);
      
      expect(provider).toBeDefined();
      expect(provider.name).toBe('python');
      expect(provider.isAvailable).toBe(true);
      expect(provider.validateConfiguration).toHaveBeenCalled();
    });

    it('should create OpenAI provider successfully', async () => {
      const provider = await LLMProviderFactory.createProvider(validOpenAIConfig);
      
      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
      expect(provider.isAvailable).toBe(true);
      expect(provider.validateConfiguration).toHaveBeenCalled();
    });

    it('should throw error for unsupported provider', async () => {
      const invalidConfig = {
        ...validPythonConfig,
        provider: 'unsupported' as any
      };

      await expect(LLMProviderFactory.createProvider(invalidConfig))
        .rejects.toThrow('Unsupported provider: unsupported');
    });

    it('should throw error when provider validation fails', async () => {
      // Mock the provider to return false for validation
      const { PythonLLMProvider } = await import('./PythonLLMProvider');
      (PythonLLMProvider as jest.Mock).mockImplementationOnce((config) => ({
        name: 'python',
        isAvailable: true,
        config,
        validateConfiguration: jest.fn().mockResolvedValue(false),
        generateExplanation: jest.fn(),
        cleanup: jest.fn()
      }));

      await expect(LLMProviderFactory.createProvider(validPythonConfig))
        .rejects.toThrow('Provider configuration validation failed for python');
    });

    it('should warn when provider is not available', async () => {
      // Mock the provider to be unavailable
      const { PythonLLMProvider } = await import('./PythonLLMProvider');
      (PythonLLMProvider as jest.Mock).mockImplementationOnce((config) => ({
        name: 'python',
        isAvailable: false,
        config,
        validateConfiguration: jest.fn().mockResolvedValue(true),
        generateExplanation: jest.fn(),
        cleanup: jest.fn()
      }));

      const provider = await LLMProviderFactory.createProvider(validPythonConfig);
      expect(provider.isAvailable).toBe(false);
    });

    it('should handle provider import errors gracefully', async () => {
      // Create a separate test for import errors without affecting other tests
      const invalidConfig = {
        ...validPythonConfig,
        provider: 'nonexistent' as any
      };

      await expect(LLMProviderFactory.createProvider(invalidConfig))
        .rejects.toThrow('Unsupported provider: nonexistent');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of supported providers', () => {
      const providers = LLMProviderFactory.getAvailableProviders();
      
      expect(providers).toEqual(['python', 'openai']);
      expect(providers).toHaveLength(2);
    });

    it('should return a copy of the providers array', () => {
      const providers1 = LLMProviderFactory.getAvailableProviders();
      const providers2 = LLMProviderFactory.getAvailableProviders();
      
      expect(providers1).not.toBe(providers2); // Different array instances
      expect(providers1).toEqual(providers2); // Same content
    });
  });

  describe('validateProviderConfig', () => {
    describe('common validation', () => {
      it('should pass with valid configuration', () => {
        expect(() => LLMProviderFactory.validateProviderConfig('python', validPythonConfig))
          .not.toThrow();
      });

      it('should throw for unsupported provider', () => {
        expect(() => LLMProviderFactory.validateProviderConfig('unsupported', validPythonConfig))
          .toThrow('Unsupported provider: unsupported');
      });

      it('should throw for missing configuration', () => {
        expect(() => LLMProviderFactory.validateProviderConfig('python', null as any))
          .toThrow('Provider configuration is required');
      });

      it('should throw for invalid timeout', () => {
        const invalidConfig = { ...validPythonConfig, timeout: -1 };
        expect(() => LLMProviderFactory.validateProviderConfig('python', invalidConfig))
          .toThrow('timeout must be a positive number');
      });

      it('should throw for invalid retry attempts', () => {
        const invalidConfig = { ...validPythonConfig, retryAttempts: -1 };
        expect(() => LLMProviderFactory.validateProviderConfig('python', invalidConfig))
          .toThrow('retryAttempts must be a non-negative number');
      });

      it('should throw for invalid retry delay', () => {
        const invalidConfig = { ...validPythonConfig, retryDelay: -1 };
        expect(() => LLMProviderFactory.validateProviderConfig('python', invalidConfig))
          .toThrow('retryDelay must be a non-negative number');
      });
    });

    describe('Python provider validation', () => {
      it('should pass with valid Python configuration', () => {
        expect(() => LLMProviderFactory.validateProviderConfig('python', validPythonConfig))
          .not.toThrow();
      });

      it('should pass when Python config is undefined', () => {
        const configWithoutPython = { ...validPythonConfig };
        delete configWithoutPython.python;
        
        expect(() => LLMProviderFactory.validateProviderConfig('python', configWithoutPython))
          .not.toThrow();
      });

      it('should throw for invalid Python model', () => {
        const invalidConfig = {
          ...validPythonConfig,
          python: { ...validPythonConfig.python!, model: '' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('python', invalidConfig))
          .toThrow('python.model must be a non-empty string');
      });

      it('should throw for invalid Python maxResults', () => {
        const invalidConfig = {
          ...validPythonConfig,
          python: { ...validPythonConfig.python!, maxResults: 0 }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('python', invalidConfig))
          .toThrow('python.maxResults must be a positive number');
      });
    });

    describe('OpenAI provider validation', () => {
      it('should pass with valid OpenAI configuration', () => {
        expect(() => LLMProviderFactory.validateProviderConfig('openai', validOpenAIConfig))
          .not.toThrow();
      });

      it('should throw when OpenAI config is missing', () => {
        const configWithoutOpenAI = { ...validOpenAIConfig };
        delete configWithoutOpenAI.openai;
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', configWithoutOpenAI))
          .toThrow('OpenAI configuration is required when provider is set to "openai"');
      });

      it('should throw for missing API URL', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, apiUrl: '' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.apiUrl is required and must be a valid string');
      });

      it('should throw for invalid API URL format', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, apiUrl: 'invalid-url' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.apiUrl must be a valid URL');
      });

      it('should throw for missing API key', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, apiKey: '' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.apiKey is required and must be a valid string');
      });

      it('should throw for invalid API key format', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, apiKey: 'invalid-key' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.apiKey must start with "sk-" or "org-"');
      });

      it('should accept org- prefixed API keys', () => {
        const configWithOrgKey = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, apiKey: 'org-test123456789' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', configWithOrgKey))
          .not.toThrow();
      });

      it('should throw for missing model', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, model: '' }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.model is required and must be a valid string');
      });

      it('should throw for invalid maxTokens', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, maxTokens: -1 }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.maxTokens must be a positive number');
      });

      it('should throw for invalid temperature (too low)', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, temperature: -0.1 }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.temperature must be a number between 0 and 2');
      });

      it('should throw for invalid temperature (too high)', () => {
        const invalidConfig = {
          ...validOpenAIConfig,
          openai: { ...validOpenAIConfig.openai!, temperature: 2.1 }
        };
        
        expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
          .toThrow('openai.temperature must be a number between 0 and 2');
      });

      it('should accept valid temperature values', () => {
        const validTemperatures = [0, 0.5, 1.0, 1.5, 2.0];
        
        validTemperatures.forEach(temp => {
          const configWithTemp = {
            ...validOpenAIConfig,
            openai: { ...validOpenAIConfig.openai!, temperature: temp }
          };
          
          expect(() => LLMProviderFactory.validateProviderConfig('openai', configWithTemp))
            .not.toThrow();
        });
      });
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for supported providers', () => {
      expect(LLMProviderFactory.isProviderSupported('python')).toBe(true);
      expect(LLMProviderFactory.isProviderSupported('openai')).toBe(true);
    });

    it('should return false for unsupported providers', () => {
      expect(LLMProviderFactory.isProviderSupported('unsupported')).toBe(false);
      expect(LLMProviderFactory.isProviderSupported('')).toBe(false);
    });
  });

  describe('getProviderInfo', () => {
    it('should return detailed provider information', () => {
      const info = LLMProviderFactory.getProviderInfo();
      
      expect(info).toHaveProperty('python');
      expect(info).toHaveProperty('openai');
      
      expect(info.python).toHaveProperty('description');
      expect(info.python).toHaveProperty('requiredConfig');
      expect(info.python.requiredConfig).toContain('timeout');
      expect(info.python.requiredConfig).toContain('retryAttempts');
      expect(info.python.requiredConfig).toContain('retryDelay');
      
      expect(info.openai).toHaveProperty('description');
      expect(info.openai).toHaveProperty('requiredConfig');
      expect(info.openai.requiredConfig).toContain('openai.apiUrl');
      expect(info.openai.requiredConfig).toContain('openai.apiKey');
      expect(info.openai.requiredConfig).toContain('openai.model');
    });

    it('should return consistent information', () => {
      const info1 = LLMProviderFactory.getProviderInfo();
      const info2 = LLMProviderFactory.getProviderInfo();
      
      expect(info1).toEqual(info2);
    });
  });

  describe('error handling', () => {
    it('should create LLMProviderError with correct properties', async () => {
      const invalidConfig = {
        ...validPythonConfig,
        provider: 'unsupported' as any
      };

      try {
        await LLMProviderFactory.createProvider(invalidConfig);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).type).toBe(LLMProviderErrorType.CONFIGURATION_ERROR);
        expect((error as LLMProviderError).provider).toBe('factory');
      }
    });

    it('should handle multiple validation errors', () => {
      const invalidConfig = {
        ...validOpenAIConfig,
        timeout: -1,
        retryAttempts: -1,
        openai: {
          ...validOpenAIConfig.openai!,
          apiUrl: 'invalid-url',
          apiKey: 'invalid-key'
        }
      };

      expect(() => LLMProviderFactory.validateProviderConfig('openai', invalidConfig))
        .toThrow('timeout must be a positive number');
    });
  });
});
