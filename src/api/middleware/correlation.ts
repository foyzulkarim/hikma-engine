/**
 * @file Correlation and request tracking middleware.
 *       Enhances request ID generation and provides correlation logging throughout the request lifecycle.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getLogger } from '../../utils/logger';

const logger = getLogger('CorrelationMiddleware');

/**
 * Request context interface for correlation tracking.
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
  hrStartTime?: bigint;
  ip: string;
  userAgent?: string;
  method: string;
  url: string;
  path: string;
  query: any;
  sessionId?: string;
}

/**
 * Extended Request interface with correlation context.
 */
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

/**
 * Generates a unique request ID with timestamp and random components.
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomUUID().split('-')[0];
  return `req_${timestamp}_${random}`;
}

/**
 * Generates a session ID from various request headers for tracking user sessions.
 */
function generateSessionId(req: Request): string {
  const userAgent = req.get('User-Agent') || '';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Create a simple hash-like session identifier
  const sessionData = `${ip}_${userAgent}`;
  const hash = Buffer.from(sessionData).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  
  return `sess_${hash}`;
}

/**
 * Request correlation middleware that adds request ID and context tracking.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Generate or use existing request ID
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  
  // Generate session ID for tracking user sessions
  const sessionId = generateSessionId(req);
  
  // Create request context
  const context: RequestContext = {
    requestId,
    startTime,
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: req.query,
    sessionId,
  };
  
  // Attach context to request
  req.context = context;
  
  // Set request ID header for client and downstream services
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Session-ID', sessionId);
  
  // Log request start
  logger.info('Request started', {
    requestId,
    sessionId,
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    ip: context.ip,
    userAgent: context.userAgent,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString(),
  });
  
  // Track request completion
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const contentLength = Buffer.byteLength(data || '', 'utf8');
    
    // Calculate high-precision timing if available
    let hrDuration: number | undefined;
    if (context.hrStartTime) {
      const hrEndTime = process.hrtime.bigint();
      hrDuration = Number(hrEndTime - context.hrStartTime) / 1_000_000; // Convert to milliseconds
    }
    
    logger.info('Request completed', {
      requestId,
      sessionId,
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: `${contentLength}B`,
      ip: context.ip,
      timestamp: new Date().toISOString(),
    });
    
    // Add performance headers (only if response hasn't been sent)
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.setHeader('X-Content-Length', `${contentLength}B`);
      if (hrDuration !== undefined) {
        res.setHeader('X-Process-Time', `${hrDuration.toFixed(2)}ms`);
      }
    }
    
    return originalSend.call(this, data);
  };
  
  // Track request errors
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    // Calculate high-precision timing if available
    let hrDuration: number | undefined;
    if (context.hrStartTime) {
      const hrEndTime = process.hrtime.bigint();
      hrDuration = Number(hrEndTime - context.hrStartTime) / 1_000_000; // Convert to milliseconds
    }
    
    // Log errors for non-success responses
    if (res.statusCode >= 400) {
      logger.warn('Request failed', {
        requestId,
        sessionId,
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        error: data?.error,
        ip: context.ip,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Add performance headers (only if response hasn't been sent)
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
      if (hrDuration !== undefined) {
        res.setHeader('X-Process-Time', `${hrDuration.toFixed(2)}ms`);
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
}

/**
 * Middleware to add request timing information.
 */
export function timingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = process.hrtime.bigint();
  
  // Store timing info in request context for later use
  if (req.context) {
    req.context.hrStartTime = startTime;
  }
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
    
    const requestId = req.context?.requestId || 'unknown';
    
    logger.debug('Request timing', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      timestamp: new Date().toISOString(),
    });
    
    // Note: Headers are set in correlationMiddleware before response is sent
    // This event handler only logs timing information
  });
  
  next();
}

/**
 * Creates a child logger with request context for correlation logging.
 */
export function getRequestLogger(req: Request) {
  const context = req.context;
  
  if (!context) {
    return logger;
  }
  
  // Create a logger with request context
  return {
    debug: (message: string, meta?: any) => logger.debug(message, { 
      requestId: context.requestId,
      sessionId: context.sessionId,
      ...meta 
    }),
    info: (message: string, meta?: any) => logger.info(message, { 
      requestId: context.requestId,
      sessionId: context.sessionId,
      ...meta 
    }),
    warn: (message: string, meta?: any) => logger.warn(message, { 
      requestId: context.requestId,
      sessionId: context.sessionId,
      ...meta 
    }),
    error: (message: string, meta?: any) => logger.error(message, { 
      requestId: context.requestId,
      sessionId: context.sessionId,
      ...meta 
    }),
  };
}

/**
 * Middleware to log request body for debugging (sanitized).
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestLogger = getRequestLogger(req);
  
  // Log request body for POST/PUT requests (sanitized)
  if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
    const sanitizedBody = { ...req.body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    sensitiveFields.forEach(field => {
      if (sanitizedBody[field]) {
        sanitizedBody[field] = '[REDACTED]';
      }
    });
    
    requestLogger.debug('Request body received', {
      method: req.method,
      path: req.path,
      bodySize: JSON.stringify(req.body).length,
      body: Object.keys(sanitizedBody).length > 0 ? sanitizedBody : undefined,
    });
  }
  
  next();
}

/**
 * Performance monitoring middleware that tracks slow requests.
 */
export function performanceMonitoringMiddleware(req: Request, res: Response, next: NextFunction) {
  const slowRequestThreshold = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000', 10); // 1 second default
  
  res.on('finish', () => {
    const context = req.context;
    if (!context) return;
    
    const duration = Date.now() - context.startTime;
    
    if (duration > slowRequestThreshold) {
      const requestLogger = getRequestLogger(req);
      requestLogger.warn('Slow request detected', {
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.path,
        duration: `${duration}ms`,
        threshold: `${slowRequestThreshold}ms`,
        statusCode: res.statusCode,
        query: context.query,
      });
    }
  });
  
  next();
} 
