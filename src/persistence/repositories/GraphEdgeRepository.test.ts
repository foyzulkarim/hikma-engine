/**
 * @file GraphEdgeRepository.test.ts - Unit tests for GraphEdgeRepository
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { GraphEdgeRepository } from './GraphEdgeRepository';
import { GraphEdgeDTO } from '../models/GraphEdgeDTO';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('GraphEdgeRepository', () => {
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatement: jest.Mocked<Database.Statement>;
  let repository: GraphEdgeRepository;

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
      source: 'SELECT * FROM graph_edges',
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

    repository = new GraphEdgeRepository(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct table name', () => {
      expect(repository).toBeInstanceOf(GraphEdgeRepository);
      // Verify the table name is set correctly by checking prepare calls
      repository.getAll();
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_edges');
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
    it('should add a graph edge DTO successfully', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:testFunction1',
        'function:testFunction2',
        'CALLS',
        {
          properties: '{"callType":"direct","async":false}',
          line: 25,
          col: 10,
          dynamic: false
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.add(edgeDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO graph_edges (id, created_at, updated_at, source_id, target_id, source_business_key, target_business_key, edge_type, properties, line, col, dynamic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockStatement.run).toHaveBeenCalledWith(
        'edge-1',
        edgeDto.created_at,
        edgeDto.updated_at,
        'node-1',
        'node-2',
        'function:testFunction1',
        'function:testFunction2',
        'CALLS',
        '{"callType":"direct","async":false}',
        25,
        10,
        0 // false converted to 0
      );
      expect(result).toEqual(edgeDto);
    });

    it('should handle minimal edge with only required fields', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:testFunction1',
        'function:testFunction2',
        'CALLS'
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(edgeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[0]).toBe('edge-1'); // id
      expect(runCall[3]).toBe('node-1'); // source_id
      expect(runCall[4]).toBe('node-2'); // target_id
      expect(runCall[5]).toBe('function:testFunction1'); // source_business_key
      expect(runCall[6]).toBe('function:testFunction2'); // target_business_key
      expect(runCall[7]).toBe('CALLS'); // edge_type
      // Optional fields should not be present in the call since they're undefined
      expect(runCall.length).toBe(8); // Only required fields + created_at + updated_at
    });

    it('should handle different edge types', async () => {
      const edgeTypes = [
        'CALLS',
        'CONTAINS',
        'EXTENDS',
        'IMPLEMENTS',
        'IMPORTS',
        'EXPORTS',
        'REFERENCES',
        'DEFINES',
        'USES'
      ];

      for (const edgeType of edgeTypes) {
        const edgeDto = new GraphEdgeDTO(
          `edge-${edgeType}`,
          'node-1',
          'node-2',
          'source:key',
          'target:key',
          edgeType
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(edgeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[7]).toBe(edgeType);
      }
    });

    it('should handle boolean dynamic field correctly', async () => {
      const testCases = [
        { dynamic: true, expected: 1 },
        { dynamic: false, expected: 0 }
      ];

      for (const testCase of testCases) {
        const edgeDto = new GraphEdgeDTO(
          'edge-1',
          'node-1',
          'node-2',
          'source:key',
          'target:key',
          'CALLS',
          { dynamic: testCase.dynamic }
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(edgeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        // Find the dynamic field in the call - it should be converted to 1 or 0
        const dynamicIndex = runCall.findIndex(val => val === testCase.expected);
        expect(dynamicIndex).toBeGreaterThan(-1);
      }
    });

    it('should handle complex properties JSON', async () => {
      const complexProperties = {
        callType: 'async',
        parameters: ['param1', 'param2'],
        returnType: 'Promise<void>',
        metadata: {
          confidence: 0.95,
          source: 'ast-analysis'
        }
      };

      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:caller',
        'function:callee',
        'CALLS',
        {
          properties: JSON.stringify(complexProperties),
          line: 42,
          col: 15
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(edgeDto);

      const runCall = mockStatement.run.mock.calls[0];
      expect(runCall[8]).toBe(JSON.stringify(complexProperties));
    });
  });

  describe('get', () => {
    it('should retrieve a graph edge by id', async () => {
      const mockEdge = {
        id: 'edge-1',
        source_id: 'node-1',
        target_id: 'node-2',
        source_business_key: 'function:testFunction1',
        target_business_key: 'function:testFunction2',
        edge_type: 'CALLS',
        properties: '{"callType":"direct"}',
        line: 25,
        col: 10,
        dynamic: 0,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockStatement.get.mockReturnValue(mockEdge);

      const result = await repository.get('edge-1');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_edges WHERE id = ?');
      expect(mockStatement.get).toHaveBeenCalledWith('edge-1');
      expect(result).toEqual(mockEdge);
    });

    it('should return null when edge not found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await repository.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search edges by edge type', async () => {
      const mockEdges = [
        {
          id: 'edge-1',
          source_id: 'node-1',
          target_id: 'node-2',
          source_business_key: 'function:caller1',
          target_business_key: 'function:callee',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'edge-2',
          source_id: 'node-3',
          target_id: 'node-2',
          source_business_key: 'function:caller2',
          target_business_key: 'function:callee',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockEdges);

      const result = await repository.search({ edge_type: 'CALLS' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_edges WHERE edge_type = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('CALLS');
      expect(result).toEqual(mockEdges);
    });

    it('should search edges by source node', async () => {
      const mockEdges = [
        {
          id: 'edge-1',
          source_id: 'node-1',
          target_id: 'node-2',
          source_business_key: 'function:testFunction',
          target_business_key: 'function:helper1',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'edge-2',
          source_id: 'node-1',
          target_id: 'node-3',
          source_business_key: 'function:testFunction',
          target_business_key: 'function:helper2',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockEdges);

      const result = await repository.search({ source_id: 'node-1' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_edges WHERE source_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('node-1');
      expect(result).toEqual(mockEdges);
    });

    it('should search edges by target node', async () => {
      const mockEdges = [
        {
          id: 'edge-1',
          source_id: 'node-1',
          target_id: 'node-2',
          source_business_key: 'function:caller1',
          target_business_key: 'function:targetFunction',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'edge-2',
          source_id: 'node-3',
          target_id: 'node-2',
          source_business_key: 'function:caller2',
          target_business_key: 'function:targetFunction',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockEdges);

      const result = await repository.search({ target_id: 'node-2' });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_edges WHERE target_id = ?');
      expect(mockStatement.all).toHaveBeenCalledWith('node-2');
      expect(result).toEqual(mockEdges);
    });

    it('should search edges by business keys', async () => {
      const mockEdges = [
        {
          id: 'edge-1',
          source_id: 'node-1',
          target_id: 'node-2',
          source_business_key: 'function:specificFunction',
          target_business_key: 'function:targetFunction',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: null,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockEdges);

      const result = await repository.search({ 
        source_business_key: 'function:specificFunction',
        target_business_key: 'function:targetFunction'
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM graph_edges WHERE source_business_key = ? AND target_business_key = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('function:specificFunction', 'function:targetFunction');
      expect(result).toEqual(mockEdges);
    });

    it('should search with multiple criteria', async () => {
      const mockEdges = [
        {
          id: 'edge-1',
          source_id: 'node-1',
          target_id: 'node-2',
          source_business_key: 'function:caller',
          target_business_key: 'function:callee',
          edge_type: 'CALLS',
          properties: null,
          line: 25,
          col: null,
          dynamic: 0,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockEdges);

      const criteria = {
        edge_type: 'CALLS',
        source_id: 'node-1',
        target_id: 'node-2',
        line: 25
      };
      const result = await repository.search(criteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM graph_edges WHERE edge_type = ? AND source_id = ? AND target_id = ? AND line = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('CALLS', 'node-1', 'node-2', 25);
      expect(result).toEqual(mockEdges);
    });

    it('should search by dynamic flag', async () => {
      const mockEdges = [
        {
          id: 'edge-1',
          source_id: 'node-1',
          target_id: 'node-2',
          source_business_key: 'function:caller',
          target_business_key: 'function:callee',
          edge_type: 'CALLS',
          properties: null,
          line: null,
          col: null,
          dynamic: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z'
        }
      ];

      mockStatement.all.mockReturnValue(mockEdges);

      const result = await repository.search({ dynamic: true });

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM graph_edges WHERE dynamic = ?');
      expect(mockStatement.all).toHaveBeenCalledWith(true);
      expect(result).toEqual(mockEdges);
    });
  });

  describe('batchAdd', () => {
    it('should add multiple graph edges in a transaction', async () => {
      const edges = [
        new GraphEdgeDTO(
          'edge-1',
          'node-1',
          'node-2',
          'function:caller1',
          'function:callee',
          'CALLS',
          { line: 10, col: 5 }
        ),
        new GraphEdgeDTO(
          'edge-2',
          'node-2',
          'node-3',
          'function:callee',
          'function:helper',
          'CALLS',
          { line: 15, dynamic: true }
        )
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(edges);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(edges);
    });

    it('should handle edges with different optional properties', async () => {
      const edges = [
        new GraphEdgeDTO(
          'edge-1',
          'node-1',
          'node-2',
          'function:fullEdge',
          'function:target',
          'CALLS',
          {
            properties: '{"callType":"async"}',
            line: 25,
            col: 10,
            dynamic: false
          }
        ),
        new GraphEdgeDTO(
          'edge-2',
          'node-3',
          'node-4',
          'class:MinimalEdge',
          'class:Target',
          'EXTENDS'
        )
      ];

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const result = await repository.batchAdd(edges);

      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(edges);
    });
  });

  describe('performance optimizations', () => {
    it('should use prepared statements for batch operations', async () => {
      const edges = Array.from({ length: 100 }, (_, i) => 
        new GraphEdgeDTO(
          `edge-${i}`,
          `node-${i}`,
          `node-${i + 1}`,
          `function:func${i}`,
          `function:func${i + 1}`,
          'CALLS',
          { line: i * 5 }
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.batchAdd(edges);

      // Should prepare statement only once for batch operation
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      // Should run the statement for each edge
      expect(mockStatement.run).toHaveBeenCalledTimes(100);
      // Should use transaction for batch operation
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should handle large edge sets efficiently', async () => {
      const largeEdgeSet = Array.from({ length: 1000 }, (_, i) => 
        new GraphEdgeDTO(
          `edge-${i}`,
          `node-${i % 100}`,
          `node-${(i + 1) % 100}`,
          `function:func${i % 100}`,
          `function:func${(i + 1) % 100}`,
          i % 2 === 0 ? 'CALLS' : 'REFERENCES',
          {
            line: i % 50 + 1,
            col: i % 20 + 1,
            dynamic: i % 3 === 0
          }
        )
      );

      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      const startTime = Date.now();
      const result = await repository.batchAdd(largeEdgeSet);
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(mockStatement.run).toHaveBeenCalledTimes(1000);
      // Verify it completes in reasonable time (this is a mock, so it should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('data transformation and validation', () => {
    it('should handle line and column numbers correctly', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:caller',
        'function:callee',
        'CALLS',
        {
          line: 100,
          col: 25
        }
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      await repository.add(edgeDto);

      const runCall = mockStatement.run.mock.calls[0];
      // Check that line and col are present in the call
      expect(runCall).toContain(100); // line
      expect(runCall).toContain(25); // col
    });

    it('should handle complex business key patterns', async () => {
      const businessKeyPairs = [
        {
          source: 'function:MyClass.prototype.method',
          target: 'function:helper.utility'
        },
        {
          source: 'class:namespace.ParentClass',
          target: 'interface:IChildInterface'
        },
        {
          source: 'variable:module.exports.config',
          target: 'type:ConfigType'
        }
      ];

      for (const pair of businessKeyPairs) {
        const edgeDto = new GraphEdgeDTO(
          'edge-1',
          'node-1',
          'node-2',
          pair.source,
          pair.target,
          'REFERENCES'
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(edgeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[5]).toBe(pair.source);
        expect(runCall[6]).toBe(pair.target);
      }
    });

    it('should preserve edge relationship semantics', async () => {
      const relationshipTypes = [
        { type: 'CALLS', description: 'function call relationship' },
        { type: 'CONTAINS', description: 'containment relationship' },
        { type: 'EXTENDS', description: 'inheritance relationship' },
        { type: 'IMPLEMENTS', description: 'interface implementation' },
        { type: 'IMPORTS', description: 'module import relationship' },
        { type: 'EXPORTS', description: 'module export relationship' }
      ];

      for (const rel of relationshipTypes) {
        const edgeDto = new GraphEdgeDTO(
          `edge-${rel.type}`,
          'node-1',
          'node-2',
          'source:key',
          'target:key',
          rel.type,
          {
            properties: JSON.stringify({ description: rel.description })
          }
        );
        
        mockStatement.run.mockReturnValue({
          changes: 1,
          lastInsertRowid: 1
        });

        await repository.add(edgeDto);

        const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
        expect(runCall[7]).toBe(rel.type);
        expect(runCall[8]).toBe(JSON.stringify({ description: rel.description }));
      }
    });
  });

  describe('error handling', () => {
    it('should handle database constraint violations', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:caller',
        'function:callee',
        'CALLS'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: graph_edges.id');
      });

      await expect(repository.add(edgeDto)).rejects.toThrow('UNIQUE constraint failed');
    });

    it('should handle foreign key constraint violations', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'non-existent-node',
        'node-2',
        'function:caller',
        'function:callee',
        'CALLS'
      );
      
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      await expect(repository.add(edgeDto)).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should handle transaction rollback in batch operations', async () => {
      const edges = [
        new GraphEdgeDTO('edge-1', 'node-1', 'node-2', 'source1', 'target1', 'CALLS'),
        new GraphEdgeDTO('edge-2', 'node-2', 'node-3', 'source2', 'target2', 'CALLS')
      ];

      mockDb.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(repository.batchAdd(edges)).rejects.toThrow('Transaction failed');
    });

    it('should handle invalid edge type gracefully', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:caller',
        'function:callee',
        'INVALID_TYPE' as any
      );
      
      mockStatement.run.mockReturnValue({
        changes: 1,
        lastInsertRowid: 1
      });

      // Should still add the edge even with invalid type
      const result = await repository.add(edgeDto);
      expect(result).toEqual(edgeDto);
    });
  });

  describe('SQL query generation', () => {
    it('should generate correct INSERT query with all fields', async () => {
      const edgeDto = new GraphEdgeDTO(
        'edge-1',
        'node-1',
        'node-2',
        'function:caller',
        'function:callee',
        'CALLS',
        {
          properties: '{"callType":"direct"}',
          line: 25,
          col: 10,
          dynamic: true
        }
      );
      
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

      await repository.add(edgeDto);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO graph_edges (id, created_at, updated_at, source_id, target_id, source_business_key, target_business_key, edge_type, properties, line, col, dynamic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
    });

    it('should generate correct search queries for different edge relationships', async () => {
      const searchCriteria = [
        { edge_type: 'CALLS' },
        { source_id: 'node-1' },
        { target_id: 'node-2' },
        { source_business_key: 'function:caller' },
        { target_business_key: 'function:callee' },
        { dynamic: true }
      ];

      for (const criteria of searchCriteria) {
        mockStatement.all.mockReturnValue([]);
        
        await repository.search(criteria);

        const key = Object.keys(criteria)[0];
        expect(mockDb.prepare).toHaveBeenCalledWith(
          `SELECT * FROM graph_edges WHERE ${key} = ?`
        );
      }
    });

    it('should generate correct complex search queries', async () => {
      const complexCriteria = {
        edge_type: 'CALLS',
        source_id: 'node-1',
        target_id: 'node-2',
        dynamic: false
      };

      mockStatement.all.mockReturnValue([]);
      
      await repository.search(complexCriteria);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM graph_edges WHERE edge_type = ? AND source_id = ? AND target_id = ? AND dynamic = ?'
      );
      expect(mockStatement.all).toHaveBeenCalledWith('CALLS', 'node-1', 'node-2', false);
    });
  });
});
