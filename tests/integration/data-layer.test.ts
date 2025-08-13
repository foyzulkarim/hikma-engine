import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SQLiteClient } from '../../src/persistence/db/connection';

describe('Data Layer - SQLite Operations', () => {
  let tempDbPath: string;
  let sqliteClient: SQLiteClient;

  beforeEach(() => {
    // Create a temporary database file for each test
    tempDbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    sqliteClient = new SQLiteClient(tempDbPath);
  });

  afterEach(() => {
    // Clean up temporary database file
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Database Connection', () => {
    test('should connect to SQLite database successfully', () => {
      expect(() => {
        sqliteClient.connect();
      }).not.toThrow();
    });

    test('should verify database connectivity', () => {
      sqliteClient.connect();
      expect(() => {
        sqliteClient.get('SELECT 1 as test');
      }).not.toThrow();
    });

    test('should handle connection errors gracefully', () => {
      const invalidPath = '/invalid/path/to/database.db';
      const invalidClient = new SQLiteClient(invalidPath);
      
      expect(() => {
        invalidClient.connect();
      }).toThrow();
    });
  });

  describe('CRUD Operations', () => {
    beforeEach(() => {
      sqliteClient.connect();
      
      // Create test table
      sqliteClient.run(`
        CREATE TABLE IF NOT EXISTS test_items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          value INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });

    test('should insert data successfully', () => {
      const result = sqliteClient.run(
        'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
        ['test-1', 'Test Item', 42]
      );
      
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    test('should read data correctly', () => {
      sqliteClient.run(
        'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
        ['test-1', 'Test Item', 42]
      );

      const row = sqliteClient.get('SELECT * FROM test_items WHERE id = ?', ['test-1']);
      
      expect(row).toBeDefined();
      expect(row.name).toBe('Test Item');
      expect(row.value).toBe(42);
    });

    test('should update data successfully', () => {
      sqliteClient.run(
        'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
        ['test-1', 'Test Item', 42]
      );

      const result = sqliteClient.run(
        'UPDATE test_items SET value = ? WHERE id = ?',
        [100, 'test-1']
      );
      
      expect(result.changes).toBe(1);

      const row = sqliteClient.get('SELECT * FROM test_items WHERE id = ?', ['test-1']);
      expect(row.value).toBe(100);
    });

    test('should delete data successfully', () => {
      sqliteClient.run(
        'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
        ['test-1', 'Test Item', 42]
      );

      const result = sqliteClient.run('DELETE FROM test_items WHERE id = ?', ['test-1']);
      expect(result.changes).toBe(1);

      const row = sqliteClient.get('SELECT * FROM test_items WHERE id = ?', ['test-1']);
      expect(row).toBeUndefined();
    });

    test('should handle batch operations', () => {
      const insertStmt = sqliteClient.prepare('INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)');
      
      const items = [
        ['batch-1', 'Item 1', 10],
        ['batch-2', 'Item 2', 20],
        ['batch-3', 'Item 3', 30]
      ];

      items.forEach(item => {
        insertStmt.run(...item);
      });

      const count = sqliteClient.get('SELECT COUNT(*) as count FROM test_items');
      expect(count.count).toBe(3);
    });
  });

  describe('Database Schema Operations', () => {
    beforeEach(() => {
      sqliteClient.connect();
    });

    test('should create repository table successfully', () => {
      expect(() => {
        sqliteClient.run(`
          CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            repo_path TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }).not.toThrow();
    });

    test('should create files table with foreign key constraint', () => {
      expect(() => {
        sqliteClient.run(`
          CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            language TEXT,
            FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
          )
        `);
      }).not.toThrow();
    });
  });

  describe('Data Integrity', () => {
    beforeEach(() => {
      sqliteClient.connect();
      
      sqliteClient.run(`
        CREATE TABLE IF NOT EXISTS repositories (
          id TEXT PRIMARY KEY,
          repo_path TEXT NOT NULL,
          repo_name TEXT NOT NULL
        )
      `);
      
      sqliteClient.run(`
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
        )
      `);
    });

    test('should enforce foreign key constraints', () => {
      // Insert repository
      sqliteClient.run('INSERT INTO repositories (id, repo_path, repo_name) VALUES (?, ?, ?)', ['repo-1', '/path/to/repo', 'test-repo']);
      
      // Insert file with valid foreign key
      expect(() => {
        sqliteClient.run('INSERT INTO files (id, repo_id, file_path) VALUES (?, ?, ?)', ['file-1', 'repo-1', 'test.js']);
      }).not.toThrow();
      
      // Try to insert file with invalid foreign key
      expect(() => {
        sqliteClient.run('INSERT INTO files (id, repo_id, file_path) VALUES (?, ?, ?)', ['file-2', 'invalid-repo', 'test2.js']);
      }).toThrow();
    });

    test('should handle cascading deletes', () => {
      // Insert repository and file
      sqliteClient.run('INSERT INTO repositories (id, repo_path, repo_name) VALUES (?, ?, ?)', ['repo-1', '/path/to/repo', 'test-repo']);
      sqliteClient.run('INSERT INTO files (id, repo_id, file_path) VALUES (?, ?, ?)', ['file-1', 'repo-1', 'test.js']);
      
      // Delete repository
      sqliteClient.run('DELETE FROM repositories WHERE id = ?', ['repo-1']);
      
      // Verify file is also deleted
      const file = sqliteClient.get('SELECT * FROM files WHERE repo_id = ?', ['repo-1']);
      expect(file).toBeUndefined();
    });
  });
});