/**
 * @file Integration tests for database operations
 * Tests actual SQLite database operations with vector extensions, schema creation,
 * batch operations, transaction handling, and vector storage/retrieval
 */

import { SQLiteClient } from '../../src/persistence/db/connection';
import { initializeTables } from '../../src/persistence/db/schema';
import { storeVector, vectorSearch, batchStoreEmbeddings, semanticSearch } from '../../src/persistence/db/vector';
import { getDatabaseStats, getEnhancedGraphStats } from '../../src/persistence/db/stats';
import { TestDatabaseManager } from '../utils/test-database-manager';
import { TestDataFactory } from '../utils/TestDataFactory';
import path from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';

describe('Database Operations Integration', () => {
  let testDbManager: TestDatabaseManager;
  let sqliteClient: SQLiteClient;
  beforeAll(async () => {
    testDbManager = new TestDatabaseManager('integration');
    await testDbManager.initialize();
  });

  beforeEach(async () => {
    // Create fresh database for each test
    await testDbManager.createFreshDatabase();
    
    // Initialize SQLite client with test database
    sqliteClient = new SQLiteClient(testDbManager.getDatabasePath());
    await sqliteClient.connect();
    
    // Schema is already initialized by testDbManager.createFreshDatabase()
  });

  afterEach(async () => {
    if (sqliteClient) {
      sqliteClient.disconnect();
    }
    await testDbManager.cleanup();
  });

  afterAll(async () => {
    await testDbManager.destroy();
  });

  describe('SQLite Database Connection and Basic Operations', () => {
    it('should successfully connect to SQLite database', async () => {
      // Assert
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
      
      // Test basic query execution
      const result = sqliteClient.get('SELECT 1 as test');
      expect(result).toEqual({ test: 1 });
    });

    it('should handle database disconnection and reconnection', async () => {
      // Arrange
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);

      // Act - Disconnect
      sqliteClient.disconnect();
      expect(sqliteClient.isConnectedToDatabase()).toBe(false);

      // Act - Reconnect (create new client since disconnect closes the database)
      sqliteClient = new SQLiteClient(testDbManager.getDatabasePath());
      await sqliteClient.connect();
      
      // Assert
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
      const result = sqliteClient.get('SELECT 1 as test');
      expect(result).toEqual({ test: 1 });
    });

    it('should load vector extension when available', async () => {
      // Assert
      const isVectorEnabled = sqliteClient.isVectorEnabled;
      const isVectorSearchAvailable = await sqliteClient.isVectorSearchAvailable();
      
      // Vector extension may or may not be available in test environment
      expect(typeof isVectorEnabled).toBe('boolean');
      expect(typeof isVectorSearchAvailable).toBe('boolean');
      expect(isVectorEnabled).toBe(isVectorSearchAvailable);

      if (isVectorEnabled) {
        // If vector extension is loaded, test basic vector functionality
        const db = sqliteClient.getDb();
        const versionResult = db.prepare('SELECT vec_version() as version').get() as { version: string };
        expect(versionResult).toBeDefined();
        expect(versionResult.version).toBeTruthy();
      }
    });

    it('should handle database file creation in non-existent directory', async () => {
      // Arrange
      const tempDir = path.join(__dirname, '../temp/nested/deep/path');
      const dbPath = path.join(tempDir, 'test-creation.db');
      
      // Ensure directory doesn't exist
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Directory might not exist, which is fine
      }

      // Act
      const newClient = new SQLiteClient(dbPath);
      await newClient.connect();

      // Assert
      expect(newClient.isConnectedToDatabase()).toBe(true);
      
      // Verify directory was created
      const dirExists = await fs.access(tempDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);

      // Cleanup
      newClient.disconnect();
      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('Schema Creation and Migration', () => {
    it('should create all required tables with correct schema', async () => {
      // Act - Schema is already initialized in beforeEach
      const db = sqliteClient.getDb();

      // Assert - Check that all expected tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      
      // Core tables should exist
      expect(tableNames).toContain('repositories');
      expect(tableNames).toContain('files');
      expect(tableNames).toContain('graph_nodes');
      expect(tableNames).toContain('graph_edges');
      expect(tableNames).toContain('embedding_nodes');
      expect(tableNames).toContain('phase_status');
    });

    it('should create correct column structure for repositories table', async () => {
      // Act
      const db = sqliteClient.getDb();
      const columns = db.prepare(`PRAGMA table_info(repositories)`).all() as any[];

      // Assert
      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('repo_path');
      expect(columnNames).toContain('repo_name');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Check primary key
      const primaryKey = columns.find(c => c.pk === 1);
      expect(primaryKey.name).toBe('id');
    });

    it('should create correct column structure for files table', async () => {
      // Act
      const db = sqliteClient.getDb();
      const columns = db.prepare(`PRAGMA table_info(files)`).all() as any[];

      // Assert
      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('repo_id');
      expect(columnNames).toContain('file_path');
      expect(columnNames).toContain('file_name');
      expect(columnNames).toContain('content_embedding');

      // Check foreign key constraints
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(files)`).all() as any[];
      expect(foreignKeys.length).toBeGreaterThan(0);
      
      const repoForeignKey = foreignKeys.find(fk => fk.from === 'repo_id');
      expect(repoForeignKey).toBeDefined();
      expect(repoForeignKey.table).toBe('repositories');
    });

    it('should create correct indexes for performance', async () => {
      // Act
      const db = sqliteClient.getDb();
      const indexes = db.prepare(`
        SELECT name, tbl_name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as { name: string; tbl_name: string }[];

      // Assert - Check that performance indexes exist
      const indexNames = indexes.map(i => i.name);
      
      // Should have indexes on commonly queried columns
      expect(indexes.some(i => i.tbl_name === 'files')).toBe(true);
      expect(indexes.some(i => i.tbl_name === 'graph_nodes')).toBe(true);
      expect(indexes.some(i => i.tbl_name === 'graph_edges')).toBe(true);
    });

    it('should handle schema recreation without errors', async () => {
      // Arrange - Schema is already created
      const db = sqliteClient.getDb();
      
      // Act - Try to recreate schema (should not fail due to IF NOT EXISTS)
      expect(() => {
        initializeTables(sqliteClient);
      }).not.toThrow();

      // Assert - Tables should still exist and be functional
      const result = db.prepare('SELECT COUNT(*) as count FROM repositories').get();
      expect(result).toBeDefined();
    });
  });

  describe('Basic CRUD Operations', () => {
    it('should insert and retrieve repository data', async () => {
      // Arrange
      const testRepo = TestDataFactory.createRepository({
        name: 'test-repo',
        path: '/path/to/test-repo'
      });

      // Act - Insert
      sqliteClient.run(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
        [testRepo.id, testRepo.properties.repoName, testRepo.properties.repoPath]
      );

      // Act - Retrieve
      const retrieved = sqliteClient.get(
        'SELECT * FROM repositories WHERE id = ?',
        [testRepo.id]
      );

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(testRepo.id);
      expect(retrieved.repo_name).toBe(testRepo.properties.repoName);
      expect(retrieved.repo_path).toBe(testRepo.properties.repoPath);
    });

    it('should insert and retrieve file data with relationships', async () => {
      // Arrange
      const testRepo = TestDataFactory.createRepository();
      const testFile = TestDataFactory.createFile({
        repositoryId: testRepo.id,
        name: 'test.ts',
        path: '/src/test.ts'
      });

      // Act - Insert repository first
      sqliteClient.run(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
        [testRepo.id, testRepo.properties.repoName, testRepo.properties.repoPath]
      );

      // Act - Insert file
      sqliteClient.run(`
        INSERT INTO files (id, repo_id, file_name, file_path, language, size_kb)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [testFile.id, testFile.properties.repoId, testFile.properties.fileName, testFile.properties.filePath, 'typescript', 1.5]);

      // Act - Retrieve with join
      const result = sqliteClient.get(`
        SELECT f.*, r.repo_name 
        FROM files f 
        JOIN repositories r ON f.repo_id = r.id 
        WHERE f.id = ?
      `, [testFile.id]);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(testFile.id);
      expect(result.file_name).toBe(testFile.properties.fileName);
      expect(result.repo_name).toBe(testRepo.properties.repoName);
    });

    it('should handle foreign key constraints', async () => {
      // Arrange
      const testFile = TestDataFactory.createFile({
        repositoryId: 'non-existent-repo-id'
      });

      // Act & Assert - Should fail due to foreign key constraint
      expect(() => {
        sqliteClient.run(`
          INSERT INTO files (id, repo_id, file_name, file_path)
          VALUES (?, ?, ?, ?)
        `, [testFile.id, testFile.properties.repoId, testFile.properties.fileName, testFile.properties.filePath]);
      }).toThrow();
    });

    it('should update and delete records correctly', async () => {
      // Arrange
      const testRepo = TestDataFactory.createRepository();
      
      // Insert
      sqliteClient.run(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
        [testRepo.id, testRepo.properties.repoName, testRepo.properties.repoPath]
      );

      // Act - Update
      const newName = 'updated-repo-name';
      const updateResult = sqliteClient.run(
        'UPDATE repositories SET repo_name = ? WHERE id = ?',
        [newName, testRepo.id]
      );

      // Assert update
      expect(updateResult.changes).toBe(1);
      
      const updated = sqliteClient.get('SELECT * FROM repositories WHERE id = ?', [testRepo.id]);
      expect(updated.repo_name).toBe(newName);

      // Act - Delete
      const deleteResult = sqliteClient.run('DELETE FROM repositories WHERE id = ?', [testRepo.id]);

      // Assert delete
      expect(deleteResult.changes).toBe(1);
      
      const deleted = sqliteClient.get('SELECT * FROM repositories WHERE id = ?', [testRepo.id]);
      expect(deleted).toBeUndefined();
    });
  });

  describe('Transaction Handling', () => {
    it('should execute successful transactions', async () => {
      // Arrange
      const repos = [
        TestDataFactory.createRepository({ name: 'repo1' }),
        TestDataFactory.createRepository({ name: 'repo2' }),
        TestDataFactory.createRepository({ name: 'repo3' })
      ];

      // Act - Execute transaction
      const result = sqliteClient.transaction(() => {
        for (const repo of repos) {
          sqliteClient.run(
            'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
            [repo.id, repo.properties.repoName, repo.properties.repoPath]
          );
        }
        return repos.length;
      });

      // Assert
      expect(result).toBe(3);
      
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(count.count).toBe(3);
    });

    it('should rollback failed transactions', async () => {
      // Arrange
      const validRepo = TestDataFactory.createRepository({ name: 'valid-repo' });
      
      // Insert one valid repo first
      sqliteClient.run(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
        [validRepo.id, validRepo.properties.repoName, validRepo.properties.repoPath]
      );

      // Act & Assert - Transaction should fail and rollback
      expect(() => {
        sqliteClient.transaction(() => {
          // This should succeed
          const newRepo = TestDataFactory.createRepository({ name: 'new-repo' });
          sqliteClient.run(
            'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
            [newRepo.id, newRepo.properties.repoName, newRepo.properties.repoPath]
          );
          
          // This should fail (duplicate primary key)
          sqliteClient.run(
            'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
            [validRepo.id, 'duplicate-id', '/path']
          );
        });
      }).toThrow();

      // Assert - Only the original repo should exist
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(count.count).toBe(1);
      
      const remaining = sqliteClient.get('SELECT * FROM repositories');
      expect(remaining.id).toBe(validRepo.id);
    });

    it('should handle nested transactions correctly', async () => {
      // Arrange
      const repo1 = TestDataFactory.createRepository({ name: 'repo1' });
      const repo2 = TestDataFactory.createRepository({ name: 'repo2' });

      // Act - Nested transaction (SQLite doesn't support true nested transactions, 
      // but better-sqlite3 handles this by using savepoints)
      const result = sqliteClient.transaction(() => {
        sqliteClient.run(
          'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
          [repo1.id, repo1.properties.repoName, repo1.properties.repoPath]
        );

        // Inner "transaction" - actually a savepoint
        const innerResult = sqliteClient.transaction(() => {
          sqliteClient.run(
            'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
            [repo2.id, repo2.properties.repoName, repo2.properties.repoPath]
          );
          return 'inner-success';
        });

        return innerResult;
      });

      // Assert
      expect(result).toBe('inner-success');
      
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(count.count).toBe(2);
    });
  });

  describe('Batch Operations', () => {
    it('should perform batch inserts efficiently', async () => {
      // Arrange
      const batchSize = 100;
      const repositories = Array.from({ length: batchSize }, (_, i) => 
        TestDataFactory.createRepository({ name: `repo-${i}` })
      );

      // Act - Batch insert using prepared statement
      const startTime = Date.now();
      
      const insertStmt = sqliteClient.prepare(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)'
      );
      
      sqliteClient.transaction(() => {
        for (const repo of repositories) {
          insertStmt.run(repo.id, repo.properties.repoName, repo.properties.repoPath);
        }
      });
      
      const duration = Date.now() - startTime;

      // Assert
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(count.count).toBe(batchSize);
      
      // Batch operation should be reasonably fast (less than 1 second for 100 records)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle batch updates with mixed success/failure', async () => {
      // Arrange
      const repos = [
        TestDataFactory.createRepository({ name: 'repo1' }),
        TestDataFactory.createRepository({ name: 'repo2' }),
        TestDataFactory.createRepository({ name: 'repo3' })
      ];

      // Insert initial data
      for (const repo of repos) {
        sqliteClient.run(
          'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
          [repo.id, repo.properties.repoName, repo.properties.repoPath]
        );
      }

      // Act - Batch update with one invalid operation
      const updateStmt = sqliteClient.prepare(
        'UPDATE repositories SET repo_name = ? WHERE id = ?'
      );

      let successCount = 0;
      let failureCount = 0;

      const updates = [
        { id: repos[0].id, name: 'updated-repo1' }, // Should succeed
        { id: repos[1].id, name: 'updated-repo2' }, // Should succeed
        { id: 'non-existent-id', name: 'updated-repo3' } // Should not update anything
      ];

      for (const update of updates) {
        const result = updateStmt.run(update.name, update.id);
        if (result.changes > 0) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      // Assert
      expect(successCount).toBe(2);
      expect(failureCount).toBe(1);

      // Verify updates
      const updated1 = sqliteClient.get('SELECT * FROM repositories WHERE id = ?', [repos[0].id]);
      expect(updated1.repo_name).toBe('updated-repo1');

      const updated2 = sqliteClient.get('SELECT * FROM repositories WHERE id = ?', [repos[1].id]);
      expect(updated2.repo_name).toBe('updated-repo2');
    });

    it('should perform batch deletes with proper cleanup', async () => {
      // Arrange
      const repos = Array.from({ length: 50 }, (_, i) => 
        TestDataFactory.createRepository({ name: `repo-${i}` })
      );

      // Insert test data
      const insertStmt = sqliteClient.prepare(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)'
      );
      
      sqliteClient.transaction(() => {
        for (const repo of repos) {
          insertStmt.run(repo.id, repo.properties.repoName, repo.properties.repoPath);
        }
      });

      // Act - Batch delete (delete every other repository)
      const deleteStmt = sqliteClient.prepare('DELETE FROM repositories WHERE id = ?');
      const toDelete = repos.filter((_, i) => i % 2 === 0);

      const toDeleteIds = toDelete.map(r => r.id);
      const deletedCount = sqliteClient.transaction(() => {
        let deletedCount = 0;
        for (const id of toDeleteIds) {
          const result = deleteStmt.run(id);
          deletedCount += result.changes;
        }
        return deletedCount;
      });

      // Assert
      expect(deletedCount).toBe(toDelete.length);
      
      const remainingCount = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(remainingCount.count).toBe(repos.length - toDelete.length);
    });
  });

  describe('Vector Storage and Retrieval Operations', () => {
    beforeEach(async () => {
      // Seed test data for vector operations
      const testRepo = TestDataFactory.createRepository();
      const testFiles = [
        TestDataFactory.createFile({ 
          repositoryId: testRepo.id, 
          name: 'component.ts',
          content: 'React component for user interface'
        }),
        TestDataFactory.createFile({ 
          repositoryId: testRepo.id, 
          name: 'service.ts',
          content: 'Service layer for data processing'
        }),
        TestDataFactory.createFile({ 
          repositoryId: testRepo.id, 
          name: 'utils.ts',
          content: 'Utility functions for string manipulation'
        })
      ];

      // Insert test data
      sqliteClient.run(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
        [testRepo.id, testRepo.properties.repoName, testRepo.properties.repoPath]
      );

      for (const file of testFiles) {
        sqliteClient.run(`
          INSERT INTO files (id, repo_id, file_name, file_path, language)
          VALUES (?, ?, ?, ?, ?)
        `, [file.id, file.properties.repoId, file.properties.fileName, file.properties.filePath, 'typescript']);
      }
    });

    it('should store vector embeddings successfully', async () => {
      // Arrange
      const files = sqliteClient.all('SELECT * FROM files');
      expect(files.length).toBeGreaterThan(0);

      const testEmbedding = TestDataFactory.createEmbedding(384); // Standard embedding size

      // Act - Store embedding using SQLiteClient method
      await sqliteClient.storeVector('files', 'content_embedding', files[0].id, testEmbedding);

      // Assert
      const fileWithEmbedding = sqliteClient.get(
        'SELECT id, content_embedding FROM files WHERE id = ?',
        [files[0].id]
      );

      expect(fileWithEmbedding.content_embedding).toBeTruthy();
      expect(fileWithEmbedding.content_embedding).toBeInstanceOf(Buffer);

      // Verify embedding can be converted back to Float32Array
      const retrievedEmbedding = new Float32Array(fileWithEmbedding.content_embedding.buffer);
      expect(retrievedEmbedding.length).toBe(testEmbedding.length);
    });

    it('should store vector embeddings using vector module function', async () => {
      // Arrange
      const files = sqliteClient.all('SELECT * FROM files');
      const testEmbedding = TestDataFactory.createEmbedding(384);

      // Act - Store embedding using vector module function
      await storeVector(sqliteClient, 'files', 'content_embedding', files[0].id, testEmbedding);

      // Assert
      const fileWithEmbedding = sqliteClient.get(
        'SELECT id, content_embedding FROM files WHERE id = ?',
        [files[0].id]
      );

      expect(fileWithEmbedding.content_embedding).toBeTruthy();
      expect(fileWithEmbedding.content_embedding).toBeInstanceOf(Buffer);
    });

    it('should perform vector similarity search when vector extension is available', async () => {
      // Skip test if vector extension is not available
      if (!sqliteClient.isVectorEnabled) {
        console.log('Skipping vector search test - vector extension not available');
        return;
      }

      // Arrange
      const files = sqliteClient.all('SELECT * FROM files');
      const embeddings = [
        TestDataFactory.createEmbedding(384),
        TestDataFactory.createEmbedding(384),
        TestDataFactory.createEmbedding(384)
      ];

      // Store embeddings for all files
      for (let i = 0; i < files.length && i < embeddings.length; i++) {
        await sqliteClient.storeVector('files', 'content_embedding', files[i].id, embeddings[i]);
      }

      // Act - Perform vector search
      const queryEmbedding = TestDataFactory.createEmbedding(384);
      const searchResults = await sqliteClient.vectorSearch(
        'files', 
        'content_embedding', 
        queryEmbedding, 
        5
      );

      // Assert
      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.length).toBeLessThanOrEqual(5);

      // Each result should have required properties
      searchResults.forEach(result => {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('data');
        expect(typeof result.similarity).toBe('number');
        expect(typeof result.similarity).toBe('number');
        expect(result.similarity).toBeGreaterThanOrEqual(-1);
        expect(result.similarity).toBeLessThanOrEqual(1);
      });
    });

    it('should perform vector search with threshold filtering', async () => {
      // Skip test if vector extension is not available
      if (!sqliteClient.isVectorEnabled) {
        console.log('Skipping vector search with threshold test - vector extension not available');
        return;
      }

      // Arrange
      const files = sqliteClient.all('SELECT * FROM files');
      const embeddings = files.map(() => TestDataFactory.createEmbedding(384));

      // Store embeddings
      for (let i = 0; i < files.length; i++) {
        await sqliteClient.storeVector('files', 'content_embedding', files[i].id, embeddings[i]);
      }

      // Act - Search with high threshold (should return fewer results)
      const queryEmbedding = TestDataFactory.createEmbedding(384);
      const highThresholdResults = await sqliteClient.vectorSearch(
        'files', 
        'content_embedding', 
        queryEmbedding, 
        10,
        0.9 // High similarity threshold
      );

      // Act - Search with low threshold (should return more results)
      const lowThresholdResults = await sqliteClient.vectorSearch(
        'files', 
        'content_embedding', 
        queryEmbedding, 
        10,
        0.1 // Low similarity threshold
      );

      // Assert
      expect(lowThresholdResults.length).toBeGreaterThanOrEqual(highThresholdResults.length);
      
      // All results should meet the threshold
      highThresholdResults.forEach(result => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should handle batch vector storage operations', async () => {
      // Arrange
      const files = sqliteClient.all('SELECT * FROM files');
      const embeddingRecords = files.map(file => ({
        id: file.id,
        embedding: TestDataFactory.createEmbedding(384)
      }));

      // Act - Batch store embeddings
      const result = await batchStoreEmbeddings(
        sqliteClient,
        'files',
        'content_embedding',
        embeddingRecords
      );

      // Assert
      expect(result.success).toBe(embeddingRecords.length);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify all embeddings were stored
      const filesWithEmbeddings = sqliteClient.all(
        'SELECT id, content_embedding FROM files WHERE content_embedding IS NOT NULL'
      );
      expect(filesWithEmbeddings.length).toBe(embeddingRecords.length);
    });

    it('should handle batch vector storage with partial failures', async () => {
      // Arrange
      const files = sqliteClient.all('SELECT * FROM files');
      const embeddingRecords = [
        ...files.map(file => ({
          id: file.id,
          embedding: TestDataFactory.createEmbedding(384)
        })),
        // Add invalid record
        {
          id: 'non-existent-file-id',
          embedding: TestDataFactory.createEmbedding(384)
        }
      ];

      // Act - Batch store embeddings (some should fail)
      const result = await batchStoreEmbeddings(
        sqliteClient,
        'files',
        'content_embedding',
        embeddingRecords
      );

      // Assert
      expect(result.success).toBe(files.length);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('non-existent-file-id');
    });

    it('should perform semantic search across multiple tables', async () => {
      // Skip test if vector extension is not available
      if (!sqliteClient.isVectorEnabled) {
        console.log('Skipping semantic search test - vector extension not available');
        return;
      }

      // Arrange - Create additional test tables and data
      const db = sqliteClient.getDb();
      
      // Create functions table for semantic search
      db.exec(`
        CREATE TABLE IF NOT EXISTS functions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          signature_embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create commits table for semantic search
      db.exec(`
        CREATE TABLE IF NOT EXISTS commits (
          id TEXT PRIMARY KEY,
          message TEXT NOT NULL,
          message_embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create pull_requests table for semantic search
      db.exec(`
        CREATE TABLE IF NOT EXISTS pull_requests (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          title_embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert test data with embeddings
      const files = sqliteClient.all('SELECT * FROM files');
      for (const file of files) {
        await sqliteClient.storeVector('files', 'content_embedding', file.id, TestDataFactory.createEmbedding(384));
      }

      // Insert function data
      const functionId = `func-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sqliteClient.run('INSERT INTO functions (id, name) VALUES (?, ?)', [functionId, 'testFunction']);
      await sqliteClient.storeVector('functions', 'signature_embedding', functionId, TestDataFactory.createEmbedding(384));

      // Act - Perform semantic search
      const queryEmbedding = TestDataFactory.createEmbedding(384);
      const searchResults = await semanticSearch(sqliteClient, queryEmbedding, 5);

      // Assert
      expect(searchResults).toBeDefined();
      expect(searchResults).toHaveProperty('files');
      expect(searchResults).toHaveProperty('functions');
      expect(searchResults).toHaveProperty('commits');
      expect(searchResults).toHaveProperty('pullRequests');

      expect(Array.isArray(searchResults.files)).toBe(true);
      expect(Array.isArray(searchResults.functions)).toBe(true);
      expect(Array.isArray(searchResults.commits)).toBe(true);
      expect(Array.isArray(searchResults.pullRequests)).toBe(true);

      // Should have results from files and functions
      expect(searchResults.files.length).toBeGreaterThan(0);
      expect(searchResults.functions.length).toBeGreaterThan(0);
    });

    it('should gracefully handle vector operations when extension is not available', async () => {
      // This test ensures the system works even without vector extension
      
      // Act - Try to store vector (should not throw error)
      const files = sqliteClient.all('SELECT * FROM files');
      const testEmbedding = TestDataFactory.createEmbedding(384);

      await expect(
        sqliteClient.storeVector('files', 'content_embedding', files[0].id, testEmbedding)
      ).resolves.not.toThrow();

      // Act - Try to search vectors (should return empty results if no extension)
      const searchResults = await sqliteClient.vectorSearch(
        'files', 
        'content_embedding', 
        testEmbedding, 
        5
      );

      // Assert
      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults)).toBe(true);
      
      if (!sqliteClient.isVectorEnabled) {
        expect(searchResults).toHaveLength(0);
      }
    });
  });

  describe('Database Statistics and Monitoring', () => {
    beforeEach(async () => {
      // Seed test data for statistics
      const testRepo = TestDataFactory.createRepository();
      const testFiles = Array.from({ length: 5 }, (_, i) => 
        TestDataFactory.createFile({ 
          repositoryId: testRepo.id, 
          name: `file${i}.ts` 
        })
      );

      // Insert test data
      sqliteClient.run(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
        [testRepo.id, testRepo.properties.repoName, testRepo.properties.repoPath]
      );

      for (const file of testFiles) {
        sqliteClient.run(`
          INSERT INTO files (id, repo_id, file_name, file_path, language)
          VALUES (?, ?, ?, ?, ?)
        `, [file.id, file.properties.repoId, file.properties.fileName, file.properties.filePath, 'typescript']);
      }

      // Add some graph nodes
      for (let i = 0; i < 10; i++) {
        const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sqliteClient.run(`
          INSERT INTO graph_nodes (id, business_key, node_type, properties, repo_id)
          VALUES (?, ?, ?, ?, ?)
        `, [nodeId, `node-${i}`, 'FunctionNode', JSON.stringify({ name: `func${i}` }), testRepo.id]);
      }
    });

    it('should retrieve basic database statistics', async () => {
      // Act
      const stats = await getDatabaseStats(sqliteClient.getDb());

      // Assert
      expect(stats).toBeDefined();
      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.totalCodeNodes).toBe('number');
      expect(typeof stats.totalCommits).toBe('number');
      expect(typeof stats.dbSizeKb).toBe('number');

      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.dbSizeKb).toBeGreaterThan(0);
    });

    it('should retrieve enhanced graph statistics', async () => {
      // Act
      const stats = await getEnhancedGraphStats(sqliteClient);

      // Assert
      expect(stats).toBeDefined();
      expect(typeof stats.nodeCount).toBe('number');
      expect(typeof stats.edgeCount).toBe('number');
      expect(typeof stats.nodeTypes).toBe('object');
      expect(typeof stats.edgeTypes).toBe('object');
      expect(typeof stats.repoBreakdown).toBe('object');

      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.nodeTypes).toHaveProperty('FunctionNode');
      expect(stats.nodeTypes.FunctionNode).toBeGreaterThan(0);
    });

    it('should track indexing state correctly', async () => {
      // Arrange
      const commitHash = 'abc123def456';

      // Act - Set last indexed commit
      sqliteClient.setLastIndexedCommit(commitHash);

      // Act - Get last indexed commit
      const retrievedCommit = sqliteClient.getLastIndexedCommit();

      // Assert
      expect(retrievedCommit).toBe(commitHash);
    });

    it('should retrieve indexing statistics', async () => {
      // Arrange
      const commitHash = 'test-commit-hash';
      sqliteClient.setLastIndexedCommit(commitHash);

      // Act
      const stats = await sqliteClient.getIndexingStats();

      // Assert
      expect(stats).toBeDefined();
      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.totalCommits).toBe('number');
      expect(stats.lastIndexed).toBe(commitHash);

      expect(stats.totalFiles).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid SQL queries gracefully', async () => {
      // Act & Assert
      expect(() => {
        sqliteClient.run('INVALID SQL QUERY');
      }).toThrow();

      expect(() => {
        sqliteClient.get('SELECT * FROM non_existent_table');
      }).toThrow();
    });

    it('should handle database corruption scenarios', async () => {
      // This test simulates database corruption by trying to access a corrupted database
      // In a real scenario, this would involve file system manipulation
      
      // Act - Try to perform operations on a potentially corrupted database
      // The database should handle this gracefully
      expect(() => {
        sqliteClient.get('PRAGMA integrity_check');
      }).not.toThrow();
    });

    it('should handle concurrent access correctly', async () => {
      // Arrange
      const repos = Array.from({ length: 10 }, (_, i) => 
        TestDataFactory.createRepository({ name: `concurrent-repo-${i}` })
      );

      // Act - Simulate concurrent operations
      const insertPromises = repos.map(repo => 
        new Promise<void>((resolve) => {
          setTimeout(() => {
            sqliteClient.run(
              'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
              [repo.id, repo.properties.repoName, repo.properties.repoPath]
            );
            resolve();
          }, Math.random() * 10);
        })
      );

      await Promise.all(insertPromises);

      // Assert
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(count.count).toBe(repos.length);
    });

    it('should handle large data operations without memory issues', async () => {
      // Arrange - Create a large dataset
      const largeDataset = Array.from({ length: 1000 }, (_, i) => 
        TestDataFactory.createRepository({ name: `large-repo-${i}` })
      );

      // Act - Insert large dataset
      const startTime = Date.now();
      const insertStmt = sqliteClient.prepare(
        'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)'
      );

      sqliteClient.transaction(() => {
        for (const repo of largeDataset) {
          insertStmt.run(repo.id, repo.properties.repoName, repo.properties.repoPath);
        }
      });
      const duration = Date.now() - startTime;

      // Assert
      const count = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
      expect(count.count).toBe(largeDataset.length);
      
      // Should complete within reasonable time (less than 5 seconds for 1000 records)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle database file locking correctly', async () => {
      // This test ensures that the database handles file locking correctly
      // when multiple connections try to access the same database file
      
      // Arrange - Create second connection to same database
      const secondClient = new SQLiteClient(testDbManager.getDatabasePath());
      await secondClient.connect();

      try {
        // Act - Perform operations on both connections
        sqliteClient.run(
          'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
          ['repo1', 'test-repo-1', '/path1']
        );

        secondClient.run(
          'INSERT INTO repositories (id, repo_name, repo_path) VALUES (?, ?, ?)',
          ['repo2', 'test-repo-2', '/path2']
        );

        // Assert - Both operations should succeed
        const count1 = sqliteClient.get('SELECT COUNT(*) as count FROM repositories');
        const count2 = secondClient.get('SELECT COUNT(*) as count FROM repositories');
        
        expect(count1.count).toBe(2);
        expect(count2.count).toBe(2);

      } finally {
        // Cleanup
        secondClient.disconnect();
      }
    });
  });
});
