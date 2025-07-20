/**
 * @file Structured error classes for comprehensive API error handling.
 *       Provides detailed error information with proper HTTP status codes and helpful messages.
 */

import { getLogger } from '../../utils/logger';

const logger = getLogger('APIErrors');

/**
 * Base API error class with structured information.
 */
export abstract class BaseAPIError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  abstract readonly isOperational: boolean;

  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly details?: any;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    details?: any,
    context?: Record<string, any>,
    requestId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.details = details;
    this.context = context;
    this.requestId = requestId;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to JSON format for API responses.
   */
  toJSON(): {
    success: false;
    error: {
      code: string;
      message: string;
      details?: any;
      stack?: string;
    };
    meta: {
      timestamp: string;
      requestId?: string;
      context?: Record<string, any>;
    };
  } {
    return {
      success: false,
      error: {
        code: this.errorCode,
        message: this.message,
        details: this.details,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
      },
      meta: {
        timestamp: this.timestamp,
        requestId: this.requestId,
        context: this.context,
      },
    };
  }

  /**
   * Logs the error with appropriate level and context.
   */
  log(): void {
    const logData = {
      errorCode: this.errorCode,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      context: this.context,
      requestId: this.requestId,
      stack: this.stack,
    };

    if (this.statusCode >= 500) {
      logger.error(`${this.errorCode}: ${this.message}`, logData);
    } else if (this.statusCode >= 400) {
      logger.warn(`${this.errorCode}: ${this.message}`, logData);
    } else {
      logger.info(`${this.errorCode}: ${this.message}`, logData);
    }
  }
}

/**
 * Validation errors (400 Bad Request).
 */
export class ValidationError extends BaseAPIError {
  readonly statusCode = 400;
  readonly errorCode = 'VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    field?: string,
    value?: any,
    constraint?: string,
    requestId?: string
  ) {
    super(
      message,
      { field, value, constraint },
      { errorType: 'validation' },
      requestId
    );
  }

  static required(field: string, requestId?: string): ValidationError {
    return new ValidationError(
      `Field '${field}' is required`,
      field,
      undefined,
      'required',
      requestId
    );
  }

  static invalid(field: string, value: any, constraint: string, requestId?: string): ValidationError {
    return new ValidationError(
      `Field '${field}' has invalid value: ${constraint}`,
      field,
      value,
      constraint,
      requestId
    );
  }

  static format(field: string, expectedFormat: string, requestId?: string): ValidationError {
    return new ValidationError(
      `Field '${field}' must be in ${expectedFormat} format`,
      field,
      undefined,
      expectedFormat,
      requestId
    );
  }
}

/**
 * Authentication errors (401 Unauthorized).
 */
export class AuthenticationError extends BaseAPIError {
  readonly statusCode = 401;
  readonly errorCode = 'AUTHENTICATION_ERROR';
  readonly isOperational = true;

  constructor(message: string = 'Authentication required', requestId?: string) {
    super(message, undefined, { errorType: 'authentication' }, requestId);
  }

  static invalidToken(requestId?: string): AuthenticationError {
    return new AuthenticationError('Invalid or expired authentication token', requestId);
  }

  static missingToken(requestId?: string): AuthenticationError {
    return new AuthenticationError('Authentication token is required', requestId);
  }
}

/**
 * Authorization errors (403 Forbidden).
 */
export class AuthorizationError extends BaseAPIError {
  readonly statusCode = 403;
  readonly errorCode = 'AUTHORIZATION_ERROR';
  readonly isOperational = true;

  constructor(
    message: string = 'Insufficient permissions',
    requiredPermission?: string,
    requestId?: string
  ) {
    super(
      message,
      { requiredPermission },
      { errorType: 'authorization' },
      requestId
    );
  }

  static insufficientPermissions(permission: string, requestId?: string): AuthorizationError {
    return new AuthorizationError(
      `Insufficient permissions. Required: ${permission}`,
      permission,
      requestId
    );
  }
}

/**
 * Resource not found errors (404 Not Found).
 */
export class NotFoundError extends BaseAPIError {
  readonly statusCode = 404;
  readonly errorCode = 'RESOURCE_NOT_FOUND';
  readonly isOperational = true;

  constructor(
    resource: string,
    identifier?: string,
    requestId?: string
  ) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(
      message,
      { resource, identifier },
      { errorType: 'not_found' },
      requestId
    );
  }

  static route(method: string, path: string, requestId?: string): NotFoundError {
    return new NotFoundError(`Route ${method} ${path}`, undefined, requestId);
  }

  static endpoint(endpoint: string, requestId?: string): NotFoundError {
    return new NotFoundError(`Endpoint '${endpoint}'`, undefined, requestId);
  }
}

/**
 * Rate limiting errors (429 Too Many Requests).
 */
export class RateLimitError extends BaseAPIError {
  readonly statusCode = 429;
  readonly errorCode = 'RATE_LIMIT_EXCEEDED';
  readonly isOperational = true;

  constructor(
    limit: number,
    windowMs: number,
    retryAfter?: number,
    requestId?: string
  ) {
    super(
      `Rate limit exceeded. Maximum ${limit} requests per ${windowMs / 1000} seconds`,
      { limit, windowMs, retryAfter },
      { errorType: 'rate_limit' },
      requestId
    );
  }
}

/**
 * Search service errors (500 Internal Server Error).
 */
export class SearchServiceError extends BaseAPIError {
  readonly statusCode = 500;
  readonly errorCode = 'SEARCH_SERVICE_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    searchType?: string,
    query?: string,
    originalError?: Error,
    requestId?: string
  ) {
    super(
      message,
      { searchType, query, originalError: originalError?.message },
      { errorType: 'search_service', originalStack: originalError?.stack },
      requestId
    );
  }

  static semanticSearchFailed(query: string, error: Error, requestId?: string): SearchServiceError {
    return new SearchServiceError(
      'Semantic search operation failed',
      'semantic',
      query,
      error,
      requestId
    );
  }

  static structuralSearchFailed(query: string, error: Error, requestId?: string): SearchServiceError {
    return new SearchServiceError(
      'Structural search operation failed',
      'structural',
      query,
      error,
      requestId
    );
  }

  static gitSearchFailed(query: string, error: Error, requestId?: string): SearchServiceError {
    return new SearchServiceError(
      'Git history search operation failed',
      'git',
      query,
      error,
      requestId
    );
  }

  static hybridSearchFailed(query: string, error: Error, requestId?: string): SearchServiceError {
    return new SearchServiceError(
      'Hybrid search operation failed',
      'hybrid',
      query,
      error,
      requestId
    );
  }

  static comprehensiveSearchFailed(query: string, error: Error, requestId?: string): SearchServiceError {
    return new SearchServiceError(
      'Comprehensive search operation failed',
      'comprehensive',
      query,
      error,
      requestId
    );
  }
}

/**
 * Database errors (500 Internal Server Error).
 */
export class DatabaseError extends BaseAPIError {
  readonly statusCode = 500;
  readonly errorCode = 'DATABASE_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    operation?: string,
    database?: string,
    originalError?: Error,
    requestId?: string
  ) {
    super(
      message,
      { operation, database, originalError: originalError?.message },
      { errorType: 'database', originalStack: originalError?.stack },
      requestId
    );
  }

  static connectionFailed(database: string, error: Error, requestId?: string): DatabaseError {
    return new DatabaseError(
      `Failed to connect to ${database} database`,
      'connect',
      database,
      error,
      requestId
    );
  }

  static queryFailed(operation: string, error: Error, requestId?: string): DatabaseError {
    return new DatabaseError(
      `Database query failed: ${operation}`,
      operation,
      'unknown',
      error,
      requestId
    );
  }
}

/**
 * Cache errors (500 Internal Server Error).
 */
export class CacheError extends BaseAPIError {
  readonly statusCode = 500;
  readonly errorCode = 'CACHE_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    operation?: string,
    originalError?: Error,
    requestId?: string
  ) {
    super(
      message,
      { operation, originalError: originalError?.message },
      { errorType: 'cache', originalStack: originalError?.stack },
      requestId
    );
  }

  static operationFailed(operation: string, error: Error, requestId?: string): CacheError {
    return new CacheError(
      `Cache operation failed: ${operation}`,
      operation,
      error,
      requestId
    );
  }
}

/**
 * Configuration errors (500 Internal Server Error).
 */
export class ConfigurationError extends BaseAPIError {
  readonly statusCode = 500;
  readonly errorCode = 'CONFIGURATION_ERROR';
  readonly isOperational = false; // These are programming errors

  constructor(
    message: string,
    configKey?: string,
    expectedValue?: string,
    requestId?: string
  ) {
    super(
      message,
      { configKey, expectedValue },
      { errorType: 'configuration' },
      requestId
    );
  }

  static missing(configKey: string, requestId?: string): ConfigurationError {
    return new ConfigurationError(
      `Missing required configuration: ${configKey}`,
      configKey,
      undefined,
      requestId
    );
  }

  static invalid(configKey: string, expectedValue: string, requestId?: string): ConfigurationError {
    return new ConfigurationError(
      `Invalid configuration for ${configKey}. Expected: ${expectedValue}`,
      configKey,
      expectedValue,
      requestId
    );
  }
}

/**
 * Generic internal server errors (500 Internal Server Error).
 */
export class InternalServerError extends BaseAPIError {
  readonly statusCode = 500;
  readonly errorCode = 'INTERNAL_SERVER_ERROR';
  readonly isOperational = false;

  constructor(
    message: string = 'An unexpected error occurred',
    originalError?: Error,
    requestId?: string
  ) {
    super(
      message,
      { originalError: originalError?.message },
      { errorType: 'internal', originalStack: originalError?.stack },
      requestId
    );
  }

  static unexpected(error: Error, requestId?: string): InternalServerError {
    return new InternalServerError(
      'An unexpected error occurred. Please try again later.',
      error,
      requestId
    );
  }
}

/**
 * Service unavailable errors (503 Service Unavailable).
 */
export class ServiceUnavailableError extends BaseAPIError {
  readonly statusCode = 503;
  readonly errorCode = 'SERVICE_UNAVAILABLE';
  readonly isOperational = true;

  constructor(
    service: string,
    reason?: string,
    retryAfter?: number,
    requestId?: string
  ) {
    super(
      `${service} service is currently unavailable${reason ? `: ${reason}` : ''}`,
      { service, reason, retryAfter },
      { errorType: 'service_unavailable' },
      requestId
    );
  }

  static searchService(reason?: string, requestId?: string): ServiceUnavailableError {
    return new ServiceUnavailableError('Search', reason, 60, requestId);
  }

  static database(database: string, reason?: string, requestId?: string): ServiceUnavailableError {
    return new ServiceUnavailableError(`${database} database`, reason, 30, requestId);
  }
}

/**
 * Utility function to create appropriate error from unknown error.
 */
export function createAPIError(
  error: unknown,
  requestId?: string,
  context?: Record<string, any>
): BaseAPIError {
  // If it's already an API error, return it
  if (error instanceof BaseAPIError) {
    return error;
  }

  // If it's a standard Error
  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
      return new ServiceUnavailableError('Database', error.message, 30, requestId);
    }
    
    if (error.message.includes('timeout')) {
      return new ServiceUnavailableError('Service', 'Request timeout', 60, requestId);
    }

    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return new ValidationError(error.message, undefined, undefined, undefined, requestId);
    }

    // Default to internal server error
    return new InternalServerError(error.message, error, requestId);
  }

  // For non-Error objects
  const message = typeof error === 'string' ? error : 'An unknown error occurred';
  return new InternalServerError(message, undefined, requestId);
}

/**
 * Type guard to check if error is operational.
 */
export function isOperationalError(error: unknown): boolean {
  return error instanceof BaseAPIError && error.isOperational;
}

/**
 * Error factory for common API errors.
 */
export const APIErrors = {
  // Validation errors
  validation: {
    required: (field: string, requestId?: string) => ValidationError.required(field, requestId),
    invalid: (field: string, value: any, constraint: string, requestId?: string) => 
      ValidationError.invalid(field, value, constraint, requestId),
    format: (field: string, format: string, requestId?: string) => 
      ValidationError.format(field, format, requestId),
  },

  // Authentication errors
  auth: {
    invalidToken: (requestId?: string) => AuthenticationError.invalidToken(requestId),
    missingToken: (requestId?: string) => AuthenticationError.missingToken(requestId),
    insufficientPermissions: (permission: string, requestId?: string) => 
      AuthorizationError.insufficientPermissions(permission, requestId),
  },

  // Not found errors
  notFound: {
    route: (method: string, path: string, requestId?: string) => 
      NotFoundError.route(method, path, requestId),
    endpoint: (endpoint: string, requestId?: string) => 
      NotFoundError.endpoint(endpoint, requestId),
    resource: (resource: string, id?: string, requestId?: string) => 
      new NotFoundError(resource, id, requestId),
  },

  // Search errors
  search: {
    semanticFailed: (query: string, error: Error, requestId?: string) => 
      SearchServiceError.semanticSearchFailed(query, error, requestId),
    structuralFailed: (query: string, error: Error, requestId?: string) => 
      SearchServiceError.structuralSearchFailed(query, error, requestId),
    gitFailed: (query: string, error: Error, requestId?: string) => 
      SearchServiceError.gitSearchFailed(query, error, requestId),
    hybridFailed: (query: string, error: Error, requestId?: string) => 
      SearchServiceError.hybridSearchFailed(query, error, requestId),
    comprehensiveFailed: (query: string, error: Error, requestId?: string) => 
      SearchServiceError.comprehensiveSearchFailed(query, error, requestId),
  },

  // Service errors
  service: {
    unavailable: (service: string, reason?: string, requestId?: string) => 
      new ServiceUnavailableError(service, reason, 60, requestId),
    searchUnavailable: (reason?: string, requestId?: string) => 
      ServiceUnavailableError.searchService(reason, requestId),
    databaseUnavailable: (database: string, reason?: string, requestId?: string) => 
      ServiceUnavailableError.database(database, reason, requestId),
  },

  // Generic errors
  internal: (message?: string, error?: Error, requestId?: string) => 
    new InternalServerError(message, error, requestId),
  
  rateLimit: (limit: number, windowMs: number, retryAfter?: number, requestId?: string) => 
    new RateLimitError(limit, windowMs, retryAfter, requestId),

  // Authentication errors
  authentication: (message: string, requestId?: string) => 
    new AuthenticationError(message, requestId),

  // Authorization errors  
  authorization: (message: string, requestId?: string) => 
    new AuthorizationError(message, requestId),

  // Timeout errors
  timeout: (message: string, requestId?: string) => 
    new InternalServerError(message, undefined, requestId),
};
