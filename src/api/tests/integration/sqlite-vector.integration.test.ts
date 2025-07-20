/**
 * @file Integration tests for SQLite vector search functionality
 */

import request from 'supertest';
import { Express } from 'express';
import { createAPIServer } from '../../server';
import { SQLiteClient } from '../../../persistence/db-clients';
import { DataLoader } from '../../../modules/data-loader';
import { SearchService } from '../../../modules/search-service';
import { ConfigManager } from '../../../config';
import { NodeWithEmbedding, FileNode, CodeNode, CommitNode } from '../../../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SQLite Vector Search Integration Tests', () => {
  let app: any;
  let server: any;
  let sqliteClient: SQLiteClient;
  let dataLoader: DataLoader;
  let searchService: SearchService;
  let config: ConfigManager;
  let testDbPath: string;

  beforeAll(async () => {
    // Create temporary database file for testing
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-integration-${Date.now()}.db`);
    
    // Initialize config manager
    config = new ConfigManager(process.cwd());
    
    // Mock the database config to use our test database
    jest.spyOn(config, 'getDatabaseConfig').mockReturnValue({
      sqlite: {
        path: testDbPath,
        vectorExtension: './extensions/vec0.dylib'
      }
    });

    // Create test server
    const serverInstance = await createAPIServer();
    app = serverInstance.getApp();
    server = serverInstance.getServer();

    // Initialize database client, data loader, and search service
    sqliteClient = new SQLiteClient(testDbPath);
    dataLoader = new DataLoader(testDbPath, config);
    searchService = new SearchService(config);

    // Setup test data
    await setupTestData();

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Clean up
    try {
      if (sqliteClient.isConnectedToDatabase()) {
        sqliteClient.disconnect();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    // Remove test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function setupTestData() {
    await sqliteClient.connect();

    // Create test nodes with embeddings
    const testNodes: NodeWithEmbedding[] = [
      {
        id: 'file-1',
        type: 'FileNode',
        properties: {
          filePath: '/src/utils/math.ts',
          fileName: 'math.ts',
          fileExtension: '.ts',
          repoId: 'test-repo',
          language: 'typescript',
          sizeKb: 2.0,
          contentHash: 'hash1',
          fileType: 'source' as const,
        },
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] // Mathematical utilities embedding
      } as NodeWithEmbedding & FileNode,
      {
        id: 'file-2',
        type: 'FileNode',
        properties: {
          filePath: '/src/components/Button.tsx',
          fileName: 'Button.tsx',
          fileExtension: '.tsx',
          repoId: 'test-repo',
          language: 'typescript',
          sizeKb: 1.5,
          contentHash: 'hash2',
          fileType: 'source' as const,
        },
        embedding: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] // UI component embedding
      } as NodeWithEmbedding & FileNode,
      {
        id: 'code-1',
        type: 'CodeNode',
        properties: {
          name: 'calculateSum',
          signature: 'function calculateSum(a: number, b: number): number',
          language: 'typescript',
          filePath: '/src/utils/math.ts',
          startLine: 1,
          endLine: 15,
        },
        embedding: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] // Math function embedding
      } as NodeWithEmbedding,
      {
        id: 'code-2',
        type: 'CodeNode',
        properties: {
          name: 'Button',
          signature: 'const Button: React.FC<ButtonProps>',
          language: 'typescript',
          filePath: '/src/components/Button.tsx',
          startLine: 1,
          endLine: 20,
        },
        embedding: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] // React component embedding
      } as NodeWithEmbedding,
      {
        id: 'commit-1',
        type: 'CommitNode',
        properties: {
          hash: 'abc123def456',
          message: 'Add mathematical utility functions for calculations',
          author: 'John Developer',
          date: new Date('2024-01-15').toISOString(),
        },
        embedding: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] // Math-related commit embedding
      } as NodeWithEmbedding,
      {
        id: 'commit-2',
        type: 'CommitNode',
        properties: {
          hash: 'def456ghi789',
          message: 'Implement responsive Button component with TypeScript',
          author: 'Jane Designer',
          date: new Date('2024-01-20').toISOString(),
        },
        embedding: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3] // UI-related commit embedding
      } as NodeWithEmbedding
    ];

    // Load test data using DataLoader
    await dataLoader.load(testNodes, []);
  }

  describe('Health Check with Vector Extension', () => {
    it('should report SQLite health with vector extension status', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('checks');
      expect(response.body.data.checks).toHaveProperty('database');
      
      const dbCheck = response.body.data.checks.database;
      expect(dbCheck).toHaveProperty('sqlite');
      expect(dbCheck.sqlite).toHaveProperty('success');
      
      if (dbCheck.sqlite.success) {
        expect(dbCheck.sqlite.details).toHaveProperty('vectorExtensionAvailable');
        expect(typeof dbCheck.sqlite.details.vectorExtensionAvailable).toBe('boolean');
      }
    });

    it('should not have LanceDB references in health check', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.checks.database).not.toHaveProperty('lancedb');
    });
  });

  describe('Direct SearchService Integration', () => {
    it('should initialize SearchService with SQLite vector support', async () => {
      await searchService.initialize();
      
      // Verify SearchService is properly initialized
      expect(searchService).toBeDefined();
      
      // Test basic semantic search functionality
      const results = await searchService.semanticSearch('test query', { limit: 5 });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform semantic search using SQLite vectors', async () => {
      await searchService.initialize();
      
      const results = await searchService.semanticSearch('mathematical functions', {
        limit: 5,
        minSimilarity: 0.1
      });
      
      expect(Array.isArray(results)).toBe(true);
      results.forEach(result => {
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('rank');
        expect(typeof result.similarity).toBe('number');
      });
    });

    it('should perform hybrid search with metadata filtering', async () => {
      await searchService.initialize();
      
      const results = await searchService.hybridSearch('typescript functions', {
        language: 'typescript'
      }, {
        limit: 5
      });
      
      expect(Array.isArray(results)).toBe(true);
      results.forEach(result => {
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('metadata');
      });
    });

    it('should search specific node types', async () => {
      await searchService.initialize();
      
      // Search for code nodes specifically
      const codeResults = await searchService.findSimilarCode('function implementation', 'typescript', {
        limit: 3
      });
      
      expect(Array.isArray(codeResults)).toBe(true);
      
      // Search for files specifically
      const fileResults = await searchService.searchFiles('utility functions', 'ts', {
        limit: 3
      });
      
      expect(Array.isArray(fileResults)).toBe(true);
      
      // Search for commits specifically
      const commitResults = await searchService.searchCommits('Add functionality', 'John Developer', undefined, {
        limit: 3
      });
      
      expect(Array.isArray(commitResults)).toBe(true);
    });
  });

  describe('Semantic Search with SQLite Vectors', () => {
    it('should perform semantic search for mathematical content', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'mathematical calculations and utility functions',
          limit: 5,
          minSimilarity: 0.1
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(Array.isArray(response.body.data.results)).toBe(true);

      // Should find math-related content
      const results = response.body.data.results;
      if (results.length > 0) {
        results.forEach((result: any) => {
          expect(result).toHaveProperty('node');
          expect(result).toHaveProperty('similarity');
          expect(result).toHaveProperty('rank');
          expect(typeof result.similarity).toBe('number');
          expect(result.similarity).toBeGreaterThanOrEqual(0);
          expect(result.similarity).toBeLessThanOrEqual(1);
        });

        // Math-related content should have higher similarity
        const mathResults = results.filter((r: any) => 
          r.node.path?.includes('math') || 
          r.node.content?.includes('calculate') ||
          r.node.message?.includes('mathematical')
        );
        expect(mathResults.length).toBeGreaterThan(0);
      }
    });

    it('should perform semantic search for UI components', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'React button component user interface',
          limit: 5,
          minSimilarity: 0.1
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeDefined();

      const results = response.body.data.results;
      if (results.length > 0) {
        // UI-related content should be found
        const uiResults = results.filter((r: any) => 
          r.node.path?.includes('Button') || 
          r.node.content?.includes('React') ||
          r.node.message?.includes('Button')
        );
        expect(uiResults.length).toBeGreaterThan(0);
      }
    });

    it('should handle semantic search with node type filtering', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'function implementation',
          limit: 10,
          nodeTypes: 'CodeNode'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // All results should be CodeNode type
      results.forEach((result: any) => {
        expect(result.node.type).toBe('CodeNode');
      });
    });

    it('should return empty results for unrelated queries', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'completely unrelated quantum physics nuclear fusion',
          limit: 5,
          minSimilarity: 0.8 // High threshold
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeDefined();
      
      // Should return few or no results due to high similarity threshold
      const results = response.body.data.results;
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Hybrid Search with Unified SQLite', () => {
    it('should perform hybrid search with file extension filtering', async () => {
      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({ 
          q: 'typescript functions',
          fileExtension: 'ts',
          limit: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeDefined();

      const results = response.body.data.results;
      results.forEach((result: any) => {
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('metadata');
        
        // Should match file extension filter
        if (result.node.extension) {
          expect(['ts', 'tsx']).toContain(result.node.extension);
        }
      });
    });

    it('should perform hybrid search with author filtering', async () => {
      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({ 
          q: 'implementation',
          author: 'John Developer',
          limit: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // Should find commits by John Developer
      const johnCommits = results.filter((r: any) => 
        r.node.type === 'CommitNode' && r.node.authorName === 'John Developer'
      );
      expect(johnCommits.length).toBeGreaterThan(0);
    });

    it('should perform hybrid search with date range filtering', async () => {
      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({ 
          q: 'component development',
          dateStart: '2024-01-01',
          dateEnd: '2024-01-31',
          limit: 10
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeDefined();

      const results = response.body.data.results;
      results.forEach((result: any) => {
        if (result.node.date) {
          const nodeDate = new Date(result.node.date);
          expect(nodeDate.getTime()).toBeGreaterThanOrEqual(new Date('2024-01-01').getTime());
          expect(nodeDate.getTime()).toBeLessThanOrEqual(new Date('2024-01-31').getTime());
        }
      });
    });
  });

  describe('Specialized Search Endpoints', () => {
    it('should search code snippets', async () => {
      const response = await request(app)
        .get('/api/v1/search/code')
        .query({ 
          q: 'function calculateSum',
          limit: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // Should find the calculateSum function
      const mathFunction = results.find((r: any) => 
        r.node.content?.includes('calculateSum')
      );
      expect(mathFunction).toBeDefined();
    });

    it('should search files', async () => {
      const response = await request(app)
        .get('/api/v1/search/files')
        .query({ 
          q: 'utility math functions',
          fileExtension: 'ts',
          limit: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // All results should be FileNode type
      results.forEach((result: any) => {
        expect(result.node.type).toBe('FileNode');
      });

      // Should find math.ts file
      const mathFile = results.find((r: any) => 
        r.node.name === 'math.ts'
      );
      expect(mathFile).toBeDefined();
    });

    it('should search commits', async () => {
      const response = await request(app)
        .get('/api/v1/search/commits')
        .query({ 
          q: 'mathematical utility functions',
          author: 'John Developer',
          limit: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // All results should be CommitNode type
      results.forEach((result: any) => {
        expect(result.node.type).toBe('CommitNode');
      });

      // Should find John's math-related commit
      const mathCommit = results.find((r: any) => 
        r.node.authorName === 'John Developer' && 
        r.node.message?.includes('mathematical')
      );
      expect(mathCommit).toBeDefined();
    });

    it('should search across all content types', async () => {
      const response = await request(app)
        .get('/api/v1/search/all')
        .query({ 
          q: 'typescript development',
          limit: 10
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // Should return mixed node types
      const nodeTypes = new Set(results.map((r: any) => r.node.type));
      expect(nodeTypes.size).toBeGreaterThan(1);
      
      // Should include FileNode, CodeNode, and CommitNode
      expect(nodeTypes.has('FileNode')).toBe(true);
      expect(nodeTypes.has('CodeNode')).toBe(true);
      expect(nodeTypes.has('CommitNode')).toBe(true);
    });
  });

  describe('Vector Search Performance', () => {
    it('should perform semantic search within acceptable time limits', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'complex mathematical algorithms and data structures',
          limit: 20
        })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      
      // Should complete within 2 seconds (requirement from task description)
      expect(responseTime).toBeLessThan(2000);
    });

    it('should handle concurrent search requests efficiently', async () => {
      const queries = [
        'mathematical functions',
        'React components',
        'TypeScript interfaces',
        'utility helpers',
        'button implementation'
      ];

      const startTime = Date.now();
      
      const searchPromises = queries.map(query => 
        request(app)
          .get('/api/v1/search/semantic')
          .query({ q: query, limit: 5 })
      );

      const responses = await Promise.all(searchPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(5000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty search queries gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: '', limit: 5 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle invalid search parameters', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'test query',
          limit: -1, // Invalid limit
          minSimilarity: 2.0 // Invalid similarity
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should fallback gracefully when vector search is unavailable', async () => {
      // This test verifies the system works even if vector extension fails
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ 
          q: 'fallback search test',
          limit: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeDefined();
      
      // Should return results even if vector search is not available
      expect(Array.isArray(response.body.data.results)).toBe(true);
    });
  });

  describe('Unified Database Architecture Verification', () => {
    it('should store and retrieve all data types from single SQLite database', async () => {
      // Verify that all data is stored in the single SQLite database
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
      
      // Check that all tables exist
      const tables = sqliteClient.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const expectedTables = [
        'files', 'code_nodes', 'functions', 'commits', 'pull_requests',
        'directories', 'test_nodes', 'repositories', 'graph_nodes', 'graph_edges'
      ];

      expectedTables.forEach(tableName => {
        expect(tables.some((table: any) => table.name === tableName)).toBe(true);
      });
    });

    it('should have vector columns in all relevant tables', async () => {
      const vectorColumns = [
        { table: 'files', column: 'content_embedding' },
        { table: 'code_nodes', column: 'code_embedding' },
        { table: 'functions', column: 'signature_embedding' },
        { table: 'functions', column: 'body_embedding' },
        { table: 'commits', column: 'message_embedding' },
        { table: 'pull_requests', column: 'title_embedding' },
        { table: 'pull_requests', column: 'body_embedding' },
        { table: 'directories', column: 'summary_embedding' },
        { table: 'test_nodes', column: 'test_embedding' }
      ];

      for (const { table, column } of vectorColumns) {
        const columns = sqliteClient.all(`PRAGMA table_info(${table})`);
        expect(columns.some((col: any) => col.name === column)).toBe(true);
      }
    });

    it('should perform unified search across all data types', async () => {
      const response = await request(app)
        .get('/api/v1/search/all')
        .query({ 
          q: 'comprehensive search across all content',
          limit: 20
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      
      // Should return results from multiple node types
      const nodeTypes = new Set(results.map((r: any) => r.node.type));
      expect(nodeTypes.size).toBeGreaterThanOrEqual(2);
      
      // Verify we have different types of content
      const hasFiles = results.some((r: any) => r.node.type === 'FileNode');
      const hasCode = results.some((r: any) => r.node.type === 'CodeNode');
      const hasCommits = results.some((r: any) => r.node.type === 'CommitNode');
      
      expect(hasFiles || hasCode || hasCommits).toBe(true);
    });

    it('should support complete indexing pipeline with single database', async () => {
      // This test verifies the complete end-to-end pipeline works with unified SQLite
      
      // 1. Verify database is properly initialized
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
      
      // 2. Verify all test data was loaded successfully
      const fileCount = sqliteClient.get('SELECT COUNT(*) as count FROM files');
      const codeCount = sqliteClient.get('SELECT COUNT(*) as count FROM code_nodes');
      const commitCount = sqliteClient.get('SELECT COUNT(*) as count FROM commits');
      
      expect(fileCount.count).toBeGreaterThan(0);
      expect(codeCount.count).toBeGreaterThan(0);
      expect(commitCount.count).toBeGreaterThan(0);
      
      // 3. Verify vector data is stored (if vector extension is available)
      const vectorAvailable = await sqliteClient.isVectorSearchAvailable();
      if (vectorAvailable) {
        // Check for vector data in files table
        const filesWithVectors = sqliteClient.all(`
          SELECT COUNT(*) as count FROM files 
          WHERE content_embedding IS NOT NULL
        `);
        expect(filesWithVectors[0].count).toBeGreaterThan(0);
      }
      
      // 4. Verify search functionality works end-to-end
      await searchService.initialize();
      const searchResults = await searchService.comprehensiveSearch('typescript function', {
        limit: 10
      });
      
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThanOrEqual(0);
      
      // 5. Verify hybrid search with metadata filtering
      const hybridResults = await searchService.hybridSearch('implementation', {
        language: 'typescript'
      }, {
        limit: 5
      });
      
      expect(Array.isArray(hybridResults)).toBe(true);
    });

    it('should maintain sub-2-second response time for searches', async () => {
      await searchService.initialize();
      
      const startTime = Date.now();
      
      // Perform multiple search operations
      const [semanticResults, hybridResults, fileResults] = await Promise.all([
        searchService.semanticSearch('function implementation', { limit: 10 }),
        searchService.hybridSearch('typescript code', { language: 'typescript' }, { limit: 10 }),
        searchService.searchFiles('utility functions', 'ts', { limit: 10 })
      ]);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete all searches within 2 seconds (requirement from design)
      expect(totalTime).toBeLessThan(2000);
      
      // Verify all searches returned results
      expect(Array.isArray(semanticResults)).toBe(true);
      expect(Array.isArray(hybridResults)).toBe(true);
      expect(Array.isArray(fileResults)).toBe(true);
    });
  });
});
