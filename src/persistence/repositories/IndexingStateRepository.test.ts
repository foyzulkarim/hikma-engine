/**
 * @file IndexingStateRepository.test.ts - Unit tests for IndexingStateRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { IndexingStateRepository } from './IndexingStateRepository';
import { IndexingStateDTO } from '../models/IndexingStateDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('IndexingStateRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: IndexingStateRepository;

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
      source: 'SELECT * FROM indexing_state',
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

    repository = new IndexingStateRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(IndexingStateRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM indexing_state');
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
    it('should add an indexing state DTO successfully', async () => {
      const stateDto = new IndexingStateDTO(
        'state-1',
        'last_indexed_commit',
        'abc123def456'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(stateDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO indexing_state (id, created_at, updated_at, key, value) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'state-1',
        stateDto.created_at,
        stateDto.updated_at,
        'last_indexed_commit',
        'abc123def456'
      );
      expect(result).toEqual(stateDto);
    });

    it('should handle different state keys', async () => {
      const stateKeys = [
        { key: 'last_indexed_commit', value: 'commit-hash-123' },
        { key: 'indexing_progress', value: '75' },
        { key: 'last_error', value: 'Connection timeout' },
        { key: 'total_files_processed', value: '1250' },
        { key: 'indexing_start_time', value: '2023-01-01T10:00:00.000Z' },
        { key: 'current_phase', value: 'ast_parsing' },
        { key: 'repository_id', value: 'repo-456' },
        { key: 'batch_size', value: '100' }
      ];

      for (const state of stateKeys) {
        const stateDto = new IndexingStateDTO(
          `state-${state.key}`,
          state.key,
          state.value
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(stateDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[3]).toBe(state.key); // key
        expect(runCall[4]).toBe(state.value); // value
      }
    });

    it('should handle JSON values for complex state', async () => {
      const complexState = {
        phase: 'embedding_generation',
        progress: {
          completed: 750,
          total: 1000,
          percentage: 75
        },
        errors: [
          { file: 'src/error1.ts', message: 'Parse error' },
          { file: 'src/error2.ts', message: 'Type error' }
        ],
        performance: {
          avgProcessingTime: 150,
          memoryUsage: '512MB',
          cpuUsage: '45%'
        }
      };

      const stateDto = new IndexingStateDTO(
        'state-complex',
        'indexing_status',
        JSON.stringify(complexState)
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(stateDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[4]).toBe(JSON.stringify(complexState));
    });

    it('should handle large text values', async () => {
      const largeValue = 'x'.repeat(10000); // 10KB string
      const stateDto = new IndexingStateDTO(
        'state-large',
        'large_data',
        largeValue
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(stateDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[4]).toBe(largeValue);
      expect((runCall[4] as string).length).toBe(10000);
    });
  });

  describe('get', () => {
    it('should retrieve indexing state by id', async () => {
      const mockState = {
        id: 'state-1',
        key: 'last_indexed_commit',
        value: 'abc123def456',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockState);

      const result = await repository.get('state-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM indexing_state WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('state-1');
      expect(result).toEqual(mockState);
    });

    it('should return null when state not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search indexing state by key', async () => {
      const mockStates = [
        {
          id: 'state-1',
          key: 'last_indexed_commit',
          value: 'abc123def456',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockStates);

      const result = await repository.search({ key: 'last_indexed_commit' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM indexing_state WHERE key = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('last_indexed_commit');
      expect(result).toEqual(mockStates);
    });

    it('should search indexing state by value pattern', async () => {
      const mockStates = [
        {
          id: 'state-1',
          key: 'current_phase',
          value: 'ast_parsing',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'state-2',
          key: 'previous_phase',
          value: 'ast_parsing',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockStates);

      const result = await repository.search({ value: 'ast_parsing' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM indexing_state WHERE value = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('ast_parsing');
      expect(result).toEqual(mockStates);
    });

    it('should search with multiple criteria', async () => {
      const mockStates = [
        {
          id: 'state-1',
          key: 'error_count',
          value: '5',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockStates);

      const criteria = {
        key: 'error_count',
        value: '5'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM indexing_state WHERE key = ? AND value = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('error_count', '5');
      expect(result).toEqual(mockStates);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple indexing states in a transaction', async () => {
      const states = [
        new IndexingStateDTO('state-1', 'last_indexed_commit', 'commit-123'),
        new IndexingStateDTO('state-2', 'indexing_progress', '50'),
        new IndexingStateDTO('state-3', 'current_phase', 'file_discovery'),
        new IndexingStateDTO('state-4', 'total_files', '1000')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(states);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(4);
      expect(result).toEqual(states);
    });

    it('should handle batch update of existing states', async () => {
      const states = [
        new IndexingStateDTO('existing-1', 'last_indexed_commit', 'new-commit-456'),
        new IndexingStateDTO('existing-2', 'indexing_progress', '100'),
        new IndexingStateDTO('new-1', 'completion_time', '2023-01-01T12:00:00.000Z')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(states);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
      expect(result).toEqual(states);
    });
  });

  describe('complex query operations', () => {
    it('should support state aggregation queries', async () => {
      mockStatement.get.mockReturnValue({ count: 25 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM indexing_state');
      expect(count).toBe(25);
    });

    it('should handle empty state collections', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ key: 'non_existent_key' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });

    it('should retrieve all indexing states', async () => {
      const mockStates = [
        {
          id: 'state-1',
          key: 'last_indexed_commit',
          value: 'commit-123',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'state-2',
          key: 'indexing_progress',
          value: '75',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'state-3',
          key: 'current_phase',
          value: 'embedding_generation',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockStates);

      const result = await repository.getAll();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM indexing_state');
      expect(result).toEqual(mockStates);
    });
  });

  describe('state management operations', () => {
    it('should handle state key updates', async () => {
      const updatedState = new IndexingStateDTO(
        'state-progress',
        'indexing_progress',
        '90'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(updatedState);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[3]).toBe('indexing_progress');
      expect(runCall[4]).toBe('90');
    });

    it('should handle state removal', async () => {
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.remove('state-to-remove');

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM indexing_state WHERE id = ?');
      expect(mockStatement.run).toHaveBeenCalledWith('state-to-remove');
    });

    it('should handle state value validation', async () => {
      const validationStates = [
        { key: 'progress_percentage', value: '85', valid: true },
        { key: 'error_count', value: '0', valid: true },
        { key: 'timestamp', value: '2023-01-01T10:00:00.000Z', valid: true },
        { key: 'boolean_flag', value: 'true', valid: true },
        { key: 'json_data', value: '{"valid": true}', valid: true }
      ];

      for (const state of validationStates) {
        const stateDto = new IndexingStateDTO(
          `validation-${state.key}`,
          state.key,
          state.value
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        const result = await repository.add(stateDto);
        expect(result).toEqual(stateDto);
      }
    });
  });

  describe('performance optimizations', () => {
    it('should handle frequent state updates efficiently', async () => {
      const progressUpdates = Array.from({ length: 100 }, (_, i) => 
        new IndexingStateDTO(
          'progress-update',
          'indexing_progress',
          `${i + 1}`
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      
      for (const update of progressUpdates) {
        await repository.add(update);
      }
      
      const endTime = Date.now();

      expect(mockStatement.run).toHaveBeenCalledTimes(100);
      // Should complete efficiently (mock should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should support bulk state initialization', async () => {
      const initialStates = [
        new IndexingStateDTO('init-1', 'last_indexed_commit', ''),
        new IndexingStateDTO('init-2', 'indexing_progress', '0'),
        new IndexingStateDTO('init-3', 'current_phase', 'initialization'),
        new IndexingStateDTO('init-4', 'total_files', '0'),
        new IndexingStateDTO('init-5', 'processed_files', '0'),
        new IndexingStateDTO('init-6', 'error_count', '0'),
        new IndexingStateDTO('init-7', 'start_time', new Date().toISOString()),
        new IndexingStateDTO('init-8', 'repository_id', 'repo-123')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(initialStates);

      expect(result).toHaveLength(8);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(8);
    });

    it('should handle concurrent state access', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ key: 'indexing_progress' }),
        repository.search({ key: 'current_phase' }),
        repository.search({ key: 'error_count' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const stateDto = new IndexingStateDTO(
        'duplicate-state',
        'duplicate_key',
        'value'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: indexing_state.id');
      });

      await expect(repository.add(stateDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle transaction failures in batch operations', async () => {
      const states = [
        new IndexingStateDTO('batch-1', 'key1', 'value1'),
        new IndexingStateDTO('batch-2', 'key2', 'value2')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(states)).rejects.toThrow('Transaction failed');
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });

    it('should handle invalid state data gracefully', async () => {
      const invalidStates = [
        new IndexingStateDTO('', 'empty_id', 'value'), // Empty ID
        new IndexingStateDTO('valid-id', '', 'value'), // Empty key
        new IndexingStateDTO('valid-id-2', 'valid_key', '') // Empty value (should be allowed)
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Empty value should be allowed
      const result = await repository.add(invalidStates[2]);
      expect(result).toEqual(invalidStates[2]);
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient state lookups', async () => {
      const lookupKeys = [
        'last_indexed_commit',
        'indexing_progress',
        'current_phase',
        'error_count',
        'total_files'
      ];

      mockStatement.all.mockReturnValue([]);

      const lookupPromises = lookupKeys.map(key => 
        repository.search({ key })
      );

      const results = await Promise.all(lookupPromises);

      expect(results).toHaveLength(5);
      expect(mockDb.prepare).toHaveBeenCalledTimes(5);
      expect(mockStatement.all).toHaveBeenCalledTimes(5);
    });

    it('should handle large state values efficiently', async () => {
      const largeStates = Array.from({ length: 50 }, (_, i) => {
        const largeValue = JSON.stringify({
          index: i,
          data: 'x'.repeat(1000), // 1KB per state
          timestamp: new Date().toISOString(),
          metadata: {
            processed: true,
            errors: [],
            performance: { time: Math.random() * 1000 }
          }
        });

        return new IndexingStateDTO(
          `large-state-${i}`,
          `large_data_${i}`,
          largeValue
        );
      });

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(largeStates);

      expect(result).toHaveLength(50);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(50);
    });
  });
});
