/**
 * @file Simplified unit tests for SQLite vector operations
 */

import { SQLiteClient } from './db-clients';
import { ConfigManager } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SQLite Vector Operations', () => {
  let sqliteClient: SQLiteClient;
  let testDbPath: string;

  beforeAll(async () => {
    // Create temporary database file for testing
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-sqlite-vector-${Date.now()}.db`);
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

  describe('Basic Vector Operations', () => {
    it('should connect to SQLite database successfully', async () => {
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
    });

    it('should check vector extension availability', async () => {
      const isVectorEnabled = sqliteClient.isVectorEnabled;
      expect(typeof isVectorEnabled).toBe('boolean');
      
      const isVectorSearchAvailable = await sqliteClient.isVectorSearchAvailable();
      expect(typeof isVectorSearchAvailable).toBe('boolean');
    });

    it('should have vector columns in tables', async () => {
      // Check if embedding columns exist
      const filesColumns = sqliteClient.all("PRAGMA table_info(files)");
      const codeNodesColumns = sqliteClient.all("PRAGMA table_info(code_nodes)");
      
      expect(filesColumns.some((col: any) => col.name === 'content_embedding')).toBe(true);
      expect(codeNodesColumns.some((col: any) => col.name === 'code_embedding')).toBe(true);
    });

    it('should store and retrieve vector embeddings', async () => {
      const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const testRecordId = 'test-record-123';

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

      // Store vector embedding
      await sqliteClient.storeVector('files', 'content_embedding', testRecordId, testEmbedding);
      
      // Verify the embedding was stored
      const result = sqliteClient.get(`
        SELECT content_embedding FROM files WHERE id = ?
      `, [testRecordId]);

      expect(result).toBeDefined();
      if (sqliteClient.isVectorEnabled) {
        expect(result.content_embedding).toBeDefined();
      }
    });

    it('should perform vector search', async () => {
      const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const queryEmbedding = [0.15, 0.25, 0.35, 0.45, 0.55];

      // Insert test records with embeddings
      const testRecords = [
        { id: 'file-1', path: '/test/file1.ts', name: 'file1.ts' },
        { id: 'file-2', path: '/test/file2.ts', name: 'file2.ts' }
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

      // Perform vector search
      const results = await sqliteClient.vectorSearch(
        'files',
        'content_embedding',
        queryEmbedding,
        5
      );

      expect(Array.isArray(results)).toBe(true);
      
      if (sqliteClient.isVectorEnabled && results.length > 0) {
        results.forEach(result => {
          expect(result).toHaveProperty('id');
          expect(result).toHaveProperty('similarity');
          expect(result).toHaveProperty('data');
          expect(typeof result.similarity).toBe('number');
        });
      }
    });

    it('should handle batch insert with embeddings', async () => {
      const files = [
        {
          id: 'file-1',
          repoId: 'repo-1',
          filePath: '/test/file1.ts',
          fileName: 'file1.ts',
          fileExtension: 'ts',
          language: 'typescript',
          sizeKb: 1,
          contentHash: 'hash1',
          fileType: 'source' as const,
          contentEmbedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      ];

      const result = await sqliteClient.batchInsertFiles(files);

      // Verify record was inserted
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM files');
      expect(count.count).toBe(1);
    });

    it('should perform semantic search across tables', async () => {
      const queryEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      
      const results = await sqliteClient.semanticSearch(queryEmbedding, 5);

      expect(typeof results).toBe('object');
      expect(results).toHaveProperty('files');
      expect(results).toHaveProperty('functions');
      expect(results).toHaveProperty('commits');
      expect(results).toHaveProperty('pullRequests');
      
      expect(Array.isArray(results.files)).toBe(true);
      expect(Array.isArray(results.functions)).toBe(true);
      expect(Array.isArray(results.commits)).toBe(true);
      expect(Array.isArray(results.pullRequests)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid parameters gracefully', async () => {
      await expect(
        sqliteClient.storeVector('', 'content_embedding', 'test-id', [0.1, 0.2])
      ).rejects.toThrow();

      await expect(
        sqliteClient.vectorSearch('files', '', [0.1, 0.2], 5)
      ).rejects.toThrow();
    });

    it('should handle vector operations when extension is unavailable', async () => {
      // These should not throw errors even if vector extension is not available
      await expect(
        sqliteClient.storeVector('files', 'content_embedding', 'test-id', [0.1, 0.2])
      ).resolves.not.toThrow();

      const results = await sqliteClient.vectorSearch('files', 'content_embedding', [0.1, 0.2], 5);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
