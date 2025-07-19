/**
 * @file Middleware exports for API server.
 *       Centralizes all middleware imports for easy integration.
 */

// Validation middleware
export {
  createValidationMiddleware,
  ValidationSchemas,
  validateSemanticSearch,
  validateStructuralSearch,
  validateGitSearch,
  validateHybridSearch,
  validateComprehensiveSearch,
} from './validation';

// Rate limiting middleware
export {
  RateLimiters,
  globalRateLimit,
  searchRateLimit,
  heavySearchRateLimit,
  healthCheckRateLimit,
  developmentRateLimit,
  getEnvironmentRateLimit,
  addRateLimitHeaders,
} from './rate-limiting';

// Correlation and logging middleware
export {
  correlationMiddleware,
  timingMiddleware,
  getRequestLogger,
  requestLoggingMiddleware,
  performanceMonitoringMiddleware,
} from './correlation';

// Error handling middleware
export {
  globalErrorHandler,
  asyncErrorHandler,
  handleSearchError,
  handleDatabaseError,
  handleCacheError,
} from './error-handling'; 
