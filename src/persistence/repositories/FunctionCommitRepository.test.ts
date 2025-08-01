/**
 * @file FunctionCommitRepository.test.ts - Unit tests for FunctionCommitRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { FunctionCommitRepository } from './FunctionCommitRepository';
import { FunctionCommitDTO } from '../models/FunctionCommitDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('FunctionCommitRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: FunctionCommitRepository;

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
      source: 'SELECT * FROM function_commits',
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

    repository = new FunctionCommitRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(FunctionCommitRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_commits');
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
    it('should add a function commit relationship successfully', async () => {
      const functionCommitDto = new FunctionCommitDTO(
        'func-commit-1',
        'function-calculateTotal',
        'commit-abc123'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(functionCommitDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO function_commits (id, created_at, updated_at, function_id, commit_id) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'func-commit-1',
        functionCommitDto.created_at,
        functionCommitDto.updated_at,
        'function-calculateTotal',
        'commit-abc123'
      );
      expect(result).toEqual(functionCommitDto);
    });

    it('should handle multiple functions modified in same commit', async () => {
      const commitId = 'commit-feature-update';
      const modifiedFunctions = [
        'function-validateInput',
        'function-processData',
        'function-saveResults',
        'function-sendNotification',
        'function-logActivity'
      ];
      
      for (let i = 0; i < modifiedFunctions.length; i++) {
        const functionCommitDto = new FunctionCommitDTO(
          `func-commit-${i + 1}`,
          modifiedFunctions[i],
          commitId
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(functionCommitDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(modifiedFunctions[i]); // function_id
        expect(runCall[4]).toBe(commitId); // commit_id
      }
    });

    it('should handle same function modified across multiple commits', async () => {
      const functionId = 'function-criticalBusinessLogic';
      const commits = [
        'commit-initial-implementation',
        'commit-bug-fix-1',
        'commit-performance-optimization',
        'commit-bug-fix-2',
        'commit-refactoring',
        'commit-security-update'
      ];
      
      for (let i = 0; i < commits.length; i++) {
        const functionCommitDto = new FunctionCommitDTO(
          `func-commit-history-${i + 1}`,
          functionId,
          commits[i]
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(functionCommitDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(functionId); // function_id
        expect(runCall[4]).toBe(commits[i]); // commit_id
      }
    });

    it('should handle function lifecycle tracking', async () => {
      const functionLifecycle = [
        // Function creation
        new FunctionCommitDTO('lifecycle-1', 'function-newFeature', 'commit-create-function'),
        // Function modifications
        new FunctionCommitDTO('lifecycle-2', 'function-newFeature', 'commit-add-validation'),
        new FunctionCommitDTO('lifecycle-3', 'function-newFeature', 'commit-improve-performance'),
        new FunctionCommitDTO('lifecycle-4', 'function-newFeature', 'commit-add-error-handling'),
        // Function refactoring
        new FunctionCommitDTO('lifecycle-5', 'function-newFeature', 'commit-refactor-logic'),
        // Function deprecation (still tracked)
        new FunctionCommitDTO('lifecycle-6', 'function-newFeature', 'commit-deprecate-function')
      ];

      for (const lifecycle of functionLifecycle) {
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(lifecycle);
      }

      expect(mockStatement.run).toHaveBeenCalledTimes(6);
    });
  });

  describe('get', () => {
    it('should retrieve a function commit relationship by id', async () => {
      const mockFunctionCommit = {
        id: 'func-commit-1',
        function_id: 'function-calculateTotal',
        commit_id: 'commit-abc123',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockFunctionCommit);

      const result = await repository.get('func-commit-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_commits WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('func-commit-1');
      expect(result).toEqual(mockFunctionCommit);
    });

    it('should return null when function commit relationship not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search function commits by function id', async () => {
      const mockFunctionCommits = [
        {
          id: 'fc-1',
          function_id: 'function-userAuth',
          commit_id: 'commit-initial',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fc-2',
          function_id: 'function-userAuth',
          commit_id: 'commit-security-fix',
          created_at: '2023-01-15T00:00:00.000Z',
          updated_at: '2023-01-15T00:00:00.000Z'
        },
        {
          id: 'fc-3',
          function_id: 'function-userAuth',
          commit_id: 'commit-performance-update',
          created_at: '2023-02-01T00:00:00.000Z',
          updated_at: '2023-02-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionCommits);

      const result = await repository.search({ function_id: 'function-userAuth' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_commits WHERE function_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('function-userAuth');
      expect(result).toEqual(mockFunctionCommits);
      expect(result).toHaveLength(3);
    });

    it('should search function commits by commit id', async () => {
      const mockFunctionCommits = [
        {
          id: 'fc-1',
          function_id: 'function-validateEmail',
          commit_id: 'commit-validation-update',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fc-2',
          function_id: 'function-validatePhone',
          commit_id: 'commit-validation-update',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fc-3',
          function_id: 'function-validateAddress',
          commit_id: 'commit-validation-update',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionCommits);

      const result = await repository.search({ commit_id: 'commit-validation-update' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM function_commits WHERE commit_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('commit-validation-update');
      expect(result).toEqual(mockFunctionCommits);
      expect(result).toHaveLength(3);
    });

    it('should search with both function_id and commit_id', async () => {
      const mockFunctionCommits = [
        {
          id: 'fc-specific',
          function_id: 'function-processPayment',
          commit_id: 'commit-payment-fix',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionCommits);

      const criteria = {
        function_id: 'function-processPayment',
        commit_id: 'commit-payment-fix'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM function_commits WHERE function_id = ? AND commit_id = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('function-processPayment', 'commit-payment-fix');
      expect(result).toEqual(mockFunctionCommits);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple function commit relationships in a transaction', async () => {
      const functionCommits = [
        new FunctionCommitDTO('fc-1', 'function-auth', 'commit-security-update'),
        new FunctionCommitDTO('fc-2', 'function-validate', 'commit-security-update'),
        new FunctionCommitDTO('fc-3', 'function-encrypt', 'commit-security-update'),
        new FunctionCommitDTO('fc-4', 'function-hash', 'commit-security-update'),
        new FunctionCommitDTO('fc-5', 'function-sanitize', 'commit-security-update')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(functionCommits);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(5);
      expect(result).toEqual(functionCommits);
    });

    it('should handle large batch operations for commit analysis', async () => {
      // Simulate a large refactoring commit affecting many functions
      const largeBatch = Array.from({ length: 1500 }, (_, i) => 
        new FunctionCommitDTO(
          `fc-refactor-${i}`,
          `function-${Math.floor(i / 10)}`, // Groups of 10 functions
          'commit-major-refactoring'
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeBatch);
      const endTime = Date.now();

      expect(result).toHaveLength(1500);
      expect(mockStatement.run).toHaveBeenCalledTimes(1500);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Should complete efficiently (mock should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('complex query operations', () => {
    it('should support function evolution tracking', async () => {
      // Get all commits that modified a specific function (function history)
      const mockFunctionHistory = [
        {
          id: 'fh-1',
          function_id: 'function-criticalAlgorithm',
          commit_id: 'commit-initial-implementation',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fh-2',
          function_id: 'function-criticalAlgorithm',
          commit_id: 'commit-optimization-v1',
          created_at: '2023-01-15T00:00:00.000Z',
          updated_at: '2023-01-15T00:00:00.000Z'
        },
        {
          id: 'fh-3',
          function_id: 'function-criticalAlgorithm',
          commit_id: 'commit-bug-fix-edge-case',
          created_at: '2023-02-01T00:00:00.000Z',
          updated_at: '2023-02-01T00:00:00.000Z'
        },
        {
          id: 'fh-4',
          function_id: 'function-criticalAlgorithm',
          commit_id: 'commit-optimization-v2',
          created_at: '2023-02-15T00:00:00.000Z',
          updated_at: '2023-02-15T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFunctionHistory);

      const result = await repository.search({ function_id: 'function-criticalAlgorithm' });

      expect(result).toHaveLength(4);
      expect(result.every(fc => fc.function_id === 'function-criticalAlgorithm')).toBe(true);
    });

    it('should support commit impact analysis', async () => {
      // Get all functions affected by a specific commit
      const mockCommitImpact = [
        {
          id: 'ci-1',
          function_id: 'function-dataProcessor',
          commit_id: 'commit-performance-overhaul',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'ci-2',
          function_id: 'function-cacheManager',
          commit_id: 'commit-performance-overhaul',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'ci-3',
          function_id: 'function-queryOptimizer',
          commit_id: 'commit-performance-overhaul',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'ci-4',
          function_id: 'function-memoryManager',
          commit_id: 'commit-performance-overhaul',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockCommitImpact);

      const result = await repository.search({ commit_id: 'commit-performance-overhaul' });

      expect(result).toHaveLength(4);
      expect(result.every(fc => fc.commit_id === 'commit-performance-overhaul')).toBe(true);
    });

    it('should handle empty results gracefully', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ function_id: 'function-never-modified' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('data aggregations', () => {
    it('should count total function commit relationships', async () => {
      mockStatement.get.mockReturnValue({ count: 8500 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM function_commits');
      expect(count).toBe(8500);
    });

    it('should handle count with zero results', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const count = await repository.count();

      expect(count).toBe(0);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for repeated operations', async () => {
      const searchCriteria = { commit_id: 'frequent-commit' };
      
      mockStatement.all.mockReturnValue([]);

      // Perform multiple searches
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);

      expect(mockDb.prepare).toHaveBeenCalledTimes(3);
      expect(mockStatement.all).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction rollback on batch operation failure', async () => {
      const functionCommits = [
        new FunctionCommitDTO('fc-1', 'function-1', 'commit-1'),
        new FunctionCommitDTO('fc-2', 'function-2', 'commit-1')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(functionCommits)).rejects.toThrow('Transaction failed');
    });

    it('should support concurrent function history analysis', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ function_id: 'function-1' }),
        repository.search({ commit_id: 'commit-major' }),
        repository.search({ function_id: 'function-2', commit_id: 'commit-specific' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const functionCommitDto = new FunctionCommitDTO(
        'duplicate-fc',
        'function-1',
        'commit-1'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: function_commits.id');
      });

      await expect(repository.add(functionCommitDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const functionCommitDto = new FunctionCommitDTO(
        'invalid-fc',
        'non-existent-function',
        'non-existent-commit'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(functionCommitDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient function evolution tracking', async () => {
      // Simulate tracking evolution of many functions across commits
      const evolutionTracking = Array.from({ length: 800 }, (_, i) => 
        new FunctionCommitDTO(
          `evolution-${i}`,
          `function-${Math.floor(i / 8)}`, // Each function has ~8 commits
          `commit-${(i * 3) % 100}` // Distributed across 100 commits
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(evolutionTracking);

      expect(result).toHaveLength(800);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(800);
    });

    it('should handle relationship deduplication', async () => {
      // Test adding the same function-commit relationship multiple times
      const duplicateRelationship = new FunctionCommitDTO(
        'duplicate-test',
        'function-duplicate',
        'commit-duplicate'
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Add the same relationship multiple times
      await repository.add(duplicateRelationship);
      await repository.add(duplicateRelationship);
      await repository.add(duplicateRelationship);

      // Should use INSERT OR REPLACE, so no errors expected
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });

    it('should support efficient commit impact queries', async () => {
      const impactQueries = Array.from({ length: 25 }, (_, i) => 
        repository.search({ commit_id: `commit-${i}` })
      );

      mockStatement.all.mockReturnValue([]);

      const results = await Promise.all(impactQueries);

      expect(results).toHaveLength(25);
      expect(mockDb.prepare).toHaveBeenCalledTimes(25);
      expect(mockStatement.all).toHaveBeenCalledTimes(25);
    });

    it('should handle complex development patterns efficiently', async () => {
      // Test various development patterns: feature development, bug fixes, refactoring
      const developmentPatterns = [
        // Feature development: multiple functions created in sequence
        new FunctionCommitDTO('feature-1', 'function-feature-core', 'commit-feature-start'),
        new FunctionCommitDTO('feature-2', 'function-feature-validation', 'commit-feature-validation'),
        new FunctionCommitDTO('feature-3', 'function-feature-api', 'commit-feature-api'),
        new FunctionCommitDTO('feature-4', 'function-feature-tests', 'commit-feature-tests'),
        
        // Bug fix: single function modified multiple times
        new FunctionCommitDTO('bugfix-1', 'function-problematic', 'commit-initial-fix'),
        new FunctionCommitDTO('bugfix-2', 'function-problematic', 'commit-fix-regression'),
        new FunctionCommitDTO('bugfix-3', 'function-problematic', 'commit-final-fix'),
        
        // Refactoring: many functions modified in single commit
        new FunctionCommitDTO('refactor-1', 'function-old-api-1', 'commit-api-refactor'),
        new FunctionCommitDTO('refactor-2', 'function-old-api-2', 'commit-api-refactor'),
        new FunctionCommitDTO('refactor-3', 'function-old-api-3', 'commit-api-refactor'),
        new FunctionCommitDTO('refactor-4', 'function-old-api-4', 'commit-api-refactor'),
        new FunctionCommitDTO('refactor-5', 'function-old-api-5', 'commit-api-refactor'),
        
        // Maintenance: periodic updates to core functions
        new FunctionCommitDTO('maint-1', 'function-core-util', 'commit-monthly-update-jan'),
        new FunctionCommitDTO('maint-2', 'function-core-util', 'commit-monthly-update-feb'),
        new FunctionCommitDTO('maint-3', 'function-core-util', 'commit-monthly-update-mar')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(developmentPatterns);

      expect(result).toHaveLength(15);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(15);
    });
  });
});
