/**
 * @file Unit tests for configuration management system
 * Tests configuration loading, validation, environment variable processing,
 * default value handling, and configuration update functionality.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ConfigManager, initializeConfig, getConfig, AppConfig } from './index';

// Mock file system operations
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const testProjectRoot = '/tmp/test-project';
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment variables to clean state
    process.env = { NODE_ENV: 'test' };
    
    configManager = new ConfigManager(testProjectRoot);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initialization and default configuration', () => {
    it('should initialize with complete default configuration structure', () => {
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('ai');
      expect(config).toHaveProperty('indexing');
      expect(config).toHaveProperty('logging');
    });

    it('should have valid default database configuration', () => {
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite).toBeDefined();
      expect(dbConfig.sqlite.path).toBeDefined();
      expect(dbConfig.sqlite.vectorExtension).toBeDefined();
      expect(typeof dbConfig.sqlite.path).toBe('string');
      expect(typeof dbConfig.sqlite.vectorExtension).toBe('string');
    });

    it('should have valid default AI configuration', () => {
      const aiConfig = configManager.getAIConfig();
      
      expect(aiConfig.embedding).toBeDefined();
      expect(aiConfig.summary).toBeDefined();
      expect(aiConfig.embedding.model).toBe('jinaai/jina-embeddings-v2-base-code');
      expect(aiConfig.embedding.batchSize).toBe(32);
      expect(aiConfig.embedding.provider).toBe('transformers');
      expect(aiConfig.summary.model).toBe('Xenova/distilgpt2');
      expect(aiConfig.summary.maxTokens).toBe(256);
    });

    it('should have valid default indexing configuration', () => {
      const indexingConfig = configManager.getIndexingConfig();
      
      expect(Array.isArray(indexingConfig.filePatterns)).toBe(true);
      expect(Array.isArray(indexingConfig.ignorePatterns)).toBe(true);
      expect(Array.isArray(indexingConfig.supportedLanguages)).toBe(true);
      expect(indexingConfig.maxFileSize).toBe(1024 * 1024);
      expect(indexingConfig.filePatterns.length).toBeGreaterThan(0);
      expect(indexingConfig.ignorePatterns).toContain('**/node_modules/**');
    });

    it('should have valid default logging configuration', () => {
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig.level).toBe('info');
      expect(loggingConfig.enableConsole).toBe(true);
      expect(loggingConfig.enableFile).toBe(false);
      expect(['debug', 'info', 'warn', 'error']).toContain(loggingConfig.level);
    });

    it('should resolve relative paths to absolute paths based on project root', () => {
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.path).toBe(path.resolve(testProjectRoot, './data/metadata.db'));
      expect(dbConfig.sqlite.vectorExtension).toBe(path.resolve(testProjectRoot, './extensions/vec0.dylib'));
    });

    it('should create instances with different project roots', () => {
      const differentRoot = '/different/project/root';
      const differentConfigManager = new ConfigManager(differentRoot);
      
      // Both instances should be valid ConfigManager instances
      expect(configManager).toBeInstanceOf(ConfigManager);
      expect(differentConfigManager).toBeInstanceOf(ConfigManager);
      
      // They should be different instances
      expect(configManager).not.toBe(differentConfigManager);
    });
  });

  describe('configuration getters', () => {
    it('should return consistent database configuration', () => {
      const dbConfig1 = configManager.getDatabaseConfig();
      const dbConfig2 = configManager.getDatabaseConfig();
      
      expect(dbConfig1).toEqual(dbConfig2);
    });

    it('should return complete AI configuration with all required fields', () => {
      const aiConfig = configManager.getAIConfig();
      
      expect(aiConfig.embedding).toHaveProperty('model');
      expect(aiConfig.embedding).toHaveProperty('batchSize');
      expect(aiConfig.embedding).toHaveProperty('provider');
      expect(aiConfig.embedding).toHaveProperty('localEndpoint');
      expect(aiConfig.summary).toHaveProperty('model');
      expect(aiConfig.summary).toHaveProperty('maxTokens');
    });

    it('should return complete indexing configuration with all required fields', () => {
      const indexingConfig = configManager.getIndexingConfig();
      
      expect(indexingConfig).toHaveProperty('filePatterns');
      expect(indexingConfig).toHaveProperty('ignorePatterns');
      expect(indexingConfig).toHaveProperty('maxFileSize');
      expect(indexingConfig).toHaveProperty('supportedLanguages');
      expect(typeof indexingConfig.maxFileSize).toBe('number');
    });

    it('should return complete logging configuration with all required fields', () => {
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig).toHaveProperty('level');
      expect(loggingConfig).toHaveProperty('enableConsole');
      expect(loggingConfig).toHaveProperty('enableFile');
      expect(typeof loggingConfig.enableConsole).toBe('boolean');
      expect(typeof loggingConfig.enableFile).toBe('boolean');
    });

    it('should return complete configuration object', () => {
      const config = configManager.getConfig();
      
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('ai');
      expect(config).toHaveProperty('indexing');
      expect(config).toHaveProperty('logging');
      expect(config.database).toEqual(configManager.getDatabaseConfig());
      expect(config.ai).toEqual(configManager.getAIConfig());
      expect(config.indexing).toEqual(configManager.getIndexingConfig());
      expect(config.logging).toEqual(configManager.getLoggingConfig());
    });
  });

  describe('configuration validation', () => {
    it('should validate file patterns are properly formatted', () => {
      const indexingConfig = configManager.getIndexingConfig();
      
      indexingConfig.filePatterns.forEach((pattern: string) => {
        expect(typeof pattern).toBe('string');
        expect(pattern.length).toBeGreaterThan(0);
      });
    });

    it('should validate ignore patterns include essential exclusions', () => {
      const indexingConfig = configManager.getIndexingConfig();
      
      expect(indexingConfig.ignorePatterns).toContain('**/node_modules/**');
      expect(indexingConfig.ignorePatterns).toContain('**/dist/**');
      expect(indexingConfig.ignorePatterns).toContain('**/.git/**');
    });

    it('should validate supported languages are properly defined', () => {
      const indexingConfig = configManager.getIndexingConfig();
      
      expect(indexingConfig.supportedLanguages).toContain('typescript');
      expect(indexingConfig.supportedLanguages).toContain('javascript');
      expect(indexingConfig.supportedLanguages).toContain('python');
      expect(indexingConfig.supportedLanguages.length).toBeGreaterThan(5);
    });

    it('should validate AI configuration has reasonable defaults', () => {
      const aiConfig = configManager.getAIConfig();
      
      expect(aiConfig.embedding.batchSize).toBeGreaterThan(0);
      expect(aiConfig.embedding.batchSize).toBeLessThan(1000);
      expect(aiConfig.summary.maxTokens).toBeGreaterThan(0);
      expect(aiConfig.summary.maxTokens).toBeLessThan(10000);
    });

    it('should validate database paths are absolute after resolution', () => {
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(path.isAbsolute(dbConfig.sqlite.path)).toBe(true);
      expect(path.isAbsolute(dbConfig.sqlite.vectorExtension!)).toBe(true);
    });
  });

  describe('configuration updates and persistence', () => {
    it('should allow partial configuration updates', () => {
      const originalLogLevel = configManager.getLoggingConfig().level;
      
      configManager.updateConfig({
        logging: {
          ...configManager.getLoggingConfig(),
          level: 'debug',
        },
      });
      
      const updatedLogLevel = configManager.getLoggingConfig().level;
      expect(updatedLogLevel).toBe('debug');
      expect(updatedLogLevel).not.toBe(originalLogLevel);
    });

    it('should allow deep configuration updates', () => {
      const originalBatchSize = configManager.getAIConfig().embedding.batchSize;
      
      configManager.updateConfig({
        ai: {
          ...configManager.getAIConfig(),
          embedding: {
            ...configManager.getAIConfig().embedding,
            batchSize: 64,
          },
        },
      });
      
      const updatedBatchSize = configManager.getAIConfig().embedding.batchSize;
      expect(updatedBatchSize).toBe(64);
      expect(updatedBatchSize).not.toBe(originalBatchSize);
    });

    it('should preserve other configuration values during partial updates', () => {
      const originalAIConfig = configManager.getAIConfig();
      const originalIndexingConfig = configManager.getIndexingConfig();
      
      configManager.updateConfig({
        logging: {
          ...configManager.getLoggingConfig(),
          level: 'error',
        },
      });
      
      expect(configManager.getAIConfig()).toEqual(originalAIConfig);
      expect(configManager.getIndexingConfig()).toEqual(originalIndexingConfig);
    });

    it('should handle multiple sequential updates correctly', () => {
      configManager.updateConfig({
        logging: { ...configManager.getLoggingConfig(), level: 'debug' },
      });
      
      configManager.updateConfig({
        ai: {
          ...configManager.getAIConfig(),
          embedding: { ...configManager.getAIConfig().embedding, batchSize: 16 },
        },
      });
      
      expect(configManager.getLoggingConfig().level).toBe('debug');
      expect(configManager.getAIConfig().embedding.batchSize).toBe(16);
    });

    it('should handle empty updates gracefully', () => {
      const originalConfig = configManager.getConfig();
      
      configManager.updateConfig({});
      
      expect(configManager.getConfig()).toEqual(originalConfig);
    });

    it('should handle null and undefined values in updates', () => {
      const originalConfig = configManager.getConfig();
      
      configManager.updateConfig({
        logging: {
          ...configManager.getLoggingConfig(),
          logFilePath: undefined,
        },
      });
      
      expect(configManager.getLoggingConfig().logFilePath).toBeUndefined();
      expect(configManager.getLoggingConfig().level).toBe(originalConfig.logging.level);
    });
  });
});

describe('Environment variable processing', () => {
  const originalEnv = process.env;
  let configManager: ConfigManager;

  beforeEach(() => {
    jest.resetModules();
    // Clear the module cache to get fresh instances
    delete require.cache[require.resolve('./index')];
    process.env = { NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('database configuration overrides', () => {
    it('should override SQLite database path from environment variable', () => {
      process.env.HIKMA_SQLITE_PATH = './custom/metadata.db';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.path).toBe(path.resolve('/tmp/test', './custom/metadata.db'));
    });

    it('should override vector extension path from environment variable', () => {
      process.env.HIKMA_SQLITE_VEC_EXTENSION = './custom/vec0.so';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.vectorExtension).toBe(path.resolve('/tmp/test', './custom/vec0.so'));
    });

    it('should handle both database environment variables together', () => {
      process.env.HIKMA_SQLITE_PATH = './env/database.db';
      process.env.HIKMA_SQLITE_VEC_EXTENSION = './env/vector.so';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/env/test');
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.path).toBe(path.resolve('/env/test', './env/database.db'));
      expect(dbConfig.sqlite.vectorExtension).toBe(path.resolve('/env/test', './env/vector.so'));
    });

    it('should handle absolute paths in environment variables', () => {
      process.env.HIKMA_SQLITE_PATH = '/absolute/path/database.db';
      process.env.HIKMA_SQLITE_VEC_EXTENSION = '/absolute/path/vector.so';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.path).toBe('/absolute/path/database.db');
      expect(dbConfig.sqlite.vectorExtension).toBe('/absolute/path/vector.so');
    });
  });

  describe('logging configuration overrides', () => {
    it('should override log level from HIKMA_LOG_LEVEL environment variable', () => {
      process.env.HIKMA_LOG_LEVEL = 'debug';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig.level).toBe('debug');
    });

    it('should override log level from HIKMA_API_LOG_LEVEL environment variable', () => {
      process.env.HIKMA_API_LOG_LEVEL = 'error';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig.level).toBe('error');
    });

    it('should prioritize HIKMA_LOG_LEVEL over HIKMA_API_LOG_LEVEL', () => {
      process.env.HIKMA_LOG_LEVEL = 'warn';
      process.env.HIKMA_API_LOG_LEVEL = 'debug';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig.level).toBe('warn');
    });

    it('should handle invalid log levels gracefully', () => {
      process.env.HIKMA_LOG_LEVEL = 'invalid-level' as any;
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig.level).toBe('invalid-level');
    });
  });

  describe('default value handling', () => {
    it('should use default values when environment variables are not set', () => {
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      expect(config.database.sqlite.path).toBe(path.resolve('/tmp/test', './data/metadata.db'));
      expect(config.database.sqlite.vectorExtension).toBe(path.resolve('/tmp/test', './extensions/vec0.dylib'));
      expect(config.logging.level).toBe('info');
    });

    it('should process environment variables when they are set', () => {
      // Test that environment variables are processed when present
      process.env.HIKMA_LOG_LEVEL = 'warn';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      // Environment variable should override default
      expect(config.logging.level).toBe('warn');
    });

    it('should preserve non-overridden default values', () => {
      process.env.HIKMA_LOG_LEVEL = 'debug';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      expect(config.logging.level).toBe('debug');
      expect(config.logging.enableConsole).toBe(true);
      expect(config.logging.enableFile).toBe(false);
      expect(config.ai.embedding.model).toBe('jinaai/jina-embeddings-v2-base-code');
    });
  });

  describe('environment variable validation', () => {
    it('should handle whitespace in environment variables', () => {
      process.env.HIKMA_SQLITE_PATH = '  ./spaced/path.db  ';
      process.env.HIKMA_LOG_LEVEL = '  debug  ';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      expect(config.database.sqlite.path).toBe(path.resolve('/tmp/test', '  ./spaced/path.db  '));
      expect(config.logging.level).toBe('  debug  ');
    });

    it('should handle special characters in paths', () => {
      process.env.HIKMA_SQLITE_PATH = './path with spaces/data-base.db';
      process.env.HIKMA_SQLITE_VEC_EXTENSION = './path-with-dashes/vec_extension.so';
      
      const { ConfigManager } = require('./index');
      configManager = new ConfigManager('/tmp/test');
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.path).toBe(path.resolve('/tmp/test', './path with spaces/data-base.db'));
      expect(dbConfig.sqlite.vectorExtension).toBe(path.resolve('/tmp/test', './path-with-dashes/vec_extension.so'));
    });
  });
});

describe('Global configuration management', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Clear the module cache to get fresh instances
    delete require.cache[require.resolve('./index')];
    process.env = { NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should initialize global configuration successfully', () => {
    const { initializeConfig, ConfigManager } = require('./index');
    const globalConfig = initializeConfig('/tmp/test');
    
    expect(globalConfig).toBeInstanceOf(ConfigManager);
    expect(globalConfig.getConfig()).toBeDefined();
  });

  it('should return the same instance on subsequent calls', () => {
    const { initializeConfig, getConfig } = require('./index');
    const globalConfig1 = initializeConfig('/tmp/test');
    const globalConfig2 = getConfig();
    
    expect(globalConfig1).toBe(globalConfig2);
  });

  it('should throw error when accessing uninitialized global config', () => {
    const { getConfig } = require('./index');
    expect(() => {
      getConfig();
    }).toThrow('Configuration not initialized. Call initializeConfig() first.');
  });

  it('should support re-initialization', () => {
    const { initializeConfig, ConfigManager: FreshConfigManager } = require('./index');
    
    // Initialize with first root
    const globalConfig1 = initializeConfig('/first/root');
    
    // Re-initialize with second root (this replaces the global instance)
    const globalConfig2 = initializeConfig('/second/root');
    
    // The instances should be different
    expect(globalConfig1).not.toBe(globalConfig2);
    // Both should be valid ConfigManager instances
    expect(globalConfig1).toBeInstanceOf(FreshConfigManager);
    expect(globalConfig2).toBeInstanceOf(FreshConfigManager);
  });
});

describe('File system operations mocking', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Clear the module cache to get fresh instances
    delete require.cache[require.resolve('./index')];
    process.env = { NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('configuration file reading', () => {
    it('should handle missing configuration files gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      
      const { ConfigManager } = require('./index');
      const configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.database).toBeDefined();
    });

    it('should handle file system permission errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('EACCES: permission denied'));
      
      const { ConfigManager } = require('./index');
      const configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.logging.level).toBe('info');
    });

    it('should handle corrupted configuration files', async () => {
      mockFs.readFile.mockResolvedValue('invalid json content {');
      
      const { ConfigManager } = require('./index');
      const configManager = new ConfigManager('/tmp/test');
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.ai.embedding.model).toBe('jinaai/jina-embeddings-v2-base-code');
    });
  });

  describe('configuration persistence', () => {
    it('should handle file write operations for configuration persistence', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const { ConfigManager } = require('./index');
      const configManager = new ConfigManager('/tmp/test');
      
      configManager.updateConfig({
        logging: { ...configManager.getLoggingConfig(), level: 'debug' },
      });
      
      expect(configManager.getLoggingConfig().level).toBe('debug');
    });

    it('should handle file write failures gracefully', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'));
      
      const { ConfigManager } = require('./index');
      const configManager = new ConfigManager('/tmp/test');
      
      configManager.updateConfig({
        logging: { ...configManager.getLoggingConfig(), level: 'error' },
      });
      
      expect(configManager.getLoggingConfig().level).toBe('error');
    });

    it('should handle directory creation for configuration files', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const { ConfigManager } = require('./index');
      const configManager = new ConfigManager('/tmp/test');
      
      expect(configManager.getConfig()).toBeDefined();
    });
  });
});
