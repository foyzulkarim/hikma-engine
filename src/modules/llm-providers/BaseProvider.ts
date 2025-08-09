/**
 * Base abstract class for LLM providers
 * Provides common functionality and enforces the provider interface
 */

import { getLogger } from '../../utils/logger';
import { LLMProviderInterface, LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';

/**
 * Abstract base class for all LLM providers
 * Provides common functionality like logging, error handling, and validation
 */
export abstract class BaseProvider implements LLMProviderInterface {
  protected config: LLMProviderConfig;
  private _logger?: ReturnType<typeof getLogger>;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  /** The name of the provider - must be implemented by subclasses */
  abstract readonly name: string;

  /** Get the logger instance, creating it if needed */
  protected get logger(): ReturnType<typeof getLogger> {
    if (!this._logger) {
      this._logger = getLogger(`LLMProvider:${this.name}`);
    }
    return this._logger;
  }

  /** Whether the provider is currently available - must be implemented by subclasses */
  abstract readonly isAvailable: boolean;

  /**
   * Generate an explanation - must be implemented by subclasses
   */
  abstract generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse>;

  /**
   * Validate the provider's configuration - must be implemented by subclasses
   */
  abstract validateConfiguration(): Promise<boolean>;

  /**
   * Cleanup any resources - must be implemented by subclasses
   */
  abstract cleanup(): Promise<void>;

  /**
   * Helper method to create provider-specific errors
   */
  protected createError(
    message: string,
    type: LLMProviderErrorType,
    cause?: Error
  ): LLMProviderError {
    return new LLMProviderError(message, type, this.name, cause);
  }

  /**
   * Helper method to log provider operations
   */
  protected logOperation(operation: string, metadata?: Record<string, any>): () => void {
    const startTime = Date.now();
    this.logger.info(`Starting ${operation}`, metadata);
    
    return () => {
      const duration = Date.now() - startTime;
      this.logger.info(`Completed ${operation}`, { ...metadata, duration });
    };
  }

  /**
   * Helper method to validate common configuration properties
   */
  protected validateCommonConfig(): void {
    if (!this.config) {
      throw this.createError('Provider configuration is required', LLMProviderErrorType.CONFIGURATION_ERROR);
    }

    const errors: string[] = [];

    if (typeof this.config.timeout !== 'number' || this.config.timeout <= 0) {
      errors.push('Invalid timeout configuration');
    }

    if (typeof this.config.retryAttempts !== 'number' || this.config.retryAttempts < 0) {
      errors.push('Invalid retry attempts configuration');
    }

    if (typeof this.config.retryDelay !== 'number' || this.config.retryDelay < 0) {
      errors.push('Invalid retry delay configuration');
    }

    if (errors.length > 0) {
      throw this.createError(errors[0], LLMProviderErrorType.CONFIGURATION_ERROR);
    }
  }

  /**
   * Helper method to implement retry logic with exponential backoff
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;
    const maxAttempts = this.config.retryAttempts + 1; // Total attempts = initial + retries
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          this.logger.info(`Retrying ${operationName} (attempt ${attempt + 1}/${maxAttempts}) after ${delay}ms`);
          await this.sleep(delay);
        }
        
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxAttempts - 1) {
          this.logger.error(`${operationName} failed after ${attempt + 1} attempts`, {
            error: lastError.message
          });
          throw lastError;
        }
        
        this.logger.warn(`${operationName} failed on attempt ${attempt + 1}`, {
          error: lastError.message,
          willRetry: true
        });
      }
    }
    
    // This should never be reached, but just in case
    throw lastError || new Error(`${operationName} failed after retries`);
  }

  /**
   * Helper method to sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper method to validate search results
   */
  protected validateSearchResults(searchResults: SearchResult[]): void {
    if (!Array.isArray(searchResults)) {
      throw this.createError('Search results must be an array', LLMProviderErrorType.CONFIGURATION_ERROR);
    }

    for (const result of searchResults) {
      if (!result.file_path || !result.source_text) {
        throw this.createError('Invalid search result format', LLMProviderErrorType.CONFIGURATION_ERROR);
      }
    }
  }

  /**
   * Helper method to validate query
   */
  protected validateQuery(query: string): void {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw this.createError('Query must be a non-empty string', LLMProviderErrorType.CONFIGURATION_ERROR);
    }
  }
}
