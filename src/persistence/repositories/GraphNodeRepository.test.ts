/**
 * @file GraphNodeRepository.test.ts - Unit tests for GraphNodeRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { GraphNodeRepository } from './GraphNodeRepository';
import { GraphNodeDTO } from '../models/GraphNodeDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('GraphNodeRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: GraphNodeRepository;

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
      source: 'SELECT * FROM graph_nodes',
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

    repository = new GraphNodeRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(GraphNodeRepository);
      // Verify the table name is set correctly by checking pre
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_nodes');
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
    it('should add a graph node DTO successfully', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
        'function:testFunction',
        'Function',
        '{"name":"testFunction","returnType":"string"}',
        {
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/test.ts',
          line: 10,
          col: 5,
          signature_hash: 'sig123',
          labels: 'function,exported'
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(nodeDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO graph_nodes (id, created_at, updated_at, business_key, node_type, properties, repo_id, commit_sha, file_path, line, col, signature_hash, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'node-1',
        nodeDto.created_at,
        nodeDto.updated_at,
        'function:testFunction',
        'Function',
        '{"name":"testFunction","returnType":"string"}',
        'repo-1',
        'abc123',
        'src/test.ts',
        10,
        5,
        'sig123',
        'function,exported'
      );
      expect(result).toEqual(nodeDto);
    });

    it('should handle minimal node with only required fields', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
        'class:TestClass',
        'Class',
        '{"name":"TestClass"}'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(nodeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[0]).toBe('node-1'); // id
      expect(runCall[3]).toBe('class:TestClass'); // business_key
      expect(runCall[4]).toBe('Class'); // node_type
      expect(runCall[5]).toBe('{"name":"TestClass"}'); // properties
      expect(runCall[6]).toBeNull(); // repo_id
      expect(runCall[7]).toBeNull(); // commit_sha
      expect(runCall[8]).toBeNull(); // file_path
      expect(runCall[9]).toBeNull(); // line
      expect(runCall[10]).toBeNull(); // col
      expect(runCall[11]).toBeNull(); // signature_hash
      expect(runCall[12]).toBeNull(); // labels
    });

    it('should handle complex properties JSON', async () => {
      const complexProperties = {
        name: 'complexFunction',
        parameters: ['param1', 'param2'],
        returnType: 'Promise<string>',
        async: true,
        metadata: {
          complexity: 5,
          testCoverage: 0.85
        }
      };

      const nodeDto = new GraphNodeDTO(
        'node-1',
        'function:complexFunction',
        'Function',
        JSON.stringify(complexProperties),
        {
          repo_id: 'repo-1',
          file_path: 'src/complex.ts',
          line: 25
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(nodeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[5]).toBe(JSON.stringify(complexProperties));
    });

    it('should handle different node types', async () => {
      const nodeTypes = [
        'Function',
        'Class',
        'Variable',
        'Interface',
        'Type',
        'Module',
        'Import',
        'Export'
      ];

      for (const nodeType of nodeTypes) {
        const nodeDto = new GraphNodeDTO(
          `node-${nodeType}`,
          `${nodeType.toLowerCase()}:test`,
          nodeType,
          `{"name":"test${nodeType}"}`
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(nodeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[4]).toBe(nodeType);
      }
    });
  });

  describe('get', () => {
    it('should retrieve a graph node by id', async () => {
      const mockNode = {
        id: 'node-1',
        business_key: 'function:testFunction',
        node_type: 'Function',
        properties: '{"name":"testFunction","returnType":"string"}',
        repo_id: 'repo-1',
        commit_sha: 'abc123',
        file_path: 'src/test.ts',
        line: 10,
        col: 5,
        signature_hash: 'sig123',
        labels: 'function,exported',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockNode);

      const result = await repository.get('node-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_nodes WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('node-1');
      expect(result).toEqual(mockNode);
    });

    it('should return null when node not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search nodes by node type', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          business_key: 'function:testFunction1',
          node_type: 'Function',
          properties: '{"name":"testFunction1"}',
          repo_id: 'repo-1',
          commit_sha: null,
          file_path: 'src/test1.ts',
          line: 10,
          col: null,
          signature_hash: null,
          labels: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'node-2',
          business_key: 'function:testFunction2',
          node_type: 'Function',
          properties: '{"name":"testFunction2"}',
          repo_id: 'repo-1',
          commit_sha: null,
          file_path: 'src/test2.ts',
          line: 15,
          col: null,
          signature_hash: null,
          labels: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockNodes);

      const result = await repository.search({ node_type: 'Function' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_nodes WHERE node_type = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('Function');
      expect(result).toEqual(mockNodes);
    });

    it('should search nodes by repository id', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          business_key: 'function:testFunction',
          node_type: 'Function',
          properties: '{"name":"testFunction"}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/test.ts',
          line: 10,
          col: 5,
          signature_hash: null,
          labels: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockNodes);

      const result = await repository.search({ repo_id: 'repo-1' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_nodes WHERE repo_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('repo-1');
      expect(result).toEqual(mockNodes);
    });

    it('should search nodes by file path', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          business_key: 'function:testFunction',
          node_type: 'Function',
          properties: '{"name":"testFunction"}',
          repo_id: 'repo-1',
          commit_sha: null,
          file_path: 'src/utils/helper.ts',
          line: 20,
          col: null,
          signature_hash: null,
          labels: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockNodes);

      const result = await repository.search({ file_path: 'src/utils/helper.ts' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_nodes WHERE file_path = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('src/utils/helper.ts');
      expect(result).toEqual(mockNodes);
    });

    it('should search with multiple criteria', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          business_key: 'function:testFunction',
          node_type: 'Function',
          properties: '{"name":"testFunction"}',
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/test.ts',
          line: 10,
          col: null,
          signature_hash: null,
          labels: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockNodes);

      const criteria = {
        node_type: 'Function',
        repo_id: 'repo-1',
        file_path: 'src/test.ts'
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM graph_nodes WHERE node_type = ? AND repo_id = ? AND file_path = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('Function', 'repo-1', 'src/test.ts');
      expect(result).toEqual(mockNodes);
    });

    it('should search by business key pattern', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          business_key: 'function:testFunction',
          node_type: 'Function',
          properties: '{"name":"testFunction"}',
          repo_id: 'repo-1',
          commit_sha: null,
          file_path: 'src/test.ts',
          line: 10,
          col: null,
          signature_hash: null,
          labels: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockNodes);

      const result = await repository.search({ business_key: 'function:testFunction' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_nodes WHERE business_key = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('function:testFunction');
      expect(result).toEqual(mockNodes);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple graph nodes in a transaction', async () => {
      const nodes = [
        new GraphNodeDTO(
          'node-1',
          'function:testFunction1',
          'Function',
          '{"name":"testFunction1"}',
          { repo_id: 'repo-1', file_path: 'src/test1.ts', line: 10 }
        ),
        new GraphNodeDTO(
          'node-2',
          'class:TestClass',
          'Class',
          '{"name":"TestClass"}',
          { repo_id: 'repo-1', file_path: 'src/test2.ts', line: 5 }
        )
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(nodes);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(nodes);
    });

    it('should handle nodes with different optional properties', async () => {
      const nodes = [
        new GraphNodeDTO(
          'node-1',
          'function:fullFunction',
          'Function',
          '{"name":"fullFunction"}',
          {
            repo_id: 'repo-1',
            commit_sha: 'abc123',
            file_path: 'src/full.ts',
            line: 10,
            col: 5,
            signature_hash: 'sig123',
            labels: 'function,exported'
          }
        ),
        new GraphNodeDTO(
          'node-2',
          'class:MinimalClass',
          'Class',
          '{"name":"MinimalClass"}'
        )
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(nodes);

      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(nodes);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for batch operations', async () => {
      const nodes = Array.from({ length: 50 }, (_, i) => 
        new GraphNodeDTO(
          `node-${i}`,
          `function:testFunction${i}`,
          'Function',
          `{"name":"testFunction${i}"}`,
          { repo_id: 'repo-1', file_path: `src/test${i}.ts`, line: i * 10 }
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.batchAdd(nodes);

      // Should prepare statement only once for batch operation
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      // Should run the statement for each node
      expect(mockStatement.run).toHaveBeenCalledTimes(50);
      // Should use transaction for batch operation
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should handle large node sets efficiently', async () => {
      const largeNodeSet = Array.from({ length: 500 }, (_, i) => 
        new GraphNodeDTO(
          `node-${i}`,
          `function:func${i}`,
          'Function',
          `{"name":"func${i}","complexity":${Math.floor(Math.random() * 10)}}`,
          {
            repo_id: 'repo-1',
            file_path: `src/module${Math.floor(i / 10)}.ts`,
            line: (i % 10) * 10 + 5,
            col: Math.floor(Math.random() * 20)
          }
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeNodeSet);
      const endTime = Date.now();

      expect(result).toHaveLength(500);
      expect(mockStatement.run).toHaveBeenCalledTimes(500);
      // Verify it completes in reasonable time (this is a mock, so it should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('data transformation and validation', () => {
    it('should handle line and column numbers correctly', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
        'function:testFunction',
        'Function',
        '{"name":"testFunction"}',
        {
          repo_id: 'repo-1',
          file_path: 'src/test.ts',
          line: 42,
          col: 15
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(nodeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[9]).toBe(42); // line
      expect(runCall[10]).toBe(15); // col
    });

    it('should handle complex business keys', async () => {
      const complexBusinessKeys = [
        'function:MyClass.prototype.method',
        'class:namespace.MyClass',
        'variable:module.exports.config',
        'interface:IComplexInterface<T>',
        'type:Union|Intersection&Complex'
      ];

      for (const businessKey of complexBusinessKeys) {
        const nodeDto = new GraphNodeDTO(
          `node-${businessKey}`,
          businessKey,
          'Function',
          '{"name":"test"}'
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(nodeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[3]).toBe(businessKey);
      }
    });

    it('should handle signature hashes', async () => {
      const signatureHashes = [
        'sha256:abc123def456',
        'md5:098f6bcd4621d373cade4e832627b4f6',
        'custom-hash-algorithm:xyz789'
      ];

      for (const hash of signatureHashes) {
        const nodeDto = new GraphNodeDTO(
          'node-1',
          'function:testFunction',
          'Function',
          '{"name":"testFunction"}',
          {
            signature_hash: hash
          }
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(nodeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[11]).toBe(hash);
      }
    });

    it('should handle comma-separated labels', async () => {
      const labelSets = [
        'function,exported,async',
        'class,abstract,generic',
        'variable,const,readonly',
        'interface,public'
      ];

      for (const labels of labelSets) {
        const nodeDto = new GraphNodeDTO(
          'node-1',
          'function:testFunction',
          'Function',
          '{"name":"testFunction"}',
          {
            labels: labels
          }
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(nodeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[12]).toBe(labels);
      }
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON in properties', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
        'function:testFunction',
        'Function',
        'invalid-json-string'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Should still add the node even with invalid JSON
      const result = await repository.add(nodeDto);
      expect(result).toEqual(nodeDto);
    });

    it('should handle database constraint violations', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
        'function:testFunction',
        'Function',
        '{"name":"testFunction"}'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: graph_nodes.business_key');
      });

      await expect(repository.add(nodeDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
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

      await expect(repository.add(nodeDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });
  });

  describe('SQL query generation', () => {
    it('should generate correct INSERT query with all fields', async () => {
      const nodeDto = new GraphNodeDTO(
        'node-1',
        'function:testFunction',
        'Function',
        '{"name":"testFunction"}',
        {
          repo_id: 'repo-1',
          commit_sha: 'abc123',
          file_path: 'src/test.ts',
          line: 10,
          col: 5,
          signature_hash: 'sig123',
          labels: 'function,exported'
        }
      );
      
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

      await repository.add(nodeDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO graph_nodes (id, created_at, updated_at, business_key, node_type, properties, repo_id, commit_sha, file_path, line, col, signature_hash, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
    });

    it('should generate correct search queries for different node types', async () => {
      const nodeTypes = ['Function', 'Class', 'Variable', 'Interface'];

      for (const nodeType of nodeTypes) {
        mockStatement.all.mockReturnValue([]);
        
        await repository.search({ node_type: nodeType });

        expect(mockDb.prepare).toHaveBeenCalledWith(
          'SELECT * FROM graph_nodes WHERE node_type = ?'
        );
      }
    });

    it('should generate correct complex search queries', async () => {
      const complexCriteria = {
        node_type: 'Function',
        repo_id: 'repo-1',
        file_path: 'src/test.ts',
        line: 10
      };

      mockStatement.all.mockReturnValue([]);
      
      await repository.search(complexCriteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM graph_nodes WHERE node_type = ? AND repo_id = ? AND file_path = ? AND line = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('Function', 'repo-1', 'src/test.ts', 10);
    });
  });
});
