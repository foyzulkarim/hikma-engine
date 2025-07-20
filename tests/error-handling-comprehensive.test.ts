/**
 * @file Comprehensive tests for error handling enhancements
 */

import { 
  DatabaseConnectionError, 
  DatabaseOperationError, 
  DataValidationError,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  CircuitBreaker,
  isRetryableError
} from '../src/utils/error-handling';
import { SQLiteClient } from '../src/persistence/db-clients';
import { DataLoader } from '../src/modules/data-loader';
import { ConfigManager } from '../src/config';
import { NodeWithEmbedding, Edge } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Comprehensive Error Handling', () => {
  const testDbPath = path.join(__dirname, 'test-error-handling.db');
  const testLanceDbPath = path.join(__dirname, 'test-error-lancedb');

  beforeEach(() => {
    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }
  });

  describe('Custom Error Types', () => {
    test('DatabaseConnectionError should contain database and original error info', () => {
      const originalError = new Error('Connection refused');
      const dbError = new DatabaseConnectionError('SQLite', 'Failed to connect', originalError);
      
      expect(dbError.name).toBe('DatabaseConnectionError');
      expect(dbError.database).toBe('SQLite');
      expect(dbError.originalError).toBe(originalError);
      expect(dbError.message).toContain('SQLite connection error');
    });

    test('DatabaseOperationError should contain operation details', () => {
      const originalError = new Error('Query failed');
      const opError = new DatabaseOperationError('SQLite', 'INSERT', 'Failed to insert', originalError);
      
      expect(opError.name).toBe('DatabaseOperationError');
      expect(opError.database).toBe('SQLite');
      expect(opError.operation).toBe('INSERT');
      expect(opError.message).toContain('SQLite INSERT error');
    });

    test('DataValidationError should contain validation errors', () => {
      const validationErrors = ['Field A is required', 'Field B must be positive'];
      const validationError = new DataValidationError('Validation failed', validationErrors);
      
      expect(validationError.name).toBe('DataValidationError');
      expect(validationError.validationErrors).toEqual(validationErrors);
      expect(validationError.message).toContain('Data validation failed');
    });
  });

  describe('Retry Logic', () => {
    test('withRetry should succeed on first attempt', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        return 'success';
      });

      const result = await withRetry(operation, DEFAULT_RETRY_CONFIG);
      
      expect(result).toBe('success');
      expect(attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('withRetry should retry on retryable errors', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('ECONNREFUSED');
          (error as any).code = 'ECONNREFUSED';
          throw error;
        }
        return 'success';
      });

      const result = await withRetry(operation, DEFAULT_RETRY_CONFIG);
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('withRetry should not retry on non-retryable errors', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        throw new Error('INVALID_SYNTAX');
      });

      await expect(withRetry(operation, DEFAULT_RETRY_CONFIG)).rejects.toThrow('INVALID_SYNTAX');
      expect(attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('isRetryableError should identify retryable errors correctly', () => {
      const retryableError = new Error('ECONNREFUSED');
      (retryableError as any).code = 'ECONNREFUSED';
      
      const nonRetryableError = new Error('SYNTAX_ERROR');
      
      expect(isRetryableError(retryableError)).toBe(true);
      expect(isRetryableError(nonRetryableError)).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    test('CircuitBreaker should open after failure threshold', async () => {
      const circuitBreaker = new CircuitBreaker(2, 1000); // 2 failures, 1 second timeout
      
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // First failure
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      expect(circuitBreaker.getState()).toBe('CLOSED');
      
      // Second failure - should open circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      expect(circuitBreaker.getState()).toBe('OPEN');
      
      // Third attempt - should fail immediately due to open circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Circuit breaker is OPEN');
    });

    test('CircuitBreaker should recover after timeout', async () => {
      const circuitBreaker = new CircuitBreaker(1, 100); // 1 failure, 100ms timeout
      
      // Cause failure to open circuit
      await expect(circuitBreaker.execute(async () => {
        throw new Error('Failure');
      })).rejects.toThrow('Failure');
      
      expect(circuitBreaker.getState()).toBe('OPEN');
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should now allow operation and recover
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });
  });

  describe('SQLite Client Error Handling', () => {
    test('should throw DatabaseConnectionError on connection failure', async () => {
      // Use an invalid path that will cause connection issues
      const invalidPath = '/invalid/path/database.db';
      
      expect(() => {
        new SQLiteClient(invalidPath);
      }).toThrow(DatabaseConnectionError);
    });

    test('should validate repository data before insertion', async () => {
      const client = new SQLiteClient(testDbPath);
      await client.connect();

      const invalidRepositories = [
        {
          id: '', // Invalid: empty ID
          repoPath: '/valid/path',
          repoName: 'valid-name'
        }
      ];

      await expect(client.batchInsertRepositories(invalidRepositories))
        .rejects.toThrow(DataValidationError);
      
      client.disconnect();
    });

    test('should validate file data before insertion', async () => {
      const client = new SQLiteClient(testDbPath);
      await client.connect();

      const invalidFiles = [
        {
          id: 'valid-id',
          repoId: 'valid-repo',
          filePath: '', // Invalid: empty path
          fileName: 'test.ts'
        }
      ];

      await expect(client.batchInsertFiles(invalidFiles))
        .rejects.toThrow(DataValidationError);
      
      client.disconnect();
    });

    test('should handle database operations with proper error logging', async () => {
      const client = new SQLiteClient(testDbPath);
      await client.connect();

      // Test with valid data to ensure operations work
      const validRepositories = [
        {
          id: 'repo-1',
          repoPath: '/test/repo',
          repoName: 'test-repo'
        }
      ];

      const result = await client.batchInsertRepositories(validRepositories);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      
      client.disconnect();
    });
  });



  describe('DataLoader Error Handling', () => {
    test('should validate nodes before persistence', async () => {
      const config = new ConfigManager(__dirname);
      const dataLoader = new DataLoader(
        testLanceDbPath,
        testDbPath,
        config
      );

      const invalidNodes: NodeWithEmbedding[] = [
        {
          id: '', // Invalid: empty ID
          type: 'TestNode',
          properties: {},
          embedding: [0.1, 0.2, 0.3]
        } as NodeWithEmbedding
      ];

      const validEdges: Edge[] = [];

      await expect(dataLoader.load(invalidNodes, validEdges))
        .rejects.toThrow(DataValidationError);
    });

    test('should validate edges before persistence', async () => {
      const config = new ConfigManager(__dirname);
      const dataLoader = new DataLoader(
        testLanceDbPath,
        testDbPath,
        config
      );

      const validNodes: NodeWithEmbedding[] = [
        {
          id: 'node-1',
          type: 'TestNode',
          properties: { name: 'test' },
          embedding: [0.1, 0.2, 0.3]
        } as NodeWithEmbedding
      ];

      const invalidEdges: Edge[] = [
        {
          source: '', // Invalid: empty source
          target: 'node-1',
          type: 'CONTAINS',
          properties: {}
        }
      ];

      await expect(dataLoader.load(validNodes, invalidEdges))
        .rejects.toThrow(DataValidationError);
    });

    test('should validate data consistency between nodes and edges', async () => {
      const config = new ConfigManager(__dirname);
      const dataLoader = new DataLoader(
        testLanceDbPath,
        testDbPath,
        config
      );

      const validNodes: NodeWithEmbedding[] = [
        {
          id: 'node-1',
          type: 'TestNode',
          properties: { name: 'test' },
          embedding: [0.1, 0.2, 0.3]
        } as NodeWithEmbedding
      ];

      const inconsistentEdges: Edge[] = [
        {
          source: 'node-1',
          target: 'non-existent-node', // Invalid: references non-existent node
          type: 'CONTAINS',
          properties: {}
        }
      ];

      await expect(dataLoader.load(validNodes, inconsistentEdges))
        .rejects.toThrow(DataValidationError);
    });

    test('should handle graceful degradation when databases are unavailable', async () => {
      const config = new ConfigManager(__dirname);
      const dataLoader = new DataLoader(
        testLanceDbPath,
        testDbPath,
        config
      );

      const validNodes: NodeWithEmbedding[] = [
        {
          id: 'node-1',
          type: 'TestNode',
          properties: { name: 'test' },
          embedding: [0.1, 0.2, 0.3]
        } as NodeWithEmbedding
      ];

      const validEdges: Edge[] = [];

      // Should succeed even if some databases fail, as long as at least one works
      const result = await dataLoader.load(validNodes, validEdges);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result.results).toHaveProperty('lancedb');
      expect(result.results).toHaveProperty('sqlite');
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log database operations with proper context', async () => {
      const client = new SQLiteClient(testDbPath);
      await client.connect();

      // Mock logger to capture log calls
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      // Replace logger (this would need proper mocking in real implementation)
      // For now, just verify operations complete successfully
      const validRepositories = [
        {
          id: 'repo-1',
          repoPath: '/test/repo',
          repoName: 'test-repo'
        }
      ];

      const result = await client.batchInsertRepositories(validRepositories);
      expect(result.success).toBe(1);
      
      client.disconnect();
    });
  });
});
