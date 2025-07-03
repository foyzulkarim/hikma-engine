/**
 * @file Centralized configuration management for hikma-engine.
 *       Manages database connections, AI model settings, file patterns, and environment-specific configurations.
 */

import * as path from 'path';

export interface DatabaseConfig {
  lancedb: {
    path: string;
  };
  sqlite: {
    path: string;
  };
  tinkergraph: {
    url: string;
  };
}

export interface AIConfig {
  embedding: {
    model: string;
    batchSize: number;
  };
  summary: {
    model: string;
    maxTokens: number;
  };
}

export interface IndexingConfig {
  filePatterns: string[];
  ignorePatterns: string[];
  maxFileSize: number; // in bytes
  supportedLanguages: string[];
}

export interface AppConfig {
  database: DatabaseConfig;
  ai: AIConfig;
  indexing: IndexingConfig;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableConsole: boolean;
    enableFile: boolean;
    logFilePath?: string;
  };
}

/**
 * Default configuration for the hikma-engine.
 */
const defaultConfig: AppConfig = {
  database: {
    lancedb: {
      path: './data/lancedb',
    },
    sqlite: {
      path: './data/metadata.db',
    },
    tinkergraph: {
      url: 'ws://localhost:8182/gremlin',
    },
  },
  ai: {
    embedding: {
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 32,
    },
    summary: {
      model: 'Xenova/distilbart-cnn-6-6',
      maxTokens: 150,
    },
  },
  indexing: {
    filePatterns: [
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
      '**/*.py', '**/*.java', '**/*.go',
      '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
      '**/*.cs', '**/*.rb', '**/*.php',
      '**/*.html', '**/*.css', '**/*.scss', '**/*.less',
      '**/*.json', '**/*.xml', '**/*.yaml', '**/*.yml',
      '**/*.md', '**/*.rst', '**/*.txt',
    ],
    ignorePatterns: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '**/*.min.js',
      '**/*.min.css',
    ],
    maxFileSize: 1024 * 1024, // 1MB
    supportedLanguages: [
      'typescript', 'javascript', 'python', 'java', 'go',
      'c', 'cpp', 'csharp', 'ruby', 'php', 'html', 'css',
    ],
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: false,
  },
};

/**
 * Configuration manager class that handles loading and merging configurations
 * from various sources (defaults, environment variables, config files).
 */
export class ConfigManager {
  private config: AppConfig;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.config = this.loadConfig();
  }

  /**
   * Loads configuration from various sources and merges them.
   * Priority: Environment variables > Config file > Defaults
   */
  private loadConfig(): AppConfig {
    let config = { ...defaultConfig };

    // Resolve relative paths to absolute paths based on project root
    config.database.lancedb.path = path.resolve(this.projectRoot, config.database.lancedb.path);
    config.database.sqlite.path = path.resolve(this.projectRoot, config.database.sqlite.path);

    // Override with environment variables if present
    if (process.env.HIKMA_LANCEDB_PATH) {
      config.database.lancedb.path = path.resolve(this.projectRoot, process.env.HIKMA_LANCEDB_PATH);
    }
    if (process.env.HIKMA_SQLITE_PATH) {
      config.database.sqlite.path = path.resolve(this.projectRoot, process.env.HIKMA_SQLITE_PATH);
    }
    if (process.env.HIKMA_TINKERGRAPH_URL) {
      config.database.tinkergraph.url = process.env.HIKMA_TINKERGRAPH_URL;
    }
    if (process.env.HIKMA_LOG_LEVEL) {
      config.logging.level = process.env.HIKMA_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
    }

    return config;
  }

  /**
   * Gets the complete configuration object.
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Gets database configuration.
   */
  public getDatabaseConfig(): DatabaseConfig {
    return this.config.database;
  }

  /**
   * Gets AI configuration.
   */
  public getAIConfig(): AIConfig {
    return this.config.ai;
  }

  /**
   * Gets indexing configuration.
   */
  public getIndexingConfig(): IndexingConfig {
    return this.config.indexing;
  }

  /**
   * Gets logging configuration.
   */
  public getLoggingConfig() {
    return this.config.logging;
  }

  /**
   * Updates configuration at runtime (useful for testing or dynamic configuration).
   */
  public updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Global configuration instance (singleton pattern).
 * Initialize this once at application startup.
 */
let globalConfigManager: ConfigManager | null = null;

/**
 * Initializes the global configuration manager.
 */
export function initializeConfig(projectRoot: string): ConfigManager {
  globalConfigManager = new ConfigManager(projectRoot);
  return globalConfigManager;
}

/**
 * Gets the global configuration manager instance.
 * Throws an error if not initialized.
 */
export function getConfig(): ConfigManager {
  if (!globalConfigManager) {
    throw new Error('Configuration not initialized. Call initializeConfig() first.');
  }
  return globalConfigManager;
}
