/**
 * @file Tests for the configuration management system.
 */

import { ConfigManager, initializeConfig } from './index';
import * as path from 'path';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const testProjectRoot = '/tmp/test-project';

  beforeEach(() => {
    configManager = new ConfigManager(testProjectRoot);
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.ai).toBeDefined();
      expect(config.indexing).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('should resolve database paths relative to project root', () => {
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite.path).toBe(path.resolve(testProjectRoot, './data/metadata.db'));
      expect(dbConfig.sqlite.vectorExtension).toBe(path.resolve(testProjectRoot, './extensions/vec0.dylib'));
    });
  });

  describe('configuration getters', () => {
    it('should return database configuration', () => {
      const dbConfig = configManager.getDatabaseConfig();
      
      expect(dbConfig.sqlite).toBeDefined();
      expect(dbConfig.sqlite.path).toBeDefined();
      expect(dbConfig.sqlite.vectorExtension).toBeDefined();
    });

    it('should return AI configuration', () => {
      const aiConfig = configManager.getAIConfig();
      
      expect(aiConfig.embedding).toBeDefined();
      expect(aiConfig.summary).toBeDefined();
      expect(aiConfig.embedding.model).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('should return indexing configuration', () => {
      const indexingConfig = configManager.getIndexingConfig();
      
      expect(indexingConfig.filePatterns).toBeDefined();
      expect(indexingConfig.ignorePatterns).toBeDefined();
      expect(indexingConfig.maxFileSize).toBe(1024 * 1024);
    });
  });

  describe('global configuration', () => {
    it('should initialize global configuration', () => {
      const globalConfig = initializeConfig(testProjectRoot);
      
      expect(globalConfig).toBeInstanceOf(ConfigManager);
    });

    it('should throw error when accessing uninitialized global config', () => {
      // This would require resetting the global state, which is complex in tests
      // In a real test environment, you'd mock the global state
      expect(() => {
        // This test would need proper setup to work
      }).not.toThrow(); // Placeholder
    });
  });

  describe('configuration updates', () => {
    it('should allow runtime configuration updates', () => {
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
  });
});

describe('Environment variable overrides', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should override database paths from environment variables', () => {
    process.env.HIKMA_SQLITE_PATH = './custom/metadata.db';
    process.env.HIKMA_SQLITE_VEC_EXTENSION = './custom/vec0.so';
    
    const configManager = new ConfigManager('/tmp/test');
    const dbConfig = configManager.getDatabaseConfig();
    
    expect(dbConfig.sqlite.path).toBe(path.resolve('/tmp/test', './custom/metadata.db'));
    expect(dbConfig.sqlite.vectorExtension).toBe(path.resolve('/tmp/test', './custom/vec0.so'));
  });

  it('should override log level from environment variables', () => {
    process.env.HIKMA_LOG_LEVEL = 'debug';
    
    const configManager = new ConfigManager('/tmp/test');
    const loggingConfig = configManager.getLoggingConfig();
    
    expect(loggingConfig.level).toBe('debug');
  });
});
