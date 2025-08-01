/**
 * @file FileRelationRepository.test.ts - Unit tests for FileRelationRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { FileRelationRepository } from './FileRelationRepository';
import { FileRelationDTO } from '../models/FileRelationDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('FileRelationRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: FileRelationRepository;

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
      source: 'SELECT * FROM file_relations',
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

    repository = new FileRelationRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(FileRelationRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_relations');
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
    it('should add a file relation successfully', async () => {
      const fileRelationDto = new FileRelationDTO(
        'relation-1',
        'file-service',
        'file-model',
        'DEPENDS_ON'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(fileRelationDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO file_relations (id, created_at, updated_at, file_id, related_file_id, relation_type) VALUES (?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'relation-1',
        fileRelationDto.created_at,
        fileRelationDto.updated_at,
        'file-service',
        'file-model',
        'DEPENDS_ON'
      );
      expect(result).toEqual(fileRelationDto);
    });

    it('should handle different relation types', async () => {
      const relationTypes = [
        { type: 'DEPENDS_ON', description: 'File A depends on File B' },
        { type: 'IMPORTS', description: 'File A imports from File B' },
        { type: 'EXTENDS', description: 'File A extends File B' },
        { type: 'IMPLEMENTS', description: 'File A implements File B' },
        { type: 'REFERENCES', description: 'File A references File B' },
        { type: 'SIMILAR_TO', description: 'File A is similar to File B' },
        { type: 'TESTS', description: 'File A tests File B' },
        { type: 'CONFIGURES', description: 'File A configures File B' }
      ];

      for (let i = 0; i < relationTypes.length; i++) {
        const relationType = relationTypes[i];
        const fileRelationDto = new FileRelationDTO(
          `relation-${i + 1}`,
          'file-a',
          'file-b',
          relationType.type
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(fileRelationDto);

        const runCall = mockStatement.run.mock.calls[i];
        expect(runCall[5]).toBe(relationType.type); // relation_type
      }
    });

    it('should handle bidirectional relationships', async () => {
      const bidirectionalRelations = [
        new FileRelationDTO('rel-1', 'file-a', 'file-b', 'SIMILAR_TO'),
        new FileRelationDTO('rel-2', 'file-b', 'file-a', 'SIMILAR_TO')
      ];
      
      for (const relation of bidirectionalRelations) {
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(relation);
      }

      expect(mockStatement.run).toHaveBeenCalledTimes(2);
    });

    it('should handle complex relationship hierarchies', async () => {
      const hierarchyRelations = [
        // Service layer depends on model layer
        new FileRelationDTO('hier-1', 'file-user-service', 'file-user-model', 'DEPENDS_ON'),
        new FileRelationDTO('hier-2', 'file-order-service', 'file-order-model', 'DEPENDS_ON'),
        
        // Controller layer depends on service layer
        new FileRelationDTO('hier-3', 'file-user-controller', 'file-user-service', 'DEPENDS_ON'),
        new FileRelationDTO('hier-4', 'file-order-controller', 'file-order-service', 'DEPENDS_ON'),
        
        // Test files test their corresponding implementation files
        new FileRelationDTO('hier-5', 'file-user-service.test', 'file-user-service', 'TESTS'),
        new FileRelationDTO('hier-6', 'file-order-service.test', 'file-order-service', 'TESTS')
      ];

      for (const relation of hierarchyRelations) {
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(relation);
      }

      expect(mockStatement.run).toHaveBeenCalledTimes(6);
    });
  });

  describe('get', () => {
    it('should retrieve a file relation by id', async () => {
      const mockFileRelation = {
        id: 'relation-1',
        file_id: 'file-service',
        related_file_id: 'file-model',
        relation_type: 'DEPENDS_ON',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockFileRelation);

      const result = await repository.get('relation-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_relations WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('relation-1');
      expect(result).toEqual(mockFileRelation);
    });

    it('should return null when file relation not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search file relations by source file id', async () => {
      const mockFileRelations = [
        {
          id: 'rel-1',
          file_id: 'file-main',
          related_file_id: 'file-utils',
          relation_type: 'DEPENDS_ON',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rel-2',
          file_id: 'file-main',
          related_file_id: 'file-config',
          relation_type: 'IMPORTS',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rel-3',
          file_id: 'file-main',
          related_file_id: 'file-types',
          relation_type: 'REFERENCES',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileRelations);

      const result = await repository.search({ file_id: 'file-main' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_relations WHERE file_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('file-main');
      expect(result).toEqual(mockFileRelations);
      expect(result).toHaveLength(3);
    });

    it('should search file relations by target file id', async () => {
      const mockFileRelations = [
        {
          id: 'rel-1',
          file_id: 'file-service1',
          related_file_id: 'file-shared',
          relation_type: 'DEPENDS_ON',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rel-2',
          file_id: 'file-service2',
          related_file_id: 'file-shared',
          relation_type: 'IMPORTS',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rel-3',
          file_id: 'file-controller',
          related_file_id: 'file-shared',
          relation_type: 'REFERENCES',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileRelations);

      const result = await repository.search({ related_file_id: 'file-shared' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_relations WHERE related_file_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('file-shared');
      expect(result).toEqual(mockFileRelations);
      expect(result).toHaveLength(3);
    });

    it('should search file relations by relation type', async () => {
      const mockFileRelations = [
        {
          id: 'rel-1',
          file_id: 'file-test1',
          related_file_id: 'file-impl1',
          relation_type: 'TESTS',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'rel-2',
          file_id: 'file-test2',
          related_file_id: 'file-impl2',
          relation_type: 'TESTS',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileRelations);

      const result = await repository.search({ relation_type: 'TESTS' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM file_relations WHERE relation_type = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('TESTS');
      expect(result).toEqual(mockFileRelations);
      expect(result).toHaveLength(2);
    });

    it('should search with multiple criteria', async () => {
      const mockFileRelations = [
        {
          id: 'rel-specific',
          file_id: 'file-service',
          related_file_id: 'file-model',
          relation_type: 'DEPENDS_ON',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockFileRelations);

      const criteria = {
        file_id: 'file-service',
        related_file_id: 'file-model',
        relation_type: 'DEPENDS_ON'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM file_relations WHERE file_id = ? AND related_file_id = ? AND relation_type = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('file-service', 'file-model', 'DEPENDS_ON');
      expect(result).toEqual(mockFileRelations);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple file relations in a transaction', async () => {
      const fileRelations = [
        new FileRelationDTO('rel-1', 'file-a', 'file-b', 'DEPENDS_ON'),
        new FileRelationDTO('rel-2', 'file-b', 'file-c', 'IMPORTS'),
        new FileRelationDTO('rel-3', 'file-c', 'file-d', 'EXTENDS'),
        new FileRelationDTO('rel-4', 'file-test', 'file-a', 'TESTS'),
        new FileRelationDTO('rel-5', 'file-config', 'file-a', 'CONFIGURES')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(fileRelations);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(5);
      expect(result).toEqual(fileRelations);
    });

    it('should handle large batch operations for relationship analysis', async () => {
      // Simulate analyzing relationships in a large codebase
      const relationTypes = ['DEPENDS_ON', 'IMPORTS', 'REFERENCES', 'SIMILAR_TO', 'TESTS'];
      const largeBatch = Array.from({ length: 2000 }, (_, i) => 
        new FileRelationDTO(
          `rel-${i}`,
          `file-${Math.floor(i / 20)}`, // 20 relations per file
          `related-${i % 100}`, // 100 different related files
          relationTypes[i % relationTypes.length]
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeBatch);
      const endTime = Date.now();

      expect(result).toHaveLength(2000);
      expect(mockStatement.run).toHaveBeenCalledTimes(2000);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Should complete efficiently (mock should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('complex query operations', () => {
    it('should support relationship graph analysis', async () => {
      // Get all outgoing relationships from a file
      const mockOutgoingRelations = [
        {
          id: 'out-1',
          file_id: 'file-central',
          related_file_id: 'file-dep1',
          relation_type: 'DEPENDS_ON',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'out-2',
          file_id: 'file-central',
          related_file_id: 'file-dep2',
          relation_type: 'IMPORTS',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'out-3',
          file_id: 'file-central',
          related_file_id: 'file-dep3',
          relation_type: 'REFERENCES',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockOutgoingRelations);

      const result = await repository.search({ file_id: 'file-central' });

      expect(result).toHaveLength(3);
      expect(result.every(rel => rel.file_id === 'file-central')).toBe(true);
    });

    it('should support reverse relationship analysis', async () => {
      // Get all incoming relationships to a file
      const mockIncomingRelations = [
        {
          id: 'in-1',
          file_id: 'file-service1',
          related_file_id: 'file-popular',
          relation_type: 'DEPENDS_ON',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'in-2',
          file_id: 'file-service2',
          related_file_id: 'file-popular',
          relation_type: 'IMPORTS',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'in-3',
          file_id: 'file-controller',
          related_file_id: 'file-popular',
          relation_type: 'REFERENCES',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockIncomingRelations);

      const result = await repository.search({ related_file_id: 'file-popular' });

      expect(result).toHaveLength(3);
      expect(result.every(rel => rel.related_file_id === 'file-popular')).toBe(true);
    });

    it('should handle empty relationship results gracefully', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ file_id: 'file-isolated' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('data aggregations', () => {
    it('should count total file relationships', async () => {
      mockStatement.get.mockReturnValue({ count: 7500 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM file_relations');
      expect(count).toBe(7500);
    });

    it('should handle count with zero results', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const count = await repository.count();

      expect(count).toBe(0);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for repeated operations', async () => {
      const searchCriteria = { relation_type: 'DEPENDS_ON' };
      
      mockStatement.all.mockReturnValue([]);

      // Perform multiple searches
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);

      expect(mockDb.prepare).toHaveBeenCalledTimes(3);
      expect(mockStatement.all).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction rollback on batch operation failure', async () => {
      const fileRelations = [
        new FileRelationDTO('rel-1', 'file-1', 'file-2', 'DEPENDS_ON'),
        new FileRelationDTO('rel-2', 'file-2', 'file-3', 'IMPORTS')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(fileRelations)).rejects.toThrow('Transaction failed');
    });

    it('should support concurrent relationship analysis', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ file_id: 'file-1' }),
        repository.search({ related_file_id: 'file-utils' }),
        repository.search({ relation_type: 'TESTS' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const fileRelationDto = new FileRelationDTO(
        'duplicate-relation',
        'file-1',
        'file-2',
        'DEPENDS_ON'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: file_relations.id');
      });

      await expect(repository.add(fileRelationDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const fileRelationDto = new FileRelationDTO(
        'invalid-relation',
        'non-existent-file',
        'another-non-existent-file',
        'DEPENDS_ON'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(fileRelationDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle self-referential relationships', async () => {
      // File relating to itself
      const selfRelationDto = new FileRelationDTO(
        'self-relation',
        'file-self',
        'file-self',
        'SIMILAR_TO'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(selfRelationDto);
      expect(result).toEqual(selfRelationDto);
    });

    it('should handle invalid relation types gracefully', async () => {
      const invalidRelationDto = new FileRelationDTO(
        'invalid-type-relation',
        'file-1',
        'file-2',
        'INVALID_RELATION_TYPE'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Should still add the relation even with custom relation type
      const result = await repository.add(invalidRelationDto);
      expect(result).toEqual(invalidRelationDto);
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient relationship graph construction', async () => {
      // Simulate building a complex relationship graph
      const relationshipGraph = Array.from({ length: 1000 }, (_, i) => {
        const relationTypes = ['DEPENDS_ON', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'REFERENCES', 'SIMILAR_TO', 'TESTS', 'CONFIGURES'];
        return new FileRelationDTO(
          `graph-rel-${i}`,
          `file-${Math.floor(i / 10)}`, // Each file has ~10 relationships
          `target-${(i * 3) % 200}`, // Distributed targets
          relationTypes[i % relationTypes.length]
        );
      });

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(relationshipGraph);

      expect(result).toHaveLength(1000);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(1000);
    });

    it('should handle relationship deduplication', async () => {
      // Test adding the same relationship multiple times
      const duplicateRelation = new FileRelationDTO(
        'duplicate-test',
        'file-source',
        'file-target',
        'DEPENDS_ON'
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Add the same relationship multiple times
      await repository.add(duplicateRelation);
      await repository.add(duplicateRelation);
      await repository.add(duplicateRelation);

      // Should use INSERT OR REPLACE, so no errors expected
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });

    it('should support efficient relationship pattern queries', async () => {
      const patternQueries = [
        repository.search({ relation_type: 'DEPENDS_ON' }),
        repository.search({ relation_type: 'IMPORTS' }),
        repository.search({ relation_type: 'TESTS' }),
        repository.search({ relation_type: 'EXTENDS' }),
        repository.search({ relation_type: 'IMPLEMENTS' })
      ];

      mockStatement.all.mockReturnValue([]);

      const results = await Promise.all(patternQueries);

      expect(results).toHaveLength(5);
      expect(mockDb.prepare).toHaveBeenCalledTimes(5);
      expect(mockStatement.all).toHaveBeenCalledTimes(5);
    });

    it('should handle complex relationship hierarchies efficiently', async () => {
      // Test various relationship patterns: inheritance, composition, aggregation
      const hierarchyRelations = [
        // Inheritance hierarchy
        new FileRelationDTO('inherit-1', 'file-child1', 'file-parent', 'EXTENDS'),
        new FileRelationDTO('inherit-2', 'file-child2', 'file-parent', 'EXTENDS'),
        new FileRelationDTO('inherit-3', 'file-grandchild', 'file-child1', 'EXTENDS'),
        
        // Interface implementation
        new FileRelationDTO('impl-1', 'file-impl1', 'file-interface', 'IMPLEMENTS'),
        new FileRelationDTO('impl-2', 'file-impl2', 'file-interface', 'IMPLEMENTS'),
        
        // Composition relationships
        new FileRelationDTO('comp-1', 'file-composite', 'file-component1', 'DEPENDS_ON'),
        new FileRelationDTO('comp-2', 'file-composite', 'file-component2', 'DEPENDS_ON'),
        new FileRelationDTO('comp-3', 'file-composite', 'file-component3', 'DEPENDS_ON'),
        
        // Test relationships
        new FileRelationDTO('test-1', 'file-test1', 'file-impl1', 'TESTS'),
        new FileRelationDTO('test-2', 'file-test2', 'file-impl2', 'TESTS'),
        new FileRelationDTO('test-3', 'file-integration-test', 'file-composite', 'TESTS')
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(hierarchyRelations);

      expect(result).toHaveLength(11);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(11);
    });
  });
});
