import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { apiConfig } from '../config/api-config';
import { APIErrors } from '../errors/api-errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
  apiKey?: string;
}

export class AuthenticationService {
  private static instance: AuthenticationService;

  private constructor() {}

  public static getInstance(): AuthenticationService {
    if (!AuthenticationService.instance) {
      AuthenticationService.instance = new AuthenticationService();
    }
    return AuthenticationService.instance;
  }

  public validateApiKey(apiKey: string): boolean {
    const securityConfig = apiConfig.getSecurityConfig();
    
    if (!securityConfig.apiKey.enabled) {
      return true; // API key authentication is disabled
    }

    if (!apiKey) {
      return false;
    }

    return securityConfig.apiKey.keys.includes(apiKey);
  }

  public validateJWT(token: string): { valid: boolean; payload?: any; error?: string } {
    const securityConfig = apiConfig.getSecurityConfig();
    
    if (!securityConfig.jwt.enabled) {
      return { valid: true }; // JWT authentication is disabled
    }

    if (!token) {
      return { valid: false, error: 'No token provided' };
    }

    if (!securityConfig.jwt.secret) {
      return { valid: false, error: 'JWT secret not configured' };
    }

    try {
      const payload = jwt.verify(token, securityConfig.jwt.secret, {
        algorithms: [securityConfig.jwt.algorithm as jwt.Algorithm],
      });
      
      return { valid: true, payload };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Token expired' };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return { valid: false, error: 'Invalid token' };
      } else {
        return { valid: false, error: 'Token verification failed' };
      }
    }
  }

  public generateJWT(payload: object): string {
    const securityConfig = apiConfig.getSecurityConfig();
    
    if (!securityConfig.jwt.secret) {
      throw new Error('JWT secret not configured');
    }

    return jwt.sign(payload, securityConfig.jwt.secret, {
      expiresIn: securityConfig.jwt.expiresIn,
      algorithm: securityConfig.jwt.algorithm as jwt.Algorithm,
    });
  }

  public extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }
}

export const authService = AuthenticationService.getInstance();

// API Key Authentication Middleware
export function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const securityConfig = apiConfig.getSecurityConfig();
  
  if (!securityConfig.apiKey.enabled) {
    return next(); // API key authentication is disabled
  }

  const apiKey = req.header(securityConfig.apiKey.header);
  
  if (!apiKey) {
    throw APIErrors.authentication('API key is required');
  }

  if (!authService.validateApiKey(apiKey)) {
    throw APIErrors.authentication('Invalid API key');
  }

  req.apiKey = apiKey;
  next();
}

// JWT Authentication Middleware
export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const securityConfig = apiConfig.getSecurityConfig();
  
  if (!securityConfig.jwt.enabled) {
    return next(); // JWT authentication is disabled
  }

  const authHeader = req.header('Authorization');
  const token = authService.extractTokenFromHeader(authHeader || '');
  
  if (!token) {
    throw APIErrors.authentication('JWT token is required');
  }

  const validation = authService.validateJWT(token);
  
  if (!validation.valid) {
    throw APIErrors.authentication(validation.error || 'Invalid token');
  }

  req.user = validation.payload as any;
  next();
}

// Combined Authentication Middleware (API Key OR JWT)
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const securityConfig = apiConfig.getSecurityConfig();
  
  // If neither authentication method is enabled, allow access
  if (!securityConfig.apiKey.enabled && !securityConfig.jwt.enabled) {
    return next();
  }

  let authenticated = false;
  let lastError: string | null = null;

  // Try API Key authentication first
  if (securityConfig.apiKey.enabled) {
    const apiKey = req.header(securityConfig.apiKey.header);
    if (apiKey && authService.validateApiKey(apiKey)) {
      req.apiKey = apiKey;
      authenticated = true;
    } else if (apiKey) {
      lastError = 'Invalid API key';
    }
  }

  // Try JWT authentication if API key failed or not provided
  if (!authenticated && securityConfig.jwt.enabled) {
    const authHeader = req.header('Authorization');
    const token = authService.extractTokenFromHeader(authHeader || '');
    
    if (token) {
      const validation = authService.validateJWT(token);
      if (validation.valid) {
        req.user = validation.payload as any;
        authenticated = true;
      } else {
        lastError = validation.error || 'Invalid token';
      }
    }
  }

  if (!authenticated) {
    const errorMessage = lastError || 'Authentication required';
    throw APIErrors.authentication(errorMessage);
  }

  next();
}

// Role-based Authorization Middleware
export function authorize(requiredRoles: string[] = []) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (requiredRoles.length === 0) {
      return next(); // No specific roles required
    }

    if (!req.user) {
      throw APIErrors.authorization('User information not available');
    }

    const userRole = req.user.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw APIErrors.authorization(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
    }

    next();
  };
}

// Permission-based Authorization Middleware
export function requirePermissions(requiredPermissions: string[] = []) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (requiredPermissions.length === 0) {
      return next(); // No specific permissions required
    }

    if (!req.user || !req.user.permissions) {
      throw APIErrors.authorization('User permissions not available');
    }

    const userPermissions = req.user.permissions;
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      throw APIErrors.authorization(`Access denied. Required permissions: ${requiredPermissions.join(', ')}`);
    }

    next();
  };
}

// Optional Authentication Middleware (doesn't throw errors)
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const securityConfig = apiConfig.getSecurityConfig();
  
  // Try API Key authentication
  if (securityConfig.apiKey.enabled) {
    const apiKey = req.header(securityConfig.apiKey.header);
    if (apiKey && authService.validateApiKey(apiKey)) {
      req.apiKey = apiKey;
      return next();
    }
  }

  // Try JWT authentication
  if (securityConfig.jwt.enabled) {
    const authHeader = req.header('Authorization');
    const token = authService.extractTokenFromHeader(authHeader || '');
    
    if (token) {
      const validation = authService.validateJWT(token);
      if (validation.valid) {
        req.user = validation.payload as any;
      }
    }
  }

  next();
}

// Rate limiting per authenticated user
export function createUserRateLimit() {
  const rateLimitConfig = apiConfig.getRateLimitConfig();
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // This would integrate with a rate limiting service
    // For now, we'll just pass through
    // In a real implementation, you'd track requests per user/API key
    next();
  };
}

// Authentication status endpoint
export function getAuthStatus(req: AuthenticatedRequest): {
  authenticated: boolean;
  method?: 'apiKey' | 'jwt';
  user?: any;
  apiKey?: string;
} {
  if (req.user) {
    return {
      authenticated: true,
      method: 'jwt',
      user: {
        id: req.user.id,
        role: req.user.role,
        permissions: req.user.permissions,
      },
    };
  }

  if (req.apiKey) {
    return {
      authenticated: true,
      method: 'apiKey',
      apiKey: req.apiKey.substring(0, 8) + '...',
    };
  }

  return {
    authenticated: false,
  };
}
