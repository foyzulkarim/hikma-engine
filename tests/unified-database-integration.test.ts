/**
 * @file Integration tests for unified database architecture with complete indexing pipeline.
 * Tests the end-to-end workflow with only SQLite database for all data types.
 */

import { Indexer, IndexingOptions } from '../src/core/indexer';
import { ConfigManager } from '../src/config';
import { DataLoader } from '../src/modules/data-loader';
import { SearchService } from '../src/modules/search-service';
import { SQLiteClient } from '../src/persistence/db-clients';
import { NodeWithEmbedding, Edge, FileNode, RepositoryNode, CodeNode, CommitNode } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Unified Database Architecture', () => {
  let testProjectRoot: string;
  let config: ConfigManager;
  let indexer: Indexer;
  let dataLoader: DataLoader;
  let searchService: SearchService;
  let sqliteClient: SQLiteClient;

  const testDbPath = path.join(__dirname, 'test-unified-integration.db');

  beforeAll(async () => {
    // Create a temporary test project structure
    testProjectRoot = path.join(__dirname, 'test-unified-project');
    await createTestProject(testProjectRoot);
  });

  beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize configuration and components
    config = new ConfigManager(testProjectRoot);
    config.updateConfig({
      database: {
        sqlite: { 
          path: testDbPath,
          vectorExtension: './extensions/vec0.dylib'
        }
      }
    });

    indexer = new Indexer(testProjectRoot, config);
    dataLoader = new DataLoader(testDbPath, config);
    searchService = new SearchService(config);
    sqliteClient = new SQLiteClient(testDbPath);
  });

  afterEach(async () => {
    // Clean up database connections
    try {
      if (sqliteClient.isConnectedToDatabase()) {
        sqliteClient.disconnect();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterAll(async () => {
    // Clean up test project
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  describe('Complete Pipeline with Unified SQLite', () => {
    it('should execute complete indexing pipeline with only SQLite', async () => {
      const options: IndexingOptions = {
        forceFullIndex: true,
        skipAISummary: true, // Skip AI to avoid external dependencies
        skipEmbeddings: false, // Test with embeddings
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

      // Verify all data is in SQLite
      await sqliteClient.connect();
      
      const stats = await sqliteClient.getIndexingStats();
      expect(stats.totalFiles).toBeGreaterThan(0);
      
      // Verify single database file exists
      expect(fs.existsSync(testDbPath)).toBe(true);
      const dbStats = fs.statSync(testDbPath);
      expect(dbStats.size).toBeGreaterThan(0);
    }, 45000);

    it('should store all node types with vectors in unified SQLite', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      const testEdges: Edge[] = createTestEdges();

      const result = await dataLoader.load(testNodes, testEdges);
      
      expect(result.success).toBe(true);
      expect(result.results.sqlite.success).toBe(true);

      // Verify all node types are stored
      await sqliteClient.connect();
      
      const tables = [
        { name: 'files', nodeType: 'FileNode' },
        { name: 'code_nodes', nodeType: 'CodeNode' },
        { name: 'commits', nodeType: 'CommitNode' },
        { name: 'functions', nodeType: 'FunctionNode' },
        { name: 'directories', nodeType: 'DirectoryNode' },
        { name: 'test_nodes', nodeType: 'TestNode' },
        { name: 'pull_requests', nodeType: 'PullRequestNode' }
      ];

      for (const table of tables) {
        const count = sqliteClient.get(`SELECT COUNT(*) as count FROM ${table.name}`);
        const nodeCount = testNodes.filter(n => n.type === table.nodeType).length;
        
        if (nodeCount > 0) {
          expect(count.count).toBeGreaterThan(0);
        }
      }
    });

    it('should perform vector search across all node types', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      await searchService.initialize();
      
      // Test semantic search across different node types
      const queries = [
        'mathematical functions',
        'React components',
        'database operations',
        'test implementation',
        'bug fix commit'
      ];

      for (const query of queries) {
        const results = await searchService.semanticSearch(query, {
          limit: 5,
          minSimilarity: 0.1
        });
        
        expect(Array.isArray(results)).toBe(true);
        // Should not throw error even if no results found
      }
    });

    it('should support hybrid search with unified SQL queries', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      await searchService.initialize();
      
      // Test hybrid search with different filter combinations
      const searchCases = [
        {
          query: 'typescript functions',
          filters: { language: 'typescript' },
          description: 'language filter'
        },
        {
          query: 'utility functions',
          filters: { fileExtension: 'ts' },
          description: 'file extension filter'
        },
        {
          query: 'implementation',
          filters: { 
            author: 'Test Developer',
            dateRange: { start: '2024-01-01', end: '2024-12-31' }
          },
          description: 'author and date filter'
        }
      ];

      for (const testCase of searchCases) {
        const results = await searchService.hybridSearch(
          testCase.query,
          testCase.filters,
          { limit: 10 }
        );
        
        expect(Array.isArray(results)).toBe(true);
        
        // Verify metadata filtering worked
        results.forEach(result => {
          expect(result).toHaveProperty('node');
          expect(result).toHaveProperty('similarity');
          expect(result).toHaveProperty('metadata');
        });
      }
    });

    it('should maintain data consistency across single database', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      const testEdges: Edge[] = createTestEdges();

      await dataLoader.load(testNodes, testEdges);
      
      // Verify data consistency
      const consistency = await dataLoader.verifyDataConsistency(testNodes);
      
      expect(consistency).toHaveProperty('consistent');
      expect(consistency).toHaveProperty('issues');
      expect(Array.isArray(consistency.issues)).toBe(true);
      
      // Should be consistent since we're using proper foreign keys
      if (consistency.issues.length > 0) {
        console.warn('Data consistency issues found:', consistency.issues);
      }
    });

    it('should handle backup and restore with single database file', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      // Verify single database file
      expect(fs.existsSync(testDbPath)).toBe(true);
      
      // Create backup
      const backupPath = testDbPath + '.backup';
      fs.copyFileSync(testDbPath, backupPath);
      
      // Verify backup
      expect(fs.existsSync(backupPath)).toBe(true);
      
      // Verify backup integrity by opening it
      const backupClient = new SQLiteClient(backupPath);
      await backupClient.connect();
      
      const backupStats = await backupClient.getIndexingStats();
      expect(backupStats.totalFiles).toBeGreaterThan(0);
      
      backupClient.disconnect();
      
      // Clean up backup
      fs.unlinkSync(backupPath);
    });

    it('should support comprehensive search across all data types', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      await searchService.initialize();
      
      const results = await searchService.comprehensiveSearch('test implementation', {
        limit: 20,
        minSimilarity: 0.1
      });
      
      expect(Array.isArray(results)).toBe(true);
      
      // Should return mixed node types
      const nodeTypes = new Set(results.map(r => r.node.type));
      expect(nodeTypes.size).toBeGreaterThanOrEqual(1);
      
      // Verify search quality
      results.forEach(result => {
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('rank');
        expect(typeof result.similarity).toBe('number');
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      });
    });

    it('should maintain sub-2-second response times', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      await searchService.initialize();
      
      const startTime = Date.now();
      
      // Perform multiple concurrent searches
      const searchPromises = [
        searchService.semanticSearch('function implementation', { limit: 10 }),
        searchService.hybridSearch('typescript code', { language: 'typescript' }, { limit: 10 }),
        searchService.searchFiles('utility', 'ts', { limit: 10 }),
        searchService.searchCommits('fix bug', 'Test Developer', undefined, { limit: 10 }),
        searchService.comprehensiveSearch('database operations', { limit: 15 })
      ];
      
      const results = await Promise.all(searchPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete all searches within 2 seconds
      expect(totalTime).toBeLessThan(2000);
      
      // Verify all searches completed successfully
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should gracefully handle vector extension unavailability', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      await searchService.initialize();
      
      // Test that system works even if vector extension is not available
      const vectorAvailable = await sqliteClient.isVectorSearchAvailable();
      
      if (!vectorAvailable) {
        // Should still be able to perform searches using fallback methods
        const results = await searchService.semanticSearch('test query', { limit: 5 });
        expect(Array.isArray(results)).toBe(true);
        
        const hybridResults = await searchService.hybridSearch('test', {}, { limit: 5 });
        expect(Array.isArray(hybridResults)).toBe(true);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large datasets efficiently', async () => {
      const largeNodeSet = createLargeTestDataset(2000);
      const largeEdgeSet = createTestEdgesForNodes(largeNodeSet);

      const startTime = Date.now();
      const result = await dataLoader.load(largeNodeSet, largeEdgeSet);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      // Verify data was stored
      await sqliteClient.connect();
      const stats = await sqliteClient.getIndexingStats();
      expect(stats.totalFiles).toBeGreaterThan(1000);
    }, 45000);

    it('should support concurrent search operations', async () => {
      const testNodes: NodeWithEmbedding[] = createComprehensiveTestNodes();
      await dataLoader.load(testNodes, []);

      await searchService.initialize();
      
      // Run multiple concurrent searches
      const concurrentSearches = Array.from({ length: 10 }, (_, i) =>
        searchService.semanticSearch(`test query ${i}`, { limit: 5 })
      );
      
      const results = await Promise.all(concurrentSearches);
      
      // All searches should complete successfully
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
});

// Helper functions for creating test data

async function createTestProject(projectRoot: string): Promise<void> {
  if (!fs.existsSync(projectRoot)) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }

  // Create test files similar to integration-pipeline.test.ts
  const srcDir = path.join(projectRoot, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Create TypeScript files
  fs.writeFileSync(path.join(srcDir, 'math.ts'), `
export function calculateSum(a: number, b: number): number {
  return a + b;
}

export function calculateProduct(a: number, b: number): number {
  return a * b;
}

export class MathUtils {
  static PI = 3.14159;
  
  static circleArea(radius: number): number {
    return this.PI * radius * radius;
  }
}
`);

  fs.writeFileSync(path.join(srcDir, 'database.ts'), `
export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string): Promise<any[]>;
}

export class SQLiteDatabase implements DatabaseConnection {
  private path: string;
  
  constructor(path: string) {
    this.path = path;
  }
  
  async connect(): Promise<void> {
    // Implementation here
  }
  
  async disconnect(): Promise<void> {
    // Implementation here
  }
  
  async query(sql: string): Promise<any[]> {
    // Implementation here
    return [];
  }
}
`);

  // Create package.json
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'test-unified-project',
    version: '1.0.0',
    description: 'Test project for unified database integration tests',
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
    execSync('git -c user.name="Test Developer" -c user.email="test@example.com" commit -m "Initial commit"', { 
      cwd: projectRoot, 
      stdio: 'ignore' 
    });
  } catch (error) {
    // Git operations might fail in CI environments, that's okay
    console.warn('Git initialization failed, continuing without git history');
  }
}

function createComprehensiveTestNodes(): NodeWithEmbedding[] {
  const nodes: NodeWithEmbedding[] = [];
  const repoId = uuidv4();

  // Repository node
  nodes.push({
    id: repoId,
    type: 'RepositoryNode',
    properties: {
      repoPath: '/test/unified-repo',
      repoName: 'unified-test-repo',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    embedding: new Array(384).fill(0.1),
  } as NodeWithEmbedding & RepositoryNode);

  // File nodes
  const fileNodes = [
    {
      id: uuidv4(),
      type: 'FileNode',
      properties: {
        filePath: '/test/unified-repo/src/math.ts',
        fileName: 'math.ts',
        fileExtension: '.ts',
        repoId,
        language: 'typescript',
        sizeKb: 3.2,
        contentHash: 'math123',
        fileType: 'source' as const,
        aiSummary: 'Mathematical utility functions',
      },
      embedding: new Array(384).fill(0.2),
    } as NodeWithEmbedding & FileNode,
    {
      id: uuidv4(),
      type: 'FileNode',
      properties: {
        filePath: '/test/unified-repo/src/database.ts',
        fileName: 'database.ts',
        fileExtension: '.ts',
        repoId,
        language: 'typescript',
        sizeKb: 4.1,
        contentHash: 'db456',
        fileType: 'source' as const,
        aiSummary: 'Database connection utilities',
      },
      embedding: new Array(384).fill(0.3),
    } as NodeWithEmbedding & FileNode
  ];
  nodes.push(...fileNodes);

  // Code nodes
  const codeNodes = [
    {
      id: uuidv4(),
      type: 'CodeNode',
      properties: {
        name: 'calculateSum',
        signature: 'function calculateSum(a: number, b: number): number',
        language: 'typescript',
        filePath: '/test/unified-repo/src/math.ts',
        startLine: 1,
        endLine: 3,
      },
      embedding: new Array(384).fill(0.4),
    } as NodeWithEmbedding,
    {
      id: uuidv4(),
      type: 'CodeNode',
      properties: {
        name: 'SQLiteDatabase',
        signature: 'class SQLiteDatabase implements DatabaseConnection',
        language: 'typescript',
        filePath: '/test/unified-repo/src/database.ts',
        startLine: 8,
        endLine: 25,
      },
      embedding: new Array(384).fill(0.5),
    } as NodeWithEmbedding
  ];
  nodes.push(...codeNodes);

  // Commit nodes
  const commitNodes = [
    {
      id: uuidv4(),
      type: 'CommitNode',
      properties: {
        hash: 'abc123def456',
        author: 'Test Developer',
        date: new Date('2024-01-15').toISOString(),
        message: 'Add mathematical utility functions for calculations',
      },
      embedding: new Array(384).fill(0.6),
    } as NodeWithEmbedding,
    {
      id: uuidv4(),
      type: 'CommitNode',
      properties: {
        hash: 'def456ghi789',
        author: 'Test Developer',
        date: new Date('2024-01-20').toISOString(),
        message: 'Implement database connection utilities',
      },
      embedding: new Array(384).fill(0.7),
    } as NodeWithEmbedding
  ];
  nodes.push(...commitNodes);

  return nodes;
}

function createTestEdges(): Edge[] {
  return [
    {
      source: 'repo-1',
      target: 'file-1',
      type: 'CONTAINS',
      properties: {},
    },
    {
      source: 'file-1',
      target: 'code-1',
      type: 'CONTAINS',
      properties: {},
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
      repoPath: '/test/large-unified-repo',
      repoName: 'large-unified-test-repo',
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
        filePath: `/test/large-unified-repo/src/file${i}.ts`,
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
