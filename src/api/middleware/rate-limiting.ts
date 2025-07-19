/**
 * @file Rate limiting middleware for API requests.
 *       Implements configurable rate limiting per IP address with different limits for different endpoints.
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import { getLogger } from '../../utils/logger';

const logger = getLogger('RateLimitMiddleware');

/**
 * Rate limit configuration interface.
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Custom rate limit exceeded response handler.
 */
function rateLimitExceededHandler(req: Request, res: Response) {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  logger.warn('Rate limit exceeded', {
    requestId,
    ip: req.ip,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
  });

  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP address. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit?.resetTime ? (req.rateLimit.resetTime.getTime() - Date.now()) / 1000 : 60),
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      rateLimit: {
        limit: req.rateLimit?.limit,
        current: req.rateLimit?.limit ? (req.rateLimit.limit - (req.rateLimit.remaining || 0)) : 0,
        remaining: req.rateLimit?.remaining,
        resetTime: req.rateLimit?.resetTime?.toISOString(),
      },
    },
  });
}



/**
 * Skip function for rate limiting - allows bypassing rate limits for certain conditions.
 */
function skipLimitFunction(req: Request): boolean {
  // Skip rate limiting for health check endpoints
  if (req.path.startsWith('/health')) {
    return true;
  }
  
  // Skip rate limiting for root endpoint
  if (req.path === '/') {
    return true;
  }
  
  return false;
}

/**
 * Creates a rate limiting middleware with specified configuration.
 */
function createRateLimiter(config: RateLimitConfig): RateLimitRequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: config.standardHeaders ?? true,
    legacyHeaders: config.legacyHeaders ?? false,
    skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
    skipFailedRequests: config.skipFailedRequests ?? false,
    // Use default keyGenerator for IPv6 compatibility
    skip: skipLimitFunction,
    handler: rateLimitExceededHandler,
    // Note: onLimitReached is not available in newer versions of express-rate-limit
    // The rate limit exceeded logging is handled in the handler function
  });
}

/**
 * Global rate limiter - applies to all API endpoints.
 * Default: 100 requests per 15 minutes per IP.
 */
export const globalRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.GLOBAL_RATE_LIMIT || '100', 10),
  message: 'Too many requests from this IP address. Please try again later.',
});

/**
 * Search endpoint rate limiter - more restrictive for search operations.
 * Default: 50 requests per 10 minutes per IP.
 */
export const searchRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: parseInt(process.env.SEARCH_RATE_LIMIT || '50', 10),
  message: 'Too many search requests from this IP address. Please try again later.',
  skipSuccessfulRequests: false,
  skipFailedRequests: true, // Don't count failed requests (validation errors, etc.)
});

/**
 * Heavy search operations rate limiter - very restrictive for resource-intensive operations.
 * Default: 20 requests per 10 minutes per IP.
 */
export const heavySearchRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: parseInt(process.env.HEAVY_SEARCH_RATE_LIMIT || '20', 10),
  message: 'Too many heavy search requests from this IP address. Please try again later.',
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
});

/**
 * Health check rate limiter - very permissive for monitoring.
 * Default: 200 requests per 5 minutes per IP.
 */
export const healthCheckRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: parseInt(process.env.HEALTH_RATE_LIMIT || '200', 10),
  message: 'Too many health check requests from this IP address.',
});

/**
 * Development rate limiter - more permissive for development environments.
 * Default: 500 requests per 15 minutes per IP.
 */
export const developmentRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.DEV_RATE_LIMIT || '500', 10),
  message: 'Too many requests from this IP address (development mode).',
});

/**
 * Returns appropriate rate limiter based on environment.
 */
export function getEnvironmentRateLimit(): RateLimitRequestHandler {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'development' || env === 'test') {
    logger.info('Using development rate limits');
    return developmentRateLimit;
  }
  
  logger.info('Using production rate limits');
  return globalRateLimit;
}

/**
 * Rate limiting configuration for different endpoint types.
 */
export const RateLimiters = {
  global: globalRateLimit,
  search: searchRateLimit,
  heavySearch: heavySearchRateLimit,
  healthCheck: healthCheckRateLimit,
  development: developmentRateLimit,
  environment: getEnvironmentRateLimit(),
};

/**
 * Middleware to add rate limit information to response headers.
 */
export function addRateLimitHeaders(req: Request, res: Response, next: Function) {
  // Add custom rate limit headers if available
  if (req.rateLimit) {
    res.setHeader('X-RateLimit-Limit', req.rateLimit.limit.toString());
    res.setHeader('X-RateLimit-Remaining', req.rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', req.rateLimit.resetTime?.toISOString() || '');
    res.setHeader('X-RateLimit-Used', (req.rateLimit.limit - req.rateLimit.remaining).toString());
  }
  
  next();
} 
