/**
 * @file Tests for the enhanced polyglot data persistence functionality in DataLoader.
 */

import { DataLoader } from '../src/modules/data-loader';
import { ConfigManager } from '../src/config';
import { NodeWithEmbedding, Edge, FileNode, RepositoryNode } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('DataLoader Polyglot Persistence', () => {
  let dataLoader: DataLoader;
  let config: ConfigManager;
  const testDbPath = path.join(__dirname, 'test-polyglot.db');
  const testLanceDbPath = path.join(__dirname, 'test-lancedb');

  beforeEach(() => {
    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }

    config = new ConfigManager(__dirname);
    dataLoader = new DataLoader(
      testLanceDbPath,
      testDbPath,
      'ws://localhost:8182/gremlin',
      config
    );
  });

  afterEach(() => {
    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }
  });

  describe('Database Connectivity Verification', () => {
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

  describe('Polyglot Data Loading', () => {
    it('should load data to multiple databases with fallback handling', async () => {
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
        } as NodeWithEmbedding & { properties: RepositoryNode['properties'] },
        {
          id: 'file-1',
          type: 'FileNode',
          properties: {
            filePath: '/test/repo/file.ts',
            fileName: 'file.ts',
            fileExtension: '.ts',
            aiSummary: 'Test file',
          },
          embedding: new Array(384).fill(0.2),
        } as NodeWithEmbedding & { properties: FileNode['properties'] },
      ];

      const testEdges: Edge[] = [
        {
          type: 'CONTAINS',
          source: 'repo-1',
          target: 'file-1',
          properties: {},
        },
      ];

      const result = await dataLoader.load(testNodes, testEdges);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result.results).toHaveProperty('lancedb');
      expect(result.results).toHaveProperty('sqlite');
      expect(result.results).toHaveProperty('tinkergraph');
      
      // At least one database should succeed
      const successfulDatabases = Object.values(result.results).filter(r => r.success).length;
      expect(successfulDatabases).toBeGreaterThan(0);
    });

    it('should handle partial failures gracefully', async () => {
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
        } as NodeWithEmbedding & { properties: RepositoryNode['properties'] },
      ];

      const testEdges: Edge[] = [];

      // This should succeed even if some databases fail
      const result = await dataLoader.load(testNodes, testEdges);
      
      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
    });
  });

  describe('Data Consistency Verification', () => {
    it('should verify data consistency across databases', async () => {
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
        } as NodeWithEmbedding & { properties: RepositoryNode['properties'] },
      ];

      const consistency = await dataLoader.verifyDataConsistency(testNodes);
      
      expect(consistency).toHaveProperty('consistent');
      expect(consistency).toHaveProperty('issues');
      expect(typeof consistency.consistent).toBe('boolean');
      expect(Array.isArray(consistency.issues)).toBe(true);
    });
  });

  describe('Retry Mechanisms', () => {
    it('should retry failed operations', async () => {
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
        } as NodeWithEmbedding & { properties: RepositoryNode['properties'] },
      ];

      const testEdges: Edge[] = [];
      const failedDatabases = ['sqlite'];

      const result = await dataLoader.retryFailedOperations(testNodes, testEdges, failedDatabases);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide comprehensive statistics', async () => {
      const stats = await dataLoader.getStats();
      
      expect(stats).toHaveProperty('databases');
      expect(stats).toHaveProperty('lastLoad');
      expect(stats).toHaveProperty('connectivity');
      expect(stats.databases).toHaveProperty('lancedb');
      expect(stats.databases).toHaveProperty('sqlite');
      expect(stats.databases).toHaveProperty('tinkergraph');
      expect(stats.connectivity).toHaveProperty('lancedb');
      expect(stats.connectivity).toHaveProperty('sqlite');
      expect(stats.connectivity).toHaveProperty('tinkergraph');
    });
  });
});
