/**
 * Types and interfaces for configurable LLM providers
 */

import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';

/**
 * Error types that can occur when working with LLM providers
 */
export enum LLMProviderErrorType {
  CONFIGURATION_ERROR = 'configuration_error',
  NETWORK_ERROR = 'network_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  RESPONSE_FORMAT_ERROR = 'response_format_error'
}

/**
 * Configuration interface for LLM providers
 */
export interface LLMProviderConfig {
  /** The provider type to use */
  provider: 'python' | 'server';
  
  /** Request timeout in milliseconds */
  timeout: number;
  
  /** Number of retry attempts for failed requests */
  retryAttempts: number;
  
  /** Delay between retry attempts in milliseconds */
  retryDelay: number;
  
  /** Server-specific configuration */
  server?: {
    /** Server API URL */
    apiUrl: string;
    /** Server API key */
    apiKey: string;
    /** Model name to use */
    model: string;
    /** Maximum tokens in response */
    maxTokens?: number;
    /** Temperature for response generation */
    temperature?: number;
  };
  
  /** Python-specific configuration (existing) */
  python?: {
    /** Model name to use */
    model: string;
    /** Maximum number of search results to process */
    maxResults: number;
  };
}

/**
 * Interface that all LLM providers must implement
 */
export interface LLMProviderInterface {
  /** The name of the provider */
  readonly name: string;
  
  /** Whether the provider is currently available */
  readonly isAvailable: boolean;
  
  /**
   * Generate an explanation based on query and search results
   * @param query - The user's query
   * @param searchResults - Array of search results to use for context
   * @param options - Optional configuration for the request
   * @returns Promise resolving to RAG response
   */
  generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse>;
  
  /**
   * Validate the provider's configuration
   * @returns Promise resolving to true if configuration is valid
   */
  validateConfiguration(): Promise<boolean>;
  
  /**
   * Cleanup any resources used by the provider
   * @returns Promise that resolves when cleanup is complete
   */
  cleanup(): Promise<void>;
}

/**
 * Error class for LLM provider-specific errors
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly type: LLMProviderErrorType,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}
