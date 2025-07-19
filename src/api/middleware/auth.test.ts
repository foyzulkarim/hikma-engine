import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authService, authenticate, authorize, requirePermissions, apiKeyAuth, jwtAuth } from './auth';
import { apiConfig } from '../config/api-config';
import { APIErrors } from '../errors/api-errors';

// Mock the config
jest.mock('../config/api-config');
const mockApiConfig = apiConfig as jest.Mocked<typeof apiConfig>;

describe('AuthenticationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateApiKey', () => {
    it('should validate correct API key', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: {
          enabled: true,
          header: 'X-API-Key',
          keys: ['valid-key-1', 'valid-key-2'],
        },
        jwt: { enabled: false, secret: '', expiresIn: '1h', algorithm: 'HS256' },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      expect(authService.validateApiKey('valid-key-1')).toBe(true);
      expect(authService.validateApiKey('valid-key-2')).toBe(true);
      expect(authService.validateApiKey('invalid-key')).toBe(false);
    });

    it('should return true when API key authentication is disabled', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: {
          enabled: false,
          header: 'X-API-Key',
          keys: [],
        },
        jwt: { enabled: false, secret: '', expiresIn: '1h', algorithm: 'HS256' },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      expect(authService.validateApiKey('any-key')).toBe(true);
    });
  });

  describe('validateJWT', () => {
    const secret = 'test-secret';
    const payload = { id: '123', role: 'user' };

    beforeEach(() => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: {
          enabled: true,
          secret,
          expiresIn: '1h',
          algorithm: 'HS256',
        },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });
    });

    it('should validate correct JWT token', () => {
      const token = jwt.sign(payload, secret);
      const result = authService.validateJWT(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toMatchObject(payload);
    });

    it('should reject invalid JWT token', () => {
      const result = authService.validateJWT('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should reject expired JWT token', () => {
      const expiredToken = jwt.sign(payload, secret, { expiresIn: '-1h' });
      const result = authService.validateJWT(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should return true when JWT authentication is disabled', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: { enabled: false, secret: '', expiresIn: '1h', algorithm: 'HS256' },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      const result = authService.validateJWT('any-token');
      expect(result.valid).toBe(true);
    });
  });

  describe('generateJWT', () => {
    it('should generate valid JWT token', () => {
      const secret = 'test-secret';
      const payload = { id: '123', role: 'user' };

      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: {
          enabled: true,
          secret,
          expiresIn: '1h',
          algorithm: 'HS256',
        },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      const token = authService.generateJWT(payload);
      const decoded = jwt.verify(token, secret) as any;

      expect(decoded.id).toBe(payload.id);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw error when JWT secret is not configured', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: {
          enabled: true,
          secret: undefined,
          expiresIn: '1h',
          algorithm: 'HS256',
        },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      expect(() => authService.generateJWT({ id: '123' })).toThrow('JWT secret not configured');
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const header = `Bearer ${token}`;

      expect(authService.extractTokenFromHeader(header)).toBe(token);
    });

    it('should return null for invalid header format', () => {
      expect(authService.extractTokenFromHeader('InvalidHeader')).toBeNull();
      expect(authService.extractTokenFromHeader('Basic token')).toBeNull();
      expect(authService.extractTokenFromHeader('')).toBeNull();
    });
  });
});

describe('Authentication Middleware', () => {
  let req: any;
  let res: any;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      header: jest.fn(),
    };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('apiKeyAuth', () => {
    it('should authenticate with valid API key', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: {
          enabled: true,
          header: 'X-API-Key',
          keys: ['valid-key'],
        },
        jwt: { enabled: false, secret: '', expiresIn: '1h', algorithm: 'HS256' },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      req.header.mockReturnValue('valid-key');

      apiKeyAuth(req, res, next);

      expect(req.apiKey).toBe('valid-key');
      expect(next).toHaveBeenCalled();
    });

    it('should throw error for missing API key', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: {
          enabled: true,
          header: 'X-API-Key',
          keys: ['valid-key'],
        },
        jwt: { enabled: false, secret: '', expiresIn: '1h', algorithm: 'HS256' },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      req.header.mockReturnValue(undefined);

      expect(() => apiKeyAuth(req, res, next)).toThrow();
    });

    it('should skip authentication when disabled', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: { enabled: false, secret: '', expiresIn: '1h', algorithm: 'HS256' },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      apiKeyAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('jwtAuth', () => {
    it('should authenticate with valid JWT token', () => {
      const secret = 'test-secret';
      const payload = { id: '123', role: 'user' };
      const token = jwt.sign(payload, secret);

      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: {
          enabled: true,
          secret,
          expiresIn: '1h',
          algorithm: 'HS256',
        },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      req.header.mockReturnValue(`Bearer ${token}`);

      jwtAuth(req, res, next);

      expect(req.user).toMatchObject(payload);
      expect(next).toHaveBeenCalled();
    });

    it('should throw error for missing JWT token', () => {
      mockApiConfig.getSecurityConfig.mockReturnValue({
        apiKey: { enabled: false, header: 'X-API-Key', keys: [] },
        jwt: {
          enabled: true,
          secret: 'test-secret',
          expiresIn: '1h',
          algorithm: 'HS256',
        },
        headers: {
          contentSecurityPolicy: true,
          xFrameOptions: true,
          xContentTypeOptions: true,
          referrerPolicy: true,
        },
      });

      req.header.mockReturnValue(undefined);

      expect(() => jwtAuth(req, res, next)).toThrow();
    });
  });

  describe('authorize', () => {
    it('should allow access with correct role', () => {
      req.user = { id: '123', role: 'admin', permissions: [] };

      const middleware = authorize(['admin', 'user']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access with incorrect role', () => {
      req.user = { id: '123', role: 'user', permissions: [] };

      const middleware = authorize(['admin']);

      expect(() => middleware(req, res, next)).toThrow();
    });

    it('should allow access when no roles required', () => {
      req.user = { id: '123', role: 'user', permissions: [] };

      const middleware = authorize([]);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requirePermissions', () => {
    it('should allow access with correct permissions', () => {
      req.user = {
        id: '123',
        role: 'user',
        permissions: ['read', 'write', 'admin'],
      };

      const middleware = requirePermissions(['read', 'write']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access with insufficient permissions', () => {
      req.user = {
        id: '123',
        role: 'user',
        permissions: ['read'],
      };

      const middleware = requirePermissions(['read', 'write']);

      expect(() => middleware(req, res, next)).toThrow();
    });

    it('should allow access when no permissions required', () => {
      req.user = { id: '123', role: 'user', permissions: [] };

      const middleware = requirePermissions([]);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
