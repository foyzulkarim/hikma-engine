/**
 * @file Unit tests for error handling utilities
 */

import {
  getErrorMessage,
  getErrorStack,
  formatError,
  normalizeError,
  isError,
  logError,
  DatabaseConnectionError,
  DatabaseOperationError,
  DataValidationError,
  isRetryableError,
  withRetry,
  CircuitBreaker,
  DEFAULT_RETRY_CONFIG,
  RetryConfig,
} from './error-handling';

describe('Error Handling Utilities', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should return string error as-is', () => {
      const error = 'String error message';
      expect(getErrorMessage(error)).toBe('String error message');
    });

    it('should extract message from object with message property', () => {
      const error = { message: 'Object error message' };
      expect(getErrorMessage(error)).toBe('Object error message');
    });

    it('should convert unknown types to string', () => {
      expect(getErrorMessage(42)).toBe('42');
      expect(getErrorMessage(null)).toBe('null');
      expect(getErrorMessage(undefined)).toBe('undefined');
      expect(getErrorMessage(true)).toBe('true');
    });

    it('should handle complex objects', () => {
      const error = { code: 500, details: 'Server error' };
      expect(getErrorMessage(error)).toBe('[object Object]');
    });
  });

  describe('getErrorStack', () => {
    it('should extract stack from Error instance', () => {
      const error = new Error('Test error');
      const stack = getErrorStack(error);
      expect(stack).toBeDefined();
      expect(stack).toContain('Error: Test error');
    });

    it('should return undefined for string errors', () => {
      const error = 'String error';
      expect(getErrorStack(error)).toBeUndefined();
    });

    it('should extract stack from object with stack property', () => {
      const error = { stack: 'Custom stack trace' };
      expect(getErrorStack(error)).toBe('Custom stack trace');
    });

    it('should return undefined for objects without stack', () => {
      const error = { message: 'No stack' };
      expect(getErrorStack(error)).toBeUndefined();
    });

    it('should return undefined for primitive types', () => {
      expect(getErrorStack(42)).toBeUndefined();
      expect(getErrorStack(null)).toBeUndefined();
      expect(getErrorStack(undefined)).toBeUndefined();
    });
  });

  describe('formatError', () => {
    it('should format Error instance with message and stack', () => {
      const error = new Error('Test error');
      const formatted = formatError(error);
      
      expect(formatted.message).toBe('Test error');
      expect(formatted.stack).toBeDefined();
      expect(formatted.stack).toContain('Error: Test error');
    });

    it('should format string error with message only', () => {
      const error = 'String error';
      const formatted = formatError(error);
      
      expect(formatted.message).toBe('String error');
      expect(formatted.stack).toBeUndefined();
    });

    it('should format object with both message and stack', () => {
      const error = { message: 'Object error', stack: 'Object stack' };
      const formatted = formatError(error);
      
      expect(formatted.message).toBe('Object error');
      expect(formatted.stack).toBe('Object stack');
    });

    it('should handle null and undefined', () => {
      expect(formatError(null)).toEqual({ message: 'null', stack: undefined });
      expect(formatError(undefined)).toEqual({ message: 'undefined', stack: undefined });
    });
  });

  describe('normalizeError', () => {
    it('should return Error instance as-is without context', () => {
      const error = new Error('Original error');
      const normalized = normalizeError(error);
      
      expect(normalized).toBe(error);
      expect(normalized.message).toBe('Original error');
    });

    it('should wrap Error instance with context', () => {
      const error = new Error('Original error');
      const normalized = normalizeError(error, 'Database operation');
      
      expect(normalized).not.toBe(error);
      expect(normalized.message).toBe('Database operation: Original error');
    });

    it('should create Error from string', () => {
      const error = 'String error';
      const normalized = normalizeError(error);
      
      expect(normalized).toBeInstanceOf(Error);
      expect(normalized.message).toBe('String error');
    });

    it('should create Error from string with context', () => {
      const error = 'String error';
      const normalized = normalizeError(error, 'File operation');
      
      expect(normalized).toBeInstanceOf(Error);
      expect(normalized.message).toBe('File operation: String error');
    });

    it('should handle complex objects', () => {
      const error = { code: 500, details: 'Server error' };
      const normalized = normalizeError(error, 'API call');
      
      expect(normalized).toBeInstanceOf(Error);
      expect(normalized.message).toBe('API call: [object Object]');
    });
  });

  describe('isError', () => {
    it('should return true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
      expect(isError(new RangeError('test'))).toBe(true);
    });

    it('should return false for non-Error types', () => {
      expect(isError('string error')).toBe(false);
      expect(isError({ message: 'object error' })).toBe(false);
      expect(isError(42)).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
    });
  });

  describe('logError', () => {
    let mockLogger: { error: jest.Mock };

    beforeEach(() => {
      mockLogger = { error: jest.fn() };
    });

    it('should log Error instance with stack trace', () => {
      const error = new Error('Test error');
      logError(mockLogger, 'Operation failed', error);

      expect(mockLogger.error).toHaveBeenCalledWith('Operation failed', {
        error: 'Test error',
        stack: expect.stringContaining('Error: Test error'),
      });
    });

    it('should log string error without stack trace', () => {
      const error = 'String error';
      logError(mockLogger, 'Operation failed', error);

      expect(mockLogger.error).toHaveBeenCalledWith('Operation failed', {
        error: 'String error',
        stack: undefined,
      });
    });

    it('should include additional context', () => {
      const error = new Error('Test error');
      const additionalContext = { userId: 123, operation: 'data-load' };
      
      logError(mockLogger, 'Operation failed', error, additionalContext);

      expect(mockLogger.error).toHaveBeenCalledWith('Operation failed', {
        error: 'Test error',
        stack: expect.stringContaining('Error: Test error'),
        userId: 123,
        operation: 'data-load',
      });
    });

    it('should handle null/undefined additional context', () => {
      const error = new Error('Test error');
      
      logError(mockLogger, 'Operation failed', error, undefined);
      logError(mockLogger, 'Operation failed', error, null as any);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('Custom Error Classes', () => {
    describe('DatabaseConnectionError', () => {
      it('should create database connection error with database name', () => {
        const error = new DatabaseConnectionError('SQLite', 'Connection timeout');
        
        expect(error.name).toBe('DatabaseConnectionError');
        expect(error.message).toBe('SQLite connection error: Connection timeout');
        expect(error.database).toBe('SQLite');
      });

      it('should store original error', () => {
        const originalError = new Error('Network error');
        const error = new DatabaseConnectionError('PostgreSQL', 'Connection failed', originalError);
        
        expect(error.originalError).toBe(originalError);
      });
    });

    describe('DatabaseOperationError', () => {
      it('should create database operation error with operation details', () => {
        const error = new DatabaseOperationError('SQLite', 'INSERT', 'Constraint violation');
        
        expect(error.name).toBe('DatabaseOperationError');
        expect(error.message).toBe('SQLite INSERT error: Constraint violation');
        expect(error.database).toBe('SQLite');
        expect(error.operation).toBe('INSERT');
      });

      it('should store original error', () => {
        const originalError = new Error('SQL syntax error');
        const error = new DatabaseOperationError('MySQL', 'SELECT', 'Query failed', originalError);
        
        expect(error.originalError).toBe(originalError);
      });
    });

    describe('DataValidationError', () => {
      it('should create data validation error with validation details', () => {
        const validationErrors = ['Field "name" is required', 'Field "email" is invalid'];
        const error = new DataValidationError('User data invalid', validationErrors);
        
        expect(error.name).toBe('DataValidationError');
        expect(error.message).toBe('Data validation failed: User data invalid');
        expect(error.validationErrors).toEqual(validationErrors);
      });
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors by message content', () => {
      const retryableErrors = [
        new Error('Connection ECONNREFUSED'),
        new Error('Host ENOTFOUND'),
        new Error('Request ETIMEDOUT'),
        new Error('Connection ECONNRESET'),
        new Error('Broken EPIPE'),
        new Error('Database SQLITE_BUSY'),
        new Error('Database SQLITE_LOCKED'),
      ];

      retryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify retryable errors by error code', () => {
      const errorWithCode = { code: 'ECONNREFUSED', message: 'Connection refused' };
      expect(isRetryableError(errorWithCode)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new Error('Validation failed'),
        new Error('Unauthorized access'),
        new Error('Not found'),
        { code: 'INVALID_INPUT', message: 'Invalid input' },
      ];

      nonRetryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should use custom retry configuration', () => {
      const customConfig: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        retryableErrors: ['CUSTOM_ERROR'],
      };

      const customError = new Error('CUSTOM_ERROR occurred');
      const standardError = new Error('ECONNREFUSED');

      expect(isRetryableError(customError, customConfig)).toBe(true);
      expect(isRetryableError(standardError, customConfig)).toBe(false);
    });

    it('should return false when no retryable errors configured', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        retryableErrors: undefined,
      };

      const error = new Error('ECONNREFUSED');
      expect(isRetryableError(error, config)).toBe(false);
    });
  });

  describe('withRetry', () => {
    let mockLogger: { debug: jest.Mock; warn: jest.Mock };

    beforeEach(() => {
      mockLogger = {
        debug: jest.fn(),
        warn: jest.fn(),
      };
    });

    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation, DEFAULT_RETRY_CONFIG, mockLogger, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, DEFAULT_RETRY_CONFIG, mockLogger, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.debug).toHaveBeenCalledWith('test-op succeeded on attempt 3');
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Validation failed'));
      
      await expect(withRetry(operation, DEFAULT_RETRY_CONFIG, mockLogger, 'test-op'))
        .rejects.toThrow('Validation failed');
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should exhaust all retry attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      await expect(withRetry(operation, DEFAULT_RETRY_CONFIG, mockLogger, 'test-op'))
        .rejects.toThrow('ECONNREFUSED');
      
      expect(operation).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxAttempts);
      expect(mockLogger.warn).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxAttempts - 1);
    });

    it('should apply exponential backoff', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['ECONNREFUSED'],
      };

      const startTime = Date.now();
      
      await expect(withRetry(operation, config, mockLogger, 'test-op'))
        .rejects.toThrow('ECONNREFUSED');
      
      const totalTime = Date.now() - startTime;
      // Should have waited at least 100ms + 200ms = 300ms
      expect(totalTime).toBeGreaterThan(250);
    });

    it('should respect maximum delay', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 500, // Lower than calculated delay
        backoffMultiplier: 2,
        retryableErrors: ['ECONNREFUSED'],
      };

      const startTime = Date.now();
      
      await expect(withRetry(operation, config, mockLogger, 'test-op'))
        .rejects.toThrow('ECONNREFUSED');
      
      const totalTime = Date.now() - startTime;
      // Should not exceed maxDelayMs * (attempts - 1)
      expect(totalTime).toBeLessThan(1500);
    });

    it('should work without logger', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, DEFAULT_RETRY_CONFIG, undefined, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 1000); // 3 failures, 1 second recovery
    });

    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getFailures()).toBe(0);
    });

    it('should execute successful operations in CLOSED state', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getFailures()).toBe(0);
    });

    it('should track failures but stay CLOSED below threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Fail twice (below threshold of 3)
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getFailures()).toBe(2);
    });

    it('should open circuit after reaching failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Fail three times (reach threshold)
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      
      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(circuitBreaker.getFailures()).toBe(3);
    });

    it('should reject operations immediately when OPEN', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Force circuit to OPEN state
      const failingOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow();
      }
      
      // Now try successful operation - should be rejected immediately
      await expect(circuitBreaker.execute(operation))
        .rejects.toThrow('Circuit breaker is OPEN');
      
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const failingOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      
      // Create circuit breaker with very short recovery timeout
      const fastRecoveryBreaker = new CircuitBreaker(3, 1); // 1ms recovery timeout
      
      // Force it to OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(fastRecoveryBreaker.execute(failingOperation)).rejects.toThrow();
      }
      
      expect(fastRecoveryBreaker.getState()).toBe('OPEN');
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Now it should allow one operation (HALF_OPEN -> CLOSED on success)
      const result = await fastRecoveryBreaker.execute(operation);
      expect(result).toBe('success');
      expect(fastRecoveryBreaker.getState()).toBe('CLOSED');
    });

    it('should reset failures on successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const failingOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      
      // Fail twice
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow();
      expect(circuitBreaker.getFailures()).toBe(2);
      
      // Succeed once
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getFailures()).toBe(0);
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should handle custom failure threshold and recovery timeout', () => {
      const customBreaker = new CircuitBreaker(5, 2000);
      
      expect(customBreaker.getState()).toBe('CLOSED');
      expect(customBreaker.getFailures()).toBe(0);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle errors thrown during retry delay', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      // Mock setTimeout to throw an error
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn().mockImplementation(() => {
        throw new Error('Timer error');
      }) as any;
      
      try {
        await expect(withRetry(operation, DEFAULT_RETRY_CONFIG))
          .rejects.toThrow('Timer error');
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('should handle circuit breaker with zero failure threshold', () => {
      const zeroThresholdBreaker = new CircuitBreaker(0, 1000);
      expect(zeroThresholdBreaker.getState()).toBe('CLOSED');
    });

    it('should handle very large retry delays', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const config: RetryConfig = {
        maxAttempts: 2,
        baseDelayMs: Number.MAX_SAFE_INTEGER,
        maxDelayMs: 100, // Should cap the delay
        backoffMultiplier: 2,
        retryableErrors: ['ECONNREFUSED'],
      };

      const startTime = Date.now();
      
      await expect(withRetry(operation, config))
        .rejects.toThrow('ECONNREFUSED');
      
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(500); // Should be capped by maxDelayMs
    });
  });
});
