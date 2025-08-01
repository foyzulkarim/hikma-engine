/**
 * @file Unit tests for in-memory graph utilities
 */

import { InMemoryGraphService, GraphNode, GraphEdge, InMemoryGraph } from './in-memory-graph';
import { SQLiteClient } from '../persistence/db/connection';
import { MockFactory } from '../../tests/utils/mock-factory';

// Mock the logger
jest.mock('./logger', () => ({
  getLogger: jest.fn(() => ({
    operation: jest.fn(() => jest.fn()),
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('InMemoryGraphService', () => {
  let mockSqliteClient: jest.Mocked<SQLiteClient>;
  let graphService: InMemoryGraphService;
  let mockNodes: any[];
  let mockEdges: any[];

  beforeEach(() => {
    mockSqliteClient = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn(),
      prepare: jest.fn(),
      close: jest.fn(),
      transaction: jest.fn(),
    } as any;

    graphService = new InMemoryGraphService(mockSqliteClient);

    // Sample test data
    mockNodes = [
      {
        id: 'node1',
        business_key: 'file1.ts',
        node_type: 'FileNode',
        properties: JSON.stringify({ name: 'file1.ts', size: 1024 }),
        repo_id: 'repo1',
        file_path: 'src/file1.ts',
        line: null,
        col: null,
        signature_hash: 'hash1',
      },
      {
        id: 'node2',
        business_key: 'function1',
        node_type: 'FunctionNode',
        properties: JSON.stringify({ name: 'function1', returnType: 'string' }),
        repo_id: 'repo1',
        file_path: 'src/file1.ts',
        line: 10,
        col: 5,
        signature_hash: 'hash2',
      },
      {
        id: 'node3',
        business_key: 'function2',
        node_type: 'FunctionNode',
        properties: JSON.stringify({ name: 'function2', returnType: 'void' }),
        repo_id: 'repo1',
        file_path: 'src/file2.ts',
        line: 20,
        col: 10,
        signature_hash: 'hash3',
      },
    ];

    mockEdges = [
      {
        id: 'edge1',
        source_id: 'node2',
        target_id: 'node3',
        source_business_key: 'function1',
        target_business_key: 'function2',
        edge_type: 'CALLS',
        properties: JSON.stringify({ callType: 'direct' }),
        line: 15,
        col: 8,
        dynamic: false,
      },
      {
        id: 'edge2',
        source_id: 'node1',
        target_id: 'node2',
        source_business_key: 'file1.ts',
        target_business_key: 'function1',
        edge_type: 'CONTAINS',
        properties: JSON.stringify({}),
        line: null,
        col: null,
        dynamic: false,
      },
    ];

    mockSqliteClient.all.mockImplementation((query: string) => {
      if (query.includes('graph_nodes')) {
        return mockNodes;
      } else if (query.includes('graph_edges')) {
        return mockEdges;
      }
      return [];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Graph Loading', () => {
    it('should load graph data from database', async () => {
      await graphService.loadGraph();

      expect(mockSqliteClient.all).toHaveBeenCalledWith('SELECT * FROM graph_nodes');
      expect(mockSqliteClient.all).toHaveBeenCalledWith('SELECT * FROM graph_edges');
      expect(graphService.isLoaded()).toBe(true);
    });

    it('should parse node properties correctly', async () => {
      await graphService.loadGraph();
      const graph = graphService.getGraph();

      const node1 = graph.nodes.get('node1');
      expect(node1).toBeDefined();
      expect(node1!.id).toBe('node1');
      expect(node1!.businessKey).toBe('file1.ts');
      expect(node1!.nodeType).toBe('FileNode');
      expect(node1!.properties).toEqual({ name: 'file1.ts', size: 1024 });
      expect(node1!.repoId).toBe('repo1');
      expect(node1!.filePath).toBe('src/file1.ts');
    });

    it('should parse edge properties correctly', async () => {
      await graphService.loadGraph();
      const graph = graphService.getGraph();

      const edge1 = graph.edges.find(e => e.id === 'edge1');
      expect(edge1).toBeDefined();
      expect(edge1!.sourceId).toBe('node2');
      expect(edge1!.targetId).toBe('node3');
      expect(edge1!.edgeType).toBe('CALLS');
      expect(edge1!.properties).toEqual({ callType: 'direct' });
      expect(edge1!.line).toBe(15);
      expect(edge1!.col).toBe(8);
      expect(edge1!.dynamic).toBe(false);
    });

    it('should build adjacency lists correctly', async () => {
      await graphService.loadGraph();
      const graph = graphService.getGraph();

      // Check outgoing edges from node2
      const outgoingFromNode2 = graph.adjacencyList.get('node2');
      expect(outgoingFromNode2).toHaveLength(1);
      expect(outgoingFromNode2![0].targetId).toBe('node3');

      // Check incoming edges to node3
      const incomingToNode3 = graph.reverseAdjacencyList.get('node3');
      expect(incomingToNode3).toHaveLength(1);
      expect(incomingToNode3![0].sourceId).toBe('node2');
    });

    it('should group nodes by type', async () => {
      await graphService.loadGraph();
      const graph = graphService.getGraph();

      const fileNodes = graph.nodesByType.get('FileNode');
      expect(fileNodes).toHaveLength(1);
      expect(fileNodes![0].id).toBe('node1');

      const functionNodes = graph.nodesByType.get('FunctionNode');
      expect(functionNodes).toHaveLength(2);
      expect(functionNodes!.map(n => n.id)).toContain('node2');
      expect(functionNodes!.map(n => n.id)).toContain('node3');
    });

    it('should group edges by type', async () => {
      await graphService.loadGraph();
      const graph = graphService.getGraph();

      const callEdges = graph.edgesByType.get('CALLS');
      expect(callEdges).toHaveLength(1);
      expect(callEdges![0].id).toBe('edge1');

      const containsEdges = graph.edgesByType.get('CONTAINS');
      expect(containsEdges).toHaveLength(1);
      expect(containsEdges![0].id).toBe('edge2');
    });

    it('should handle empty properties gracefully', async () => {
      mockNodes[0].properties = null;
      mockEdges[0].properties = null;

      await graphService.loadGraph();
      const graph = graphService.getGraph();

      const node = graph.nodes.get('node1');
      expect(node!.properties).toEqual({});

      const edge = graph.edges.find(e => e.id === 'edge1');
      expect(edge!.properties).toEqual({});
    });

    it('should handle database errors during loading', async () => {
      mockSqliteClient.all.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(graphService.loadGraph()).rejects.toThrow('Database connection failed');
      expect(graphService.isLoaded()).toBe(false);
    });
  });

  describe('Graph Access Methods', () => {
    beforeEach(async () => {
      await graphService.loadGraph();
    });

    it('should get graph when loaded', () => {
      const graph = graphService.getGraph();
      expect(graph).toBeDefined();
      expect(graph.nodes.size).toBe(3);
      expect(graph.edges).toHaveLength(2);
    });

    it('should throw error when accessing unloaded graph', () => {
      const unloadedService = new InMemoryGraphService(mockSqliteClient);
      expect(() => unloadedService.getGraph()).toThrow('Graph not loaded. Call loadGraph() first.');
    });

    it('should check if graph is loaded', () => {
      expect(graphService.isLoaded()).toBe(true);
      
      const unloadedService = new InMemoryGraphService(mockSqliteClient);
      expect(unloadedService.isLoaded()).toBe(false);
    });
  });

  describe('Node and Edge Queries', () => {
    beforeEach(async () => {
      await graphService.loadGraph();
    });

    it('should get nodes by type', () => {
      const functionNodes = graphService.getNodesByType('FunctionNode');
      expect(functionNodes).toHaveLength(2);
      expect(functionNodes.map(n => n.id)).toContain('node2');
      expect(functionNodes.map(n => n.id)).toContain('node3');

      const fileNodes = graphService.getNodesByType('FileNode');
      expect(fileNodes).toHaveLength(1);
      expect(fileNodes[0].id).toBe('node1');
    });

    it('should return empty array for non-existent node type', () => {
      const nonExistentNodes = graphService.getNodesByType('NonExistentType');
      expect(nonExistentNodes).toEqual([]);
    });

    it('should get edges by type', () => {
      const callEdges = graphService.getEdgesByType('CALLS');
      expect(callEdges).toHaveLength(1);
      expect(callEdges[0].id).toBe('edge1');

      const containsEdges = graphService.getEdgesByType('CONTAINS');
      expect(containsEdges).toHaveLength(1);
      expect(containsEdges[0].id).toBe('edge2');
    });

    it('should return empty array for non-existent edge type', () => {
      const nonExistentEdges = graphService.getEdgesByType('NonExistentType');
      expect(nonExistentEdges).toEqual([]);
    });

    it('should get outgoing edges from node', () => {
      const outgoingFromNode2 = graphService.getOutgoingEdges('node2');
      expect(outgoingFromNode2).toHaveLength(1);
      expect(outgoingFromNode2[0].targetId).toBe('node3');

      const outgoingFromNode1 = graphService.getOutgoingEdges('node1');
      expect(outgoingFromNode1).toHaveLength(1);
      expect(outgoingFromNode1[0].targetId).toBe('node2');
    });

    it('should return empty array for node with no outgoing edges', () => {
      const outgoingFromNode3 = graphService.getOutgoingEdges('node3');
      expect(outgoingFromNode3).toEqual([]);
    });

    it('should get incoming edges to node', () => {
      const incomingToNode3 = graphService.getIncomingEdges('node3');
      expect(incomingToNode3).toHaveLength(1);
      expect(incomingToNode3[0].sourceId).toBe('node2');

      const incomingToNode2 = graphService.getIncomingEdges('node2');
      expect(incomingToNode2).toHaveLength(1);
      expect(incomingToNode2[0].sourceId).toBe('node1');
    });

    it('should return empty array for node with no incoming edges', () => {
      const incomingToNode1 = graphService.getIncomingEdges('node1');
      expect(incomingToNode1).toEqual([]);
    });
  });

  describe('Function Call Analysis', () => {
    beforeEach(async () => {
      await graphService.loadGraph();
    });

    it('should find function calls from a function', () => {
      const functionCalls = graphService.getFunctionCalls('node2');
      expect(functionCalls).toHaveLength(1);
      expect(functionCalls[0].id).toBe('node3');
    });

    it('should return empty array for function with no calls', () => {
      const functionCalls = graphService.getFunctionCalls('node3');
      expect(functionCalls).toEqual([]);
    });

    it('should find functions that call a specific function', () => {
      const callers = graphService.getFunctionCallers('node3');
      expect(callers).toHaveLength(1);
      expect(callers[0].id).toBe('node2');
    });

    it('should return empty array for function with no callers', () => {
      const callers = graphService.getFunctionCallers('node2');
      expect(callers).toEqual([]);
    });

    it('should find call chain between functions', async () => {
      // Add more nodes and edges to create a call chain
      const additionalNodes = [
        {
          id: 'node4',
          business_key: 'function3',
          node_type: 'FunctionNode',
          properties: JSON.stringify({ name: 'function3' }),
          repo_id: 'repo1',
          file_path: 'src/file3.ts',
          line: 30,
          col: 15,
          signature_hash: 'hash4',
        },
      ];

      const additionalEdges = [
        {
          id: 'edge3',
          source_id: 'node3',
          target_id: 'node4',
          source_business_key: 'function2',
          target_business_key: 'function3',
          edge_type: 'CALLS',
          properties: JSON.stringify({}),
          line: 25,
          col: 12,
          dynamic: false,
        },
      ];

      mockNodes.push(...additionalNodes);
      mockEdges.push(...additionalEdges);

      // Reload graph with new data
      const newService = new InMemoryGraphService(mockSqliteClient);
      await newService.loadGraph();

      const callChain = newService.findCallChain('node2', 'node4');
      expect(callChain).toBeDefined();
      expect(callChain).toHaveLength(3);
      expect(callChain!.map(n => n.id)).toEqual(['node2', 'node3', 'node4']);
    });

    it('should return null when no call chain exists', () => {
      const callChain = graphService.findCallChain('node3', 'node2');
      expect(callChain).toBeNull();
    });

    it('should respect max depth in call chain search', () => {
      const callChain = graphService.findCallChain('node2', 'node3', 0);
      expect(callChain).toBeNull();
    });
  });

  describe('File Analysis', () => {
    beforeEach(async () => {
      await graphService.loadGraph();
    });

    it('should find functions in a specific file', () => {
      const functionsInFile = graphService.getFunctionsInFile('src/file1.ts');
      expect(functionsInFile).toHaveLength(1);
      expect(functionsInFile[0].id).toBe('node2');
    });

    it('should return empty array for file with no functions', () => {
      const functionsInFile = graphService.getFunctionsInFile('src/nonexistent.ts');
      expect(functionsInFile).toEqual([]);
    });

    it('should find file dependents', async () => {
      // Add import edge to test file dependencies
      const importEdge = {
        id: 'edge3',
        source_id: 'node1',
        target_id: 'node1', // Self-reference for testing
        source_business_key: 'file1.ts',
        target_business_key: 'file1.ts',
        edge_type: 'IMPORTS',
        properties: JSON.stringify({}),
        line: null,
        col: null,
        dynamic: false,
      };

      mockEdges.push(importEdge);

      // Reload graph
      const newService = new InMemoryGraphService(mockSqliteClient);
      await newService.loadGraph();

      const dependents = newService.getFileDependents('src/file1.ts');
      expect(dependents).toHaveLength(1);
      expect(dependents[0].id).toBe('node1');
    });

    it('should return empty array for file with no dependents', () => {
      const dependents = graphService.getFileDependents('src/nonexistent.ts');
      expect(dependents).toEqual([]);
    });
  });

  describe('Graph Statistics', () => {
    beforeEach(async () => {
      await graphService.loadGraph();
    });

    it('should provide graph statistics', () => {
      const stats = graphService.getStats();
      
      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.nodeTypes).toEqual({
        FileNode: 1,
        FunctionNode: 2,
      });
      expect(stats.edgeTypes).toEqual({
        CALLS: 1,
        CONTAINS: 1,
      });
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await graphService.loadGraph();
    });

    it('should search nodes by predicate', () => {
      const functionNodes = graphService.searchNodes(node => node.nodeType === 'FunctionNode');
      expect(functionNodes).toHaveLength(2);
      expect(functionNodes.map(n => n.id)).toContain('node2');
      expect(functionNodes.map(n => n.id)).toContain('node3');
    });

    it('should search nodes by properties', () => {
      const nodesWithReturnType = graphService.searchNodes(
        node => node.properties.returnType === 'string'
      );
      expect(nodesWithReturnType).toHaveLength(1);
      expect(nodesWithReturnType[0].id).toBe('node2');
    });

    it('should search edges by predicate', () => {
      const callEdges = graphService.searchEdges(edge => edge.edgeType === 'CALLS');
      expect(callEdges).toHaveLength(1);
      expect(callEdges[0].id).toBe('edge1');
    });

    it('should search edges by properties', () => {
      const directCallEdges = graphService.searchEdges(
        edge => edge.properties?.callType === 'direct'
      );
      expect(directCallEdges).toHaveLength(1);
      expect(directCallEdges[0].id).toBe('edge1');
    });

    it('should return empty arrays for non-matching predicates', () => {
      const nonExistentNodes = graphService.searchNodes(node => node.nodeType === 'NonExistent');
      expect(nonExistentNodes).toEqual([]);

      const nonExistentEdges = graphService.searchEdges(edge => edge.edgeType === 'NonExistent');
      expect(nonExistentEdges).toEqual([]);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty database results', async () => {
      mockSqliteClient.all.mockReturnValue([]);
      
      await graphService.loadGraph();
      const graph = graphService.getGraph();
      
      expect(graph.nodes.size).toBe(0);
      expect(graph.edges).toHaveLength(0);
      expect(graphService.isLoaded()).toBe(true);
    });

    it('should handle malformed JSON in properties', async () => {
      mockNodes[0].properties = 'invalid json';
      
      await expect(graphService.loadGraph()).rejects.toThrow();
    });

    it('should handle missing node references in edges', async () => {
      // Add edge that references non-existent nodes
      mockEdges.push({
        id: 'edge_orphan',
        source_id: 'nonexistent_source',
        target_id: 'nonexistent_target',
        source_business_key: 'orphan_source',
        target_business_key: 'orphan_target',
        edge_type: 'ORPHAN',
        properties: JSON.stringify({}),
        line: null,
        col: null,
        dynamic: false,
      });

      await graphService.loadGraph();
      
      // Should still load successfully, but operations on orphaned edges should handle gracefully
      const orphanCalls = graphService.getFunctionCalls('nonexistent_source');
      expect(orphanCalls).toEqual([]);
    });

    it('should handle null/undefined values in database results', async () => {
      mockNodes[0].line = null;
      mockNodes[0].col = null;
      mockNodes[0].signature_hash = null;
      
      await graphService.loadGraph();
      const graph = graphService.getGraph();
      
      const node = graph.nodes.get('node1');
      expect(node!.line).toBeNull();
      expect(node!.col).toBeNull();
      expect(node!.signatureHash).toBeNull();
    });

    it('should handle very large graphs efficiently', async () => {
      // Generate large dataset
      const largeNodes = Array.from({ length: 1000 }, (_, i) => ({
        id: `node_${i}`,
        business_key: `item_${i}`,
        node_type: 'TestNode',
        properties: JSON.stringify({ index: i }),
        repo_id: 'repo1',
        file_path: `src/file_${i}.ts`,
        line: i,
        col: i,
        signature_hash: `hash_${i}`,
      }));

      const largeEdges = Array.from({ length: 999 }, (_, i) => ({
        id: `edge_${i}`,
        source_id: `node_${i}`,
        target_id: `node_${i + 1}`,
        source_business_key: `item_${i}`,
        target_business_key: `item_${i + 1}`,
        edge_type: 'CONNECTS',
        properties: JSON.stringify({ index: i }),
        line: i,
        col: i,
        dynamic: false,
      }));

      mockSqliteClient.all.mockImplementation((query: string) => {
        if (query.includes('graph_nodes')) {
          return largeNodes;
        } else if (query.includes('graph_edges')) {
          return largeEdges;
        }
        return [];
      });

      const startTime = Date.now();
      await graphService.loadGraph();
      const loadTime = Date.now() - startTime;

      // Should load reasonably quickly (less than 1 second for 1000 nodes)
      expect(loadTime).toBeLessThan(1000);
      
      const graph = graphService.getGraph();
      expect(graph.nodes.size).toBe(1000);
      expect(graph.edges).toHaveLength(999);
    });
  });
});
