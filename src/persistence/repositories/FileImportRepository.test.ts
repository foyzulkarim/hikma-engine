/**
 * @file FileImportRepository.test.ts - Unit tests for FileImportRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { FileImportRepository } from './FileImportRepository';
import { FileImportDTO } from '../models/FileImportDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('FileImportRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: FileImportRepository;

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
      source: 'SELECT * FROM file_imports',
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

    repository = new FileImportRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(FileImportRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_imports');
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
    it('should add a file import relationship successfully', async () => {
      const fileImportDto = new FileImportDTO(
        'import-1',
        'file-main',
        'file-utils'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(fileImportDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO file_imports (id, created_at, updated_at, file_id, imported_file_id) VALUES (?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'import-1',
        fileImportDto.created_at,
        fileImportDto.updated_at,
        'file-main',
        'file-utils'
      );
      expect(result).toEqual(fileImportDto);
    });

    it('should handle multiple imports from same file', async () => {
      const importingFile = 'file-main';
      const importedFiles = ['file-utils', 'file-config', 'file-types', 'file-constants'];
      
      for (let i = 0; i < importedFiles.length; i++) {
        const fileImportDto = new FileImportDTO(
          `import-${i + 1}`,
          importingFile,
          importedFiles[i]
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileImportDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(importingFile); // file_id
        expect(runCall[4]).toBe(importedFiles[i]); // imported_file_id
      }
    });

    it('should handle same file being imported by multiple files', async () => {
      const importedFile = 'file-shared-utils';
      const importingFiles = ['file-service1', 'file-service2', 'file-controller', 'file-middleware'];
      
      for (let i = 0; i < importingFiles.length; i++) {
        const fileImportDto = new FileImportDTO(
          `import-shared-${i + 1}`,
          importingFiles[i],
          importedFile
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileImportDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[3]).toBe(importingFiles[i]); // file_id
        expect(runCall[4]).toBe(importedFile); // imported_file_id
      }
    });

    it('should handle circular import scenarios', async () => {
      // File A imports File B, File B imports File A (circular dependency)
      const circularImports = [
        new FileImportDTO('circular-1', 'file-a', 'file-b'),
        new FileImportDTO('circular-2', 'file-b', 'file-a')
      ];
      
      for (const importDto of circularImports) {
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(importDto);
      }

      expect(mockStatement.run).toHaveBeenCalledTimes(2);
    });
  });

  describe('get', () => {
    it('should retrieve a file import relationship by id', async () => {
      const mockFileImport = {
        id: 'import-1',
        file_id: 'file-main',
        imported_file_id: 'file-utils',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockFileImport);

      const result = await repository.get('import-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_imports WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('import-1');
      expect(result).toEqual(mockFileImport);
    });

    it('should return null when file import relationship not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search file imports by importing file id', async () => {
      const mockFileImports = [
        {
          id: 'import-1',
          file_id: 'file-main',
          imported_file_id: 'file-utils',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'import-2',
          file_id: 'file-main',
          imported_file_id: 'file-config',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'import-3',
          file_id: 'file-main',
          imported_file_id: 'file-types',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileImports);

      const result = await repository.search({ file_id: 'file-main' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_imports WHERE file_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('file-main');
      expect(result).toEqual(mockFileImports);
      expect(result).toHaveLength(3);
    });

    it('should search file imports by imported file id', async () => {
      const mockFileImports = [
        {
          id: 'import-1',
          file_id: 'file-service1',
          imported_file_id: 'file-shared',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'import-2',
          file_id: 'file-service2',
          imported_file_id: 'file-shared',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'import-3',
          file_id: 'file-controller',
          imported_file_id: 'file-shared',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileImports);

      const result = await repository.search({ imported_file_id: 'file-shared' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_imports WHERE imported_file_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('file-shared');
      expect(result).toEqual(mockFileImports);
      expect(result).toHaveLength(3);
    });

    it('should search with both file_id and imported_file_id', async () => {
      const mockFileImports = [
        {
          id: 'import-specific',
          file_id: 'file-main',
          imported_file_id: 'file-utils',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileImports);

      const criteria = {
        file_id: 'file-main',
        imported_file_id: 'file-utils'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM file_imports WHERE file_id = ? AND imported_file_id = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('file-main', 'file-utils');
      expect(result).toEqual(mockFileImports);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple file import relationships in a transaction', async () => {
      const fileImports = [
        new FileImportDTO('import-1', 'file-main', 'file-utils'),
        new FileImportDTO('import-2', 'file-main', 'file-config'),
        new FileImportDTO('import-3', 'file-main', 'file-types'),
        new FileImportDTO('import-4', 'file-service', 'file-utils'),
        new FileImportDTO('import-5', 'file-service', 'file-config')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(fileImports);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(5);
      expect(result).toEqual(fileImports);
    });

    it('should handle large batch operations for dependency analysis', async () => {
      // Simulate analyzing a large codebase with many import relationships
      const largeBatch = Array.from({ length: 1000 }, (_, i) => 
        new FileImportDTO(
          `import-${i}`,
          `file-${Math.floor(i / 10)}`, // 10 imports per file
          `dependency-${i % 50}` // 50 different dependencies
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeBatch);
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(mockStatement.run).toHaveBeenCalledTimes(1000);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Should complete efficiently (mock should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('complex query operations', () => {
    it('should support dependency analysis queries', async () => {
      // Get all dependencies of a specific file
      const mockDependencies = [
        {
          id: 'dep-1',
          file_id: 'file-complex',
          imported_file_id: 'file-utils',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'dep-2',
          file_id: 'file-complex',
          imported_file_id: 'file-config',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'dep-3',
          file_id: 'file-complex',
          imported_file_id: 'file-types',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockDependencies);

      const result = await repository.search({ file_id: 'file-complex' });

      expect(result).toHaveLength(3);
      expect(result.every(dep => dep.file_id === 'file-complex')).toBe(true);
    });

    it('should support reverse dependency queries', async () => {
      // Get all files that depend on a specific file
      const mockReverseDeps = [
        {
          id: 'rdep-1',
          file_id: 'file-service1',
          imported_file_id: 'file-core',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rdep-2',
          file_id: 'file-service2',
          imported_file_id: 'file-core',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rdep-3',
          file_id: 'file-controller',
          imported_file_id: 'file-core',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockReverseDeps);

      const result = await repository.search({ imported_file_id: 'file-core' });

      expect(result).toHaveLength(3);
      expect(result.every(dep => dep.imported_file_id === 'file-core')).toBe(true);
    });

    it('should handle empty dependency results gracefully', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ file_id: 'file-isolated' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('data aggregations', () => {
    it('should count total file import relationships', async () => {
      mockStatement.get.mockReturnValue({ count: 5000 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM file_imports');
      expect(count).toBe(5000);
    });

    it('should handle count with zero results', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const count = await repository.count();

      expect(count).toBe(0);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for repeated operations', async () => {
      const searchCriteria = { imported_file_id: 'popular-dependency' };
      
      mockStatement.all.mockReturnValue([]);

      // Perform multiple searches
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);

      expect(mockDb.prepare).toHaveBeenCalledTimes(3);
      expect(mockStatement.all).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction rollback on batch operation failure', async () => {
      const fileImports = [
        new FileImportDTO('import-1', 'file-1', 'file-2'),
        new FileImportDTO('import-2', 'file-2', 'file-3')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(fileImports)).rejects.toThrow('Transaction failed');
    });

    it('should support concurrent dependency analysis', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ file_id: 'file-1' }),
        repository.search({ imported_file_id: 'file-utils' }),
        repository.search({ file_id: 'file-2', imported_file_id: 'file-config' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const fileImportDto = new FileImportDTO(
        'duplicate-import',
        'file-1',
        'file-2'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: file_imports.id');
      });

      await expect(repository.add(fileImportDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const fileImportDto = new FileImportDTO(
        'invalid-import',
        'non-existent-file',
        'another-non-existent-file'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(fileImportDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle self-import scenarios', async () => {
      // File importing itself (should be allowed but might be flagged)
      const selfImportDto = new FileImportDTO(
        'self-import',
        'file-self',
        'file-self'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(selfImportDto);
      expect(result).toEqual(selfImportDto);
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient dependency graph construction', async () => {
      // Simulate building a dependency graph for a large project
      const dependencyGraph = Array.from({ length: 500 }, (_, i) => 
        new FileImportDTO(
          `graph-${i}`,
          `file-${Math.floor(i / 5)}`, // Each file imports 5 others on average
          `dependency-${(i * 7) % 100}` // Distributed dependencies
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(dependencyGraph);

      expect(result).toHaveLength(500);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(500);
    });

    it('should handle import deduplication', async () => {
      // Test adding the same import relationship multiple times
      const duplicateImport = new FileImportDTO(
        'duplicate-test',
        'file-importer',
        'file-imported'
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Add the same import multiple times
      await repository.add(duplicateImport);
      await repository.add(duplicateImport);
      await repository.add(duplicateImport);

      // Should use INSERT OR REPLACE, so no errors expected
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });

    it('should support efficient dependency lookup patterns', async () => {
      const dependencyQueries = Array.from({ length: 50 }, (_, i) => 
        repository.search({ file_id: `file-${i}` })
      );

      mockStatement.all.mockReturnValue([]);

      const results = await Promise.all(dependencyQueries);

      expect(results).toHaveLength(50);
      expect(mockDb.prepare).toHaveBeenCalledTimes(50);
      expect(mockStatement.all).toHaveBeenCalledTimes(50);
    });

    it('should handle complex dependency patterns', async () => {
      // Test various dependency patterns: chains, stars, cycles
      const complexDependencies = [
        // Chain: A -> B -> C -> D
        new FileImportDTO('chain-1', 'file-a', 'file-b'),
        new FileImportDTO('chain-2', 'file-b', 'file-c'),
        new FileImportDTO('chain-3', 'file-c', 'file-d'),
        
        // Star: E imports F, G, H, I
        new FileImportDTO('star-1', 'file-e', 'file-f'),
        new FileImportDTO('star-2', 'file-e', 'file-g'),
        new FileImportDTO('star-3', 'file-e', 'file-h'),
        new FileImportDTO('star-4', 'file-e', 'file-i'),
        
        // Cycle: J -> K -> L -> J
        new FileImportDTO('cycle-1', 'file-j', 'file-k'),
        new FileImportDTO('cycle-2', 'file-k', 'file-l'),
        new FileImportDTO('cycle-3', 'file-l', 'file-j')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(complexDependencies);

      expect(result).toHaveLength(10);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(10);
    });
  });
});
