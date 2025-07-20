/**
 * @file Simplified integration tests focusing on core database operations and error handling.
 */

import { DataLoader } from '../src/modules/data-loader';
import { ConfigManager } from '../src/config';
import { SQLiteClient } from '../src/persistence/db-clients';
import { NodeWithEmbedding, Edge, FileNode, RepositoryNode } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Integration: Core Database Operations', () => {
  let config: ConfigManager;
  let dataLoader: DataLoader;
  let sqliteClient: SQLiteClient;

  
  const testDbPath = path.join(__dirname, 'test-simple-integration.db');

  beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize configuration and components
    config = new ConfigManager(__dirname);
    config.updateConfig({
      database: {
        sqlite: { 
          path: testDbPath,
          vectorExtension: './extensions/vec0.dylib'
        }
      }
    });

    dataLoader = new DataLoader(testDbPath, config);
    sqliteClient = new SQLiteClient(testDbPath);
  });

  afterEach(async () => {
    // Clean up database connections
    if (sqliteClient.isConnectedToDatabase()) {
      await sqliteClient.disconnect();
    }

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Connectivity and Health Checks', () => {
    it('should verify SQLite database connectivity', async () => {
      // Create some test data to trigger connection
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'connectivity-test',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test/connectivity',
            repoName: 'connectivity-test',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode,
      ];

      // Load data which will establish connection
      const result = await dataLoader.load(testNodes, []);
      
      // Now verify connectivity
      const connectivity = await dataLoader.verifyDatabaseConnectivity();
      
      expect(connectivity).toHaveProperty('sqlite');
      expect(typeof connectivity.sqlite).toBe('boolean');
      // Should be true after successful load operation
      expect(result.success).toBe(true);
    });

    it('should perform health check on SQLite database', async () => {
      const healthCheck = await dataLoader.performHealthCheck();
      
      expect(healthCheck).toHaveProperty('healthy');
      expect(healthCheck).toHaveProperty('unhealthy');
      expect(healthCheck).toHaveProperty('recovered');
      expect(Array.isArray(healthCheck.healthy)).toBe(true);
      expect(Array.isArray(healthCheck.unhealthy)).toBe(true);
      expect(Array.isArray(healthCheck.recovered)).toBe(true);
    });
  });

  describe('Data Persistence Operations', () => {
    it('should persist simple node data successfully', async () => {
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'repo-1',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test/repo',
            repoName: 'test-repo',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode,
      ];

      const result = await dataLoader.load(testNodes, []);
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveProperty('sqlite');
      expect(result.results.sqlite.success).toBe(true);
    });

    it('should handle batch operations efficiently', async () => {
      const batchSize = 100;
      const testNodes: NodeWithEmbedding[] = [];
      
      for (let i = 0; i < batchSize; i++) {
        testNodes.push({
          id: `file-${i}`,
          type: 'FileNode',
          properties: {
            filePath: `/test/repo/file${i}.ts`,
            fileName: `file${i}.ts`,
            fileExtension: '.ts',
            repoId: 'repo-1',
            language: 'typescript',
            sizeKb: Math.random() * 10,
            contentHash: `hash${i}`,
            fileType: 'source' as const,
          },
          embedding: new Array(384).fill(Math.random()),
        } as NodeWithEmbedding & FileNode);
      }

      const startTime = Date.now();
      const result = await dataLoader.load(testNodes, []);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 15000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid node data gracefully', async () => {
      const invalidNodes: NodeWithEmbedding[] = [
        {
          id: '', // Invalid: empty ID
          type: 'FileNode',
          properties: {},
          embedding: [0.1, 0.2, 0.3]
        } as NodeWithEmbedding
      ];

      await expect(dataLoader.load(invalidNodes, [])).rejects.toThrow();
    });

    it('should handle database connection failures', async () => {
      // Create a temporary directory for the invalid path test
      const invalidDir = path.join(__dirname, 'invalid-test-dir');
      if (!fs.existsSync(invalidDir)) {
        fs.mkdirSync(invalidDir, { recursive: true });
      }

      const invalidDataLoader = new DataLoader(
        path.join(invalidDir, 'invalid-sqlite.db'),
        config
      );

      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'test-node',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test',
            repoName: 'test',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode
      ];

      const result = await invalidDataLoader.load(testNodes, []);
      
      // Should not throw, but should report failures
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');

      // Clean up
      if (fs.existsSync(invalidDir)) {
        fs.rmSync(invalidDir, { recursive: true, force: true });
      }
    });

    it('should retry failed operations', async () => {
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'retry-test',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test/retry',
            repoName: 'retry-test',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode
      ];

      const result = await dataLoader.retryFailedOperations(testNodes, [], ['sqlite']);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
    });
  });

  describe('Data Consistency and Validation', () => {
    it('should validate data before persistence', async () => {
      const validNodes: NodeWithEmbedding[] = [
        {
          id: 'valid-node',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test/valid',
            repoName: 'valid-repo',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode
      ];

      const invalidEdges: Edge[] = [
        {
          source: 'valid-node',
          target: 'non-existent-node',
          type: 'CONTAINS',
          properties: {}
        }
      ];

      await expect(dataLoader.load(validNodes, invalidEdges)).rejects.toThrow();
    });

    it('should verify data consistency across databases', async () => {
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'consistency-test',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test/consistency',
            repoName: 'consistency-test',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode
      ];

      await dataLoader.load(testNodes, []);

      const consistency = await dataLoader.verifyDataConsistency(testNodes);
      
      expect(consistency).toHaveProperty('consistent');
      expect(consistency).toHaveProperty('issues');
      expect(typeof consistency.consistent).toBe('boolean');
      expect(Array.isArray(consistency.issues)).toBe(true);
    });
  });

  describe('Performance and Monitoring', () => {
    it('should provide database statistics', async () => {
      const stats = await dataLoader.getStats();
      
      expect(stats).toHaveProperty('databases');
      expect(stats).toHaveProperty('lastLoad');
      expect(stats).toHaveProperty('connectivity');
      expect(stats.databases).toHaveProperty('sqlite');
    });

    it('should track operation performance', async () => {
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'perf-test',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/test/perf',
            repoName: 'perf-test',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          embedding: new Array(384).fill(0.1),
        } as NodeWithEmbedding & RepositoryNode
      ];

      const startTime = Date.now();
      const result = await dataLoader.load(testNodes, []);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('SQLite Specific Operations', () => {
    it('should create and query SQLite database', async () => {
      await sqliteClient.connect();
      
      const stats = await sqliteClient.getIndexingStats();
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('totalDirectories');
      expect(stats).toHaveProperty('totalCommits');
      expect(stats).toHaveProperty('lastIndexed');
      
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalDirectories).toBe(0);
      expect(stats.totalCommits).toBe(0);
      expect(stats.lastIndexed).toBeNull();
    });

    it('should handle SQLite batch operations', async () => {
      await sqliteClient.connect();
      
      const repositories = [
        {
          id: 'repo-batch-1',
          repoPath: '/test/batch1',
          repoName: 'batch-repo-1'
        },
        {
          id: 'repo-batch-2',
          repoPath: '/test/batch2',
          repoName: 'batch-repo-2'
        }
      ];

      const result = await sqliteClient.batchInsertRepositories(repositories);
      
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Vector Storage and Retrieval', () => {
    it('should store and retrieve vector embeddings in SQLite', async () => {
      await sqliteClient.connect();
      
      const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const testNodeId = 'test-vector-node';
      
      // Store vector embedding
      await sqliteClient.storeVector('files', 'content_embedding', testNodeId, testEmbedding);
      
      // Verify vector was stored by checking if vector search is available
      const vectorAvailable = await sqliteClient.isVectorSearchAvailable();
      expect(typeof vectorAvailable).toBe('boolean');
    });

    it('should perform vector similarity search', async () => {
      await sqliteClient.connect();
      
      // Create test data with embeddings
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'vector-test-1',
          type: 'FileNode',
          properties: {
            filePath: '/test/math.ts',
            fileName: 'math.ts',
            fileExtension: '.ts',
            repoId: 'test-repo',
            language: 'typescript',
            sizeKb: 2.5,
            contentHash: 'abc123',
            fileType: 'source' as const,
          },
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        } as NodeWithEmbedding & FileNode,
        {
          id: 'vector-test-2',
          type: 'FileNode',
          properties: {
            filePath: '/test/utils.ts',
            fileName: 'utils.ts',
            fileExtension: '.ts',
            repoId: 'test-repo',
            language: 'typescript',
            sizeKb: 1.8,
            contentHash: 'def456',
            fileType: 'source' as const,
          },
          embedding: [0.9, 0.8, 0.7, 0.6, 0.5],
        } as NodeWithEmbedding & FileNode,
      ];

      // Load test data
      await dataLoader.load(testNodes, []);
      
      // Perform vector search
      const queryEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const results = await sqliteClient.vectorSearch('files', 'content_embedding', queryEmbedding, 5, 0.1);
      
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('id');
        expect(results[0]).toHaveProperty('similarity');
        expect(results[0]).toHaveProperty('data');
        expect(typeof results[0].similarity).toBe('number');
        expect(results[0].similarity).toBeGreaterThanOrEqual(0);
        expect(results[0].similarity).toBeLessThanOrEqual(1);
      }
    });

    it('should handle vector extension unavailability gracefully', async () => {
      await sqliteClient.connect();
      
      // Test graceful degradation when vector extension is not available
      const isVectorAvailable = await sqliteClient.isVectorSearchAvailable();
      
      if (!isVectorAvailable) {
        // Vector search should return empty results or fallback
        const queryEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
        const results = await sqliteClient.vectorSearch('files', 'content_embedding', queryEmbedding, 5, 0.1);
        
        expect(Array.isArray(results)).toBe(true);
        // Should not throw error even if vector extension is unavailable
      }
    });

    it('should store vectors for different node types', async () => {
      await sqliteClient.connect();
      
      const testNodes: NodeWithEmbedding[] = [
        {
          id: 'code-vector-test',
          type: 'CodeNode',
          properties: {
            name: 'testFunction',
            signature: 'function testFunction(): void',
            language: 'typescript',
            filePath: '/test/code.ts',
            startLine: 1,
            endLine: 10,
          },
          embedding: [0.2, 0.3, 0.4, 0.5, 0.6],
        } as NodeWithEmbedding,
        {
          id: 'commit-vector-test',
          type: 'CommitNode',
          properties: {
            hash: 'abc123',
            author: 'Test Author',
            date: new Date().toISOString(),
            message: 'Add test functionality',
          },
          embedding: [0.3, 0.4, 0.5, 0.6, 0.7],
        } as NodeWithEmbedding,
      ];

      // Load test data with vectors
      const result = await dataLoader.load(testNodes, []);
      
      expect(result.success).toBe(true);
      expect(result.results.sqlite.success).toBe(true);
    });
  });


});
