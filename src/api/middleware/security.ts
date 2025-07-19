import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { apiConfig } from '../config/api-config';
import { APIErrors } from '../errors/api-errors';

// Input sanitization middleware
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Sanitize query parameters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters
        req.query[key] = value
          .replace(/[<>]/g, '') // Remove angle brackets
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+=/gi, '') // Remove event handlers
          .trim();
      }
    }
  }

  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  next();
}

function sanitizeObject(obj: any): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      obj[key] = value
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value);
    }
  }
}

// Path traversal prevention
export function preventPathTraversal(req: Request, res: Response, next: NextFunction): void {
  const dangerousPatterns = [
    '../',
    '..\\',
    '%2e%2e%2f',
    '%2e%2e%5c',
    '..%2f',
    '..%5c',
  ];

  const checkValue = (value: string): boolean => {
    const lowerValue = value.toLowerCase();
    return dangerousPatterns.some(pattern => lowerValue.includes(pattern));
  };

  // Check query parameters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && checkValue(value)) {
        throw APIErrors.validation.invalid(key, value, 'Path traversal attempt detected');
      }
    }
  }

  // Check request body
  if (req.body && typeof req.body === 'object') {
    const checkObjectForPathTraversal = (obj: any, path = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string' && checkValue(value)) {
          throw APIErrors.validation.invalid(currentPath, value, 'Path traversal attempt detected');
        } else if (typeof value === 'object' && value !== null) {
          checkObjectForPathTraversal(value, currentPath);
        }
      }
    };

    checkObjectForPathTraversal(req.body);
  }

  next();
}

// SQL injection prevention (basic patterns)
export function preventSQLInjection(req: Request, res: Response, next: NextFunction): void {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(--|\/\*|\*\/)/g,
    /(\b(CHAR|NCHAR|VARCHAR|NVARCHAR)\s*\()/gi,
    /(\b(CAST|CONVERT)\s*\()/gi,
  ];

  const checkForSQLInjection = (value: string): boolean => {
    return sqlPatterns.some(pattern => pattern.test(value));
  };

  // Check query parameters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && checkForSQLInjection(value)) {
        throw APIErrors.validation.invalid(key, value, 'Potential SQL injection detected');
      }
    }
  }

  // Check request body
  if (req.body && typeof req.body === 'object') {
    const checkObjectForSQL = (obj: any, path = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string' && checkForSQLInjection(value)) {
          throw APIErrors.validation.invalid(currentPath, value, 'Potential SQL injection detected');
        } else if (typeof value === 'object' && value !== null) {
          checkObjectForSQL(value, currentPath);
        }
      }
    };

    checkObjectForSQL(req.body);
  }

  next();
}

// Request size limiting
export function limitRequestSize(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('content-length');
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        throw APIErrors.validation.invalid('Content-Length', contentLength, `exceeds maximum allowed size ${maxSize}`);
      }
    }

    next();
  };
}

function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  const multiplier = units[unit];

  if (!multiplier) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return Math.floor(value * multiplier);
}

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const securityConfig = apiConfig.getSecurityConfig();

  if (securityConfig.headers.contentSecurityPolicy) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';");
  }

  if (securityConfig.headers.xFrameOptions) {
    res.setHeader('X-Frame-Options', 'DENY');
  }

  if (securityConfig.headers.xContentTypeOptions) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  if (securityConfig.headers.referrerPolicy) {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  // Additional security headers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
}

// Helmet configuration
export function configureHelmet() {
  const securityConfig = apiConfig.getSecurityConfig();

  return helmet({
    contentSecurityPolicy: securityConfig.headers.contentSecurityPolicy ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    } : false,
    
    crossOriginEmbedderPolicy: false, // Disable for API compatibility
    
    frameguard: securityConfig.headers.xFrameOptions ? {
      action: 'deny'
    } : false,
    
    noSniff: securityConfig.headers.xContentTypeOptions,
    
    referrerPolicy: securityConfig.headers.referrerPolicy ? {
      policy: 'strict-origin-when-cross-origin'
    } : false,
    
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    
    xssFilter: true,
  });
}

// IP whitelist middleware
export function ipWhitelist(allowedIPs: string[] = []) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (allowedIPs.length === 0) {
      return next(); // No IP restrictions
    }

    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    if (!clientIP || !allowedIPs.includes(clientIP)) {
      throw APIErrors.authorization(`Access denied from IP: ${clientIP}`);
    }

    next();
  };
}

// Request timeout middleware
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        throw APIErrors.timeout(`Request timeout after ${timeoutMs}ms`);
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

// CORS configuration
export function configureCORS() {
  const corsConfig = apiConfig.getCorsConfig();

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (corsConfig.origins.includes('*') || corsConfig.origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: corsConfig.credentials,
    methods: corsConfig.methods,
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-Response-Time',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
  };
}

// Security audit logging
export function securityAuditLog(req: Request, res: Response, next: NextFunction): void {
  const securityEvents = [
    'authentication_failure',
    'authorization_failure',
    'suspicious_activity',
    'rate_limit_exceeded',
  ];

  // This would integrate with your logging system
  // For now, we'll just add the audit context to the request
  (req as any).auditContext = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    endpoint: `${req.method} ${req.path}`,
  };

  next();
}
