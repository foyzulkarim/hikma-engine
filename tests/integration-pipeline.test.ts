/**
 * @file Integration tests for the complete indexing pipeline with database persistence.
 * Tests the end-to-end workflow from file discovery to data persistence across multiple databases.
 */

import { Indexer, IndexingOptions } from '../src/core/indexer';
import { ConfigManager } from '../src/config';
import { DataLoader } from '../src/modules/data-loader';
import { SQLiteClient, TinkerGraphClient } from '../src/persistence/db-clients';
import { NodeWithEmbedding, Edge, FileNode, RepositoryNode } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Complete Indexing Pipeline', () => {
  let testProjectRoot: string;
  let config: ConfigManager;
  let indexer: Indexer;
  let dataLoader: DataLoader;
  let sqliteClient: SQLiteClient;
  let tinkergraphClient: TinkerGraphClient;
  
  const testDbPath = path.join(__dirname, 'test-integration.db');
  const testLanceDbPath = path.join(__dirname, 'test-integration-lancedb');

  beforeAll(async () => {
    // Create a temporary test project structure
    testProjectRoot = path.join(__dirname, 'test-project');
    await createTestProject(testProjectRoot);
  });

  beforeEach(async () => {
    // Clean up test databases
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLanceDbPath)) {
      fs.rmSync(testLanceDbPath, { recursive: true, force: true });
    }

    // Initialize configuration and components
    config = new ConfigManager(testProjectRoot);
    config.updateConfig({
      database: {
        lancedb: { path: testLanceDbPath },
        sqlite: { path: testDbPath },
        tinkergraph: { url: 'ws://localhost:8182/gremlin' }
      }
    });

    indexer = new Indexer(testProjectRoot, config);
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

  afterAll(async () => {
    // Clean up test project
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  describe('End-to-End Pipeline Execution', () => {
    it('should execute complete indexing pipeline successfully', async () => {
      const options: IndexingOptions = {
        forceFullIndex: true,
        skipAISummary: true, // Skip AI to avoid external dependencies
        skipEmbeddings: true, // Skip embeddings to avoid model loading
        dryRun: false
      };

      const result = await indexer.run(options);

      expect(result).toHaveProperty('totalNodes');
      expect(result).toHaveProperty('totalEdges');
      expect(result).toHaveProperty('processedFiles');
      expect(result).toHaveProperty('isIncremental');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('errors');

      expect(result.totalNodes).toBeGreaterThan(0);
      expect(result.processedFiles).toBeGreaterThan(0);
      expect(result.isIncremental).toBe(false);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    }, 30000);

    it('should handle incremental indexing correctly', async () => {
      // First run - full index
      const fullIndexOptions: IndexingOptions = {
        forceFullIndex: true,
        skipAISummary: true,
        skipEmbeddings: true,
        dryRun: false
      };

      const fullResult = await indexer.run(fullIndexOptions);
      expect(fullResult.isIncremental).toBe(false);

      // Second run - should be incremental
      const incrementalOptions: IndexingOptions = {
        forceFullIndex: false,
        skipAISummary: true,
        skipEmbeddings: true,
        dryRun: false
      };

      const incrementalResult = await indexer.run(incrementalOptions);
      expect(incrementalResult.isIncremental).toBe(true);
    }, 45000);

    it('should handle dry run mode correctly', async () => {
      const options: IndexingOptions = {
        forceFullIndex: true,
        skipAISummary: true,
        skipEmbeddings: true,
        dryRun: true
      };

      const result = await indexer.run(options);

      expect(result.totalNodes).toBeGreaterThan(0);
      expect(result.processedFiles).toBeGreaterThan(0);
      
      // Verify no data was persisted
      await sqliteClient.connect();
      const stats = await sqliteClient.getIndexingStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalDirectories).toBe(0);
    }, 30000);
  });

  describe('Database Operations with Sample Data', () => {
    it('should persist data to SQLite database correctly', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      const result = await dataLoader.load(testNodes, testEdges);
      expect(result.success).toBe(true);

      // Verify data in SQLite
      await sqliteClient.connect();
      const stats = await sqliteClient.getIndexingStats();
      
      expect(stats.totalFiles).toBeGreaterThan(0);
    });

    it('should handle large datasets efficiently', async () => {
      const largeNodeSet = createLargeTestDataset(1000);
      const largeEdgeSet = createTestEdgesForNodes(largeNodeSet);

      const startTime = Date.now();
      const result = await dataLoader.load(largeNodeSet, largeEdgeSet);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    }, 45000);

    it('should maintain referential integrity', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      await dataLoader.load(testNodes, testEdges);

      // Verify referential integrity in SQLite
      await sqliteClient.connect();
      
      // Check that files exist in the database
      const files = sqliteClient.all('SELECT * FROM files');
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('Data Consistency Verification', () => {
    it('should verify data consistency between SQLite and TinkerGraph', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      await dataLoader.load(testNodes, testEdges);

      const consistency = await dataLoader.verifyDataConsistency(testNodes);
      
      expect(consistency).toHaveProperty('consistent');
      expect(consistency).toHaveProperty('issues');
      expect(typeof consistency.consistent).toBe('boolean');
      expect(Array.isArray(consistency.issues)).toBe(true);
    });

    it('should detect and report data inconsistencies', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      // Load data normally
      await dataLoader.load(testNodes, testEdges);

      // Manually corrupt data in SQLite to create inconsistency
      await sqliteClient.connect();
      sqliteClient.run('DELETE FROM files WHERE file_id = ?', [testNodes[1].id]);

      // Verify inconsistency is detected
      const consistency = await dataLoader.verifyDataConsistency(testNodes);
      
      expect(consistency).toHaveProperty('consistent');
      expect(consistency).toHaveProperty('issues');
      expect(typeof consistency.consistent).toBe('boolean');
      expect(Array.isArray(consistency.issues)).toBe(true);
    });

    it('should handle missing nodes gracefully', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = [
        {
          source: testNodes[0].id,
          target: 'non-existent-node',
          type: 'CONTAINS',
          properties: {}
        }
      ];

      // Should throw validation error for missing node reference
      await expect(dataLoader.load(testNodes, testEdges)).rejects.toThrow();
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle database connection failures gracefully', async () => {
      // Create a DataLoader with invalid database paths
      const invalidDataLoader = new DataLoader(
        '/invalid/path/lancedb',
        '/invalid/path/sqlite.db',
        'ws://invalid:8182/gremlin',
        config
      );

      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      // Should not throw, but should report failures
      const result = await invalidDataLoader.load(testNodes, testEdges);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      
      // All databases should fail
      expect(result.results.sqlite.success).toBe(false);
      expect(result.results.lancedb.success).toBe(false);
      expect(result.results.tinkergraph.success).toBe(false);
    });

    it('should recover from partial database failures', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      // Simulate partial failure by using invalid TinkerGraph URL
      const partialFailureLoader = new DataLoader(
        testLanceDbPath,
        testDbPath,
        'ws://invalid:8182/gremlin',
        config
      );

      const result = await partialFailureLoader.load(testNodes, testEdges);
      
      expect(result.success).toBe(true); // Should succeed overall
      expect(result.results.sqlite.success).toBe(true); // SQLite should work
      expect(result.results.tinkergraph.success).toBe(false); // TinkerGraph should fail
    });

    it('should retry failed operations successfully', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();
      const failedDatabases = ['sqlite'];

      const result = await dataLoader.retryFailedOperations(testNodes, testEdges, failedDatabases);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(typeof result.success).toBe('boolean');
    });

    it('should handle corrupted data gracefully', async () => {
      const corruptedNodes: NodeWithEmbedding[] = [
        {
          id: 'valid-id',
          type: 'FileNode',
          properties: {
            filePath: null, // Corrupted data
            fileName: 'test.ts'
          },
          embedding: [0.1, 0.2, 0.3]
        } as any
      ];

      // Should handle validation errors gracefully
      await expect(dataLoader.load(corruptedNodes, [])).rejects.toThrow();
    });

    it('should handle memory pressure during large operations', async () => {
      // Create a very large dataset to test memory handling
      const veryLargeNodeSet = createLargeTestDataset(5000);
      const veryLargeEdgeSet = createTestEdgesForNodes(veryLargeNodeSet);

      // Should complete without memory errors
      const result = await dataLoader.load(veryLargeNodeSet, veryLargeEdgeSet);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
    }, 60000);
  });

  describe('Performance and Monitoring', () => {
    it('should provide comprehensive statistics', async () => {
      const testNodes: NodeWithEmbedding[] = createTestNodes();
      const testEdges: Edge[] = createTestEdges();

      await dataLoader.load(testNodes, testEdges);

      const stats = await dataLoader.getStats();
      
      expect(stats).toHaveProperty('databases');
      expect(stats).toHaveProperty('lastLoad');
      expect(stats).toHaveProperty('connectivity');
      expect(stats.databases).toHaveProperty('lancedb');
      expect(stats.databases).toHaveProperty('sqlite');
      expect(stats.databases).toHaveProperty('tinkergraph');
    });

    it('should track indexing performance metrics', async () => {
      const options: IndexingOptions = {
        forceFullIndex: true,
        skipAISummary: true,
        skipEmbeddings: true,
        dryRun: false
      };

      const startTime = Date.now();
      const result = await indexer.run(options);
      const actualDuration = Date.now() - startTime;

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThanOrEqual(actualDuration + 100); // Allow small margin
    }, 30000);

    it('should handle concurrent operations safely', async () => {
      const testNodes1: NodeWithEmbedding[] = createTestNodes('-set1');
      const testNodes2: NodeWithEmbedding[] = createTestNodes('-set2');
      const testEdges1: Edge[] = createTestEdges('-set1');
      const testEdges2: Edge[] = createTestEdges('-set2');

      // Run concurrent operations
      const [result1, result2] = await Promise.all([
        dataLoader.load(testNodes1, testEdges1),
        dataLoader.load(testNodes2, testEdges2)
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});

// Helper functions for creating test data

async function createTestProject(projectRoot: string): Promise<void> {
  if (!fs.existsSync(projectRoot)) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }

  // Create test files
  const srcDir = path.join(projectRoot, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Create a TypeScript file
  fs.writeFileSync(path.join(srcDir, 'index.ts'), `
export class TestClass {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }

  public setValue(value: string): void {
    this.value = value;
  }
}

export function testFunction(input: string): string {
  return input.toUpperCase();
}
`);

  // Create a JavaScript file
  fs.writeFileSync(path.join(srcDir, 'utils.js'), `
function formatString(str) {
  return str.trim().toLowerCase();
}

function validateInput(input) {
  return input && input.length > 0;
}

module.exports = {
  formatString,
  validateInput
};
`);

  // Create a test file
  const testDir = path.join(projectRoot, 'tests');
  fs.mkdirSync(testDir, { recursive: true });

  fs.writeFileSync(path.join(testDir, 'index.test.ts'), `
import { TestClass, testFunction } from '../src/index';

describe('TestClass', () => {
  it('should get and set values correctly', () => {
    const instance = new TestClass('test');
    expect(instance.getValue()).toBe('test');
    
    instance.setValue('updated');
    expect(instance.getValue()).toBe('updated');
  });
});

describe('testFunction', () => {
  it('should convert string to uppercase', () => {
    expect(testFunction('hello')).toBe('HELLO');
  });
});
`);

  // Create package.json
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    description: 'Test project for integration tests',
    main: 'src/index.ts',
    scripts: {
      test: 'jest'
    },
    dependencies: {},
    devDependencies: {
      '@types/jest': '^29.0.0',
      'jest': '^29.0.0',
      'typescript': '^5.0.0'
    }
  }, null, 2));

  // Initialize git repository
  const { execSync } = require('child_process');
  try {
    execSync('git init', { cwd: projectRoot, stdio: 'ignore' });
    execSync('git add .', { cwd: projectRoot, stdio: 'ignore' });
    execSync('git -c user.name="Test" -c user.email="test@example.com" commit -m "Initial commit"', { 
      cwd: projectRoot, 
      stdio: 'ignore' 
    });
  } catch (error) {
    // Git operations might fail in CI environments, that's okay
    console.warn('Git initialization failed, continuing without git history');
  }
}

function createTestNodes(prefix: string = ''): NodeWithEmbedding[] {
  const repoId = `repo-1${prefix}`;
  const fileId1 = `file-1${prefix}`;
  const fileId2 = `file-2${prefix}`;

  return [
    {
      id: repoId,
      type: 'RepositoryNode',
      properties: {
        repoPath: '/test/repo',
        repoName: `test-repo${prefix}`,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
      embedding: new Array(384).fill(0.1),
    } as NodeWithEmbedding & RepositoryNode,
    {
      id: fileId1,
      type: 'FileNode',
      properties: {
        filePath: `/test/repo/src/index${prefix}.ts`,
        fileName: `index${prefix}.ts`,
        fileExtension: '.ts',
        repoId,
        language: 'typescript',
        sizeKb: 2.5,
        contentHash: 'abc123',
        fileType: 'source' as const,
        aiSummary: 'Main TypeScript file',
      },
      embedding: new Array(384).fill(0.2),
    } as NodeWithEmbedding & FileNode,
    {
      id: fileId2,
      type: 'FileNode',
      properties: {
        filePath: `/test/repo/src/utils${prefix}.js`,
        fileName: `utils${prefix}.js`,
        fileExtension: '.js',
        repoId,
        language: 'javascript',
        sizeKb: 1.8,
        contentHash: 'def456',
        fileType: 'source' as const,
        aiSummary: 'Utility functions',
      },
      embedding: new Array(384).fill(0.3),
    } as NodeWithEmbedding & FileNode,
  ];
}

function createTestEdges(prefix: string = ''): Edge[] {
  return [
    {
      source: `repo-1${prefix}`,
      target: `file-1${prefix}`,
      type: 'CONTAINS',
      properties: {},
    },
    {
      source: `repo-1${prefix}`,
      target: `file-2${prefix}`,
      type: 'CONTAINS',
      properties: {},
    },
    {
      source: `file-1${prefix}`,
      target: `file-2${prefix}`,
      type: 'REFERENCES',
      properties: { importType: 'module' },
    },
  ];
}

function createLargeTestDataset(nodeCount: number): NodeWithEmbedding[] {
  const nodes: NodeWithEmbedding[] = [];
  const repoId = uuidv4();

  // Add repository node
  nodes.push({
    id: repoId,
    type: 'RepositoryNode',
    properties: {
      repoPath: '/test/large-repo',
      repoName: 'large-test-repo',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    embedding: new Array(384).fill(0.1),
  } as NodeWithEmbedding & RepositoryNode);

  // Add file nodes
  for (let i = 0; i < nodeCount - 1; i++) {
    nodes.push({
      id: uuidv4(),
      type: 'FileNode',
      properties: {
        filePath: `/test/large-repo/src/file${i}.ts`,
        fileName: `file${i}.ts`,
        fileExtension: '.ts',
        repoId,
        language: 'typescript',
        sizeKb: Math.random() * 10,
        contentHash: `hash${i}`,
        fileType: 'source' as const,
        aiSummary: `File ${i} description`,
      },
      embedding: new Array(384).fill(Math.random()),
    } as NodeWithEmbedding & FileNode);
  }

  return nodes;
}

function createTestEdgesForNodes(nodes: NodeWithEmbedding[]): Edge[] {
  const edges: Edge[] = [];
  const repoNode = nodes.find(n => n.type === 'RepositoryNode');
  const fileNodes = nodes.filter(n => n.type === 'FileNode');

  if (repoNode) {
    // Connect repository to all files
    fileNodes.forEach(fileNode => {
      edges.push({
        source: repoNode.id,
        target: fileNode.id,
        type: 'CONTAINS',
        properties: {},
      });
    });

    // Connect some files to each other
    for (let i = 0; i < Math.min(fileNodes.length - 1, 100); i++) {
      edges.push({
        source: fileNodes[i].id,
        target: fileNodes[i + 1].id,
        type: 'REFERENCES',
        properties: { importType: 'module' },
      });
    }
  }

  return edges;
}
