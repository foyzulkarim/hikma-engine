/**
 * @file Enhanced error handling middleware with structured errors and monitoring.
 */

import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../utils/logger';
import { getRequestLogger } from './correlation';
import { 
  BaseAPIError, 
  createAPIError as createStructuredAPIError, 
  InternalServerError,
  APIErrors
} from '../errors/api-errors';
import { errorMonitoringService } from '../services/error-monitoring';

const logger = getLogger('ErrorHandlingMiddleware');

/**
 * Global error handler middleware with enhanced monitoring.
 */
export function globalErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.context?.requestId || req.headers['x-request-id'] as string || 'unknown';
  const startTime = req.context?.startTime || Date.now();
  const processingTime = Date.now() - startTime;

  // Convert to structured API error
  let apiError: BaseAPIError;
  
  if (error instanceof BaseAPIError) {
    apiError = error;
  } else {
    apiError = createStructuredAPIError(error, requestId, {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
  }

  // Log the error with appropriate level
  apiError.log();

  // Record error for monitoring
  errorMonitoringService.recordError(apiError);

  // Update performance metrics
  errorMonitoringService.updatePerformanceMetrics(processingTime, true);

  // Send error response
  const errorResponse = apiError.toJSON();
  if (errorResponse.meta) {
    (errorResponse.meta as any).processingTime = processingTime;
  }

  res.status(apiError.statusCode).json(errorResponse);
}

/**
 * Async error handler wrapper.
 */
export function asyncErrorHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error handler for search operations.
 */
export function handleSearchError(
  error: unknown,
  searchType: string,
  query: string,
  requestId?: string
): BaseAPIError {
  if (error instanceof BaseAPIError) {
    return error;
  }

  if (error instanceof Error) {
    // Map specific search errors
    switch (searchType) {
      case 'semantic':
        return APIErrors.search.semanticFailed(query, error, requestId);
      case 'structural':
        return APIErrors.search.structuralFailed(query, error, requestId);
      case 'git':
        return APIErrors.search.gitFailed(query, error, requestId);
      case 'hybrid':
        return APIErrors.search.hybridFailed(query, error, requestId);
      case 'comprehensive':
        return APIErrors.search.comprehensiveFailed(query, error, requestId);
      default:
        return APIErrors.search.semanticFailed(query, error, requestId);
    }
  }

  return new InternalServerError('Unknown search error occurred', undefined, requestId);
}

/**
 * Error handler for database operations.
 */
export function handleDatabaseError(
  error: unknown,
  operation: string,
  requestId?: string
): BaseAPIError {
  if (error instanceof BaseAPIError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific database error patterns
    if (error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')) {
      return APIErrors.service.databaseUnavailable('SQLite', 'Database is busy', requestId);
    }

    if (error.message.includes('ECONNREFUSED') || error.message.includes('connection refused')) {
      return APIErrors.service.databaseUnavailable('Database', 'Connection refused', requestId);
    }

    if (error.message.includes('timeout')) {
      return APIErrors.service.databaseUnavailable('Database', 'Connection timeout', requestId);
    }

    // Generic database error
    return APIErrors.internal(`Database operation failed: ${operation}`, error, requestId);
  }

  return new InternalServerError(`Database operation failed: ${operation}`, undefined, requestId);
}

/**
 * Error handler for cache operations.
 */
export function handleCacheError(
  error: unknown,
  operation: string,
  requestId?: string
): BaseAPIError {
  if (error instanceof BaseAPIError) {
    return error;
  }

  if (error instanceof Error) {
    return APIErrors.internal(`Cache operation failed: ${operation}`, error, requestId);
  }

  return new InternalServerError(`Cache operation failed: ${operation}`, undefined, requestId);
}
