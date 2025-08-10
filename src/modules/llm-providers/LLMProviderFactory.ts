/**
 * Factory class for creating and managing LLM providers
 * Handles provider instantiation, validation, and availability checking
 */

import { getLogger } from '../../utils/logger';
import { 
  LLMProviderInterface, 
  LLMProviderConfig, 
  LLMProviderError, 
  LLMProviderErrorType 
} from './types';

/**
 * Factory class that creates appropriate provider instances based on configuration
 */
export class LLMProviderFactory {
  private static readonly logger = getLogger('LLMProviderFactory');
  private static readonly SUPPORTED_PROVIDERS = ['python', 'server'] as const;

  /**
   * Creates a provider instance based on the configuration
   * @param config - The LLM provider configuration
   * @returns Promise resolving to the created provider instance
   * @throws LLMProviderError if provider creation fails
   */
  static async createProvider(config: LLMProviderConfig): Promise<LLMProviderInterface> {
    const startTime = Date.now();
    this.logger.info('Creating LLM provider', { 
      provider: config.provider,
      timeout: config.timeout,
      retryAttempts: config.retryAttempts 
    });

    try {
      // Validate the configuration first
      this.validateProviderConfig(config.provider, config);

      // Create the appropriate provider
      let provider: LLMProviderInterface;

      switch (config.provider) {
        case 'python':
          provider = await this.createPythonProvider(config);
          break;
        case 'server':
          provider = await this.createOpenAIProvider(config);
          break;
        default:
          throw new LLMProviderError(
            `Unsupported provider: ${config.provider}`,
            LLMProviderErrorType.CONFIGURATION_ERROR,
            'factory'
          );
      }

      // Validate the created provider's configuration
      const isValid = await provider.validateConfiguration();
      if (!isValid) {
        throw new LLMProviderError(
          `Provider configuration validation failed for ${config.provider}`,
          LLMProviderErrorType.CONFIGURATION_ERROR,
          'factory'
        );
      }

      // Check if the provider is available
      if (!provider.isAvailable) {
        this.logger.warn('Provider created but not available', { 
          provider: config.provider,
          name: provider.name 
        });
      }

      const duration = Date.now() - startTime;
      this.logger.info('Provider created successfully', { 
        provider: config.provider,
        name: provider.name,
        isAvailable: provider.isAvailable,
        duration: `${duration}ms`
      });

      return provider;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof LLMProviderError) {
        this.logger.error('Provider creation failed', {
          provider: config.provider,
          error: error.message,
          type: error.type,
          duration: `${duration}ms`
        });
        throw error;
      }

      const providerError = new LLMProviderError(
        `Failed to create provider ${config.provider}: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'factory',
        error instanceof Error ? error : undefined
      );

      this.logger.error('Unexpected error during provider creation', {
        provider: config.provider,
        error: providerError.message,
        duration: `${duration}ms`
      });

      throw providerError;
    }
  }

  /**
   * Gets a list of all available provider types
   * @returns Array of supported provider names
   */
  static getAvailableProviders(): string[] {
    return [...this.SUPPORTED_PROVIDERS];
  }

  /**
   * Validates provider-specific configuration
   * @param provider - The provider type
   * @param config - The configuration to validate
   * @returns true if configuration is valid
   * @throws LLMProviderError if configuration is invalid
   */
  static validateProviderConfig(provider: string, config: LLMProviderConfig): boolean {
    this.logger.debug('Validating provider configuration', { provider });

    // Check if provider is supported
    if (!this.SUPPORTED_PROVIDERS.includes(provider as any)) {
      throw new LLMProviderError(
        `Unsupported provider: ${provider}. Supported providers: ${this.SUPPORTED_PROVIDERS.join(', ')}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'factory'
      );
    }

    // Validate common configuration
    this.validateCommonConfig(config);

    // Validate provider-specific configuration
    switch (provider) {
      case 'python':
        this.validatePythonConfig(config);
        break;
      case 'server':
        this.validateServerConfig(config);
        break;
      default:
        throw new LLMProviderError(
          `Unknown provider: ${provider}`,
          LLMProviderErrorType.CONFIGURATION_ERROR,
          'factory'
        );
    }

    this.logger.debug('Provider configuration validation passed', { provider });
    return true;
  }

  /**
   * Creates a Python provider instance
   * @param config - The provider configuration
   * @returns Promise resolving to Python provider instance
   */
  private static async createPythonProvider(config: LLMProviderConfig): Promise<LLMProviderInterface> {
    try {
      // Dynamic import to avoid circular dependencies and allow for lazy loading
      const { PythonLLMProvider } = await import('./PythonLLMProvider');
      return new PythonLLMProvider(config);
    } catch (error) {
      throw new LLMProviderError(
        `Failed to load Python provider: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.PROVIDER_UNAVAILABLE,
        'factory',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Creates an OpenAI provider instance
   * @param config - The provider configuration
   * @returns Promise resolving to OpenAI provider instance
   */
  private static async createOpenAIProvider(config: LLMProviderConfig): Promise<LLMProviderInterface> {
    try {
      // Dynamic import to avoid circular dependencies and allow for lazy loading
      const { OpenAILLMProvider } = await import('./OpenAILLMProvider');
      return new OpenAILLMProvider(config);
    } catch (error) {
      throw new LLMProviderError(
        `Failed to load OpenAI provider: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.PROVIDER_UNAVAILABLE,
        'factory',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validates common configuration properties
   * @param config - The configuration to validate
   * @throws LLMProviderError if validation fails
   */
  private static validateCommonConfig(config: LLMProviderConfig): void {
    const errors: string[] = [];

    if (!config) {
      throw new LLMProviderError(
        'Provider configuration is required',
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'factory'
      );
    }

    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      errors.push('timeout must be a positive number');
    }

    if (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0) {
      errors.push('retryAttempts must be a non-negative number');
    }

    if (typeof config.retryDelay !== 'number' || config.retryDelay < 0) {
      errors.push('retryDelay must be a non-negative number');
    }

    if (errors.length > 0) {
      throw new LLMProviderError(
        `Invalid common configuration: ${errors.join(', ')}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'factory'
      );
    }
  }

  /**
   * Validates Python provider configuration
   * @param config - The configuration to validate
   * @throws LLMProviderError if validation fails
   */
  private static validatePythonConfig(config: LLMProviderConfig): void {
    // Python configuration is optional, but if provided, validate it
    if (config.python) {
      const errors: string[] = [];

      if (!config.python.model || typeof config.python.model !== 'string') {
        errors.push('python.model must be a non-empty string');
      }

      if (typeof config.python.maxResults !== 'number' || config.python.maxResults <= 0) {
        errors.push('python.maxResults must be a positive number');
      }

      if (errors.length > 0) {
        throw new LLMProviderError(
          `Invalid Python configuration: ${errors.join(', ')}`,
          LLMProviderErrorType.CONFIGURATION_ERROR,
          'factory'
        );
      }
    }
  }

  /**
   * Validates server provider configuration
   * @param config - The configuration to validate
   * @throws LLMProviderError if validation fails
   */
  private static validateServerConfig(config: LLMProviderConfig): void {
    if (!config.server) {
      throw new LLMProviderError(
        'Server configuration is required when provider is set to "server"',
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'factory'
      );
    }

    const errors: string[] = [];
    const serverConfig = config.server;

    // Required fields
    if (!serverConfig.apiUrl || typeof serverConfig.apiUrl !== 'string') {
      errors.push('server.apiUrl is required and must be a valid string');
    } else {
      // Validate URL format
      try {
        new URL(serverConfig.apiUrl);
      } catch {
        errors.push('server.apiUrl must be a valid URL');
      }
    }

    if (!serverConfig.apiKey || typeof serverConfig.apiKey !== 'string') {
      errors.push('server.apiKey is required and must be a valid string');
    } else {
      // Basic API key format validation (relaxed for local/self-hosted endpoints)
      const isLocalEndpoint = serverConfig.apiUrl.includes('localhost') || 
                             serverConfig.apiUrl.includes('127.0.0.1') || 
                             serverConfig.apiUrl.includes('0.0.0.0');
      
      if (!isLocalEndpoint && !serverConfig.apiKey.startsWith('sk-') && !serverConfig.apiKey.startsWith('org-')) {
        errors.push('server.apiKey must start with "sk-" or "org-" for external APIs');
      }
    }

    if (!serverConfig.model || typeof serverConfig.model !== 'string') {
      errors.push('server.model is required and must be a valid string');
    }

    // Optional fields validation
    if (serverConfig.maxTokens !== undefined) {
      if (typeof serverConfig.maxTokens !== 'number' || serverConfig.maxTokens <= 0) {
        errors.push('server.maxTokens must be a positive number');
      }
    }

    if (serverConfig.temperature !== undefined) {
      if (typeof serverConfig.temperature !== 'number' || 
          serverConfig.temperature < 0 || 
          serverConfig.temperature > 2) {
        errors.push('server.temperature must be a number between 0 and 2');
      }
    }

    if (errors.length > 0) {
      throw new LLMProviderError(
        `Invalid server configuration: ${errors.join(', ')}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'factory'
      );
    }
  }

  /**
   * Checks if a provider type is supported
   * @param provider - The provider type to check
   * @returns true if the provider is supported
   */
  static isProviderSupported(provider: string): boolean {
    return this.SUPPORTED_PROVIDERS.includes(provider as any);
  }

  /**
   * Gets detailed information about supported providers
   * @returns Object with provider information
   */
  static getProviderInfo(): Record<string, { description: string; requiredConfig: string[] }> {
    return {
      python: {
        description: 'Local Python-based LLM provider using the existing Python implementation',
        requiredConfig: ['timeout', 'retryAttempts', 'retryDelay']
      },
      server: {
        description: 'Server-based LLM provider for external AI services',
        requiredConfig: ['timeout', 'retryAttempts', 'retryDelay', 'server.apiUrl', 'server.apiKey', 'server.model']
      }
    };
  }
}
