/**
 * @file FileCommitRepository.test.ts - Unit tests for FileCommitRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { FileCommitRepository } from './FileCommitRepository';
import { FileCommitDTO } from '../models/FileCommitDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('FileCommitRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: FileCommitRepository;

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
      source: 'SELECT * FROM file_commits',
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

    repository = new FileCommitRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(FileCommitRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_commits');
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
    it('should add a file commit relationship successfully', async () => {
      const fileCommitDto = new FileCommitDTO(
        'file-commit-1',
        'file-123',
        'commit-abc456'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(fileCommitDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO file_commits (id, created_at, updated_at, file_id, commit_id) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'file-commit-1',
        fileCommitDto.created_at,
        fileCommitDto.updated_at,
        'file-123',
        'commit-abc456'
      );
      expect(result).toEqual(fileCommitDto);
    });

    it('should handle multiple file-commit relationships for same file', async () => {
      const fileId = 'file-shared';
      const commits = ['commit-1', 'commit-2', 'commit-3'];
      
      for (let i = 0; i < commits.length; i++) {
        const fileCommitDto = new FileCommitDTO(
          `file-commit-${i + 1}`,
          fileId,
          commits[i]
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileCommitDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(fileId); // file_id
        expect(runCall[4]).toBe(commits[i]); // commit_id
      }
    });

    it('should handle multiple file-commit relationships for same commit', async () => {
      const commitId = 'commit-shared';
      const files = ['file-1', 'file-2', 'file-3', 'file-4'];
      
      for (let i = 0; i < files.length; i++) {
        const fileCommitDto = new FileCommitDTO(
          `file-commit-${i + 1}`,
          files[i],
          commitId
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileCommitDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(files[i]); // file_id
        expect(runCall[4]).toBe(commitId); // commit_id
      }
    });
  });

  describe('get', () => {
    it('should retrieve a file commit relationship by id', async () => {
      const mockFileCommit = {
        id: 'file-commit-1',
        file_id: 'file-123',
        commit_id: 'commit-abc456',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockFileCommit);

      const result = await repository.get('file-commit-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_commits WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('file-commit-1');
      expect(result).toEqual(mockFileCommit);
    });

    it('should return null when file commit relationship not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search file commits by file id', async () => {
      const mockFileCommits = [
        {
          id: 'file-commit-1',
          file_id: 'file-123',
          commit_id: 'commit-abc',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'file-commit-2',
          file_id: 'file-123',
          commit_id: 'commit-def',
          created_at: '2023-01-02T00:00:00.000Z',
          updated_at: '2023-01-02T00:00:00.000Z'
        },
        {
          id: 'file-commit-3',
          file_id: 'file-123',
          commit_id: 'commit-ghi',
          created_at: '2023-01-03T00:00:00.000Z',
          updated_at: '2023-01-03T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileCommits);

      const result = await repository.search({ file_id: 'file-123' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_commits WHERE file_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('file-123');
      expect(result).toEqual(mockFileCommits);
      expect(result).toHaveLength(3);
    });

    it('should search file commits by commit id', async () => {
      const mockFileCommits = [
        {
          id: 'file-commit-1',
          file_id: 'file-1',
          commit_id: 'commit-abc',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'file-commit-2',
          file_id: 'file-2',
          commit_id: 'commit-abc',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'file-commit-3',
          file_id: 'file-3',
          commit_id: 'commit-abc',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileCommits);

      const result = await repository.search({ commit_id: 'commit-abc' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_commits WHERE commit_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('commit-abc');
      expect(result).toEqual(mockFileCommits);
      expect(result).toHaveLength(3);
    });

    it('should search with both file_id and commit_id', async () => {
      const mockFileCommits = [
        {
          id: 'file-commit-specific',
          file_id: 'file-123',
          commit_id: 'commit-abc',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileCommits);

      const criteria = {
        file_id: 'file-123',
        commit_id: 'commit-abc'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM file_commits WHERE file_id = ? AND commit_id = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('file-123', 'commit-abc');
      expect(result).toEqual(mockFileCommits);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple file commit relationships in a transaction', async () => {
      const fileCommits = [
        new FileCommitDTO('fc-1', 'file-1', 'commit-abc'),
        new FileCommitDTO('fc-2', 'file-2', 'commit-abc'),
        new FileCommitDTO('fc-3', 'file-3', 'commit-abc'),
        new FileCommitDTO('fc-4', 'file-1', 'commit-def'),
        new FileCommitDTO('fc-5', 'file-2', 'commit-def')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(fileCommits);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(5);
      expect(result).toEqual(fileCommits);
    });

    it('should handle large batch operations for commit processing', async () => {
      // Simulate a large commit affecting many files
      const largeBatch = Array.from({ length: 500 }, (_, i) => 
        new FileCommitDTO(
          `fc-${i}`,
          `file-${i}`,
          'large-commit-123'
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeBatch);
      const endTime = Date.now();

      expect(result).toHaveLength(500);
      expect(mockStatement.run).toHaveBeenCalledTimes(500);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Should complete efficiently (mock should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('complex query operations', () => {
    it('should support file history queries', async () => {
      // Get all commits for a specific file (file history)
      const mockFileHistory = [
        {
          id: 'fc-1',
          file_id: 'file-important',
          commit_id: 'commit-1',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fc-2',
          file_id: 'file-important',
          commit_id: 'commit-2',
          created_at: '2023-01-02T00:00:00.000Z',
          updated_at: '2023-01-02T00:00:00.000Z'
        },
        {
          id: 'fc-3',
          file_id: 'file-important',
          commit_id: 'commit-3',
          created_at: '2023-01-03T00:00:00.000Z',
          updated_at: '2023-01-03T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileHistory);

      const result = await repository.search({ file_id: 'file-important' });

      expect(result).toHaveLength(3);
      expect(result.every(fc => fc.file_id === 'file-important')).toBe(true);
    });

    it('should support commit impact queries', async () => {
      // Get all files affected by a specific commit
      const mockCommitImpact = [
        {
          id: 'fc-1',
          file_id: 'file-1',
          commit_id: 'major-commit',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fc-2',
          file_id: 'file-2',
          commit_id: 'major-commit',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'fc-3',
          file_id: 'file-3',
          commit_id: 'major-commit',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockCommitImpact);

      const result = await repository.search({ commit_id: 'major-commit' });

      expect(result).toHaveLength(3);
      expect(result.every(fc => fc.commit_id === 'major-commit')).toBe(true);
    });

    it('should handle empty results gracefully', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ file_id: 'non-existent-file' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('data aggregations', () => {
    it('should count total file commit relationships', async () => {
      mockStatement.get.mockReturnValue({ count: 2500 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM file_commits');
      expect(count).toBe(2500);
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
      const fileCommits = [
        new FileCommitDTO('fc-1', 'file-1', 'commit-1'),
        new FileCommitDTO('fc-2', 'file-2', 'commit-1')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(fileCommits)).rejects.toThrow('Transaction failed');
    });

    it('should support concurrent access patterns', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ file_id: 'file-1' }),
        repository.search({ commit_id: 'commit-1' }),
        repository.search({ file_id: 'file-2', commit_id: 'commit-2' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const fileCommitDto = new FileCommitDTO(
        'duplicate-fc',
        'file-1',
        'commit-1'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: file_commits.id');
      });

      await expect(repository.add(fileCommitDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const fileCommitDto = new FileCommitDTO(
        'invalid-fc',
        'non-existent-file',
        'non-existent-commit'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(fileCommitDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient bulk relationship creation', async () => {
      // Simulate processing a merge commit with many file changes
      const mergeCommitFiles = Array.from({ length: 200 }, (_, i) => 
        new FileCommitDTO(
          `merge-fc-${i}`,
          `file-${i}`,
          'merge-commit-456'
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(mergeCommitFiles);

      expect(result).toHaveLength(200);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(200);
    });

    it('should handle relationship deduplication', async () => {
      // Test adding the same file-commit relationship multiple times
      const duplicateRelationship = new FileCommitDTO(
        'duplicate-test',
        'file-duplicate',
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

    it('should support efficient file history retrieval', async () => {
      const fileHistoryQueries = Array.from({ length: 20 }, (_, i) => 
        repository.search({ file_id: `file-${i}` })
      );

      mockStatement.all.mockReturnValue([]);

      const results = await Promise.all(fileHistoryQueries);

      expect(results).toHaveLength(20);
      expect(mockDb.prepare).toHaveBeenCalledTimes(20);
      expect(mockStatement.all).toHaveBeenCalledTimes(20);
    });
  });
});
