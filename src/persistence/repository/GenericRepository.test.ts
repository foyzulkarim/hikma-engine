/**
 * @file GenericRepository.test.ts - Unit tests for GenericRepository CRUD operations
 */

import { GenericRepository } from './GenericRepository';
import { BaseDTO } from '../models/base.dto';
import Database from 'better-sqlite3';
import { jest } from '@jest/globals';

// Test DTO for testing GenericRepository
class TestDTO extends BaseDTO {
  name: string;
  value: number;
  active: boolean;
  metadata?: object | null;

  constructor(id: string, name: string, value: number = 0, active: boolean = true, metadata?: object | null) {
    super(id);
    this.name = name;
    this.value = value;
    this.active = active;
    this.metadata = metadata;
  }
}

// Mock Database and Statement interfaces
interface MockStatement {
  run: jest.MockedFunction<any>;
  get: jest.MockedFunction<any>;
  all: jest.MockedFunction<any>;
}

interface MockDatabase {
  prepare: jest.MockedFunction<any>;
  transaction: jest.MockedFunction<any>;
}

describe('GenericRepository', () => {
  let mockDb: MockDatabase;
  let mockStatement: MockStatement;
  let repository: GenericRepository<TestDTO>;
  let testDto: TestDTO;

  beforeEach(() => {
    // Create mock statement
    mockStatement = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn()
    };

    // Create mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue(mockStatement),
      transaction: jest.fn()
    };

    // Create repository instance
    repository = new GenericRepository(mockDb as any, 'test_table');
    
    //  test DTO
    testDto = new TestDTO('test-1', 'Test Item', 42, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with database and table name', () => {
      expect(repository).toBeInstanceOf(GenericRepository);
      expect(mockDb).toBeDefined();
    });

    it('should store table name correctly', () => {
      // Access protected property through type assertion for testing
      expect((repository as any).tableName).toBe('test_table');
    });

    it('should store database reference correctly', () => {
      expect((repository as any).db).toBe(mockDb);
    });
  });

  describe('add method', () => {
    beforeEach(() => {
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    });

    it('should insert DTO into database', async () => {
      const result = await repository.add(testDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO test_table (id, created_at, updated_at, name, value, active, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'test-1',
        testDto.created_at,
        testDto.updated_at,
        'Test Item',
        42,
        1, // boolean converted to integer
        null // undefined metadata becomes null
      );
      expect(result).toEqual(testDto);
    });

    it('should handle undefined values by converting to null', async () => {
      const dtoWithUndefined = new TestDTO('test-2', 'Test', 0, true);
      dtoWithUndefined.created_at = undefined;

      await repository.add(dtoWithUndefined);

      expect(mockStatement.run).toHaveBeenCalledWith(
        'test-2',
        null, // undefined converted to null
        dtoWithUndefined.updated_at,
        'Test',
        0,
        1,
        null // undefined metadata becomes null
      );
    });

    it('should convert boolean values to integers', async () => {
      const dtoWithFalse = new TestDTO('test-3', 'Test', 0, false);

      await repository.add(dtoWithFalse);

      expect(mockStatement.run).toHaveBeenCalledWith(
        'test-3',
        dtoWithFalse.created_at,
        dtoWithFalse.updated_at,
        'Test',
        0,
        0, // false converted to 0
        null // undefined metadata becomes null
      );
    });

    it('should stringify object values', async () => {
      const metadata = { key: 'value', nested: { prop: 'test' } };
      const dtoWithObject = new TestDTO('test-4', 'Test', 0, true, metadata);

      await repository.add(dtoWithObject);

      expect(mockStatement.run).toHaveBeenCalledWith(
        'test-4',
        dtoWithObject.created_at,
        dtoWithObject.updated_at,
        'Test',
        0,
        1,
        JSON.stringify(metadata)
      );
    });

    it('should handle null values correctly', async () => {
      const dtoWithNull = new TestDTO('test-5', 'Test', 0, true);
      dtoWithNull.metadata = null;

      await repository.add(dtoWithNull);

      expect(mockStatement.run).toHaveBeenCalledWith(
        'test-5',
        dtoWithNull.created_at,
        dtoWithNull.updated_at,
        'Test',
        0,
        1,
        null
      );
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Database constraint violation');
      mockStatement.run.mockImplementation(() => {
        throw dbError;
      });

      await expect(repository.add(testDto)).rejects.toThrow('Database constraint violation');
    });
  });

  describe('get method', () => {
    it('should retrieve DTO by id', async () => {
      const mockRow = {
        id: 'test-1',
        name: 'Test Item',
        value: 42,
        active: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };
      mockStatement.get.mockReturnValue(mockRow);

      const result = await repository.get('test-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('test-1');
      expect(result).toEqual(mockRow);
    });

    it('should return null for non-existent id', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('non-existent');
      expect(result).toBeUndefined(); // GenericRepository returns undefined, not null
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection lost');
      mockStatement.get.mockImplementation(() => {
        throw dbError;
      });

      await expect(repository.get('test-1')).rejects.toThrow('Database connection lost');
    });

    it('should handle empty string id', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('');

      expect(mockStatement.get).toHaveBeenCalledWith('');
      expect(result).toBeUndefined(); // GenericRepository returns undefined, not null
    });
  });

  describe('getAll method', () => {
    it('should retrieve all DTOs', async () => {
      const mockRows = [
        { id: 'test-1', name: 'Item 1', value: 10, active: 1 },
        { id: 'test-2', name: 'Item 2', value: 20, active: 0 }
      ];
      mockStatement.all.mockReturnValue(mockRows);

      const result = await repository.getAll();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table');
      expect(mockStatement.all).toHaveBeenCalledWith();
      expect(result).toEqual(mockRows);
    });

    it('should return empty array when no data exists', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Table does not exist');
      mockStatement.all.mockImplementation(() => {
        throw dbError;
      });

      await expect(repository.getAll()).rejects.toThrow('Table does not exist');
    });
  });

  describe('remove method', () => {
    beforeEach(() => {
      mockStatement.run.mockReturnValue({ changes: 1 });
    });

    it('should delete DTO by id', async () => {
      await repository.remove('test-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM test_table WHERE id = ?');
      expect(mockStatement.run).toHaveBeenCalledWith('test-1');
    });

    it('should not throw error for non-existent id', async () => {
      mockStatement.run.mockReturnValue({ changes: 0 });

      await expect(repository.remove('non-existent')).resolves.toBeUndefined();
      expect(mockStatement.run).toHaveBeenCalledWith('non-existent');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Foreign key constraint violation');
      mockStatement.run.mockImplementation(() => {
        throw dbError;
      });

      await expect(repository.remove('test-1')).rejects.toThrow('Foreign key constraint violation');
    });

    it('should handle empty string id', async () => {
      mockStatement.run.mockReturnValue({ changes: 0 });

      await expect(repository.remove('')).resolves.toBeUndefined();
      expect(mockStatement.run).toHaveBeenCalledWith('');
    });
  });

  describe('search method', () => {
    it('should return all items for empty criteria', async () => {
      const mockRows = [
        { id: 'test-1', name: 'Item 1', value: 10 },
        { id: 'test-2', name: 'Item 2', value: 20 }
      ];
      mockStatement.all.mockReturnValue(mockRows);

      const result = await repository.search({});

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table');
      expect(mockStatement.all).toHaveBeenCalledWith();
      expect(result).toEqual(mockRows);
    });

    it('should search by single criteria', async () => {
      const mockRows = [{ id: 'test-1', name: 'Item 1', active: 1 }];
      mockStatement.all.mockReturnValue(mockRows);

      const result = await repository.search({ active: true });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table WHERE active = ?');
      expect(mockStatement.all).toHaveBeenCalledWith(true);
      expect(result).toEqual(mockRows);
    });

    it('should search by multiple criteria', async () => {
      const mockRows = [{ id: 'test-1', name: 'Item 1', value: 10, active: 1 }];
      mockStatement.all.mockReturnValue(mockRows);

      const result = await repository.search({ value: 10, active: true });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table WHERE value = ? AND active = ?');
      expect(mockStatement.all).toHaveBeenCalledWith(10, true);
      expect(result).toEqual(mockRows);
    });

    it('should return empty array for no matches', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ name: 'Non-existent' });

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Invalid column name');
      mockStatement.all.mockImplementation(() => {
        throw dbError;
      });

      await expect(repository.search({ name: 'test' })).rejects.toThrow('Invalid column name');
    });

    it('should handle null criteria values', async () => {
      const mockRows = [{ id: 'test-1', metadata: null }];
      mockStatement.all.mockReturnValue(mockRows);

      const result = await repository.search({ metadata: null });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_table WHERE metadata = ?');
      expect(mockStatement.all).toHaveBeenCalledWith(null);
      expect(result).toEqual(mockRows);
    });
  });

  describe('batchAdd method', () => {
    beforeEach(() => {
      mockStatement.run.mockReturnValue({ changes: 1 });
      mockDb.transaction.mockImplementation((fn: Function) => fn);
    });

    it('should return empty array for empty input', async () => {
      const result = await repository.batchAdd([]);

      expect(result).toEqual([]);
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should batch insert multiple DTOs', async () => {
      const dtos = [
        new TestDTO('batch-1', 'Item 1', 10),
        new TestDTO('batch-2', 'Item 2', 20)
      ];

      const result = await repository.batchAdd(dtos);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO test_table (id, created_at, updated_at, name, value, active, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(dtos);
    });

    it('should handle transaction errors', async () => {
      const dtos = [new TestDTO('batch-1', 'Item 1')];
      const transactionError = new Error('Transaction failed');
      
      mockDb.transaction.mockImplementation(() => {
        throw transactionError;
      });

      await expect(repository.batchAdd(dtos)).rejects.toThrow('Transaction failed');
    });

    it('should convert data types correctly in batch operations', async () => {
      const dtos = [
        new TestDTO('batch-1', 'Item 1', 10, false, { key: 'value' })
      ];
      dtos[0].created_at = undefined;

      await repository.batchAdd(dtos);

      expect(mockStatement.run).toHaveBeenCalledWith(
        'batch-1',
        null, // undefined -> null
        dtos[0].updated_at,
        'Item 1',
        10,
        0, // false -> 0
        JSON.stringify({ key: 'value' }) // object -> JSON string
      );
    });

    it('should handle statement execution errors within transaction', async () => {
      const dtos = [new TestDTO('batch-1', 'Item 1')];
      const statementError = new Error('Statement execution failed');
      
      mockStatement.run.mockImplementation(() => {
        throw statementError;
      });

      await expect(repository.batchAdd(dtos)).rejects.toThrow('Statement execution failed');
    });
  });

  describe('count method', () => {
    it('should return count of records', async () => {
      mockStatement.get.mockReturnValue({ count: 5 });

      const result = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM test_table');
      expect(mockStatement.get).toHaveBeenCalledWith();
      expect(result).toBe(5);
    });

    it('should return 0 for empty table', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const result = await repository.count();

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Table access denied');
      mockStatement.get.mockImplementation(() => {
        throw dbError;
      });

      await expect(repository.count()).rejects.toThrow('Table access denied');
    });
  });

  describe('Error Handling', () => {
    it('should propagate prepare statement errors', async () => {
      const prepareError = new Error('Invalid SQL syntax');
      mockDb.prepare.mockImplementation(() => {
        throw prepareError;
      });

      await expect(repository.get('test-1')).rejects.toThrow('Invalid SQL syntax');
    });

    it('should handle concurrent access errors', async () => {
      const concurrencyError = new Error('Database is locked');
      mockStatement.run.mockImplementation(() => {
        throw concurrencyError;
      });

      await expect(repository.add(testDto)).rejects.toThrow('Database is locked');
    });

    it('should maintain error context in batch operations', async () => {
      const dtos = [new TestDTO('batch-1', 'Item 1')];
      const statementError = new Error('Individual statement failed');
      
      mockDb.transaction.mockImplementation((fn: Function) => {
        return fn; // Return the function to be called later
      });
      
      mockStatement.run.mockImplementation(() => {
        throw statementError;
      });

      await expect(repository.batchAdd(dtos)).rejects.toThrow('Individual statement failed');
    });
  });

  describe('Transaction Management', () => {
    it('should use transactions for batch operations', async () => {
      const dtos = [new TestDTO('tx-1', 'Item 1')];
      let transactionCallback: Function;
      
      mockDb.transaction.mockImplementation((callback: Function) => {
        transactionCallback = callback;
        return callback; // Return the callback function itself
      });

      await repository.batchAdd(dtos);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(typeof transactionCallback!).toBe('function');
    });

    it('should execute statements within transaction context', async () => {
      const dtos = [
        new TestDTO('tx-1', 'Item 1'),
        new TestDTO('tx-2', 'Item 2')
      ];
      
      let executionOrder: string[] = [];
      
      mockDb.transaction.mockImplementation((callback: Function) => {
        executionOrder.push('transaction-start');
        // Return a function that when called, executes the callback
        return (items: any[]) => {
          const result = callback(items);
          executionOrder.push('transaction-end');
          return result;
        };
      });
      
      mockStatement.run.mockImplementation(() => {
        executionOrder.push('statement-run');
        return { changes: 1 };
      });

      await repository.batchAdd(dtos);

      expect(executionOrder).toEqual([
        'transaction-start',
        'statement-run',
        'statement-run',
        'transaction-end'
      ]);
    });
  });

  describe('Data Type Handling', () => {
    it('should handle various JavaScript types correctly', async () => {
      const complexDto = new TestDTO('complex-1', 'Complex Item');
      
      // Add various data types
      (complexDto as any).stringValue = 'test string';
      (complexDto as any).numberValue = 42.5;
      (complexDto as any).booleanTrue = true;
      (complexDto as any).booleanFalse = false;
      (complexDto as any).nullValue = null;
      (complexDto as any).undefinedValue = undefined;
      (complexDto as any).objectValue = { nested: { prop: 'value' } };
      (complexDto as any).arrayValue = [1, 2, 3];

      await repository.add(complexDto);

      // Verify the run call received properly converted values
      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain('test string'); // string unchanged
      expect(runCall).toContain(42.5); // number unchanged
      expect(runCall).toContain(1); // true -> 1
      expect(runCall).toContain(0); // false -> 0
      expect(runCall).toContain(null); // null unchanged
      expect(runCall).toContain(null); // undefined -> null
      expect(runCall).toContain(JSON.stringify({ nested: { prop: 'value' } })); // object -> JSON
      expect(runCall).toContain(JSON.stringify([1, 2, 3])); // array -> JSON
    });

    it('should handle edge cases in data conversion', async () => {
      const edgeCaseDto = new TestDTO('edge-1', 'Edge Case');
      
      // Add edge case values
      (edgeCaseDto as any).emptyString = '';
      (edgeCaseDto as any).zeroNumber = 0;
      (edgeCaseDto as any).emptyObject = {};
      (edgeCaseDto as any).emptyArray = [];

      await repository.add(edgeCaseDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain(''); // empty string unchanged
      expect(runCall).toContain(0); // zero unchanged
      expect(runCall).toContain(JSON.stringify({})); // empty object -> JSON
      expect(runCall).toContain(JSON.stringify([])); // empty array -> JSON
    });
  });
});
