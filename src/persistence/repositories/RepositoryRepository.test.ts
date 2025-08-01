/**
 * @file RepositoryRepository.test.ts - Unit tests for RepositoryRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { RepositoryRepository } from './RepositoryRepository';
import { RepositoryDTO } from '../models/RepositoryDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('RepositoryRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: RepositoryRepository;

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
      source: 'SELECT * FROM repositories',
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

    repository = new RepositoryRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(RepositoryRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories');
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
    it('should add a repository DTO successfully', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(repositoryDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO repositories (id, created_at, updated_at, repo_path, repo_name) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'repo-1',
        repositoryDto.created_at,
        repositoryDto.updated_at,
        '/path/to/repo',
        'test-repo'
      );
      expect(result).toEqual(repositoryDto);
    });

    it('should handle boolean values correctly', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      // Add a boolean property for testing
      (repositoryDto as any).active = true;
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(repositoryDto);

      // Verify boolean is converted to integer
      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain(1); // true converted to 1
    });

    it('should handle undefined values as null', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      // Add undefined property
      (repositoryDto as any).optional_field = undefined;
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(repositoryDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain(null); // undefined converted to null
    });

    it('should stringify object values', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      // Add object property
      (repositoryDto as any).metadata = { key: 'value' };
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(repositoryDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain('{"key":"value"}'); // object stringified
    });
  });

  describe('get', () => {
    it('should retrieve a repository by id', async () => {
      const mockRepository = {
        id: 'repo-1',
        repo_path: '/path/to/repo',
        repo_name: 'test-repo',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockRepository);

      const result = await repository.get('repo-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('repo-1');
      expect(result).toEqual(mockRepository);
    });

    it('should return null when repository not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should retrieve all repositories', async () => {
      const mockRepositories = [
        {
          id: 'repo-1',
          repo_path: '/path/to/repo1',
          repo_name: 'test-repo-1',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'repo-2',
          repo_path: '/path/to/repo2',
          repo_name: 'test-repo-2',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockRepositories);

      const result = await repository.getAll();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories');
      expect(mockStatement.all).toHaveBeenCalled();
      expect(result).toEqual(mockRepositories);
    });

    it('should return empty array when no repositories exist', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should remove a repository by id', async () => {
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 0
      });

      await repository.remove('repo-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM repositories WHERE id = ?');
      expect(mockStatement.run).toHaveBeenCalledWith('repo-1');
    });

    it('should handle removal of non-existent repository', async () => {
      mockStatement.run.mockReturnValue({
        changes: 0,
        lastInsertRowid: 0
      });

      await repository.remove('non-existent');

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM repositories WHERE id = ?');
      expect(mockStatement.run).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('search', () => {
    it('should search repositories by criteria', async () => {
      const mockRepositories = [
        {
          id: 'repo-1',
          repo_path: '/path/to/repo',
          repo_name: 'test-repo',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockRepositories);

      const criteria = { repo_name: 'test-repo' };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories WHERE repo_name = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('test-repo');
      expect(result).toEqual(mockRepositories);
    });

    it('should search with multiple criteria', async () => {
      const mockRepositories = [
        {
          id: 'repo-1',
          repo_path: '/path/to/repo',
          repo_name: 'test-repo',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockRepositories);

      const criteria = { repo_name: 'test-repo', repo_path: '/path/to/repo' };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM repositories WHERE repo_name = ? AND repo_path = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('test-repo', '/path/to/repo');
      expect(result).toEqual(mockRepositories);
    });

    it('should return all repositories when no criteria provided', async () => {
      const mockRepositories = [
        {
          id: 'repo-1',
          repo_path: '/path/to/repo1',
          repo_name: 'test-repo-1',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'repo-2',
          repo_path: '/path/to/repo2',
          repo_name: 'test-repo-2',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockRepositories);

      const result = await repository.search({});

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories');
      expect(result).toEqual(mockRepositories);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple repositories in a transaction', async () => {
      const repositories = [
        new RepositoryDTO('repo-1', '/path/to/repo1', 'test-repo-1'),
        new RepositoryDTO('repo-2', '/path/to/repo2', 'test-repo-2')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });



      const result = await repository.batchAdd(repositories);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO repositories (id, created_at, updated_at, repo_path, repo_name) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(repositories);
    });

    it('should handle empty batch', async () => {
      const result = await repository.batchAdd([]);

      expect(mockDb.prepare).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle transaction errors', async () => {
      const repositories = [
        new RepositoryDTO('repo-1', '/path/to/repo1', 'test-repo-1')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(repositories)).rejects.toThrow('Transaction failed');
    });
  });

  describe('count', () => {
    it('should return the count of repositories', async () => {
      mockStatement.get.mockReturnValue({ count: 5 });

      const result = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM repositories');
      expect(mockStatement.get).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should return 0 when no repositories exist', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const result = await repository.count();

      expect(result).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle database errors in add operation', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(repository.add(repositoryDto)).rejects.toThrow('Database error');
    });

    it('should handle database errors in get operation', async () => {
      mockStatement.get.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(repository.get('repo-1')).rejects.toThrow('Database error');
    });

    it('should handle database errors in search operation', async () => {
      mockStatement.all.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(repository.search({ repo_name: 'test' })).rejects.toThrow('Database error');
    });
  });

  describe('SQL query generation', () => {
    it('should generate correct INSERT query', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

      await repository.add(repositoryDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO repositories (id, created_at, updated_at, repo_path, repo_name) VALUES (?, ?, ?, ?, ?)'
      );
    });

    it('should generate correct SELECT query for get', async () => {
      mockStatement.get.mockReturnValue(null);

      await repository.get('repo-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM repositories WHERE id = ?');
    });

    it('should generate correct DELETE query', async () => {
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 });

      await repository.remove('repo-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM repositories WHERE id = ?');
    });

    it('should generate correct COUNT query', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM repositories');
    });
  });

  describe('data transformation', () => {
    it('should handle RepositoryDTO properties correctly', async () => {
      const repositoryDto = new RepositoryDTO('repo-1', '/path/to/repo', 'test-repo');
      
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

      await repository.add(repositoryDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[0]).toBe('repo-1'); // id
      expect(runCall[1]).toBe(repositoryDto.created_at); // created_at
      expect(runCall[2]).toBe(repositoryDto.updated_at); // updated_at
      expect(runCall[3]).toBe('/path/to/repo'); // repo_path
      expect(runCall[4]).toBe('test-repo'); // repo_name
    });

    it('should preserve data types in search results', async () => {
      const mockRepository = {
        id: 'repo-1',
        repo_path: '/path/to/repo',
        repo_name: 'test-repo',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockRepository);

      const result = await repository.get('repo-1');

      expect(result).toEqual(mockRepository);
      expect(typeof result?.id).toBe('string');
      expect(typeof result?.repo_path).toBe('string');
      expect(typeof result?.repo_name).toBe('string');
    });
  });
});
