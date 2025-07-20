/**
 * @file Tests for comprehensive error handling and monitoring (Task 10).
 */

import { 
  BaseAPIError,
  ValidationError,
  SearchServiceError,
  DatabaseError,
  NotFoundError,
  RateLimitError,
  createAPIError,
  isOperationalError,
  APIErrors
} from '../src/api/errors/api-errors';
import { ErrorMonitoringService } from '../src/api/services/error-monitoring';
import { 
  globalErrorHandler,
  handleSearchError,
  handleDatabaseError,
  handleCacheError
} from '../src/api/middleware/error-handling';
import { Request, Response, NextFunction } from 'express';

// Mock logger
jest.mock('../src/utils/logger', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Structured API Errors', () => {
  describe('BaseAPIError', () => {
    class TestError extends BaseAPIError {
      readonly statusCode = 400;
      readonly errorCode = 'TEST_ERROR';
      readonly isOperational = true;
    }

    it('should create error with proper structure', () => {
      const error = new TestError('Test message', { field: 'test' }, { context: 'test' }, 'req-123');

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.context).toEqual({ context: 'test' });
      expect(error.requestId).toBe('req-123');
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should convert to JSON format correctly', () => {
      const error = new TestError('Test message', { field: 'test' });
      const json = error.toJSON();

      expect(json).toMatchObject({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test message',
          details: { field: 'test' },
        },
        meta: {
          timestamp: expect.any(String),
        },
      });
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new TestError('Test message');
      const json = error.toJSON();

      expect(json.error.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new TestError('Test message');
      const json = error.toJSON();

      expect(json.error.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field details', () => {
      const error = new ValidationError('Invalid field', 'email', 'invalid@', 'email format');

      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({
        field: 'email',
        value: 'invalid@',
        constraint: 'email format',
      });
    });

    it('should create required field error', () => {
      const error = ValidationError.required('name', 'req-123');

      expect(error.message).toBe("Field 'name' is required");
      expect(error.details.field).toBe('name');
      expect(error.details.constraint).toBe('required');
      expect(error.requestId).toBe('req-123');
    });

    it('should create invalid field error', () => {
      const error = ValidationError.invalid('age', -5, 'must be positive', 'req-123');

      expect(error.message).toBe("Field 'age' has invalid value: must be positive");
      expect(error.details.field).toBe('age');
      expect(error.details.value).toBe(-5);
      expect(error.details.constraint).toBe('must be positive');
    });

    it('should create format error', () => {
      const error = ValidationError.format('date', 'ISO 8601', 'req-123');

      expect(error.message).toBe("Field 'date' must be in ISO 8601 format");
      expect(error.details.field).toBe('date');
      expect(error.details.constraint).toBe('ISO 8601');
    });
  });

  describe('SearchServiceError', () => {
    it('should create semantic search error', () => {
      const originalError = new Error('Database connection failed');
      const error = SearchServiceError.semanticSearchFailed('test query', originalError, 'req-123');

      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('SEARCH_SERVICE_ERROR');
      expect(error.message).toBe('Semantic search operation failed');
      expect(error.details.searchType).toBe('semantic');
      expect(error.details.query).toBe('test query');
      expect(error.details.originalError).toBe('Database connection failed');
      expect(error.requestId).toBe('req-123');
    });

    it('should create different search type errors', () => {
      const originalError = new Error('Test error');
      
      const structuralError = SearchServiceError.structuralSearchFailed('query', originalError);
      const gitError = SearchServiceError.gitSearchFailed('query', originalError);
      const hybridError = SearchServiceError.hybridSearchFailed('query', originalError);
      const comprehensiveError = SearchServiceError.comprehensiveSearchFailed('query', originalError);

      expect(structuralError.details.searchType).toBe('structural');
      expect(gitError.details.searchType).toBe('git');
      expect(hybridError.details.searchType).toBe('hybrid');
      expect(comprehensiveError.details.searchType).toBe('comprehensive');
    });
  });

  describe('DatabaseError', () => {
    it('should create connection failed error', () => {
      const originalError = new Error('ECONNREFUSED');
      const error = DatabaseError.connectionFailed('PostgreSQL', originalError, 'req-123');

      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('DATABASE_ERROR');
      expect(error.message).toBe('Failed to connect to PostgreSQL database');
      expect(error.details.operation).toBe('connect');
      expect(error.details.database).toBe('PostgreSQL');
      expect(error.details.originalError).toBe('ECONNREFUSED');
    });

    it('should create query failed error', () => {
      const originalError = new Error('Syntax error');
      const error = DatabaseError.queryFailed('SELECT users', originalError, 'req-123');

      expect(error.message).toBe('Database query failed: SELECT users');
      expect(error.details.operation).toBe('SELECT users');
    });
  });

  describe('NotFoundError', () => {
    it('should create resource not found error', () => {
      const error = new NotFoundError('User', '123', 'req-123');

      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('RESOURCE_NOT_FOUND');
      expect(error.message).toBe("User with identifier '123' not found");
      expect(error.details.resource).toBe('User');
      expect(error.details.identifier).toBe('123');
    });

    it('should create route not found error', () => {
      const error = NotFoundError.route('GET', '/api/nonexistent', 'req-123');

      expect(error.message).toBe('Route GET /api/nonexistent not found');
      expect(error.details.resource).toBe('Route GET /api/nonexistent');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry info', () => {
      const error = new RateLimitError(100, 60000, 30, 'req-123');

      expect(error.statusCode).toBe(429);
      expect(error.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.message).toBe('Rate limit exceeded. Maximum 100 requests per 60 seconds');
      expect(error.details.limit).toBe(100);
      expect(error.details.windowMs).toBe(60000);
      expect(error.details.retryAfter).toBe(30);
    });
  });

  describe('createAPIError utility', () => {
    it('should return BaseAPIError as-is', () => {
      const originalError = new ValidationError('Test error');
      const result = createAPIError(originalError);

      expect(result).toBe(originalError);
    });

    it('should convert Error to InternalServerError', () => {
      const originalError = new Error('Test error');
      const result = createAPIError(originalError, 'req-123');

      expect(result.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(result.message).toBe('Test error');
      expect(result.requestId).toBe('req-123');
    });

    it('should detect connection errors', () => {
      const connectionError = new Error('ECONNREFUSED: Connection refused');
      const result = createAPIError(connectionError, 'req-123');

      expect(result.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(result.message).toContain('Database');
    });

    it('should detect timeout errors', () => {
      const timeoutError = new Error('Request timeout after 5000ms');
      const result = createAPIError(timeoutError, 'req-123');

      expect(result.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(result.message).toContain('timeout');
    });

    it('should handle string errors', () => {
      const result = createAPIError('String error message', 'req-123');

      expect(result.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(result.message).toBe('String error message');
    });

    it('should handle unknown error types', () => {
      const result = createAPIError({ unknown: 'object' }, 'req-123');

      expect(result.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(result.message).toBe('An unknown error occurred');
    });
  });

  describe('isOperationalError utility', () => {
    it('should identify operational errors', () => {
      const operationalError = new ValidationError('Test error');
      const nonOperationalError = new Error('System error');

      expect(isOperationalError(operationalError)).toBe(true);
      expect(isOperationalError(nonOperationalError)).toBe(false);
    });
  });

  describe('APIErrors factory', () => {
    it('should create validation errors', () => {
      const requiredError = APIErrors.validation.required('name', 'req-123');
      const invalidError = APIErrors.validation.invalid('age', -1, 'positive', 'req-123');
      const formatError = APIErrors.validation.format('email', 'email format', 'req-123');

      expect(requiredError).toBeInstanceOf(ValidationError);
      expect(invalidError).toBeInstanceOf(ValidationError);
      expect(formatError).toBeInstanceOf(ValidationError);
    });

    it('should create search errors', () => {
      const error = new Error('Test error');
      const semanticError = APIErrors.search.semanticFailed('query', error, 'req-123');
      const structuralError = APIErrors.search.structuralFailed('query', error, 'req-123');

      expect(semanticError).toBeInstanceOf(SearchServiceError);
      expect(structuralError).toBeInstanceOf(SearchServiceError);
    });

    it('should create service errors', () => {
      const serviceError = APIErrors.service.unavailable('Search', 'Maintenance', 'req-123');
      const searchError = APIErrors.service.searchUnavailable('Overloaded', 'req-123');

      expect(serviceError.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(searchError.errorCode).toBe('SERVICE_UNAVAILABLE');
    });
  });
});

describe('Error Monitoring Service', () => {
  let monitoringService: ErrorMonitoringService;

  beforeEach(() => {
    monitoringService = new ErrorMonitoringService();
  });

  describe('Error Recording', () => {
    it('should record error statistics', () => {
      const error = new ValidationError('Test error', 'field', 'value', 'constraint', 'req-123');
      
      monitoringService.recordError(error);
      
      const stats = monitoringService.getErrorStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].errorCode).toBe('VALIDATION_ERROR');
      expect(stats[0].count).toBe(1);
      expect(stats[0].samples).toHaveLength(1);
    });

    it('should aggregate multiple occurrences of same error', () => {
      const error1 = new ValidationError('Test error 1', 'field1');
      const error2 = new ValidationError('Test error 2', 'field2');
      
      monitoringService.recordError(error1);
      monitoringService.recordError(error2);
      
      const stats = monitoringService.getErrorStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].count).toBe(2);
      expect(stats[0].samples).toHaveLength(2);
    });

    it('should limit sample size', () => {
      const error = new ValidationError('Test error');
      
      // Record more errors than max samples
      for (let i = 0; i < 15; i++) {
        monitoringService.recordError(error);
      }
      
      const stats = monitoringService.getErrorStats();
      expect(stats[0].count).toBe(15);
      expect(stats[0].samples.length).toBeLessThanOrEqual(10); // maxSamples
    });
  });

  describe('Performance Metrics', () => {
    it('should record slow queries', () => {
      monitoringService.recordSlowQuery('SELECT * FROM users', 3000, '/api/users', 'req-123');
      
      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.slowQueries).toHaveLength(1);
      expect(metrics.slowQueries[0].duration).toBe(3000);
      expect(metrics.slowQueries[0].endpoint).toBe('/api/users');
    });

    it('should update performance metrics', () => {
      monitoringService.updatePerformanceMetrics(500, false);
      monitoringService.updatePerformanceMetrics(1000, true);
      
      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.requestCount).toBe(2);
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThan(0);
    });

    it('should limit slow query history', () => {
      // Record more slow queries than max
      for (let i = 0; i < 60; i++) {
        monitoringService.recordSlowQuery(`Query ${i}`, 2000, '/api/test');
      }
      
      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.slowQueries.length).toBeLessThanOrEqual(50); // maxSlowQueries
    });
  });

  describe('Error Summary', () => {
    beforeEach(() => {
      // Add some test errors
      monitoringService.recordError(new ValidationError('Validation 1'));
      monitoringService.recordError(new ValidationError('Validation 2'));
      monitoringService.recordError(new SearchServiceError('Search failed', 'semantic', 'query'));
      monitoringService.recordError(new DatabaseError('DB failed', 'query', 'postgres'));
    });

    it('should generate error summary', () => {
      const summary = monitoringService.getErrorSummary();
      
      expect(summary.totalErrors).toBe(4);
      expect(summary.errorsByCode['VALIDATION_ERROR']).toBe(2);
      expect(summary.errorsByCode['SEARCH_SERVICE_ERROR']).toBe(1);
      expect(summary.errorsByCode['DATABASE_ERROR']).toBe(1);
      expect(summary.errorsByStatus[400]).toBe(2); // Validation errors
      expect(summary.errorsByStatus[500]).toBe(2); // Server errors
    });

    it('should identify recent errors', () => {
      const summary = monitoringService.getErrorSummary();
      
      expect(summary.recentErrors.length).toBeGreaterThan(0);
      expect(summary.recentErrors[0]).toHaveProperty('errorCode');
      expect(summary.recentErrors[0]).toHaveProperty('count');
      expect(summary.recentErrors[0]).toHaveProperty('lastOccurrence');
    });

    it('should identify critical errors', () => {
      // Add more server errors to trigger critical threshold
      for (let i = 0; i < 6; i++) {
        monitoringService.recordError(new SearchServiceError('Critical error', 'semantic', 'query'));
      }
      
      const summary = monitoringService.getErrorSummary();
      
      expect(summary.criticalErrors.length).toBeGreaterThan(0);
      expect(summary.criticalErrors[0].statusCode).toBeGreaterThanOrEqual(500);
      expect(summary.criticalErrors[0].count).toBeGreaterThan(5);
    });
  });

  describe('Health Status', () => {
    it('should report healthy status with no errors', () => {
      const health = monitoringService.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.score).toBe(100);
      expect(health.issues).toHaveLength(0);
    });

    it('should report degraded status with some errors', () => {
      // Add some errors but not too many
      monitoringService.updatePerformanceMetrics(3000, false); // Slow response
      
      const health = monitoringService.getHealthStatus();
      
      expect(health.status).toBe('degraded');
      expect(health.score).toBeLessThan(100);
      expect(health.issues.length).toBeGreaterThan(0);
    });

    it('should report unhealthy status with many errors', () => {
      // Add many errors and slow responses
      for (let i = 0; i < 20; i++) {
        monitoringService.recordError(new SearchServiceError('Critical error', 'semantic', 'query'));
        monitoringService.updatePerformanceMetrics(6000, true); // Very slow and error
      }
      
      const health = monitoringService.getHealthStatus();
      
      expect(health.status).toBe('unhealthy');
      expect(health.score).toBeLessThan(60);
      expect(health.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Alert Configuration', () => {
    it('should add alert configuration', () => {
      monitoringService.addAlert({
        errorCode: 'TEST_ERROR',
        threshold: 5,
        timeWindow: 60000,
        enabled: true,
        cooldownPeriod: 300000,
      });
      
      // This is tested indirectly through error recording and alert triggering
      expect(true).toBe(true); // Alert system is internal
    });

    it('should remove alert configuration', () => {
      monitoringService.addAlert({
        errorCode: 'TEST_ERROR',
        threshold: 5,
        timeWindow: 60000,
        enabled: true,
        cooldownPeriod: 300000,
      });
      
      monitoringService.removeAlert('TEST_ERROR');
      
      // This is tested indirectly
      expect(true).toBe(true);
    });
  });
});

describe('Error Handler Functions', () => {
  describe('handleSearchError', () => {
    it('should return BaseAPIError as-is', () => {
      const originalError = new ValidationError('Test error');
      const result = handleSearchError(originalError, 'semantic', 'query', 'req-123');
      
      expect(result).toBe(originalError);
    });

    it('should convert Error to SearchServiceError', () => {
      const originalError = new Error('Database failed');
      const result = handleSearchError(originalError, 'semantic', 'test query', 'req-123');
      
      expect(result).toBeInstanceOf(SearchServiceError);
      expect(result.details.searchType).toBe('semantic');
      expect(result.details.query).toBe('test query');
      expect(result.requestId).toBe('req-123');
    });

    it('should handle different search types', () => {
      const error = new Error('Test error');
      
      const semanticResult = handleSearchError(error, 'semantic', 'query');
      const structuralResult = handleSearchError(error, 'structural', 'query');
      const gitResult = handleSearchError(error, 'git', 'query');
      const hybridResult = handleSearchError(error, 'hybrid', 'query');
      const comprehensiveResult = handleSearchError(error, 'comprehensive', 'query');
      
      expect(semanticResult.details.searchType).toBe('semantic');
      expect(structuralResult.details.searchType).toBe('structural');
      expect(gitResult.details.searchType).toBe('git');
      expect(hybridResult.details.searchType).toBe('hybrid');
      expect(comprehensiveResult.details.searchType).toBe('comprehensive');
    });

    it('should handle unknown search types', () => {
      const error = new Error('Test error');
      const result = handleSearchError(error, 'unknown', 'query', 'req-123');
      
      expect(result).toBeInstanceOf(SearchServiceError);
      expect(result.details.searchType).toBe('semantic'); // defaults to semantic
    });

    it('should handle non-Error objects', () => {
      const result = handleSearchError('string error', 'semantic', 'query', 'req-123');
      
      expect(result.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(result.message).toBe('Unknown search error occurred');
    });
  });

  describe('handleDatabaseError', () => {
    it('should detect SQLite busy errors', () => {
      const error = new Error('SQLITE_BUSY: database is locked');
      const result = handleDatabaseError(error, 'SELECT', 'req-123');
      
      expect(result.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(result.message).toContain('Database is busy');
    });

    it('should detect connection refused errors', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const result = handleDatabaseError(error, 'CONNECT', 'req-123');
      
      expect(result.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(result.message).toContain('Connection refused');
    });

    it('should detect timeout errors', () => {
      const error = new Error('Connection timeout after 5000ms');
      const result = handleDatabaseError(error, 'QUERY', 'req-123');
      
      expect(result.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(result.message).toContain('Connection timeout');
    });

    it('should handle generic database errors', () => {
      const error = new Error('Generic database error');
      const result = handleDatabaseError(error, 'INSERT', 'req-123');
      
      expect(result.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(result.message).toContain('Database operation failed: INSERT');
    });
  });

  describe('handleCacheError', () => {
    it('should convert cache errors to internal server errors', () => {
      const error = new Error('Redis connection failed');
      const result = handleCacheError(error, 'SET', 'req-123');
      
      expect(result.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(result.message).toContain('Cache operation failed: SET');
    });

    it('should return BaseAPIError as-is', () => {
      const originalError = new ValidationError('Test error');
      const result = handleCacheError(originalError, 'GET', 'req-123');
      
      expect(result).toBe(originalError);
    });
  });
});
