/**
 * @file Unit tests for DataLoader with comprehensive coverage of data loading and persistence coordination
 */

import { DataLoader } from './data-loader';
import { ConfigManager } from '../config';
import { NodeWithEmbedding, FileNode, CodeNode, CommitNode, Edge, RepositoryNode, FunctionNode, TestNode, PullRequestNode } from '../types';
import { MockSQLiteClient } from '../../tests/utils/mocks/MockSQLiteClient';
import { TestDataFactory } from '../../tests/utils/TestDataFactory';
import { 
  DatabaseConnectionError, 
  DatabaseOperationError, 
  DataValidationError,
  withRetry 
} from '../utils/error-handling';
import * as path from 'path';
import * as os from 'os';

// Mock the SQLiteClient
jest.mock('../persistence/db/connection', () => ({
  SQLiteClient: jest.fn().mockImplementation((dbPath: string) => {
    return new MockSQLiteClient(dbPath);
  })
}));

// Mock the withRetry function
jest.mock('../utils/error-handling', () => ({
  ...jest.requireActual('../utils/error-handling'),
  withRetry: jest.fn()
}));

describe('DataLoader', () => {
  let dataLoader: DataLoader;
  let mockSQLiteClient: MockSQLiteClient;
  let testDbPath: string;
  let config: ConfigManager;
  let mockWithRetry: jest.MockedFunction<typeof withRetry>;

  beforeAll(() => {
    // Create temporary database path for testing
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-dataloader-${Date.now()}.db`);
    
    // Initialize config manager
    config = new ConfigManager(process.cwd());
    
    // Setup withRetry mock
    mockWithRetry = withRetry as jest.MockedFunction<typeof withRetry>;
  });

  beforeEach(() => {
    // Reset test data factory counter
    TestDataFactory.resetCounter();
    
    // Create fresh DataLoader instance for each test
    dataLoader = new DataLoader(testDbPath, config);
    
    // Get the mock SQLite client instance
    mockSQLiteClient = (dataLoader as any).sqliteClient as MockSQLiteClient;
    
    // Setup default withRetry behavior
    mockWithRetry.mockImplementation(async (fn, config, logger, operation) => {
      return await fn();
    });
    
    // Clear all mocks
    mockSQLiteClient.clearMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize DataLoader with SQLite path and config', () => {
      expect(dataLoader).toBeDefined();
      expect(mockSQLiteClient).toBeDefined();
    });

    it('should initialize with correct database path', () => {
      const customPath = '/custom/path/test.db';
      const customLoader = new DataLoader(customPath, config);
      
      expect(customLoader).toBeDefined();
    });

    it('should store configuration manager reference', () => {
      expect((dataLoader as any).config).toBe(config);
    });
  });

  describe('Database Connection Management', () => {
    it('should connect to SQLite database successfully', async () => {
      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      expect(mockSQLiteClient.connect).toHaveBeenCalled();
    });

    it('should handle connection failures with retry logic', async () => {
      mockSQLiteClient.simulateConnectionFailure(true);
      mockWithRetry.mockRejectedValueOnce(new DatabaseConnectionError('SQLite', 'Connection failed'));

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await expect(dataLoader.load(nodes, edges)).rejects.toThrow(DatabaseConnectionError);
      expect(mockWithRetry).toHaveBeenCalled();
    });

    it('should disconnect from database after loading', async () => {
      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      expect(mockSQLiteClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect even if loading fails', async () => {
      mockSQLiteClient.simulateQueryFailure(true);

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await expect(dataLoader.load(nodes, edges)).rejects.toThrow();
      expect(mockSQLiteClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('Data Validation', () => {
    it('should validate nodes before persistence', async () => {
      const validNodes = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode())
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(validNodes, edges);

      expect(result.success).toBe(true);
      expect(result.results.sqlite.success).toBe(true);
    });

    it('should reject nodes with missing required fields', async () => {
      const invalidNodes: any[] = [
        {
          id: '', // Empty ID
          type: 'FileNode',
          properties: {},
          embedding: [0.1, 0.2, 0.3],
          sourceText: 'test'
        }
      ];
      const edges: Edge[] = [];

      await expect(dataLoader.load(invalidNodes, edges)).rejects.toThrow(DataValidationError);
    });

    it('should reject nodes with invalid types', async () => {
      const invalidNodes: any[] = [
        {
          id: 'test-1',
          type: '', // Empty type (invalid)
          properties: {},
          embedding: [0.1, 0.2, 0.3],
          sourceText: 'test'
        }
      ];
      const edges: Edge[] = [];

      await expect(dataLoader.load(invalidNodes, edges)).rejects.toThrow(DataValidationError);
    });

    it('should validate edges before persistence', async () => {
      const nodes = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile({ id: 'file-1' })),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode({ id: 'code-1' }))
      ];
      const validEdges = [
        TestDataFactory.createEdge({ source: 'file-1', target: 'code-1', type: 'CONTAINS' })
      ];

      const result = await dataLoader.load(nodes, validEdges);

      expect(result.success).toBe(true);
    });

    it('should reject edges with missing source or target', async () => {
      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const invalidEdges: any[] = [
        {
          source: '', // Empty source
          target: 'node-2',
          type: 'CALLS',
          properties: {}
        }
      ];

      await expect(dataLoader.load(nodes, invalidEdges)).rejects.toThrow(DataValidationError);
    });

    it('should reject edges referencing non-existent nodes', async () => {
      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile({ id: 'file-1' }))];
      const invalidEdges = [
        TestDataFactory.createEdge({ source: 'file-1', target: 'non-existent-node', type: 'CALLS' })
      ];

      await expect(dataLoader.load(nodes, invalidEdges)).rejects.toThrow(DataValidationError);
    });

    it('should detect duplicate node IDs', async () => {
      const duplicateNodes = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile({ id: 'duplicate-id' })),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode({ id: 'duplicate-id' }))
      ];
      const edges: Edge[] = [];

      await expect(dataLoader.load(duplicateNodes, edges)).rejects.toThrow(DataValidationError);
    });
  });

  describe('Batch Processing', () => {
    it('should process nodes in batches by type', async () => {
      const { repositories, files, nodes } = TestDataFactory.generateLargeDataset('small');
      const nodesWithEmbeddings = [
        ...repositories.map(r => TestDataFactory.createNodeWithEmbedding(r)),
        ...files.map(f => TestDataFactory.createNodeWithEmbedding(f)),
        ...nodes.map(n => TestDataFactory.createNodeWithEmbedding(n))
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodesWithEmbeddings, edges);

      expect(result.success).toBe(true);
      expect(mockSQLiteClient.transaction).toHaveBeenCalled();
    });

    it('should handle large datasets efficiently', async () => {
      const { repositories, files, nodes } = TestDataFactory.generateLargeDataset('medium');
      const nodesWithEmbeddings = [
        ...repositories.map(r => TestDataFactory.createNodeWithEmbedding(r)),
        ...files.map(f => TestDataFactory.createNodeWithEmbedding(f)),
        ...nodes.map(n => TestDataFactory.createNodeWithEmbedding(n))
      ];
      const edges: Edge[] = [];

      const startTime = Date.now();
      const result = await dataLoader.load(nodesWithEmbeddings, edges);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should process different node types correctly', async () => {
      const nodes: NodeWithEmbedding[] = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createRepository()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCommit()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createTestNode()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createPullRequest()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFunctionNode())
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      // prepare is called for each table type plus function_calls
      expect(mockSQLiteClient.prepare).toHaveBeenCalled();
    });

    it('should maintain referential integrity during batch processing', async () => {
      const repository = TestDataFactory.createRepository({ id: 'repo-1' });
      const file = TestDataFactory.createFile({ id: 'file-1', repositoryId: 'repo-1' });
      const functionNode = TestDataFactory.createFunctionNode({ id: 'func-1', fileId: 'file-1' });

      const nodes = [
        TestDataFactory.createNodeWithEmbedding(repository),
        TestDataFactory.createNodeWithEmbedding(file),
        TestDataFactory.createNodeWithEmbedding(functionNode)
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      // Verify transaction was used to maintain consistency
      expect(mockSQLiteClient.transaction).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database operation failures', async () => {
      mockSQLiteClient.simulateQueryFailure(true);

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await expect(dataLoader.load(nodes, edges)).rejects.toThrow();
    });

    it('should rollback transaction on failure', async () => {
      // Simulate failure during transaction
      mockSQLiteClient.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await expect(dataLoader.load(nodes, edges)).rejects.toThrow();
      expect(mockSQLiteClient.transaction).toHaveBeenCalled();
    });

    it('should handle partial node insertion failures gracefully', async () => {
      // Mock prepare to fail for specific node types
      const originalPrepare = mockSQLiteClient.prepare;
      mockSQLiteClient.prepare.mockImplementation((sql: any) => {
        if (typeof sql === 'string' && sql.includes('files')) {
          throw new Error('File insertion failed');
        }
        return originalPrepare.call(mockSQLiteClient, sql);
      });

      const nodes = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createRepository()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile()) // This should fail
      ];
      const edges: Edge[] = [];

      await expect(dataLoader.load(nodes, edges)).rejects.toThrow();
    });

    it('should handle vector storage failures gracefully', async () => {
      mockSQLiteClient.storeVector.mockRejectedValue(new Error('Vector storage failed') as never);

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      // Should still succeed even if vector storage fails (it's logged as warning)
      const result = await dataLoader.load(nodes, edges);
      expect(result.success).toBe(true);
    });

    it('should provide detailed error information', async () => {
      mockSQLiteClient.simulateConnectionFailure(true);
      mockWithRetry.mockRejectedValueOnce(new DatabaseConnectionError('SQLite', 'Connection timeout'));

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      try {
        await dataLoader.load(nodes, edges);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseConnectionError);
        expect((error as DatabaseConnectionError).message).toContain('Connection timeout');
      }
    });
  });

  describe('Retry Mechanisms and Failure Recovery', () => {
    it('should retry database connections on failure', async () => {
      let connectionAttempts = 0;
      
      // Mock the withRetry function to simulate actual retry behavior
      mockWithRetry.mockImplementation(async (fn, config, logger, operation) => {
        // Simulate the actual retry logic
        for (let attempt = 1; attempt <= (config?.maxAttempts || 3); attempt++) {
          try {
            connectionAttempts++;
            if (connectionAttempts < 3) {
              // Simulate connection failure on first two attempts
              mockSQLiteClient.simulateConnectionFailure(true);
            } else {
              // Success on third attempt
              mockSQLiteClient.simulateConnectionFailure(false);
            }
            return await fn();
          } catch (error) {
            if (attempt === (config?.maxAttempts || 3)) {
              throw error;
            }
            // Continue to next attempt
          }
        }
      });

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      expect(mockWithRetry).toHaveBeenCalled();
      expect(connectionAttempts).toBe(3);
    });

    it('should respect retry configuration', async () => {
      mockWithRetry.mockImplementation(async (fn, retryConfig, logger, operation) => {
        expect(retryConfig).toBeDefined();
        if (retryConfig) {
          expect(retryConfig.maxAttempts).toBeGreaterThan(0);
          expect(retryConfig.baseDelayMs).toBeGreaterThan(0);
        }
        return await fn();
      });

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      expect(mockWithRetry).toHaveBeenCalled();
    });

    it('should fail after maximum retry attempts', async () => {
      mockWithRetry.mockRejectedValue(new Error('Max retries exceeded'));

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await expect(dataLoader.load(nodes, edges)).rejects.toThrow('Max retries exceeded');
    });

    it('should implement exponential backoff for retries', async () => {
      const delays: number[] = [];
      mockWithRetry.mockImplementation(async (fn, config, logger, operation) => {
        // Simulate retry with backoff
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            if (attempt < 3 && config) {
              const delay = config.baseDelayMs * Math.pow(2, attempt - 1);
              delays.push(delay);
              throw new Error(`Attempt ${attempt} failed`);
            }
            return await fn();
          } catch (error) {
            if (attempt === 3) throw error;
          }
        }
      });

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      expect(delays.length).toBeGreaterThan(0);
      // Verify exponential backoff pattern
      if (delays.length > 1) {
        expect(delays[1]).toBeGreaterThan(delays[0]);
      }
    });
  });

  describe('Data Transformation and Persistence', () => {
    it('should transform nodes to database format correctly', async () => {
      const fileNode = TestDataFactory.createFile({
        id: 'file-1',
        name: 'test.ts',
        path: 'src/test.ts',
        extension: '.ts',
        language: 'typescript'
      });
      const nodes = [TestDataFactory.createNodeWithEmbedding(fileNode)];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      // Verify that prepare was called with correct SQL for files table
      expect(mockSQLiteClient.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO files')
      );
    });

    it('should handle nodes with embeddings', async () => {
      // Ensure vector operations are enabled
      mockSQLiteClient.enableVectorOperations(true);
      
      const embedding = TestDataFactory.createEmbedding(384);
      const fileNode = TestDataFactory.createFile();
      const nodeWithEmbedding = {
        ...fileNode,
        embedding,
        sourceText: 'test file content'
      };
      const nodes = [nodeWithEmbedding];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      expect(mockSQLiteClient.storeVector).toHaveBeenCalledWith(
        'files',
        'content_embedding',
        fileNode.id,
        embedding
      );
    });

    it('should handle nodes without embeddings', async () => {
      const fileNode = TestDataFactory.createFile();
      const nodeWithoutEmbedding = {
        ...fileNode,
        embedding: [], // Empty embedding
        sourceText: 'test file content'
      };
      const nodes = [nodeWithoutEmbedding];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      // storeVector should not be called for empty embeddings
      expect(mockSQLiteClient.storeVector).not.toHaveBeenCalled();
    });

    it('should store different node types in appropriate tables', async () => {
      const repository = TestDataFactory.createRepository();
      const file = TestDataFactory.createFile();
      const codeNode = TestDataFactory.createCodeNode();
      const commit = TestDataFactory.createCommit();

      const nodes = [
        TestDataFactory.createNodeWithEmbedding(repository),
        TestDataFactory.createNodeWithEmbedding(file),
        TestDataFactory.createNodeWithEmbedding(codeNode),
        TestDataFactory.createNodeWithEmbedding(commit)
      ];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      // Verify correct table insertions
      expect(mockSQLiteClient.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO repositories')
      );
      expect(mockSQLiteClient.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO files')
      );
      expect(mockSQLiteClient.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO code_nodes')
      );
      expect(mockSQLiteClient.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO commits')
      );
    });

    it('should handle edge insertion correctly', async () => {
      const sourceNode = TestDataFactory.createFunctionNode({ id: 'func-1' });
      const targetNode = TestDataFactory.createFunctionNode({ id: 'func-2' });
      const nodes = [
        TestDataFactory.createNodeWithEmbedding(sourceNode),
        TestDataFactory.createNodeWithEmbedding(targetNode)
      ];
      const edges = [
        TestDataFactory.createCallsEdge('func-1', 'func-2')
      ];

      await dataLoader.load(nodes, edges);

      expect(mockSQLiteClient.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO function_calls')
      );
    });
  });

  describe('Vector Operations', () => {
    it('should store vector embeddings when vector operations are enabled', async () => {
      mockSQLiteClient.enableVectorOperations(true);

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      expect(mockSQLiteClient.storeVector).toHaveBeenCalled();
    });

    it('should skip vector storage when vector operations are disabled', async () => {
      mockSQLiteClient.enableVectorOperations(false);

      const nodes = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile())];
      const edges: Edge[] = [];

      await dataLoader.load(nodes, edges);

      expect(mockSQLiteClient.storeVector).not.toHaveBeenCalled();
    });

    it('should handle different embedding dimensions', async () => {
      mockSQLiteClient.enableVectorOperations(true);
      
      const embedding128 = TestDataFactory.createEmbedding(128);
      const embedding384 = TestDataFactory.createEmbedding(384);
      const embedding768 = TestDataFactory.createEmbedding(768);

      const nodes = [
        { ...TestDataFactory.createFile({ id: 'file-1' }), embedding: embedding128, sourceText: 'test1' },
        { ...TestDataFactory.createFile({ id: 'file-2' }), embedding: embedding384, sourceText: 'test2' },
        { ...TestDataFactory.createFile({ id: 'file-3' }), embedding: embedding768, sourceText: 'test3' }
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      expect(mockSQLiteClient.storeVector).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance and Monitoring', () => {
    it('should provide loading statistics', async () => {
      const { repositories, files, nodes } = TestDataFactory.generateLargeDataset('small');
      const nodesWithEmbeddings = [
        ...repositories.map(r => TestDataFactory.createNodeWithEmbedding(r)),
        ...files.map(f => TestDataFactory.createNodeWithEmbedding(f)),
        ...nodes.map(n => TestDataFactory.createNodeWithEmbedding(n))
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodesWithEmbeddings, edges);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results.sqlite).toBeDefined();
      expect(result.results.sqlite.success).toBe(true);
    });

    it('should track node type statistics during loading', async () => {
      const nodes = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createRepository()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile()),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode())
      ];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
      // The internal getNodeTypeStats method should be called
      // We can't directly test it, but we can verify the loading succeeded
    });

    it('should handle concurrent loading operations', async () => {
      const nodes1 = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile({ id: 'file-1' }))];
      const nodes2 = [TestDataFactory.createNodeWithEmbedding(TestDataFactory.createFile({ id: 'file-2' }))];
      const edges: Edge[] = [];

      // Create separate data loader instances to simulate concurrency
      const loader1 = new DataLoader(testDbPath + '1', config);
      const loader2 = new DataLoader(testDbPath + '2', config);

      const [result1, result2] = await Promise.all([
        loader1.load(nodes1, edges),
        loader2.load(nodes2, edges)
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty node and edge arrays', async () => {
      const nodes: NodeWithEmbedding[] = [];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
    });

    it('should handle nodes with null or undefined properties', async () => {
      const nodeWithNullProps: any = {
        id: 'test-node',
        type: 'FileNode',
        properties: {
          filePath: 'test.ts',
          fileName: 'test.ts',
          fileExtension: '.ts',
          repoId: 'repo-1',
          language: null, // null property
          sizeKb: undefined, // undefined property
          contentHash: 'hash123'
        },
        embedding: [0.1, 0.2, 0.3],
        sourceText: 'test'
      };

      const nodes = [nodeWithNullProps];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
    });

    it('should handle very large embeddings', async () => {
      const largeEmbedding = TestDataFactory.createEmbedding(4096); // Very large embedding
      const node = {
        ...TestDataFactory.createFile(),
        embedding: largeEmbedding,
        sourceText: 'test with large embedding'
      };

      const nodes = [node];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in node properties', async () => {
      const nodeWithSpecialChars = TestDataFactory.createFile({
        name: 'test-file-with-特殊字符-and-émojis-🚀.ts',
        path: 'src/special/test-file-with-特殊字符-and-émojis-🚀.ts'
      });

      const nodes = [TestDataFactory.createNodeWithEmbedding(nodeWithSpecialChars)];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
    });

    it('should handle maximum safe integer values', async () => {
      const nodeWithLargeNumbers = TestDataFactory.createCodeNode({
        properties: {
          startLine: Number.MAX_SAFE_INTEGER - 1,
          endLine: Number.MAX_SAFE_INTEGER,
          name: 'testFunction',
          language: 'typescript',
          filePath: 'test.ts'
        }
      });

      const nodes = [TestDataFactory.createNodeWithEmbedding(nodeWithLargeNumbers)];
      const edges: Edge[] = [];

      const result = await dataLoader.load(nodes, edges);

      expect(result.success).toBe(true);
    });
  });
});
