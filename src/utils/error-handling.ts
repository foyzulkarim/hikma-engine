/**
 * @file Utility functions for type-safe error handling throughout the application.
 *       Provides consistent error formatting and type checking for unknown error types.
 */

/**
 * Safely extracts error message from unknown error type
 * @param error - The error object (unknown type)
 * @returns A string representation of the error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  
  return String(error);
}

/**
 * Safely extracts error stack trace from unknown error type
 * @param error - The error object (unknown type)
 * @returns Stack trace string or undefined if not available
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  
  if (error && typeof error === 'object' && 'stack' in error) {
    return String((error as any).stack);
  }
  
  return undefined;
}

/**
 * Formats error for logging with consistent structure
 * @param error - The error object (unknown type)
 * @returns Object with message and optional stack trace
 */
export function formatError(error: unknown): { message: string; stack?: string } {
  return {
    message: getErrorMessage(error),
    stack: getErrorStack(error)
  };
}

/**
 * Creates a standardized error object from unknown error
 * @param error - The error object (unknown type)
 * @param context - Additional context for the error
 * @returns A proper Error object
 */
export function normalizeError(error: unknown, context?: string): Error {
  if (error instanceof Error) {
    return context ? new Error(`${context}: ${getErrorMessage(error)}`) : error;
  }
  
  const message = getErrorMessage(error);
  return new Error(context ? `${context}: ${message}` : message);
}

/**
 * Type guard to check if an error is an instance of Error
 * @param error - The error object to check
 * @returns True if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Safely logs error with consistent formatting
 * @param logger - Logger instance with error method
 * @param message - Log message
 * @param error - The error object (unknown type)
 * @param additionalContext - Additional context to include
 */
export function logError(
  logger: { error: (message: string, context?: any) => void },
  message: string,
  error: unknown,
  additionalContext?: Record<string, any>
): void {
  const errorInfo = formatError(error);
  logger.error(message, {
    error: errorInfo.message,
    stack: errorInfo.stack,
    ...additionalContext
  });
}

/**
 * Database-specific error types for better error handling
 */
export class DatabaseConnectionError extends Error {
  constructor(
    public readonly database: string,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(`${database} connection error: ${message}`);
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseOperationError extends Error {
  constructor(
    public readonly database: string,
    public readonly operation: string,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(`${database} ${operation} error: ${message}`);
    this.name = 'DatabaseOperationError';
  }
}

export class DataValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(`Data validation failed: ${message}`);
    this.name = 'DataValidationError';
  }
}

/**
 * Retry configuration for database operations
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/**
 * Default retry configuration for database operations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'EPIPE',
    'SQLITE_BUSY',
    'SQLITE_LOCKED'
  ]
};

/**
 * Determines if an error is retryable based on configuration
 * @param error - The error to check
 * @param retryConfig - Retry configuration
 * @returns True if the error should be retried
 */
export function isRetryableError(error: unknown, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  const errorMessage = getErrorMessage(error);
  const errorCode = (error as any)?.code;
  
  if (!retryConfig.retryableErrors) {
    return false;
  }
  
  return retryConfig.retryableErrors.some(retryableError => 
    errorMessage.includes(retryableError) || errorCode === retryableError
  );
}

/**
 * Executes an operation with retry logic and exponential backoff
 * @param operation - The operation to retry
 * @param retryConfig - Retry configuration
 * @param logger - Logger instance for retry attempts
 * @param operationName - Name of the operation for logging
 * @returns Promise resolving to the operation result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  logger?: { debug: (message: string, context?: any) => void; warn: (message: string, context?: any) => void },
  operationName: string = 'operation'
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1 && logger) {
        logger.debug(`${operationName} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === retryConfig.maxAttempts) {
        break;
      }
      
      if (!isRetryableError(error, retryConfig)) {
        throw error;
      }
      
      const delay = Math.min(
        retryConfig.baseDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
        retryConfig.maxDelayMs
      );
      
      if (logger) {
        logger.warn(`${operationName} failed on attempt ${attempt}, retrying in ${delay}ms`, {
          error: getErrorMessage(error),
          attempt,
          maxAttempts: retryConfig.maxAttempts
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Circuit breaker state for database connections
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeoutMs: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): string {
    return this.state;
  }
  
  getFailures(): number {
    return this.failures;
  }
}
