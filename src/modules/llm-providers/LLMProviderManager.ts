/**
 * LLM Provider Manager with fallback capabilities
 * Handles provider selection, fallback logic, and health monitoring
 */

import { getLogger } from '../../utils/logger';
import { getConfig } from '../../config';
import { 
  LLMProviderInterface, 
  LLMProviderConfig, 
  LLMProviderError, 
  LLMProviderErrorType 
} from './types';
import { LLMProviderFactory } from './LLMProviderFactory';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';
import { getProviderMetrics, ProviderRequestMetrics } from './ProviderMetrics';

/**
 * Provider health status information
 */
interface ProviderHealth {
  isHealthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  lastError?: string;
  responseTime?: number;
}

/**
 * Provider selection strategy
 */
type ProviderSelectionStrategy = 'primary-fallback' | 'round-robin' | 'fastest-first';

/**
 * Configuration for the provider manager
 */
interface ProviderManagerConfig {
  /** Primary provider to use first */
  primaryProvider: string;
  /** Fallback providers in order of preference */
  fallbackProviders: string[];
  /** Provider selection strategy */
  selectionStrategy: ProviderSelectionStrategy;
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  /** Maximum consecutive failures before marking provider as unhealthy */
  maxConsecutiveFailures: number;
  /** Timeout for health checks in milliseconds */
  healthCheckTimeout: number;
}

/**
 * LLM Provider Manager that handles provider selection, fallback logic, and health monitoring
 */
export class LLMProviderManager {
  private logger = getLogger('LLMProviderManager');
  private metrics = getProviderMetrics();
  private providers = new Map<string, LLMProviderInterface>();
  private providerHealth = new Map<string, ProviderHealth>();
  private config: ProviderManagerConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private isInitialized = false;
  private metricsReportTimer?: NodeJS.Timeout;

  constructor(config?: Partial<ProviderManagerConfig>) {
    this.config = {
      primaryProvider: 'python',
      fallbackProviders: ['openai'],
      selectionStrategy: 'primary-fallback',
      healthCheckInterval: 60000, // 1 minute
      maxConsecutiveFailures: 3,
      healthCheckTimeout: 10000, // 10 seconds
      ...config
    };

    this.logger.info('LLM Provider Manager initialized', {
      primaryProvider: this.config.primaryProvider,
      fallbackProviders: this.config.fallbackProviders,
      strategy: this.config.selectionStrategy
    });

    // Start periodic metrics reporting
    this.startMetricsReporting();
  }

  /**
   * Initialize the provider manager with available providers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug('Provider manager already initialized');
      return;
    }

    const logEnd = this.logger.operation('initialize');

    try {
      // Get LLM provider configuration from main config
      const appConfig = getConfig().getAIConfig();
      const llmConfig = appConfig.llmProvider;

      // Align manager's primary/fallback providers with configured provider
      const configuredPrimary = llmConfig.provider;
      this.config.primaryProvider = configuredPrimary;
      // When explicitly using openai, do not fallback to python implicitly
      if (configuredPrimary === 'openai') {
        this.config.fallbackProviders = [];
      } else {
        this.config.fallbackProviders = ['openai'];
      }

      // Create all available providers
      const availableProviders = [this.config.primaryProvider, ...this.config.fallbackProviders];
      const uniqueProviders = [...new Set(availableProviders)];

      for (const providerType of uniqueProviders) {
        try {
          // Create provider-specific configuration
          const providerConfig: LLMProviderConfig = {
            ...llmConfig,
            provider: providerType as 'python' | 'openai'
          };

          const provider = await LLMProviderFactory.createProvider(providerConfig);
          this.providers.set(providerType, provider);

          // Initialize health status
          this.providerHealth.set(providerType, {
            isHealthy: provider.isAvailable,
            lastChecked: new Date(),
            consecutiveFailures: 0
          });

          this.logger.info(`Provider ${providerType} initialized`, {
            isAvailable: provider.isAvailable
          });

        } catch (error) {
          this.logger.error(`Failed to initialize provider ${providerType}`, {
            error: error instanceof Error ? error.message : String(error)
          });

          // Initialize as unhealthy
          this.providerHealth.set(providerType, {
            isHealthy: false,
            lastChecked: new Date(),
            consecutiveFailures: this.config.maxConsecutiveFailures,
            lastError: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Start health monitoring
      this.startHealthMonitoring();
      this.isInitialized = true;

      logEnd();
      this.logger.info('Provider manager initialization completed', {
        totalProviders: this.providers.size,
        healthyProviders: Array.from(this.providerHealth.values()).filter(h => h.isHealthy).length
      });

    } catch (error) {
      logEnd();
      throw new LLMProviderError(
        `Failed to initialize provider manager: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'manager',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generate an explanation using the best available provider with fallback logic
   */
  async generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions = {}
  ): Promise<RAGResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const logEnd = this.logger.operation('generateExplanation');
    const startTime = Date.now();
    
    this.logger.info('Starting explanation generation', {
      requestId,
      queryLength: query.length,
      resultCount: searchResults.length
    });

    try {
      const selectedProviders = this.selectProviders();
      
      // Log provider selection for requirement 5.1
      this.logger.info('Provider selection completed', {
        requestId,
        selectedProviders,
        selectionStrategy: this.config.selectionStrategy,
        totalAvailableProviders: this.providers.size,
        healthyProviders: this.getHealthyProviders().length
      });
      
      if (selectedProviders.length === 0) {
        const error = new LLMProviderError(
          'No healthy providers available',
          LLMProviderErrorType.PROVIDER_UNAVAILABLE,
          'manager'
        );
        
        // Record metrics for the failure
        this.recordRequestMetrics({
          requestId,
          provider: 'manager',
          timestamp: new Date(),
          queryLength: query.length,
          resultCount: searchResults.length,
          responseTime: Date.now() - startTime,
          success: false,
          errorType: LLMProviderErrorType.PROVIDER_UNAVAILABLE,
          errorMessage: error.message
        });
        
        throw error;
      }

      let lastError: Error | null = null;

      // Try each provider in order
      for (const providerName of selectedProviders) {
        const provider = this.providers.get(providerName);
        if (!provider) {
          continue;
        }

        try {
          this.logger.debug(`Attempting explanation with provider: ${providerName}`, {
            requestId
          });

          const providerStartTime = Date.now();
          const response = await provider.generateExplanation(query, searchResults, options);
          const responseTime = Date.now() - providerStartTime;

          // Update provider health on success
          this.updateProviderHealth(providerName, true, responseTime);

          // Record successful metrics
          this.recordRequestMetrics({
            requestId,
            provider: providerName,
            timestamp: new Date(),
            queryLength: query.length,
            resultCount: searchResults.length,
            responseTime,
            success: true,
            model: response.model,
            explanationLength: response.explanation?.length || 0,
            tokenUsage: response.usage
          });

          logEnd();
          this.logger.info('Explanation generated successfully', {
            requestId,
            provider: providerName,
            responseTime,
            explanationLength: response.explanation?.length || 0
          });

          return {
            ...response,
            // Add metadata about which provider was used
            provider: providerName,
            responseId: requestId,
            responseTime
          };

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const responseTime = Date.now() - startTime;
          
          // Determine error type
          let errorType = LLMProviderErrorType.PROVIDER_UNAVAILABLE;
          if (error instanceof LLMProviderError) {
            errorType = error.type;
          }
          
          this.logger.warn(`Provider ${providerName} failed`, {
            requestId,
            error: lastError.message,
            errorType,
            willTryFallback: selectedProviders.indexOf(providerName) < selectedProviders.length - 1
          });

          // Record failed metrics
          this.recordRequestMetrics({
            requestId,
            provider: providerName,
            timestamp: new Date(),
            queryLength: query.length,
            resultCount: searchResults.length,
            responseTime,
            success: false,
            errorType,
            errorMessage: lastError.message
          });

          // Update provider health on failure
          this.updateProviderHealth(providerName, false, undefined, lastError.message);

          // Continue to next provider
          continue;
        }
      }

      // All providers failed
      const totalResponseTime = Date.now() - startTime;
      const finalError = new LLMProviderError(
        `All providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
        LLMProviderErrorType.PROVIDER_UNAVAILABLE,
        'manager',
        lastError || undefined
      );

      // Record final failure metrics
      this.recordRequestMetrics({
        requestId,
        provider: 'manager',
        timestamp: new Date(),
        queryLength: query.length,
        resultCount: searchResults.length,
        responseTime: totalResponseTime,
        success: false,
        errorType: LLMProviderErrorType.PROVIDER_UNAVAILABLE,
        errorMessage: finalError.message
      });

      logEnd();
      throw finalError;

    } catch (error) {
      logEnd();
      
      if (error instanceof LLMProviderError) {
        throw error;
      }

      const finalError = new LLMProviderError(
        `Provider manager error: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        'manager',
        error instanceof Error ? error : undefined
      );

      // Record configuration error metrics
      this.recordRequestMetrics({
        requestId,
        provider: 'manager',
        timestamp: new Date(),
        queryLength: query.length,
        resultCount: searchResults.length,
        responseTime: Date.now() - startTime,
        success: false,
        errorType: LLMProviderErrorType.CONFIGURATION_ERROR,
        errorMessage: finalError.message
      });

      throw finalError;
    }
  }

  /**
   * Select providers based on the configured strategy
   */
  private selectProviders(): string[] {
    const allProviders = [this.config.primaryProvider, ...this.config.fallbackProviders];
    const uniqueProviders = [...new Set(allProviders)];

    switch (this.config.selectionStrategy) {
      case 'primary-fallback':
        return uniqueProviders.filter(name => {
          const health = this.providerHealth.get(name);
          return health?.isHealthy && this.providers.has(name);
        });

      case 'fastest-first':
        return uniqueProviders
          .filter(name => {
            const health = this.providerHealth.get(name);
            return health?.isHealthy && this.providers.has(name);
          })
          .sort((a, b) => {
            const healthA = this.providerHealth.get(a);
            const healthB = this.providerHealth.get(b);
            const timeA = healthA?.responseTime || Infinity;
            const timeB = healthB?.responseTime || Infinity;
            return timeA - timeB;
          });

      case 'round-robin':
        // Simple round-robin implementation
        const healthyProviders = uniqueProviders.filter(name => {
          const health = this.providerHealth.get(name);
          return health?.isHealthy && this.providers.has(name);
        });
        
        if (healthyProviders.length === 0) return [];
        
        // Rotate the array based on current time
        const rotateIndex = Math.floor(Date.now() / 60000) % healthyProviders.length;
        return [...healthyProviders.slice(rotateIndex), ...healthyProviders.slice(0, rotateIndex)];

      default:
        return uniqueProviders.filter(name => {
          const health = this.providerHealth.get(name);
          return health?.isHealthy && this.providers.has(name);
        });
    }
  }

  /**
   * Update provider health status
   */
  private updateProviderHealth(
    providerName: string,
    success: boolean,
    responseTime?: number,
    errorMessage?: string
  ): void {
    const currentHealth = this.providerHealth.get(providerName);
    if (!currentHealth) return;

    const updatedHealth: ProviderHealth = {
      ...currentHealth,
      lastChecked: new Date(),
      responseTime: responseTime || currentHealth.responseTime
    };

    if (success) {
      updatedHealth.isHealthy = true;
      updatedHealth.consecutiveFailures = 0;
      updatedHealth.lastError = undefined;
    } else {
      updatedHealth.consecutiveFailures += 1;
      updatedHealth.lastError = errorMessage;
      
      // Mark as unhealthy if too many consecutive failures
      if (updatedHealth.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        updatedHealth.isHealthy = false;
      }
    }

    this.providerHealth.set(providerName, updatedHealth);

    this.logger.debug(`Updated health for provider ${providerName}`, {
      isHealthy: updatedHealth.isHealthy,
      consecutiveFailures: updatedHealth.consecutiveFailures,
      responseTime: updatedHealth.responseTime
    });
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    this.logger.debug('Health monitoring started', {
      interval: this.config.healthCheckInterval
    });
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        const startTime = Date.now();
        
        // Simple health check by validating configuration
        const isHealthy = await Promise.race([
          provider.validateConfiguration(),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout)
          )
        ]);
        
        const responseTime = Date.now() - startTime;
        this.updateProviderHealth(name, isHealthy && provider.isAvailable, responseTime);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.updateProviderHealth(name, false, undefined, errorMessage);
      }
    });

    await Promise.allSettled(healthCheckPromises);
    
    const healthyCount = Array.from(this.providerHealth.values()).filter(h => h.isHealthy).length;
    this.logger.debug('Health check completed', {
      totalProviders: this.providers.size,
      healthyProviders: healthyCount
    });
  }

  /**
   * Get current provider health status
   */
  getProviderHealth(): Record<string, ProviderHealth> {
    const result: Record<string, ProviderHealth> = {};
    for (const [name, health] of this.providerHealth.entries()) {
      result[name] = { ...health };
    }
    return result;
  }

  /**
   * Get list of healthy providers
   */
  getHealthyProviders(): string[] {
    return Array.from(this.providerHealth.entries())
      .filter(([_, health]) => health.isHealthy)
      .map(([name]) => name);
  }

  /**
   * Force a provider health check
   */
  async checkProviderHealth(providerName?: string): Promise<void> {
    if (providerName) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }

      try {
        const startTime = Date.now();
        const isHealthy = await provider.validateConfiguration();
        const responseTime = Date.now() - startTime;
        this.updateProviderHealth(providerName, isHealthy && provider.isAvailable, responseTime);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.updateProviderHealth(providerName, false, undefined, errorMessage);
      }
    } else {
      await this.performHealthChecks();
    }
  }

  /**
   * Records request metrics
   */
  private recordRequestMetrics(metrics: ProviderRequestMetrics): void {
    this.metrics.recordRequest(metrics);
  }

  /**
   * Starts periodic metrics reporting
   */
  private startMetricsReporting(): void {
    // Report metrics every 5 minutes
    this.metricsReportTimer = setInterval(() => {
      this.metrics.logMetricsSummary();
    }, 5 * 60 * 1000);

    this.logger.debug('Metrics reporting started', {
      interval: '5 minutes'
    });
  }

  /**
   * Gets provider metrics for monitoring
   */
  getProviderMetrics(provider?: string): any {
    if (provider) {
      return this.metrics.getProviderMetrics(provider);
    }
    return this.metrics.getAllProviderMetrics();
  }

  /**
   * Gets failure patterns for analysis
   */
  getFailurePatterns(provider?: string): any {
    return this.metrics.getFailurePatterns(provider);
  }

  /**
   * Generates a provider comparison report
   */
  generateProviderComparison(): any {
    return this.metrics.generateProviderComparison();
  }

  /**
   * Cleanup resources and stop health monitoring
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up provider manager');

    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Stop metrics reporting
    if (this.metricsReportTimer) {
      clearInterval(this.metricsReportTimer);
      this.metricsReportTimer = undefined;
    }

    // Log final metrics summary before cleanup
    this.metrics.logMetricsSummary();

    // Cleanup all providers
    const cleanupPromises = Array.from(this.providers.values()).map(provider => 
      provider.cleanup().catch(error => 
        this.logger.error('Error cleaning up provider', {
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error)
        })
      )
    );

    await Promise.allSettled(cleanupPromises);

    this.providers.clear();
    this.providerHealth.clear();
    this.isInitialized = false;

    this.logger.info('Provider manager cleanup completed');
  }

  /**
   * Get manager statistics
   */
  getStats(): Record<string, any> {
    const healthyProviders = this.getHealthyProviders();
    const totalProviders = this.providers.size;
    
    return {
      totalProviders,
      healthyProviders: healthyProviders.length,
      unhealthyProviders: totalProviders - healthyProviders.length,
      primaryProvider: this.config.primaryProvider,
      fallbackProviders: this.config.fallbackProviders,
      selectionStrategy: this.config.selectionStrategy,
      isInitialized: this.isInitialized,
      providerHealth: this.getProviderHealth()
    };
  }
}
