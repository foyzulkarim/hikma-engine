import { SQLiteClient } from './connection';
import { DatabaseConnectionError, DatabaseOperationError } from '../../utils/error-handling';
import { Logger } from '../../utils/logger';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('better-sqlite3');
jest.mock('fs');
jest.mock('path');

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
  operation: jest.fn(),
  performance: jest.fn(),
} as unknown as jest.Mocked<Logger>;

const mockDatabase = {
  prepare: jest.fn(),
  close: jest.fn(),
  loadExtension: jest.fn(),
  exec: jest.fn(),
  transaction: jest.fn(),
  memory: false,
  readonly: false,
  name: 'test.db',
  open: true,
  inTransaction: false,
} as unknown as jest.Mocked<Database.Database>;

const mockStatement = {
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
  database: mockDatabase,
  source: 'SELECT 1',
  reader: false,
  readonly: false,
  busy: false,
} as unknown as jest.Mocked<Database.Statement>;

describe('SQLiteClient', () => {
  let sqliteClient: SQLiteClient;
  let testDbPath: string;

  beforeAll(() => {
    // Setup test database path
    testDbPath = path.join(os.tmpdir(), `test-hikma-${Date.now()}.db`);
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (require('../../utils/logger').getLogger as jest.Mock).mockReturnValue(mockLogger);
    (Database as jest.MockedClass<typeof Database>).mockReturnValue(mockDatabase);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (path.dirname as jest.Mock).mockReturnValue('/test/dir');
    (path.resolve as jest.Mock).mockReturnValue(testDbPath);
    
    mockDatabase.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    mockStatement.get.mockReturnValue({ result: 'test' });
    mockStatement.all.mockReturnValue([{ result: 'test' }]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should create SQLiteClient instance successfully', () => {
      sqliteClient = new SQLiteClient(testDbPath);
      
      expect(Database).toHaveBeenCalledWith(testDbPath);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing SQLite client',
        { path: testDbPath }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('SQLite database instance created successfully');
    });

    it('should create database directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      sqliteClient = new SQLiteClient(testDbPath);
      
      expect(path.dirname).toHaveBeenCalledWith(testDbPath);
      expect(fs.existsSync).toHaveBeenCalledWith('/test/dir');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/dir', { recursive: true });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating database directory',
        { directory: '/test/dir' }
      );
    });

    it('should throw DatabaseConnectionError if database creation fails', () => {
      (Database as jest.MockedClass<typeof Database>).mockImplementation(() => {
        throw new Error('Database creation failed');
      });

      expect(() => new SQLiteClient(testDbPath)).toThrow(DatabaseConnectionError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create SQLite database instance',
        expect.objectContaining({
          error: 'Database creation failed',
          path: testDbPath,
        })
      );
    });

    it('should handle file system errors during directory creation', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      expect(() => new SQLiteClient(testDbPath)).toThrow(DatabaseConnectionError);
    });
  });

  describe('Connection Lifecycle', () => {
    beforeEach(() => {
      sqliteClient = new SQLiteClient(testDbPath);
    });

    it('should connect to database successfully', async () => {
      mockStatement.get.mockReturnValue({ result: 1 }); // Mock connection test
      
      await sqliteClient.connect();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Connecting to SQLite');
      expect(mockDatabase.prepare).toHaveBeenCalledWith('SELECT 1');
      expect(mockStatement.get).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('SQLite connection test successful');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Connected to SQLite successfully',
        expect.objectContaining({ vectorEnabled: expect.any(Boolean) })
      );
    });

    it('should not reconnect if already connected', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      
      // First connection
      await sqliteClient.connect();
      jest.clearAllMocks();
      
      // Second connection attempt
      await sqliteClient.connect();
      
      expect(mockLogger.debug).toHaveBeenCalledWith('Already connected to SQLite');
      expect(mockDatabase.prepare).not.toHaveBeenCalledWith('SELECT 1');
    });

    it('should retry connection on failure and succeed', async () => {
      let attemptCount = 0;
      mockStatement.get.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          const error = new Error('SQLITE_BUSY');
          (error as any).code = 'SQLITE_BUSY';
          throw error;
        }
        return { result: 1 };
      });
      
      await sqliteClient.connect();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SQLite connection failed on attempt 1'),
        expect.objectContaining({
          error: 'SQLITE_BUSY',
          attempt: 1,
          maxAttempts: 3
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Connected to SQLite successfully',
        expect.objectContaining({ vectorEnabled: expect.any(Boolean) })
      );
    });

    it('should throw DatabaseConnectionError after max retry attempts', async () => {
      mockStatement.get.mockImplementation(() => {
        throw new Error('Persistent connection failure');
      });
      
      await expect(sqliteClient.connect()).rejects.toThrow(DatabaseConnectionError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect to SQLite after retries',
        expect.objectContaining({
          error: 'Persistent connection failure',
        })
      );
    });

    it('should handle connection test failures', async () => {
      mockStatement.get.mockImplementation(() => {
        throw new Error('Connection test failed');
      });
      
      await expect(sqliteClient.connect()).rejects.toThrow(DatabaseConnectionError);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SQLite connection test failed',
        { error: 'Connection test failed' }
      );
    });

    it('should disconnect successfully', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      await sqliteClient.connect();
      
      sqliteClient.disconnect();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from SQLite');
      expect(mockDatabase.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnected from SQLite successfully');
    });

    it('should not disconnect if already disconnected', async () => {
      sqliteClient.disconnect();
      
      expect(mockLogger.debug).toHaveBeenCalledWith('Already disconnected from SQLite');
      expect(mockDatabase.close).not.toHaveBeenCalled();
    });

    it('should handle disconnect errors', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      await sqliteClient.connect();
      
      const disconnectError = new Error('Disconnect failed');
      mockDatabase.close.mockImplementation(() => {
        throw disconnectError;
      });
      
      expect(() => sqliteClient.disconnect()).toThrow(disconnectError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to disconnect from SQLite',
        { error: 'Disconnect failed' }
      );
    });
  });

  describe('Vector Extension Loading', () => {
    beforeEach(() => {
      sqliteClient = new SQLiteClient(testDbPath);
    });

    it('should load vector extension successfully', async () => {
      mockStatement.get.mockReturnValue({ result: 1 }); // Connection test
      mockDatabase.loadExtension.mockReturnValue(mockDatabase);
      mockDatabase.prepare.mockImplementation((sql: string) => {
        if (sql === 'SELECT vec_version()') {
          return { get: jest.fn().mockReturnValue({ version: '1.0.0' }) } as any;
        }
        return mockStatement;
      });
      
      await sqliteClient.connect();
      
      expect(mockDatabase.loadExtension).toHaveBeenCalledWith('./extensions/vec0');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'sqlite-vec extension loaded successfully',
        { extensionPath: './extensions/vec0' }
      );
      expect(sqliteClient.isVectorEnabled).toBe(true);
    });

    it('should use custom extension path from environment', async () => {
      process.env.HIKMA_SQLITE_VEC_EXTENSION = '/custom/path/vec0';
      mockStatement.get.mockReturnValue({ result: 1 });
      mockDatabase.loadExtension.mockReturnValue(mockDatabase);
      mockDatabase.prepare.mockImplementation((sql: string) => {
        if (sql === 'SELECT vec_version()') {
          return { get: jest.fn().mockReturnValue({ version: '1.0.0' }) } as any;
        }
        return mockStatement;
      });
      
      await sqliteClient.connect();
      
      expect(mockDatabase.loadExtension).toHaveBeenCalledWith('/custom/path/vec0');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'sqlite-vec extension loaded successfully',
        { extensionPath: '/custom/path/vec0' }
      );
      
      delete process.env.HIKMA_SQLITE_VEC_EXTENSION;
    });

    it('should handle vector extension loading failure gracefully', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      mockDatabase.loadExtension.mockImplementation(() => {
        throw new Error('Extension not found');
      });
      
      await sqliteClient.connect();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load sqlite-vec extension, vector operations will be disabled',
        expect.objectContaining({
          error: 'Extension not found',
          extensionPath: './extensions/vec0',
        })
      );
      expect(sqliteClient.isVectorEnabled).toBe(false);
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      sqliteClient = new SQLiteClient(testDbPath);
      mockStatement.get.mockReturnValue({ result: 1 });
      await sqliteClient.connect();
    });

    it('should throw error when accessing database without connection', () => {
      const disconnectedClient = new SQLiteClient(testDbPath);
      
      expect(() => disconnectedClient.getDb()).toThrow(DatabaseConnectionError);
    });

    it('should return database instance when connected', () => {
      const db = sqliteClient.getDb();
      
      expect(db).toBe(mockDatabase);
    });

    it('should execute run operations successfully', () => {
      const sql = 'INSERT INTO test (name) VALUES (?)';
      const params = ['test'];
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 123 });
      
      const result = sqliteClient.run(sql, params);
      
      expect(mockDatabase.prepare).toHaveBeenCalledWith(sql);
      expect(mockStatement.run).toHaveBeenCalledWith(...params);
      expect(result).toEqual({ changes: 1, lastInsertRowid: 123 });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing SQLite query',
        { sql: sql.substring(0, 100), paramCount: 1 }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SQLite query executed successfully',
        { changes: 1, lastInsertRowid: 123 }
      );
    });

    it('should handle run operation errors', () => {
      const sql = 'INVALID SQL';
      mockStatement.run.mockImplementation(() => {
        throw new Error('SQL syntax error');
      });
      
      expect(() => sqliteClient.run(sql)).toThrow(DatabaseOperationError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'SQLite query execution failed',
        expect.objectContaining({
          error: 'SQL syntax error',
          sql: sql.substring(0, 100),
          paramCount: 0
        })
      );
    });

    it('should prepare statements successfully', () => {
      const sql = 'SELECT * FROM test WHERE id = ?';
      
      const statement = sqliteClient.prepare(sql);
      
      expect(mockDatabase.prepare).toHaveBeenCalledWith(sql);
      expect(statement).toBe(mockStatement);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Preparing SQLite statement',
        { sql: sql.substring(0, 100) }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('SQLite statement prepared successfully');
    });

    it('should handle prepare statement errors', () => {
      const sql = 'INVALID SQL';
      mockDatabase.prepare.mockImplementation(() => {
        throw new Error('SQL syntax error');
      });
      
      expect(() => sqliteClient.prepare(sql)).toThrow(DatabaseOperationError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to prepare SQLite statement',
        expect.objectContaining({
          error: 'SQL syntax error',
          sql: sql.substring(0, 100)
        })
      );
    });

    it('should execute all queries successfully', () => {
      const sql = 'SELECT * FROM test';
      const params = ['param1'];
      const mockResults = [{ id: 1, name: 'test1' }, { id: 2, name: 'test2' }];
      mockStatement.all.mockReturnValue(mockResults);
      
      const results = sqliteClient.all(sql, params);
      
      expect(mockDatabase.prepare).toHaveBeenCalledWith(sql);
      expect(mockStatement.all).toHaveBeenCalledWith(...params);
      expect(results).toEqual(mockResults);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing SQLite SELECT query',
        { sql: sql.substring(0, 100) }
      );
    });

    it('should execute all queries without parameters', () => {
      const sql = 'SELECT * FROM test';
      const mockResults = [{ id: 1, name: 'test1' }];
      mockStatement.all.mockReturnValue(mockResults);
      
      const results = sqliteClient.all(sql);
      
      expect(mockStatement.all).toHaveBeenCalledWith();
      expect(results).toEqual(mockResults);
    });

    it('should execute get queries successfully', () => {
      const sql = 'SELECT * FROM test WHERE id = ?';
      const params = [1];
      const mockResult = { id: 1, name: 'test1' };
      mockStatement.get.mockReturnValue(mockResult);
      
      const result = sqliteClient.get(sql, params);
      
      expect(mockDatabase.prepare).toHaveBeenCalledWith(sql);
      expect(mockStatement.get).toHaveBeenCalledWith(...params);
      expect(result).toEqual(mockResult);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing SQLite GET query',
        { sql: sql.substring(0, 100) }
      );
    });

    it('should execute get queries without parameters', () => {
      const sql = 'SELECT * FROM test LIMIT 1';
      const mockResult = { id: 1, name: 'test1' };
      mockStatement.get.mockReturnValue(mockResult);
      
      const result = sqliteClient.get(sql);
      
      expect(mockStatement.get).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });

    it('should execute transactions successfully', () => {
      const transactionFn = jest.fn().mockReturnValue('transaction result');
      const mockTransaction = jest.fn().mockImplementation((fn) => fn);
      (mockDatabase.transaction as jest.Mock) = mockTransaction;
      
      const result = sqliteClient.transaction(transactionFn);
      
      expect(mockDatabase.transaction).toHaveBeenCalledWith(transactionFn);
      expect(result).toBe('transaction result');
      expect(mockLogger.debug).toHaveBeenCalledWith('Transaction completed successfully');
    });

    it('should handle transaction errors', () => {
      const transactionError = new Error('Transaction failed');
      const transactionFn = jest.fn().mockImplementation(() => {
        throw transactionError;
      });
      const mockTransaction = jest.fn().mockImplementation((fn) => fn);
      (mockDatabase.transaction as jest.Mock) = mockTransaction;
      
      expect(() => sqliteClient.transaction(transactionFn)).toThrow(transactionError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Transaction failed',
        { error: 'Transaction failed' }
      );
    });
  });

  describe('Connection Status', () => {
    beforeEach(() => {
      sqliteClient = new SQLiteClient(testDbPath);
    });

    it('should return false when not connected', () => {
      expect(sqliteClient.isConnectedToDatabase()).toBe(false);
    });

    it('should return true when connected', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      await sqliteClient.connect();
      
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      await sqliteClient.connect();
      sqliteClient.disconnect();
      
      expect(sqliteClient.isConnectedToDatabase()).toBe(false);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(() => {
      sqliteClient = new SQLiteClient(testDbPath);
    });

    it('should handle database operation errors gracefully', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      await sqliteClient.connect();
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('Database locked');
      });
      
      expect(() => sqliteClient.run('INSERT INTO test VALUES (?)', ['test']))
        .toThrow(DatabaseOperationError);
    });

    it('should handle connection with circuit breaker on persistent failures', async () => {
      // Mock persistent failures to trigger circuit breaker
      mockStatement.get.mockImplementation(() => {
        throw new Error('SQLITE_MISUSE');
      });
      
      await expect(sqliteClient.connect()).rejects.toThrow(DatabaseConnectionError);
    });

    it('should retry on retryable database errors', async () => {
      let connectionAttempts = 0;
      mockStatement.get.mockImplementation(() => {
        connectionAttempts++;
        if (connectionAttempts <= 2) {
          const error = new Error('SQLITE_LOCKED');
          (error as any).code = 'SQLITE_LOCKED';
          throw error;
        }
        return { result: 1 };
      });
      
      await sqliteClient.connect();
      
      // Should have made 3 attempts (2 failures + 1 success)
      expect(connectionAttempts).toBeGreaterThanOrEqual(3);
      // Should have logged retry warnings
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SQLite connection failed on attempt'),
        expect.objectContaining({
          error: 'SQLITE_LOCKED'
        })
      );
    });

    it('should not retry on non-retryable errors', async () => {
      mockStatement.get.mockImplementation(() => {
        throw new Error('SQLITE_MISUSE'); // Non-retryable error
      });
      
      await expect(sqliteClient.connect()).rejects.toThrow(DatabaseConnectionError);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('retrying')
      );
    });

    it('should handle file system permission errors during database creation', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        const error = new Error('EACCES: permission denied');
        (error as any).code = 'EACCES';
        throw error;
      });
      
      expect(() => new SQLiteClient(testDbPath)).toThrow(DatabaseConnectionError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create SQLite database instance',
        expect.objectContaining({
          error: 'EACCES: permission denied'
        })
      );
    });

    it('should handle file system disk space errors', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        const error = new Error('ENOSPC: no space left on device');
        (error as any).code = 'ENOSPC';
        throw error;
      });
      
      expect(() => new SQLiteClient(testDbPath)).toThrow(DatabaseConnectionError);
    });

    it('should handle database file corruption errors', async () => {
      (Database as jest.MockedClass<typeof Database>).mockImplementation(() => {
        const error = new Error('SQLITE_CORRUPT: database disk image is malformed');
        (error as any).code = 'SQLITE_CORRUPT';
        throw error;
      });
      
      expect(() => new SQLiteClient(testDbPath)).toThrow(DatabaseConnectionError);
    });
  });

  describe('File System Operations Mocking', () => {
    it('should mock file system operations for database file creation', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (path.dirname as jest.Mock).mockReturnValue('/mock/database/dir');
      (path.resolve as jest.Mock).mockReturnValue('/mock/database/path.db');
      
      sqliteClient = new SQLiteClient('/mock/test.db');
      
      expect(path.dirname).toHaveBeenCalledWith('/mock/database/path.db');
      expect(path.resolve).toHaveBeenCalledWith('/mock/test.db');
      expect(fs.existsSync).toHaveBeenCalledWith('/mock/database/dir');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/database/dir', { recursive: true });
    });

    it('should handle existing directory without creating new one', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      sqliteClient = new SQLiteClient(testDbPath);
      
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        'Creating database directory',
        expect.any(Object)
      );
    });

    it('should handle nested directory creation', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (path.dirname as jest.Mock).mockReturnValue('/deep/nested/database/dir');
      
      sqliteClient = new SQLiteClient('/deep/nested/database/test.db');
      
      expect(fs.mkdirSync).toHaveBeenCalledWith('/deep/nested/database/dir', { recursive: true });
    });
  });

  describe('Vector Extension Environment Configuration', () => {
    beforeEach(() => {
      sqliteClient = new SQLiteClient(testDbPath);
    });

    it('should use default extension path when environment variable is not set', async () => {
      delete process.env.HIKMA_SQLITE_VEC_EXTENSION;
      mockStatement.get.mockReturnValue({ result: 1 });
      mockDatabase.loadExtension.mockReturnValue(mockDatabase);
      mockDatabase.prepare.mockImplementation((sql: string) => {
        if (sql === 'SELECT vec_version()') {
          return { get: jest.fn().mockReturnValue({ version: '1.0.0' }) } as any;
        }
        return mockStatement;
      });
      
      await sqliteClient.connect();
      
      expect(mockDatabase.loadExtension).toHaveBeenCalledWith('./extensions/vec0');
    });

    it('should handle empty environment variable gracefully', async () => {
      process.env.HIKMA_SQLITE_VEC_EXTENSION = '';
      mockStatement.get.mockReturnValue({ result: 1 });
      mockDatabase.loadExtension.mockReturnValue(mockDatabase);
      mockDatabase.prepare.mockImplementation((sql: string) => {
        if (sql === 'SELECT vec_version()') {
          return { get: jest.fn().mockReturnValue({ version: '1.0.0' }) } as any;
        }
        return mockStatement;
      });
      
      await sqliteClient.connect();
      
      // Empty string should fall back to default path due to || operator
      expect(mockDatabase.loadExtension).toHaveBeenCalledWith('./extensions/vec0');
      
      delete process.env.HIKMA_SQLITE_VEC_EXTENSION;
    });

    it('should handle vector extension version check failure', async () => {
      mockStatement.get.mockReturnValue({ result: 1 });
      mockDatabase.loadExtension.mockReturnValue(mockDatabase);
      mockDatabase.prepare.mockImplementation((sql: string) => {
        if (sql === 'SELECT vec_version()') {
          return { get: jest.fn().mockImplementation(() => {
            throw new Error('vec_version() function not found');
          }) } as any;
        }
        return mockStatement;
      });
      
      await sqliteClient.connect();
      
      expect(sqliteClient.isVectorEnabled).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load sqlite-vec extension, vector operations will be disabled',
        expect.objectContaining({
          error: 'vec_version() function not found'
        })
      );
    });
  });
});
