/**
 * @file FileRepository.test.ts - Unit tests for FileRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { FileRepository } from './FileRepository';
import { FileDTO } from '../models/FileDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('FileRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: FileRepository;

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
      source: 'SELECT * FROM files',
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

    repository = new FileRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(FileRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM files');
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
    it('should add a file DTO successfully', async () => {
      const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {
        file_extension: '.ts',
        language: 'typescript',
        size_kb: 1.5,
        content_hash: 'abc123',
        file_type: 'source'
      });
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(fileDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO files (id, created_at, updated_at, repo_id, file_path, file_name, file_extension, language, size_kb, content_hash, file_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'file-1',
        fileDto.created_at,
        fileDto.updated_at,
        'repo-1',
        'src/test.ts',
        'test.ts',
        '.ts',
        'typescript',
        1.5,
        'abc123',
        'source'
      );
      expect(result).toEqual(fileDto);
    });

    it('should handle optional fields correctly', async () => {
      const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts');
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(fileDto);

      const runCall = mockStatement.run.mock.calls[0];
      // The FileDTO only includes defined properties, so we check the actual call structure
      expect(runCall[0]).toBe('file-1'); // id
      expect(runCall[1]).toBe(fileDto.created_at); // created_at
      expect(runCall[2]).toBe(fileDto.updated_at); // updated_at
      expect(runCall[3]).toBe('repo-1'); // repo_id
      expect(runCall[4]).toBe('src/test.ts'); // file_path
      expect(runCall[5]).toBe('test.ts'); // file_name
      // Optional fields are not included in the DTO when undefined
      expect(runCall.length).toBe(6);
    });

    it('should handle JSON string fields correctly', async () => {
      const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {
        imports: '["fs", "path"]',
        exports: '["testFunction", "TestClass"]'
      });
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(fileDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain('["fs", "path"]');
      expect(runCall).toContain('["testFunction", "TestClass"]');
    });

    it('should handle file type enum correctly', async () => {
      const testCases: Array<{ file_type: 'source' | 'test' | 'config' | 'dev' | 'vendor' }> = [
        { file_type: 'source' },
        { file_type: 'test' },
        { file_type: 'config' },
        { file_type: 'dev' },
        { file_type: 'vendor' }
      ];

      for (const testCase of testCases) {
        const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', testCase);
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall).toContain(testCase.file_type);
      }
    });
  });

  describe('get', () => {
    it('should retrieve a file by id', async () => {
      const mockFile = {
        id: 'file-1',
        repo_id: 'repo-1',
        file_path: 'src/test.ts',
        file_name: 'test.ts',
        file_extension: '.ts',
        language: 'typescript',
        size_kb: 1.5,
        content_hash: 'abc123',
        file_type: 'source',
        ai_summary: 'Test file summary',
        imports: '["fs", "path"]',
        exports: '["testFunction"]',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockFile);

      const result = await repository.get('file-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM files WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('file-1');
      expect(result).toEqual(mockFile);
    });

    it('should return null when file not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search files by repository id', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          repo_id: 'repo-1',
          file_path: 'src/test1.ts',
          file_name: 'test1.ts',
          file_extension: '.ts',
          language: 'typescript',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'file-2',
          repo_id: 'repo-1',
          file_path: 'src/test2.ts',
          file_name: 'test2.ts',
          file_extension: '.ts',
          language: 'typescript',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFiles);

      const result = await repository.search({ repo_id: 'repo-1' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM files WHERE repo_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('repo-1');
      expect(result).toEqual(mockFiles);
    });

    it('should search files by language', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          repo_id: 'repo-1',
          file_path: 'src/test.py',
          file_name: 'test.py',
          file_extension: '.py',
          language: 'python',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFiles);

      const result = await repository.search({ language: 'python' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM files WHERE language = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('python');
      expect(result).toEqual(mockFiles);
    });

    it('should search files by file type', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          repo_id: 'repo-1',
          file_path: 'tests/test.spec.ts',
          file_name: 'test.spec.ts',
          file_extension: '.ts',
          language: 'typescript',
          file_type: 'test',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFiles);

      const result = await repository.search({ file_type: 'test' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM files WHERE file_type = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('test');
      expect(result).toEqual(mockFiles);
    });

    it('should search with multiple criteria', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          repo_id: 'repo-1',
          file_path: 'src/test.ts',
          file_name: 'test.ts',
          file_extension: '.ts',
          language: 'typescript',
          file_type: 'source',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFiles);

      const criteria = { 
        repo_id: 'repo-1', 
        language: 'typescript',
        file_type: 'source' as const
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM files WHERE repo_id = ? AND language = ? AND file_type = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('repo-1', 'typescript', 'source');
      expect(result).toEqual(mockFiles);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple files in a transaction', async () => {
      const files = [
        new FileDTO('file-1', 'repo-1', 'src/test1.ts', 'test1.ts', {
          language: 'typescript',
          file_type: 'source'
        }),
        new FileDTO('file-2', 'repo-1', 'src/test2.ts', 'test2.ts', {
          language: 'typescript',
          file_type: 'source'
        })
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(files);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(files);
    });

    it('should handle files with different optional properties', async () => {
      const files = [
        new FileDTO('file-1', 'repo-1', 'src/test1.ts', 'test1.ts', {
          language: 'typescript',
          size_kb: 1.5,
          content_hash: 'abc123'
        }),
        new FileDTO('file-2', 'repo-1', 'src/test2.js', 'test2.js', {
          language: 'javascript',
          file_type: 'source',
          ai_summary: 'JavaScript test file'
        })
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(files);

      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(files);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for batch operations', async () => {
      const files = Array.from({ length: 100 }, (_, i) => 
        new FileDTO(`file-${i}`, 'repo-1', `src/test${i}.ts`, `test${i}.ts`)
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.batchAdd(files);

      // Should prepare statement only once for batch operation
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      // Should run the statement for each file
      expect(mockStatement.run).toHaveBeenCalledTimes(100);
      // Should use transaction for batch operation
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should handle large batch sizes efficiently', async () => {
      const largeFileSet = Array.from({ length: 1000 }, (_, i) => 
        new FileDTO(`file-${i}`, 'repo-1', `src/file${i}.ts`, `file${i}.ts`, {
          language: 'typescript',
          size_kb: Math.random() * 10,
          content_hash: `hash-${i}`
        })
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeFileSet);
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(mockStatement.run).toHaveBeenCalledTimes(1000);
      // Verify it completes in reasonable time (this is a mock, so it should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('data transformation and validation', () => {
    it('should handle file size as number', async () => {
      const fileDto = new FileDTO('file-1', 'repo-1', 'src/large.ts', 'large.ts', {
        size_kb: 15.75
      });
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(fileDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain(15.75);
    });

    it('should preserve file path structure', async () => {
      const complexPath = 'src/components/ui/forms/validation/EmailValidator.tsx';
      const fileDto = new FileDTO('file-1', 'repo-1', complexPath, 'EmailValidator.tsx', {
        language: 'typescript',
        file_type: 'source'
      });
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(fileDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain(complexPath);
    });

    it('should handle special characters in file names', async () => {
      const specialFileName = 'test-file_with-special@chars.spec.ts';
      const fileDto = new FileDTO('file-1', 'repo-1', `tests/${specialFileName}`, specialFileName, {
        language: 'typescript',
        file_type: 'test'
      });
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(fileDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall).toContain(specialFileName);
    });

    it('should handle content hash validation', async () => {
      const contentHashes = [
        'sha256:abc123def456',
        'md5:098f6bcd4621d373cade4e832627b4f6',
        'simple-hash-123'
      ];

      for (const hash of contentHashes) {
        const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {
          content_hash: hash
        });
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall).toContain(hash);
      }
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts');
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: files.id');
      });

      await expect(repository.add(fileDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const fileDto = new FileDTO('file-1', 'non-existent-repo', 'src/test.ts', 'test.ts');
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(fileDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle transaction rollback in batch operations', async () => {
      const files = [
        new FileDTO('file-1', 'repo-1', 'src/test1.ts', 'test1.ts'),
        new FileDTO('file-2', 'repo-1', 'src/test2.ts', 'test2.ts')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(files)).rejects.toThrow('Transaction failed');
    });
  });

  describe('SQL query generation', () => {
    it('should generate correct INSERT query with all fields', async () => {
      const fileDto = new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {
        file_extension: '.ts',
        language: 'typescript',
        size_kb: 1.5,
        content_hash: 'abc123',
        file_type: 'source',
        ai_summary: 'Test summary',
        imports: '["fs"]',
        exports: '["test"]'
      });
      
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

      await repository.add(fileDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO files (id, created_at, updated_at, repo_id, file_path, file_name, file_extension, language, size_kb, content_hash, file_type, ai_summary, imports, exports) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
    });

    it('should generate correct search queries with different criteria combinations', async () => {
      const testCases = [
        { criteria: { repo_id: 'repo-1' }, expectedWhere: 'repo_id = ?' },
        { criteria: { language: 'typescript' }, expectedWhere: 'language = ?' },
        { criteria: { file_type: 'test' as const }, expectedWhere: 'file_type = ?' },
        { 
          criteria: { repo_id: 'repo-1', language: 'typescript' }, 
          expectedWhere: 'repo_id = ? AND language = ?' 
        }
      ];

      for (const testCase of testCases) {
        mockStatement.all.mockReturnValue([]);
        
        await repository.search(testCase.criteria);

        expect(mockDb.prepare).toHaveBeenCalledWith(
          `SELECT * FROM files WHERE ${testCase.expectedWhere}`
        );
      }
    });
  });
});
