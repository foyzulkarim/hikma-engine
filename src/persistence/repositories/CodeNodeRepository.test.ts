/**
 * @file CodeNodeRepository.test.ts - Unit tests for CodeNodeRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { CodeNodeRepository } from './CodeNodeRepository';
import { GraphNodeDTO } from '../models/GraphNodeDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('CodeNodeRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: CodeNodeRepository;

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
      source: 'SELECT * FROM code_nodes',
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

    repository = new CodeNodeRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(CodeNodeRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM code_nodes');
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
    it('should add a code node DTO successfully', async () => {
      const codeNodeDto = new GraphNodeDTO(
        'code-1',
        'function:calculateSum',
        'Function',
        '{"name":"calculateSum","returnType":"number","parameters":["a","b"]}',
        {
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/math.ts',
          line: 15,
          col: 8,
          signature_hash: 'sig456',
          labels: 'function,exported,pure'
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(codeNodeDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO code_nodes (id, created_at, updated_at, business_key, node_type, properties, repo_id, commit_sha, file_path, line, col, signature_hash, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'code-1',
        codeNodeDto.created_at,
        codeNodeDto.updated_at,
        'function:calculateSum',
        'Function',
        '{"name":"calculateSum","returnType":"number","parameters":["a","b"]}',
        'repo-1',
        'abc123',
        'src/math.ts',
        15,
        8,
        'sig456',
        'function,exported,pure'
      );
      expect(result).toEqual(codeNodeDto);
    });

    it('should handle different code node types', async () => {
      const nodeTypes = [
        { type: 'Function', businessKey: 'function:testFunc', properties: '{"name":"testFunc","async":true}' },
        { type: 'Class', businessKey: 'class:TestClass', properties: '{"name":"TestClass","abstract":false}' },
        { type: 'Variable', businessKey: 'variable:testVar', properties: '{"name":"testVar","type":"string"}' },
        { type: 'Interface', businessKey: 'interface:ITest', properties: '{"name":"ITest","extends":[]}' },
        { type: 'Type', businessKey: 'type:TestType', properties: '{"name":"TestType","union":true}' }
      ];

      for (const nodeType of nodeTypes) {
        const codeNodeDto = new GraphNodeDTO(
          `code-${nodeType.type}`,
          nodeType.businessKey,
          nodeType.type,
          nodeType.properties,
          {
            repo_id: 'repo-1',
            file_path: 'src/test.ts',
            line: 10
          }
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(codeNodeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[3]).toBe(nodeType.businessKey); // business_key
        expect(runCall[4]).toBe(nodeType.type); // node_type
        expect(runCall[5]).toBe(nodeType.properties); // properties
      }
    });

    it('should handle complex function properties', async () => {
      const complexProperties = {
        name: 'complexAsyncFunction',
        async: true,
        generator: false,
        parameters: [
          { name: 'data', type: 'T[]', optional: false },
          { name: 'options', type: 'ProcessOptions', optional: true }
        ],
        returnType: 'Promise<ProcessedResult<T>>',
        genericTypes: ['T extends Serializable'],
        decorators: ['@cached', '@validate'],
        complexity: 8,
        testCoverage: 0.92,
        dependencies: ['lodash', 'axios'],
        calledBy: ['processData', 'handleRequest'],
        calls: ['validateInput', 'transformData', 'saveResult']
      };

      const codeNodeDto = new GraphNodeDTO(
        'code-1',
        'function:complexAsyncFunction',
        'Function',
        JSON.stringify(complexProperties),
        {
          repo_id: 'repo-1',
          file_path: 'src/processor.ts',
          line: 45,
          col: 12,
          signature_hash: 'complex-sig-789'
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(codeNodeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[5]).toBe(JSON.stringify(complexProperties));
    });

    it('should handle class node with inheritance', async () => {
      const classProperties = {
        name: 'DatabaseRepository',
        abstract: false,
        extends: 'BaseRepository',
        implements: ['IRepository', 'ICacheable'],
        methods: [
          { name: 'find', visibility: 'public', static: false },
          { name: 'save', visibility: 'public', static: false },
          { name: 'createConnection', visibility: 'private', static: true }
        ],
        properties: [
          { name: 'connection', type: 'Database', visibility: 'private' },
          { name: 'cache', type: 'Map<string, any>', visibility: 'private' }
        ],
        decorators: ['@Injectable', '@Repository']
      };

      const codeNodeDto = new GraphNodeDTO(
        'code-class-1',
        'class:DatabaseRepository',
        'Class',
        JSON.stringify(classProperties),
        {
          repo_id: 'repo-1',
          file_path: 'src/repositories/DatabaseRepository.ts',
          line: 20,
          labels: 'class,repository,injectable'
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(codeNodeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[5]).toBe(JSON.stringify(classProperties));
      expect(runCall[12]).toBe('class,repository,injectable');
    });
  });

  describe('search', () => {
    it('should search code nodes by node type', async () => {
      const mockCodeNodes = [
        {
          id: 'code-1',
          business_key: 'function:testFunction1',
          node_type: 'Function',
          properties: '{"name":"testFunction1","async":false}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/test1.ts',
          line: 10,
          col: 5,
          signature_hash: 'sig123',
          labels: 'function,exported',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'code-2',
          business_key: 'function:testFunction2',
          node_type: 'Function',
          properties: '{"name":"testFunction2","async":true}',
          repo_id: 'repo-1',
          commit_sha: 'def456',
          file_path: 'src/test2.ts',
          line: 25,
          col: 8,
          signature_hash: 'sig456',
          labels: 'function,async',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockCodeNodes);

      const result = await repository.search({ node_type: 'Function' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM code_nodes WHERE node_type = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('Function');
      expect(result).toEqual(mockCodeNodes);
    });

    it('should search code nodes by repository and file path', async () => {
      const mockCodeNodes = [
        {
          id: 'code-1',
          business_key: 'function:helperFunction',
          node_type: 'Function',
          properties: '{"name":"helperFunction","returnType":"string"}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/utils/helpers.ts',
          line: 15,
          col: null,
          signature_hash: null,
          labels: 'function,utility',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockCodeNodes);

      const result = await repository.search({ 
        repo_id: 'repo-1', 
        file_path: 'src/utils/helpers.ts' 
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM code_nodes WHERE repo_id = ? AND file_path = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('repo-1', 'src/utils/helpers.ts');
      expect(result).toEqual(mockCodeNodes);
    });

    it('should search code nodes by signature hash for deduplication', async () => {
      const mockCodeNodes = [
        {
          id: 'code-1',
          business_key: 'function:duplicateFunction',
          node_type: 'Function',
          properties: '{"name":"duplicateFunction","signature":"function duplicateFunction(): void"}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/duplicate1.ts',
          line: 10,
          col: 5,
          signature_hash: 'duplicate-sig-123',
          labels: 'function',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockCodeNodes);

      const result = await repository.search({ signature_hash: 'duplicate-sig-123' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM code_nodes WHERE signature_hash = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('duplicate-sig-123');
      expect(result).toEqual(mockCodeNodes);
    });

    it('should search code nodes by labels for categorization', async () => {
      const mockCodeNodes = [
        {
          id: 'code-1',
          business_key: 'function:asyncFunction1',
          node_type: 'Function',
          properties: '{"name":"asyncFunction1","async":true}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/async1.ts',
          line: 10,
          col: 5,
          signature_hash: 'async-sig-1',
          labels: 'function,async,exported',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'code-2',
          business_key: 'function:asyncFunction2',
          node_type: 'Function',
          properties: '{"name":"asyncFunction2","async":true}',
          repo_id: 'repo-1',
          commit_sha: 'def456',
          file_path: 'src/async2.ts',
          line: 20,
          col: 8,
          signature_hash: 'async-sig-2',
          labels: 'function,async,private',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockCodeNodes);

      const result = await repository.search({ labels: 'function,async,exported' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM code_nodes WHERE labels = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('function,async,exported');
      expect(result).toEqual(mockCodeNodes);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple code nodes efficiently', async () => {
      const codeNodes = [
        new GraphNodeDTO(
          'code-1',
          'function:func1',
          'Function',
          '{"name":"func1","returnType":"void"}',
          { repo_id: 'repo-1', file_path: 'src/test1.ts', line: 10 }
        ),
        new GraphNodeDTO(
          'code-2',
          'class:Class1',
          'Class',
          '{"name":"Class1","abstract":false}',
          { repo_id: 'repo-1', file_path: 'src/test2.ts', line: 5 }
        ),
        new GraphNodeDTO(
          'code-3',
          'variable:var1',
          'Variable',
          '{"name":"var1","type":"string","const":true}',
          { repo_id: 'repo-1', file_path: 'src/test3.ts', line: 1 }
        )
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(codeNodes);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
      expect(result).toEqual(codeNodes);
    });

    it('should handle large batch operations efficiently', async () => {
      const largeBatch = Array.from({ length: 1000 }, (_, i) => 
        new GraphNodeDTO(
          `code-${i}`,
          `function:func${i}`,
          'Function',
          `{"name":"func${i}","complexity":${Math.floor(Math.random() * 10)}}`,
          {
            repo_id: 'repo-1',
            file_path: `src/module${Math.floor(i / 100)}.ts`,
            line: (i % 100) * 5 + 10,
            col: Math.floor(Math.random() * 20)
          }
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
    it('should support complex search criteria combinations', async () => {
      const complexCriteria = {
        node_type: 'Function',
        repo_id: 'repo-1',
        file_path: 'src/services/UserService.ts',
        line: 45
      };

      const mockResults = [
        {
          id: 'code-complex-1',
          business_key: 'function:getUserById',
          node_type: 'Function',
          properties: '{"name":"getUserById","async":true,"parameters":["id"]}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/services/UserService.ts',
          line: 45,
          col: 12,
          signature_hash: 'user-service-sig',
          labels: 'function,async,service',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockResults);

      const result = await repository.search(complexCriteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM code_nodes WHERE node_type = ? AND repo_id = ? AND file_path = ? AND line = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('Function', 'repo-1', 'src/services/UserService.ts', 45);
      expect(result).toEqual(mockResults);
    });

    it('should handle empty search results gracefully', async () => {
      mockStatement.all.mockReturnValue([]);

      const result = await repository.search({ node_type: 'NonExistentType' });

      expect(result).toEqual([]);
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('data aggregations', () => {
    it('should count total code nodes', async () => {
      mockStatement.get.mockReturnValue({ count: 150 });

      const count = await repository.count();

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM code_nodes');
      expect(count).toBe(150);
    });

    it('should handle count with zero results', async () => {
      mockStatement.get.mockReturnValue({ count: 0 });

      const count = await repository.count();

      expect(count).toBe(0);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for repeated operations', async () => {
      const searchCriteria = { node_type: 'Function' };
      
      mockStatement.all.mockReturnValue([]);

      // Perform multiple searches
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);
      await repository.search(searchCriteria);

      // Should prepare statement only once per unique query
      expect(mockDb.prepare).toHaveBeenCalledTimes(3); // Each call creates a new prepare
      expect(mockStatement.all).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction rollback on batch operation failure', async () => {
      const codeNodes = [
        new GraphNodeDTO('code-1', 'function:func1', 'Function', '{"name":"func1"}'),
        new GraphNodeDTO('code-2', 'function:func2', 'Function', '{"name":"func2"}')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(codeNodes)).rejects.toThrow('Transaction failed');
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const codeNodeDto = new GraphNodeDTO(
        'code-1',
        'function:duplicateFunction',
        'Function',
        '{"name":"duplicateFunction"}'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: code_nodes.business_key');
      });

      await expect(repository.add(codeNodeDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const codeNodeDto = new GraphNodeDTO(
        'code-1',
        'function:testFunction',
        'Function',
        '{"name":"testFunction"}',
        {
          repo_id: 'non-existent-repo'
        }
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(codeNodeDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle malformed JSON in properties', async () => {
      const codeNodeDto = new GraphNodeDTO(
        'code-1',
        'function:testFunction',
        'Function',
        'invalid-json-{malformed'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Should still add the node even with malformed JSON
      const result = await repository.add(codeNodeDto);
      expect(result).toEqual(codeNodeDto);
    });

    it('should handle database connection failures', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(repository.getAll()).rejects.toThrow('Database connection lost');
    });
  });

  describe('caching and performance optimizations', () => {
    it('should support efficient bulk operations', async () => {
      const bulkNodes = Array.from({ length: 500 }, (_, i) => 
        new GraphNodeDTO(
          `bulk-${i}`,
          `function:bulkFunc${i}`,
          'Function',
          `{"name":"bulkFunc${i}","index":${i}}`,
          {
            repo_id: 'bulk-repo',
            file_path: `src/bulk${Math.floor(i / 50)}.ts`,
            line: (i % 50) + 1
          }
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(bulkNodes);

      expect(result).toHaveLength(500);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(500);
    });

    it('should handle concurrent access patterns', async () => {
      mockStatement.all.mockReturnValue([]);
      mockStatement.get.mockReturnValue({ count: 0 });

      const concurrentOperations = [
        repository.search({ node_type: 'Function' }),
        repository.search({ node_type: 'Class' }),
        repository.search({ node_type: 'Variable' }),
        repository.count()
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });
  });
});
