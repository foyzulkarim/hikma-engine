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
