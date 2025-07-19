/**
 * @file Simplified integration tests focusing on core database operations and error handling.
 */

import { DataLoader } from '../src/modules/data-loader';
import { ConfigManager } from '../src/config';
import { SQLiteClient, TinkerGraphClient } from '../src/persistence/db-clients';
import { NodeWithEmbedding, Edge, FileNode, RepositoryNode } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Integration: Core Database Operations', () => {
  let config: ConfigManager;
  let dataLoader: DataLoader;
  let sqliteClient: SQLiteClient;
  let tinkergraphClient: TinkerGraphClient;
  
  const testDbPath = path.join(__dirname, 'test-simple-integration.db');
  const testLanceDbPath = path.join(__dirname, 'test-simple-integration-lancedb');

  beforeEach(async () => {
    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }

    // Initialize configuration and components
    config = new ConfigManager(__dirname);
    config.updateConfig({
      database: {
        lancedb: { path: testLanceDbPath },
        sqlite: { path: testDbPath },
        tinkergraph: { url: 'ws://localhost:8182/gremlin' }
      }
    });

    dataLoader = new DataLoader(testLanceDbPath, testDbPath, 'ws://localhost:8182/gremlin', config);
    sqliteClient = new SQLiteClient(testDbPath);
    tinkergraphClient = new TinkerGraphClient('ws://localhost:8182/gremlin');
  });

  afterEach(async () => {
    // Clean up database connections
    if (sqliteClient.isConnectedToDatabase()) {
      await sqliteClient.disconnect();
    }
    if (tinkergraphClient.isConnectedToDatabase()) {
      await tinkergraphClient.disconnect();
    }

    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }
  });

  describe('Database Connectivity and Health Checks', () => {
    it('should verify database connectivity', async () => {
      const connectivity = await dataLoader.verifyDatabaseConnectivity();
      
      expect(connectivity).toHaveProperty('lancedb');
      expect(connectivity).toHaveProperty('sqlite');
      expect(connectivity).toHaveProperty('tinkergraph');
      expect(typeof connectivity.lancedb).toBe('boolean');
      expect(typeof connectivity.sqlite).toBe('boolean');
      expect(typeof connectivity.tinkergraph).toBe('boolean');
    });

    it('should perform health check on databases', async () => {
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
      expect(result.results).toHaveProperty('lancedb');
      expect(result.results).toHaveProperty('sqlite');
      expect(result.results).toHaveProperty('tinkergraph');
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
        path.join(invalidDir, 'invalid-lancedb'),
        path.join(invalidDir, 'invalid-sqlite.db'),
        'ws://invalid:8182/gremlin',
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
      expect(stats.databases).toHaveProperty('lancedb');
      expect(stats.databases).toHaveProperty('sqlite');
      expect(stats.databases).toHaveProperty('tinkergraph');
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

  describe('TinkerGraph Specific Operations', () => {
    it('should connect to TinkerGraph', async () => {
      await tinkergraphClient.connect();
      expect(tinkergraphClient.isConnectedToDatabase()).toBe(true);
    });

    it('should handle vertex and edge operations', async () => {
      await tinkergraphClient.connect();
      
      const vertexResult = await tinkergraphClient.addVertex('TestNode', {
        id: 'test-vertex',
        name: 'Test Vertex'
      });
      
      expect(vertexResult).toBeDefined();
    });
  });
});
