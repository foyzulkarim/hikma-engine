/**
 * Tests for LLM Provider Configuration Validation
 * This test suite validates the LLM provider configuration system implemented in task 2
 */

import { ConfigManager } from '../src/config';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('LLM Provider Configuration Validation', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    // Create a temporary directory for test configurations
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikma-test-'));
    tempConfigPath = path.join(tempDir, 'config.json');
    
    // Initialize ConfigManager with temp directory
    configManager = new ConfigManager(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateLLMProviderConfig', () => {
    describe('common configuration validation', () => {
      it('should pass with valid common configuration', () => {
        expect(() => configManager.validateLLMProviderConfig()).not.toThrow();
      });

      it('should throw error for invalid timeout', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              timeout: -1
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('LLM provider timeout must be a positive number');
      });

      it('should throw error for zero timeout', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              timeout: 0
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('LLM provider timeout must be a positive number');
      });

      it('should throw error for invalid retry attempts', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              retryAttempts: -1
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('LLM provider retry attempts must be a non-negative number');
      });

      it('should throw error for invalid retry delay', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              retryDelay: -1
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('LLM provider retry delay must be a non-negative number');
      });
    });

    describe('OpenAI provider validation', () => {
      beforeEach(() => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test123456789',
                model: 'gpt-3.5-turbo'
              }
            }
          }
        });
      });

      it('should pass with valid OpenAI configuration', () => {
        expect(() => configManager.validateLLMProviderConfig()).not.toThrow();
      });

      it('should throw error when OpenAI config is missing', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: undefined
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI configuration is required when provider is set to "openai"');
      });

      it('should throw error for missing API URL', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: '',
                apiKey: 'sk-test123456789',
                model: 'gpt-3.5-turbo'
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI API URL is required and must be a valid string');
      });

      it('should throw error for missing API key', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: '',
                model: 'gpt-3.5-turbo'
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI API key is required and must be a valid string');
      });

      it('should throw error for missing model', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test123456789',
                model: ''
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI model is required and must be a valid string');
      });

      it('should throw error for invalid API URL format', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'invalid-url',
                apiKey: 'sk-test123456789',
                model: 'gpt-3.5-turbo'
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI API URL must be a valid URL');
      });

      it('should throw error for invalid API key format', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'invalid-key-format',
                model: 'gpt-3.5-turbo'
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI API key must start with "sk-" or "org-"');
      });

      it('should accept org- prefixed API keys', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'org-test123456789',
                model: 'gpt-3.5-turbo'
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig()).not.toThrow();
      });

      it('should throw error for invalid maxTokens', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test123456789',
                model: 'gpt-3.5-turbo',
                maxTokens: -1
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI max tokens must be a positive number');
      });

      it('should throw error for invalid temperature (too low)', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test123456789',
                model: 'gpt-3.5-turbo',
                temperature: -0.1
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI temperature must be a number between 0 and 2');
      });

      it('should throw error for invalid temperature (too high)', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'openai',
              openai: {
                apiUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test123456789',
                model: 'gpt-3.5-turbo',
                temperature: 2.1
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('OpenAI temperature must be a number between 0 and 2');
      });

      it('should accept valid temperature values', () => {
        const validTemperatures = [0, 0.5, 1.0, 1.5, 2.0];
        
        validTemperatures.forEach(temp => {
          configManager.updateConfig({
            ai: {
              ...configManager.getAIConfig(),
              llmProvider: {
                ...configManager.getAIConfig().llmProvider,
                provider: 'openai',
                openai: {
                  apiUrl: 'https://api.openai.com/v1',
                  apiKey: 'sk-test123456789',
                  model: 'gpt-3.5-turbo',
                  temperature: temp
                }
              }
            }
          });

          expect(() => configManager.validateLLMProviderConfig()).not.toThrow();
        });
      });
    });

    describe('Python provider validation', () => {
      beforeEach(() => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'python',
              python: {
                model: 'test-model',
                maxResults: 10
              }
            }
          }
        });
      });

      it('should pass with valid Python configuration', () => {
        expect(() => configManager.validateLLMProviderConfig()).not.toThrow();
      });

      it('should pass when Python config is undefined (optional)', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'python',
              python: undefined
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig()).not.toThrow();
      });

      it('should throw error for invalid model', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'python',
              python: {
                model: '',
                maxResults: 10
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('Python model must be a valid string');
      });

      it('should throw error for invalid maxResults', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'python',
              python: {
                model: 'test-model',
                maxResults: 0
              }
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('Python max results must be a positive number');
      });
    });

    describe('unsupported provider validation', () => {
      it('should throw error for unsupported provider', () => {
        configManager.updateConfig({
          ai: {
            ...configManager.getAIConfig(),
            llmProvider: {
              ...configManager.getAIConfig().llmProvider,
              provider: 'unsupported' as any
            }
          }
        });

        expect(() => configManager.validateLLMProviderConfig())
          .toThrow('Unsupported LLM provider: unsupported');
      });
    });
  });

  describe('environment variable integration', () => {
    beforeEach(() => {
      // Clear any existing environment variables
      delete process.env.HIKMA_ENGINE_LLM_PROVIDER;
      delete process.env.HIKMA_ENGINE_LLM_TIMEOUT;
      delete process.env.HIKMA_ENGINE_LLM_RETRY_ATTEMPTS;
      delete process.env.HIKMA_ENGINE_LLM_RETRY_DELAY;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE;
      delete process.env.HIKMA_ENGINE_LLM_PYTHON_MODEL;
      delete process.env.HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS;
    });

    afterEach(() => {
      // Clean up environment variables
      delete process.env.HIKMA_ENGINE_LLM_PROVIDER;
      delete process.env.HIKMA_ENGINE_LLM_TIMEOUT;
      delete process.env.HIKMA_ENGINE_LLM_RETRY_ATTEMPTS;
      delete process.env.HIKMA_ENGINE_LLM_RETRY_DELAY;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS;
      delete process.env.HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE;
      delete process.env.HIKMA_ENGINE_LLM_PYTHON_MODEL;
      delete process.env.HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS;
    });

    it('should use environment variables for OpenAI configuration', () => {
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'openai';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL = 'https://api.openai.com/v1';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY = 'sk-env-test123456789';
      process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL = 'gpt-4';
      process.env.HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS = '2000';
      process.env.HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE = '0.7';

      // Create a new ConfigManager to pick up environment variables
      const envConfigManager = new ConfigManager(tempDir);
      
      expect(() => envConfigManager.validateLLMProviderConfig()).not.toThrow();
      
      const aiConfig = envConfigManager.getAIConfig();
      expect(aiConfig.llmProvider.provider).toBe('openai');
      expect(aiConfig.llmProvider.openai?.apiUrl).toBe('https://api.openai.com/v1');
      expect(aiConfig.llmProvider.openai?.apiKey).toBe('sk-env-test123456789');
      expect(aiConfig.llmProvider.openai?.model).toBe('gpt-4');
      expect(aiConfig.llmProvider.openai?.maxTokens).toBe(2000);
      expect(aiConfig.llmProvider.openai?.temperature).toBe(0.7);
    });

    it('should use environment variables for Python configuration', () => {
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'python';
      process.env.HIKMA_ENGINE_LLM_PYTHON_MODEL = 'env-python-model';
      process.env.HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS = '15';

      // Create a new ConfigManager to pick up environment variables
      const envConfigManager = new ConfigManager(tempDir);
      
      expect(() => envConfigManager.validateLLMProviderConfig()).not.toThrow();
      
      const aiConfig = envConfigManager.getAIConfig();
      expect(aiConfig.llmProvider.provider).toBe('python');
      expect(aiConfig.llmProvider.python?.model).toBe('env-python-model');
      expect(aiConfig.llmProvider.python?.maxResults).toBe(15);
    });

    it('should validate environment variable values', () => {
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'openai';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL = 'invalid-url';
      process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY = 'invalid-key';
      process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL = 'gpt-4';

      // Create a new ConfigManager to pick up environment variables
      const envConfigManager = new ConfigManager(tempDir);
      
      expect(() => envConfigManager.validateLLMProviderConfig())
        .toThrow('OpenAI API URL must be a valid URL');
    });
  });
});