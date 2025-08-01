/**
 * @file FunctionCallRepository.test.ts - Unit tests for FunctionCallRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { FunctionCallRepository } from './FunctionCallRepository';
import { FunctionCallDTO } from '../models/FunctionCallDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('FunctionCallRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: FunctionCallRepository;

  beforeEach(() => {
    // Create mock statement
    mockStatement = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      finalize: jest.fn(),
      bind: jest.fn(),
      pluck: jest.fn(),
      expand: jest.fn(),
      raw: jest.fn(),
      columns: jest.fn(),
      iterate: jest.fn(),
      reader: false,
      source: 'SELECT * FROM function_calls',
      database: {} as Database.Database
    } as any;

    // Create mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue(mockStatement),
      exec: jest.fn(),
      close: jest.fn(),
      pragma: jest.fn(),
      loadExtension: jest.fn(),
      serialize: jest.fn(),
      function: jest.fn(),
      aggregate: jest.fn(),
      table: jest.fn(),
      backup: jest.fn(),
      transaction: jest.fn().mockImplementation((fn: any) => {
        // Return a function that executes the transaction
        return (items: any[]) => {
          return fn(items);
        };
      }),
      defaultSafeIntegers: jest.fn(),
      unsafeMode: jest.fn(),
      inTransaction: false,
      open: true,
      readonly: false,
      name: ':memory:',
      memory: true
    } as any;

    repository = new FunctionCallRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(FunctionCallRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_calls');
    });

    it('should extend GenericRepository', () => {
      expect(repository).toHaveProperty('add');
      expect(repository).toHaveProperty('get');
      expect(repository).toHaveProperty('getAll');
      expect(repository).toHaveProperty('remove');
      expect(repository).toHaveProperty('search');
      expect(repository).toHaveProperty('batchAdd');
      expect(repository).toHaveProperty('count');
    });
  });

  describe('add', () => {
    it('should add a function call relationship successfully', async () => {
      const functionCallDto = new FunctionCallDTO(
        'call-1',
        'function-main',
        'function-helper'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(functionCallDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO function_calls (id, created_at, updated_at, caller_id, callee_id) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'call-1',
        functionCallDto.created_at,
        functionCallDto.updated_at,
        'function-main',
        'function-helper'
      );
      expect(result).toEqual(functionCallDto);
    });

    it('should handle multiple calls from same function', async () => {
      const callerFunction = 'function-orchestrator';
      const calledFunctions = ['function-validate', 'function-process', 'function-save', 'function-notify'];
      
      for (let i = 0; i < calledFunctions.length; i++) {
        const functionCallDto = new FunctionCallDTO(
          `call-${i + 1}`,
          callerFunction,
          calledFunctions[i]
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(functionCallDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(callerFunction); // caller_id
        expect(runCall[4]).toBe(calledFunctions[i]); // callee_id
      }
    });

    it('should handle same function being called by multiple functions', async () => {
      const calleeFunction = 'function-shared-utility';
      const callerFunctions = ['function-service1', 'function-service2', 'function-controller', 'function-middleware'];
      
      for (let i = 0; i < callerFunctions.length; i++) {
        const functionCallDto = new FunctionCallDTO(
          `call-shared-${i + 1}`,
          callerFunctions[i],
          calleeFunction
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(functionCallDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(callerFunctions[i]); // caller_id
        expect(runCall[4]).toBe(calleeFunction); // callee_id
      }
    });

    it('should handle recursive function calls', async () => {
      // Function calling itself (recursion)
      const recursiveCall = new FunctionCallDTO(
        'recursive-call',
        'function-recursive',
        'function-recursive'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(recursiveCall);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[3]).toBe('function-recursive'); // caller_id
      expect(runCall[4]).toBe('function-recursive'); // callee_id
    });

    it('should handle complex call chains', async () => {
      // A -> B -> C -> D call chain
      const callChain = [
        new FunctionCallDTO('chain-1', 'function-a', 'function-b'),
        new FunctionCallDTO('chain-2', 'function-b', 'function-c'),
        new FunctionCallDTO('chain-3', 'function-c', 'function-d')
      ];
      
      for (const call of callChain) {
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(call);
      }

      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });
  });

  describe('get', () => {
    it('should retrieve a function call relationship by id', async () => {
      const mockFunctionCall = {
        id: 'call-1',
        caller_id: 'function-main',
        callee_id: 'function-helper',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockFunctionCall);

      const result = await repository.get('call-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_calls WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('call-1');
      expect(result).toEqual(mockFunctionCall);
    });

    it('should return null when function call relationship not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search function calls by caller id', async () => {
      const mockFunctionCalls = [
        {
          id: 'call-1',
          caller_id: 'function-main',
          callee_id: 'function-validate',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'call-2',
          caller_id: 'function-main',
          callee_id: 'function-process',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'call-3',
          caller_id: 'function-main',
          callee_id: 'function-save',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionCalls);

      const result = await repository.search({ caller_id: 'function-main' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_calls WHERE caller_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('function-main');
      expect(result).toEqual(mockFunctionCalls);
      expect(result).toHaveLength(3);
    });

    it('should search function calls by callee id', async () => {
      const mockFunctionCalls = [
        {
          id: 'call-1',
          caller_id: 'function-service1',
          callee_id: 'function-shared',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'call-2',
          caller_id: 'function-service2',
          callee_id: 'function-shared',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'call-3',
          caller_id: 'function-controller',
          callee_id: 'function-shared',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionCalls);

      const result = await repository.search({ callee_id: 'function-shared' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_calls WHERE callee_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('function-shared');
      expect(result).toEqual(mockFunctionCalls);
      expect(result).toHaveLength(3);
    });

    it('should search with both caller_id and callee_id', async () => {
      const mockFunctionCalls = [
        {
          id: 'call-specific',
          caller_id: 'function-main',
          callee_id: 'function-helper',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionCalls);

      const criteria = {
        caller_id: 'function-main',
        callee_id: 'function-helper'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM function_calls WHERE caller_id = ? AND callee_id = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('function-main', 'function-helper');
      expect(result).toEqual(mockFunctionCalls);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple function call relationships in a transaction', async () => {
      const functionCalls = [
        new FunctionCallDTO('call-1', 'function-main', 'function-validate'),
        new FunctionCallDTO('call-2', 'function-main', 'function-process'),
        new FunctionCallDTO('call-3', 'function-process', 'function-transform'),
        new FunctionCallDTO('call-4', 'function-process', 'function-save'),
        new FunctionCallDTO('call-5', 'function-save', 'function-log')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(functionCalls);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(5);
      expect(result).toEqual(functionCalls);
    });

    it('should handle large batch operations for call graph analysis', async () => {
      // Simulate analyzing call relationships in a large codebase
      const largeBatch = Array.from({ length: 3000 }, (_, i) => 
        new FunctionCallDTO(
          `call-${i}`,
          `function-${Math.floor(i / 15)}`, // Each function calls ~15 others
          `target-function-${i % 200}` // 200 different target functions
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeBatch);
      const endTime = Date.now();

      expect(result).toHaveLength(3000);
      expect(mockStatement.run).toHaveBeenCalledTimes(3000);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Should complete efficiently (mock should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('complex query operations', () => {
    it('should support call graph analysis', async () => {
      // Get all functions called by a specific function
      const mockOutgoingCalls = [
        {
          id: 'out-1',
          caller_id: 'function-orchestrator',
          callee_id: 'function-step1',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'out-2',
          caller_id: 'function-orchestrator',
          callee_id: 'function-step2',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'out-3',
          caller_id: 'function-orchestrator',
          callee_id: 'function-step3',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockOutgoingCalls);

      const result = await repository.search({ caller_id: 'function-orchestrator' });

      expect(result).toHaveLength(3);
      expect(result.every(call => call.caller_id === 'function-orchestrator')).toBe(true);
    });

    it('should support reverse call analysis', async () => {
      // Get all functions that call a specific function
      const mockIncomingCalls = [
        {
          id: 'in-1',
          caller_id: 'function-service1',
          callee_id: 'function-popular',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'in-2',
          caller_id: 'function-service2',
          callee_id: 'function-popular',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'in-3',
          caller_id: 'function-controller',
          callee_id: 'function-popular',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockIncomingCalls);

      const result = await repository.search({ callee_id: 'function-popular' });

      expect(result).toHaveLength(3);
      expect(result.every(call => call.callee_id === 'function-popular')).toBe(true);
    });

    it('should handle empty call results gracefully', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ caller_id: 'function-isolated' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('data aggregations', () => {
    it('should count total function call relationships', async () => {
      mockStatement.get.mockReturnValue({ count: 12000 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM function_calls');
      expect(count).toBe(12000);
    });

    it('should handle count with zero results', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const count = await repository.count();

      expect(count).toBe(0);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for repeated operations', async () => {
      const searchCriteria = { callee_id: 'popular-function' };
      
      mockStatement.all.mockReturnValue([]);

      // Perform multiple searches
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);

      expect(mockDb.prepare).toHaveBeenCalledTimes(3);
      expect(mockStatement.all).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction rollback on batch operation failure', async () => {
      const functionCalls = [
        new FunctionCallDTO('call-1', 'function-1', 'function-2'),
        new FunctionCallDTO('call-2', 'function-2', 'function-3')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(functionCalls)).rejects.toThrow('Transaction failed');
    });

    it('should support concurrent call graph analysis', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ caller_id: 'function-1' }),
        repository.search({ callee_id: 'function-utils' }),
        repository.search({ caller_id: 'function-2', callee_id: 'function-helper' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const functionCallDto = new FunctionCallDTO(
        'duplicate-call',
        'function-1',
        'function-2'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: function_calls.id');
      });

      await expect(repository.add(functionCallDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const functionCallDto = new FunctionCallDTO(
        'invalid-call',
        'non-existent-function',
        'another-non-existent-function'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(functionCallDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient call graph construction', async () => {
      // Simulate building a complex call graph
      const callGraph = Array.from({ length: 2000 }, (_, i) => 
        new FunctionCallDTO(
          `graph-call-${i}`,
          `function-${Math.floor(i / 20)}`, // Each function calls ~20 others
          `target-${(i * 5) % 300}` // Distributed targets
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(callGraph);

      expect(result).toHaveLength(2000);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2000);
    });

    it('should handle call deduplication', async () => {
      // Test adding the same call relationship multiple times
      const duplicateCall = new FunctionCallDTO(
        'duplicate-test',
        'function-caller',
        'function-callee'
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Add the same call multiple times
      await repository.add(duplicateCall);
      await repository.add(duplicateCall);
      await repository.add(duplicateCall);

      // Should use INSERT OR REPLACE, so no errors expected
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });

    it('should support efficient call pattern analysis', async () => {
      const callPatternQueries = Array.from({ length: 30 }, (_, i) => 
        repository.search({ caller_id: `function-${i}` })
      );

      mockStatement.all.mockReturnValue([]);

      const results = await Promise.all(callPatternQueries);

      expect(results).toHaveLength(30);
      expect(mockDb.prepare).toHaveBeenCalledTimes(30);
      expect(mockStatement.all).toHaveBeenCalledTimes(30);
    });

    it('should handle complex call patterns efficiently', async () => {
      // Test various call patterns: chains, fans, cycles
      const complexCallPatterns = [
        // Call chain: A -> B -> C -> D -> E
        new FunctionCallDTO('chain-1', 'function-a', 'function-b'),
        new FunctionCallDTO('chain-2', 'function-b', 'function-c'),
        new FunctionCallDTO('chain-3', 'function-c', 'function-d'),
        new FunctionCallDTO('chain-4', 'function-d', 'function-e'),
        
        // Fan out: F calls G, H, I, J, K
        new FunctionCallDTO('fan-1', 'function-f', 'function-g'),
        new FunctionCallDTO('fan-2', 'function-f', 'function-h'),
        new FunctionCallDTO('fan-3', 'function-f', 'function-i'),
        new FunctionCallDTO('fan-4', 'function-f', 'function-j'),
        new FunctionCallDTO('fan-5', 'function-f', 'function-k'),
        
        // Fan in: L, M, N, O all call P
        new FunctionCallDTO('fanin-1', 'function-l', 'function-p'),
        new FunctionCallDTO('fanin-2', 'function-m', 'function-p'),
        new FunctionCallDTO('fanin-3', 'function-n', 'function-p'),
        new FunctionCallDTO('fanin-4', 'function-o', 'function-p'),
        
        // Cycle: Q -> R -> S -> Q
        new FunctionCallDTO('cycle-1', 'function-q', 'function-r'),
        new FunctionCallDTO('cycle-2', 'function-r', 'function-s'),
        new FunctionCallDTO('cycle-3', 'function-s', 'function-q'),
        
        // Recursive calls
        new FunctionCallDTO('recursive-1', 'function-recursive1', 'function-recursive1'),
        new FunctionCallDTO('recursive-2', 'function-recursive2', 'function-recursive2')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(complexCallPatterns);

      expect(result).toHaveLength(18);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(18);
    });
  });
});
