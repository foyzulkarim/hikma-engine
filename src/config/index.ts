/**
 * @file Centralized configuration management for hikma-engine.
 *       Manages database connections, AI model settings, file patterns, and environment-specific configurations.
 */

import * as path from 'path';

export interface DatabaseConfig {
  sqlite: {
    path: string;
    vectorExtension?: string;
  };
}

export interface AIConfig {
  embedding: {
    model: string;
    batchSize: number;
    provider: 'local' | 'transformers' | 'python' | 'openai';
    localEndpoint?: string;
    openai?: {
      apiUrl: string;
      apiKey?: string;
      model: string;
    };
  };
  summary: {
    model: string;
    maxTokens: number;
  };
  rag: {
    model: string;
  };
  llmProvider: {
    provider: 'python' | 'openai';
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    openai?: {
      apiUrl: string;
      apiKey: string;
      model: string;
      maxTokens?: number;
      temperature?: number;
    };
    python?: {
      model: string;
      maxResults: number;
    };
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
    sqlite: {
      path: './data/metadata.db',
      vectorExtension: './extensions/vec0.dylib',
    },
  },
  ai: {
    embedding: {
      model: 'mixedbread-ai/mxbai-embed-large-v1',
      batchSize: 32,
      provider: 'python',
      localEndpoint: 'http://localhost:1234',
    },
    summary: {
      model: 'Xenova/distilgpt2',
      maxTokens: 256,
    },
    rag: {
      model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct', // Fallback model for Python provider - main LLM config is in ai.llmProvider.openai.model
    },
    llmProvider: {
      provider: 'openai',
      timeout: 300000,
      retryAttempts: 3,
      retryDelay: 1000,
      openai: {
        apiUrl: 'http://localhost:1234/v1/chat/completions',
        apiKey: 'not-needed',
        model: 'qwen/qwen3-coder-30b',
        maxTokens: 4096,
        temperature: 0.1,
      },
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
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
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
    config.database.sqlite.path = path.resolve(this.projectRoot, config.database.sqlite.path);
    if (config.database.sqlite.vectorExtension) {
      config.database.sqlite.vectorExtension = path.resolve(this.projectRoot, config.database.sqlite.vectorExtension);
    }

    // Override with environment variables if present
    if (process.env.HIKMA_SQLITE_PATH) {
      config.database.sqlite.path = path.resolve(this.projectRoot, process.env.HIKMA_SQLITE_PATH);
    }
    if (process.env.HIKMA_SQLITE_VEC_EXTENSION) {
      config.database.sqlite.vectorExtension = path.resolve(this.projectRoot, process.env.HIKMA_SQLITE_VEC_EXTENSION);
    }
    // Override AI model configuration
    if (process.env.HIKMA_EMBEDDING_MODEL) {
      config.ai.embedding.model = process.env.HIKMA_EMBEDDING_MODEL;
    }
    if (process.env.HIKMA_RAG_MODEL) {
      config.ai.rag.model = process.env.HIKMA_RAG_MODEL;
    }

    // Override embedding provider configuration
    if (process.env.HIKMA_EMBEDDING_PROVIDER) {
      const provider = process.env.HIKMA_EMBEDDING_PROVIDER as 'local' | 'transformers' | 'python' | 'openai';
      if (['local', 'transformers', 'python', 'openai'].includes(provider)) {
        config.ai.embedding.provider = provider;
      }
    }

    // OpenAI embedding provider configuration
    if (process.env.HIKMA_EMBEDDING_OPENAI_API_URL || 
        process.env.HIKMA_EMBEDDING_OPENAI_API_KEY || 
        process.env.HIKMA_EMBEDDING_OPENAI_MODEL) {
      
      if (!config.ai.embedding.openai) {
        config.ai.embedding.openai = {
          apiUrl: 'http://localhost:11434',
          model: 'mxbai-embed-large:latest',
        };
      }
      
      if (process.env.HIKMA_EMBEDDING_OPENAI_API_URL) {
        config.ai.embedding.openai.apiUrl = process.env.HIKMA_EMBEDDING_OPENAI_API_URL;
      }
      if (process.env.HIKMA_EMBEDDING_OPENAI_API_KEY) {
        config.ai.embedding.openai.apiKey = process.env.HIKMA_EMBEDDING_OPENAI_API_KEY;
      }
      if (process.env.HIKMA_EMBEDDING_OPENAI_MODEL) {
        config.ai.embedding.openai.model = process.env.HIKMA_EMBEDDING_OPENAI_MODEL;
      }
    }

    // Override LLM provider configuration
    if (process.env.HIKMA_ENGINE_LLM_PROVIDER) {
      const provider = process.env.HIKMA_ENGINE_LLM_PROVIDER as 'python' | 'openai';
      if (provider === 'python' || provider === 'openai') {
        config.ai.llmProvider.provider = provider;
      }
    }
    if (process.env.HIKMA_ENGINE_LLM_TIMEOUT) {
      const timeout = parseInt(process.env.HIKMA_ENGINE_LLM_TIMEOUT, 10);
      if (!isNaN(timeout) && timeout > 0) {
        config.ai.llmProvider.timeout = timeout;
      }
    }
    if (process.env.HIKMA_ENGINE_LLM_RETRY_ATTEMPTS) {
      const retryAttempts = parseInt(process.env.HIKMA_ENGINE_LLM_RETRY_ATTEMPTS, 10);
      if (!isNaN(retryAttempts) && retryAttempts >= 0) {
        config.ai.llmProvider.retryAttempts = retryAttempts;
      }
    }
    if (process.env.HIKMA_ENGINE_LLM_RETRY_DELAY) {
      const retryDelay = parseInt(process.env.HIKMA_ENGINE_LLM_RETRY_DELAY, 10);
      if (!isNaN(retryDelay) && retryDelay >= 0) {
        config.ai.llmProvider.retryDelay = retryDelay;
      }
    }

    // OpenAI-specific configuration
    if (process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL || 
        process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY || 
        process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL) {
      
      if (!config.ai.llmProvider.openai) {
        config.ai.llmProvider.openai = {
          apiUrl: 'http://localhost:1234',
          apiKey: '',
          // model: 'openai/gpt-oss-20b',
          model: 'qwen/qwen3-coder-30b' // Fallback configuration - main config is in defaultConfig.ai.llmProvider.openai.model
        };
      }

      if (process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL) {
        config.ai.llmProvider.openai.apiUrl = process.env.HIKMA_ENGINE_LLM_OPENAI_API_URL;
      }
      if (process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY) {
        config.ai.llmProvider.openai.apiKey = process.env.HIKMA_ENGINE_LLM_OPENAI_API_KEY;
      }
      if (process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL) {
        config.ai.llmProvider.openai.model = process.env.HIKMA_ENGINE_LLM_OPENAI_MODEL;
      }
      if (process.env.HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS) {
        const maxTokens = parseInt(process.env.HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS, 10);
        if (!isNaN(maxTokens) && maxTokens > 0) {
          config.ai.llmProvider.openai.maxTokens = maxTokens;
        }
      }
      if (process.env.HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE) {
        const temperature = parseFloat(process.env.HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE);
        if (!isNaN(temperature) && temperature >= 0 && temperature <= 2) {
          config.ai.llmProvider.openai.temperature = temperature;
        }
      }
    }

    // Python-specific configuration
    if (process.env.HIKMA_ENGINE_LLM_PYTHON_MODEL) {
      if (!config.ai.llmProvider.python) {
        config.ai.llmProvider.python = {
          model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
          maxResults: 8,
        };
      }
      config.ai.llmProvider.python.model = process.env.HIKMA_ENGINE_LLM_PYTHON_MODEL;
    }
    if (process.env.HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS) {
      const maxResults = parseInt(process.env.HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS, 10);
      if (!isNaN(maxResults) && maxResults > 0) {
        if (!config.ai.llmProvider.python) {
          config.ai.llmProvider.python = {
            model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
            maxResults: 8,
          };
        }
        config.ai.llmProvider.python.maxResults = maxResults;
      }
    }
    // Support both HIKMA_LOG_LEVEL (CLI) and HIKMA_API_LOG_LEVEL (API) environment variables
    if (process.env.HIKMA_LOG_LEVEL || process.env.HIKMA_API_LOG_LEVEL) {
      config.logging.level = (process.env.HIKMA_LOG_LEVEL || process.env.HIKMA_API_LOG_LEVEL) as 'debug' | 'info' | 'warn' | 'error';
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

  /**
   * Validates the LLM provider configuration.
   * @throws Error if configuration is invalid
   */
  public validateLLMProviderConfig(): void {
    const llmConfig = this.config.ai.llmProvider;

    // Validate common configuration
    if (typeof llmConfig.timeout !== 'number' || llmConfig.timeout <= 0) {
      throw new Error('LLM provider timeout must be a positive number');
    }

    if (typeof llmConfig.retryAttempts !== 'number' || llmConfig.retryAttempts < 0) {
      throw new Error('LLM provider retry attempts must be a non-negative number');
    }

    if (typeof llmConfig.retryDelay !== 'number' || llmConfig.retryDelay < 0) {
      throw new Error('LLM provider retry delay must be a non-negative number');
    }

    // Validate provider-specific configuration
    if (llmConfig.provider === 'openai') {
      if (!llmConfig.openai) {
        throw new Error('OpenAI configuration is required when provider is set to "openai"');
      }

      const openaiConfig = llmConfig.openai;

      if (!openaiConfig.apiUrl || typeof openaiConfig.apiUrl !== 'string') {
        throw new Error('OpenAI API URL is required and must be a valid string');
      }

      if (!openaiConfig.apiKey || typeof openaiConfig.apiKey !== 'string') {
        throw new Error('OpenAI API key is required and must be a valid string');
      }

      if (!openaiConfig.model || typeof openaiConfig.model !== 'string') {
        throw new Error('OpenAI model is required and must be a valid string');
      }

      // Validate URL format
      try {
        new URL(openaiConfig.apiUrl);
      } catch {
        throw new Error('OpenAI API URL must be a valid URL');
      }

      // Validate API key format (relaxed for local/self-hosted endpoints)
      const isLocalEndpoint = openaiConfig.apiUrl.includes('localhost') || 
                             openaiConfig.apiUrl.includes('127.0.0.1') || 
                             openaiConfig.apiUrl.includes('0.0.0.0');
      
      if (!isLocalEndpoint && !openaiConfig.apiKey.startsWith('sk-') && !openaiConfig.apiKey.startsWith('org-')) {
        throw new Error('OpenAI API key must start with "sk-" or "org-" for external APIs');
      }

      // Validate optional parameters
      if (openaiConfig.maxTokens !== undefined) {
        if (typeof openaiConfig.maxTokens !== 'number' || openaiConfig.maxTokens <= 0) {
          throw new Error('OpenAI max tokens must be a positive number');
        }
      }

      if (openaiConfig.temperature !== undefined) {
        if (typeof openaiConfig.temperature !== 'number' || 
            openaiConfig.temperature < 0 || 
            openaiConfig.temperature > 2) {
          throw new Error('OpenAI temperature must be a number between 0 and 2');
        }
      }
    } else if (llmConfig.provider === 'python') {
      if (llmConfig.python) {
        const pythonConfig = llmConfig.python;

        if (!pythonConfig.model || typeof pythonConfig.model !== 'string') {
          throw new Error('Python model must be a valid string');
        }

        if (typeof pythonConfig.maxResults !== 'number' || pythonConfig.maxResults <= 0) {
          throw new Error('Python max results must be a positive number');
        }
      }
    } else {
      throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
    }
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
