/**
 * @file Tests for SQLite database schema creation and validation
 */

import { SQLiteClient } from '../src/persistence/db-clients';
import * as fs from 'fs';
import * as path from 'path';

describe('SQLite Database Schema', () => {
  let sqliteClient: SQLiteClient;
  const testDbPath = path.join(__dirname, 'test-schema.db');

  beforeEach(() => {
    // Remove test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    sqliteClient = new SQLiteClient(testDbPath);
  });

  afterEach(() => {
    if (sqliteClient.isConnectedToDatabase()) {
      sqliteClient.disconnect();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should create all required tables', () => {
    sqliteClient.connect();

    // Check that all required tables exist
    const tables = sqliteClient.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    const tableNames = tables.map((table: any) => table.name);
    
    expect(tableNames).toContain('repositories');
    expect(tableNames).toContain('directories');
    expect(tableNames).toContain('files');
    expect(tableNames).toContain('code_nodes');
    expect(tableNames).toContain('test_nodes');
    expect(tableNames).toContain('pull_requests');
    expect(tableNames).toContain('commits');
    expect(tableNames).toContain('functions');
    expect(tableNames).toContain('indexing_state');
    expect(tableNames).toContain('file_imports');
    expect(tableNames).toContain('file_relations');
    expect(tableNames).toContain('file_commits');
    expect(tableNames).toContain('function_calls');
    expect(tableNames).toContain('function_commits');
  });

  test('should create proper indexes', () => {
    sqliteClient.connect();

    // Check that indexes exist
    const indexes = sqliteClient.all(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    const indexNames = indexes.map((index: any) => index.name);
    
    // Check some key indexes
    expect(indexNames).toContain('idx_files_repo_id');
    expect(indexNames).toContain('idx_directories_repo_id');
    expect(indexNames).toContain('idx_code_nodes_file_path');
    expect(indexNames).toContain('idx_test_nodes_file_path');
    expect(indexNames).toContain('idx_pull_requests_pr_id');
    expect(indexNames).toContain('idx_functions_file_id');
    expect(indexNames).toContain('idx_commits_hash');
    expect(indexNames).toContain('idx_indexing_state_key');
  });

  test('should handle indexing state operations', () => {
    sqliteClient.connect();

    // Test setting and getting last indexed commit
    const testCommitHash = 'abc123def456';
    sqliteClient.setLastIndexedCommit(testCommitHash);
    
    const retrievedHash = sqliteClient.getLastIndexedCommit();
    expect(retrievedHash).toBe(testCommitHash);
  });

  test('should return comprehensive indexing stats', async () => {
    sqliteClient.connect();

    const stats = await sqliteClient.getIndexingStats();
    
    expect(stats).toHaveProperty('totalFiles');
    expect(stats).toHaveProperty('totalDirectories');
    expect(stats).toHaveProperty('totalCommits');
    expect(stats).toHaveProperty('totalCodeNodes');
    expect(stats).toHaveProperty('totalTestNodes');
    expect(stats).toHaveProperty('totalPullRequests');
    expect(stats).toHaveProperty('lastIndexed');
    
    // Initially all counts should be 0
    expect(stats.totalFiles).toBe(0);
    expect(stats.totalDirectories).toBe(0);
    expect(stats.totalCommits).toBe(0);
    expect(stats.totalCodeNodes).toBe(0);
    expect(stats.totalTestNodes).toBe(0);
    expect(stats.totalPullRequests).toBe(0);
    expect(stats.lastIndexed).toBeNull();
  });

  test('should enforce foreign key constraints', () => {
    sqliteClient.connect();

    // Enable foreign key constraints
    sqliteClient.run('PRAGMA foreign_keys = ON');

    // Try to insert a file without a valid repository - should fail
    expect(() => {
      sqliteClient.run(`
        INSERT INTO files (file_id, repo_id, file_path, file_name, file_type)
        VALUES ('file1', 'nonexistent_repo', '/test/file.ts', 'file.ts', 'source')
      `);
    }).toThrow();
  });

  test('should enforce check constraints', () => {
    sqliteClient.connect();

    // Insert a valid repository first
    sqliteClient.run(`
      INSERT INTO repositories (repo_id, repo_path, repo_name)
      VALUES ('repo1', '/test/repo', 'test-repo')
    `);

    // Try to insert a file with invalid file_type - should fail
    expect(() => {
      sqliteClient.run(`
        INSERT INTO files (file_id, repo_id, file_path, file_name, file_type)
        VALUES ('file1', 'repo1', '/test/file.ts', 'file.ts', 'invalid_type')
      `);
    }).toThrow();

    // Try to insert a function with invalid access_level - should fail
    sqliteClient.run(`
      INSERT INTO files (file_id, repo_id, file_path, file_name, file_type)
      VALUES ('file1', 'repo1', '/test/file.ts', 'file.ts', 'source')
    `);

    expect(() => {
      sqliteClient.run(`
        INSERT INTO functions (id, file_id, name, signature, return_type, access_level, file_path, start_line, end_line, body)
        VALUES ('func1', 'file1', 'testFunc', 'testFunc()', 'void', 'invalid_access', '/test/file.ts', 1, 10, 'function body')
      `);
    }).toThrow();
  });
});
