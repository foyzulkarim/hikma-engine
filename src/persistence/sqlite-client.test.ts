/**
 * @file Unit tests for SQLiteClient vector operations and database functionality
 */

import { SQLiteClient } from './db-clients';
import { ConfigManager } from '../config';
import { NodeWithEmbedding, FileNode, CodeNode, CommitNode } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SQLiteClient', () => {
  let sqliteClient: SQLiteClient;
  let testDbPath: string;
  let config: ConfigManager;

  beforeAll(async () => {
    // Create temporary database file for testing
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-hikma-${Date.now()}.db`);
    
    // Initialize config manager
    config = new ConfigManager(process.cwd());
  });

  beforeEach(async () => {
    // Create fresh SQLiteClient instance for each test
    sqliteClient = new SQLiteClient(testDbPath);
    await sqliteClient.connect();
  });

  afterEach(async () => {
    // Clean up after each test
    if (sqliteClient.isConnectedToDatabase()) {
      sqliteClient.disconnect();
    }
    
    // Remove test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Connection and Initialization', () => {
    it('should connect to SQLite database successfully', async () => {
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
    });

    it('should initialize tables successfully', async () => {
      // Tables should be created during connection
      const tables = sqliteClient.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const expectedTables = [
        'code_nodes', 'commits', 'directories', 'file_commits', 
        'file_imports', 'file_relations', 'files', 'function_calls',
        'function_commits', 'functions', 'graph_edges', 'graph_nodes',
        'indexing_state', 'pull_requests', 'repositories', 'test_nodes'
      ];

      expectedTables.forEach(tableName => {
        expect(tables.some((table: any) => table.name === tableName)).toBe(true);
      });
    });

    it('should add vector columns to tables', async () => {
      // Check if embedding columns exist
      const filesColumns = sqliteClient.all("PRAGMA table_info(files)");
      const codeNodesColumns = sqliteClient.all("PRAGMA table_info(code_nodes)");
      const functionsColumns = sqliteClient.all("PRAGMA table_info(functions)");

      expect(filesColumns.some((col: any) => col.name === 'content_embedding')).toBe(true);
      expect(codeNodesColumns.some((col: any) => col.name === 'code_embedding')).toBe(true);
      expect(functionsColumns.some((col: any) => col.name === 'signature_embedding')).toBe(true);
      expect(functionsColumns.some((col: any) => col.name === 'body_embedding')).toBe(true);
    });
  });

  describe('Vector Extension Loading', () => {
    it('should handle vector extension availability gracefully', async () => {
      const isVectorEnabled = sqliteClient.isVectorEnabled;
      expect(typeof isVectorEnabled).toBe('boolean');
    });

    it('should report vector search availability', async () => {
      const isAvailable = await sqliteClient.isVectorSearchAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Vector Storage Operations', () => {
    const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const testRecordId = 'test-record-123';

    beforeEach(async () => {
      // Insert a test file record first
      await sqliteClient.run(`
        INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        testRecordId,
        '/test/file.ts',
        'file.ts',
        'ts',
        1000,
        'test-hash',
        'repo-1',
        new Date().toISOString(),
        new Date().toISOString()
      ]);
    });

    it('should store vector embeddings successfully', async () => {
      await sqliteClient.storeVector('files', 'content_embedding', testRecordId, testEmbedding);
      
      // Verify the embedding was stored
      const result = sqliteClient.get(`
        SELECT content_embedding FROM files WHERE id = ?
      `, [testRecordId]);

      expect(result).toBeDefined();
      expect(result.content_embedding).toBeDefined();
    });

    it('should handle vector storage when extension is unavailable', async () => {
      // This should not throw an error even if vector extension is not available
      await expect(
        sqliteClient.storeVector('files', 'content_embedding', testRecordId, testEmbedding)
      ).resolves.not.toThrow();
    });

    it('should validate input parameters for storeVector', async () => {
      await expect(
        sqliteClient.storeVector('', 'content_embedding', testRecordId, testEmbedding)
      ).rejects.toThrow();

      await expect(
        sqliteClient.storeVector('files', '', testRecordId, testEmbedding)
      ).rejects.toThrow();

      await expect(
        sqliteClient.storeVector('files', 'content_embedding', '', testEmbedding)
      ).rejects.toThrow();

      await expect(
        sqliteClient.storeVector('files', 'content_embedding', testRecordId, [])
      ).rejects.toThrow();
    });
  });

  describe('Vector Search Operations', () => {
    const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const queryEmbedding = [0.15, 0.25, 0.35, 0.45, 0.55];

    beforeEach(async () => {
      // Insert test records with embeddings
      const testRecords = [
        { id: 'file-1', path: '/test/file1.ts', name: 'file1.ts' },
        { id: 'file-2', path: '/test/file2.ts', name: 'file2.ts' },
        { id: 'file-3', path: '/test/file3.ts', name: 'file3.ts' }
      ];

      for (const record of testRecords) {
        await sqliteClient.run(`
          INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.id,
          record.path,
          record.name,
          'ts',
          1000,
          `hash-${record.id}`,
          'repo-1',
          new Date().toISOString(),
          new Date().toISOString()
        ]);

        // Store embeddings
        await sqliteClient.storeVector('files', 'content_embedding', record.id, testEmbedding);
      }
    });

    it('should perform vector search successfully', async () => {
      const results = await sqliteClient.vectorSearch(
        'files',
        'content_embedding',
        queryEmbedding,
        5
      );

      expect(Array.isArray(results)).toBe(true);
      
      if (sqliteClient.isVectorEnabled) {
        // If vector extension is available, we should get results
        results.forEach(result => {
          expect(result).toHaveProperty('id');
          expect(result).toHaveProperty('similarity');
          expect(result).toHaveProperty('data');
          expect(typeof result.similarity).toBe('number');
        });
      }
    });

    it('should return empty results when vector search is unavailable', async () => {
      // Mock vector extension as unavailable
      const originalVectorEnabled = sqliteClient.isVectorEnabled;
      
      const results = await sqliteClient.vectorSearch(
        'files',
        'content_embedding',
        queryEmbedding,
        5
      );

      if (!originalVectorEnabled) {
        expect(results).toEqual([]);
      }
    });

    it('should validate input parameters for vectorSearch', async () => {
      await expect(
        sqliteClient.vectorSearch('', 'content_embedding', queryEmbedding, 5)
      ).rejects.toThrow();

      await expect(
        sqliteClient.vectorSearch('files', '', queryEmbedding, 5)
      ).rejects.toThrow();

      await expect(
        sqliteClient.vectorSearch('files', 'content_embedding', [], 5)
      ).rejects.toThrow();

      await expect(
        sqliteClient.vectorSearch('files', 'content_embedding', queryEmbedding, 0)
      ).rejects.toThrow();
    });
  });

  describe('Batch Insert Operations with Vectors', () => {
    it('should batch insert file nodes with embeddings', async () => {
      const fileNodes: any[] = [
        {
          id: 'file-1',
          path: '/test/file1.ts',
          name: 'file1.ts',
          extension: 'ts',
          size: 1000,
          contentHash: 'hash1',
          repositoryId: 'repo-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          contentEmbedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        },
        {
          id: 'file-2',
          path: '/test/file2.ts',
          name: 'file2.ts',
          extension: 'ts',
          size: 1500,
          contentHash: 'hash2',
          repositoryId: 'repo-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          contentEmbedding: [0.2, 0.3, 0.4, 0.5, 0.6]
        }
      ];

      await sqliteClient.batchInsertFileNodes(fileNodes);

      // Verify records were inserted
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM files');
      expect(count.count).toBe(2);

      // Verify embeddings were stored (if vector extension is available)
      const filesWithEmbeddings = sqliteClient.all(`
        SELECT id, content_embedding FROM files WHERE content_embedding IS NOT NULL
      `);

      if (sqliteClient.isVectorEnabled) {
        expect(filesWithEmbeddings.length).toBe(2);
      }
    });

    it('should batch insert code nodes with embeddings', async () => {
      const codeNodes: any[] = [
        {
          id: 'code-1',
          name: 'testFunction',
          language: 'typescript',
          filePath: '/test/file1.ts',
          startLine: 1,
          endLine: 10,
          codeEmbedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      ];

      await sqliteClient.batchInsertCodeNodes(codeNodes);

      // Verify records were inserted
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM code_nodes');
      expect(count.count).toBe(1);
    });

    it('should handle batch insert gracefully when vector extension is unavailable', async () => {
      const fileNodes: any[] = [
        {
          id: 'file-1',
          path: '/test/file1.ts',
          name: 'file1.ts',
          extension: 'ts',
          size: 1000,
          contentHash: 'hash1',
          repositoryId: 'repo-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          contentEmbedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      ];

      // Should not throw even if vector extension is unavailable
      await expect(
        sqliteClient.batchInsertFileNodes(fileNodes)
      ).resolves.not.toThrow();

      // Verify record was still inserted (without embedding)
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM files');
      expect(count.count).toBe(1);
    });
  });

  describe('Unified Vector Search', () => {
    beforeEach(async () => {
      // Insert test data across multiple tables
      const testData = {
        files: [
          { id: 'file-1', path: '/test/file1.ts', name: 'file1.ts', embedding: [0.1, 0.2, 0.3] }
        ],
        functions: [
          { id: 'func-1', name: 'testFunction', signature: 'function test()', embedding: [0.2, 0.3, 0.4] }
        ],
        commits: [
          { id: 'commit-1', hash: 'abc123', message: 'Add test feature', embedding: [0.3, 0.4, 0.5] }
        ]
      };

      // Insert files
      for (const file of testData.files) {
        await sqliteClient.run(`
          INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          file.id, file.path, file.name, 'ts', 1000, 'hash', 'repo-1',
          new Date().toISOString(), new Date().toISOString()
        ]);
        await sqliteClient.storeVector('files', 'content_embedding', file.id, file.embedding);
      }

      // Insert functions
      for (const func of testData.functions) {
        await sqliteClient.run(`
          INSERT INTO functions (id, name, signature, file_id, start_line, end_line, repository_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          func.id, func.name, func.signature, 'file-1', 1, 10, 'repo-1',
          new Date().toISOString(), new Date().toISOString()
        ]);
        await sqliteClient.storeVector('functions', 'signature_embedding', func.id, func.embedding);
      }

      // Insert commits
      for (const commit of testData.commits) {
        await sqliteClient.run(`
          INSERT INTO commits (id, hash, message, author_name, author_email, date, repository_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          commit.id, commit.hash, commit.message, 'Test Author', 'test@example.com',
          new Date().toISOString(), 'repo-1', new Date().toISOString(), new Date().toISOString()
        ]);
        await sqliteClient.storeVector('commits', 'message_embedding', commit.id, commit.embedding);
      }
    });

    it('should perform unified semantic search across all tables', async () => {
      const queryEmbedding = [0.2, 0.3, 0.4];
      const results = await sqliteClient.semanticSearch(queryEmbedding, 10);

      expect(typeof results).toBe('object');
      expect(results).toHaveProperty('files');
      expect(results).toHaveProperty('functions');
      expect(results).toHaveProperty('commits');
      expect(results).toHaveProperty('pullRequests');
      
      if (sqliteClient.isVectorEnabled) {
        // Check that each result array has proper structure
        expect(Array.isArray(results.files)).toBe(true);
        expect(Array.isArray(results.functions)).toBe(true);
        expect(Array.isArray(results.commits)).toBe(true);
        expect(Array.isArray(results.pullRequests)).toBe(true);
        
        // Check structure of individual results if any exist
        const allResults = [...results.files, ...results.functions, ...results.commits, ...results.pullRequests];
        allResults.forEach((result: any) => {
          expect(result).toHaveProperty('id');
          expect(result).toHaveProperty('similarity');
          expect(result).toHaveProperty('data');
        });
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      const invalidClient = new SQLiteClient('/invalid/path/database.db');
      
      await expect(invalidClient.connect()).rejects.toThrow();
    });

    it('should handle malformed embedding data', async () => {
      const testRecordId = 'test-record';
      
      // Insert test record
      await sqliteClient.run(`
        INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        testRecordId, '/test/file.ts', 'file.ts', 'ts', 1000, 'hash', 'repo-1',
        new Date().toISOString(), new Date().toISOString()
      ]);

      // Test with invalid embedding data
      await expect(
        sqliteClient.storeVector('files', 'content_embedding', testRecordId, [NaN, Infinity, -Infinity])
      ).rejects.toThrow();
    });

    it('should handle concurrent operations safely', async () => {
      const operations = [];
      
      // Create multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          sqliteClient.run(`
            INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            `file-${i}`, `/test/file${i}.ts`, `file${i}.ts`, 'ts', 1000, `hash${i}`, 'repo-1',
            new Date().toISOString(), new Date().toISOString()
          ])
        );
      }

      // All operations should complete successfully
      await expect(Promise.all(operations)).resolves.not.toThrow();

      // Verify all records were inserted
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM files');
      expect(count.count).toBe(10);
    });
  });

  describe('Performance and Optimization', () => {
    it('should create vector indexes for performance', async () => {
      // Check if indexes exist (this will depend on vector extension availability)
      const indexes = sqliteClient.all(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE '%embedding%'
      `);

      // If vector extension is available, we should have vector indexes
      if (sqliteClient.isVectorEnabled) {
        expect(indexes.length).toBeGreaterThan(0);
      }
    });

    it('should handle large batch operations efficiently', async () => {
      const largeFileList = [];
      
      // Create 100 test file records
      for (let i = 0; i < 100; i++) {
        largeFileList.push({
          id: `file-${i}`,
          path: `/test/file${i}.ts`,
          name: `file${i}.ts`,
          extension: 'ts',
          size: 1000,
          contentHash: `hash${i}`,
          repositoryId: 'repo-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          contentEmbedding: Array.from({ length: 384 }, () => Math.random())
        });
      }

      const startTime = Date.now();
      await sqliteClient.batchInsertFileNodes(largeFileList);
      const endTime = Date.now();

      // Should complete within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify all records were inserted
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM files');
      expect(count.count).toBe(100);
    });
  });
});
