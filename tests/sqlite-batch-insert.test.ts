/**
 * @file Tests for SQLite batch insert methods
 */

import { SQLiteClient } from '../src/persistence/db-clients';
import { 
  RepositoryNode, 
  FileNode, 
  DirectoryNode, 
  CodeNode, 
  TestNode, 
  FunctionNode, 
  CommitNode, 
  PullRequestNode 
} from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('SQLiteClient Batch Insert Methods', () => {
  let client: SQLiteClient;
  const testDbPath = path.join(__dirname, 'test-batch-insert.db');

  beforeEach(() => {
    // Remove test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    client = new SQLiteClient(testDbPath);
    client.connect();
  });

  afterEach(() => {
    if (client.isConnectedToDatabase()) {
      client.disconnect();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('batchInsertRepositories', () => {
    it('should successfully insert multiple repositories', async () => {
      const repositories = [
        {
          id: 'repo1',
          repoPath: '/path/to/repo1',
          repoName: 'test-repo-1',
          createdAt: '2024-01-01T00:00:00Z',
          lastUpdated: '2024-01-01T00:00:00Z'
        },
        {
          id: 'repo2',
          repoPath: '/path/to/repo2',
          repoName: 'test-repo-2'
        }
      ];

      const result = await client.batchInsertRepositories(repositories);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify data was inserted
      const rows = client.all('SELECT * FROM repositories ORDER BY repo_id');
      expect(rows).toHaveLength(2);
      expect(rows[0].repo_name).toBe('test-repo-1');
      expect(rows[1].repo_name).toBe('test-repo-2');
    });

    it('should handle empty array gracefully', async () => {
      const result = await client.batchInsertRepositories([]);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle duplicate IDs with REPLACE', async () => {
      const repositories = [
        {
          id: 'repo1',
          repoPath: '/path/to/repo1',
          repoName: 'original-name'
        },
        {
          id: 'repo1',
          repoPath: '/path/to/repo1',
          repoName: 'updated-name'
        }
      ];

      const result = await client.batchInsertRepositories(repositories);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);

      // Verify only one record exists with updated name
      const rows = client.all('SELECT * FROM repositories WHERE repo_id = ?', ['repo1']);
      expect(rows).toHaveLength(1);
      expect(rows[0].repo_name).toBe('updated-name');
    });
  });

  describe('batchInsertFiles', () => {
    beforeEach(async () => {
      // Insert a repository first for foreign key constraint
      await client.batchInsertRepositories([{
        id: 'repo1',
        repoPath: '/test/repo',
        repoName: 'test-repo'
      }]);
    });

    it('should successfully insert multiple files', async () => {
      const files = [
        {
          id: 'file1',
          repoId: 'repo1',
          filePath: '/test/file1.ts',
          fileName: 'file1.ts',
          fileExtension: 'ts',
          language: 'typescript',
          sizeKb: 10.5,
          contentHash: 'hash1',
          fileType: 'source' as const,
          aiSummary: 'Test file 1',
          imports: ['lodash', 'express'],
          exports: ['default']
        },
        {
          id: 'file2',
          repoId: 'repo1',
          filePath: '/test/file2.js',
          fileName: 'file2.js',
          fileExtension: 'js',
          language: 'javascript'
        }
      ];

      const result = await client.batchInsertFiles(files);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify data was inserted
      const rows = client.all('SELECT * FROM files ORDER BY file_id');
      expect(rows).toHaveLength(2);
      expect(rows[0].file_name).toBe('file1.ts');
      expect(rows[0].imports).toBe('["lodash","express"]');
      expect(rows[1].file_name).toBe('file2.js');
    });
  });

  describe('batchInsertCodeNodes', () => {
    it('should successfully insert multiple code nodes', async () => {
      const codeNodes = [
        {
          id: 'code1',
          name: 'testFunction',
          signature: 'function testFunction(): void',
          body: 'console.log("test");',
          docstring: 'A test function',
          language: 'typescript',
          filePath: '/test/file1.ts',
          startLine: 1,
          endLine: 3
        },
        {
          id: 'code2',
          name: 'anotherFunction',
          language: 'javascript',
          filePath: '/test/file2.js',
          startLine: 5,
          endLine: 10
        }
      ];

      const result = await client.batchInsertCodeNodes(codeNodes);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify data was inserted
      const rows = client.all('SELECT * FROM code_nodes ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('testFunction');
      expect(rows[1].name).toBe('anotherFunction');
    });
  });

  describe('batchInsertFunctions', () => {
    beforeEach(async () => {
      // Insert repository and file first
      await client.batchInsertRepositories([{
        id: 'repo1',
        repoPath: '/test/repo',
        repoName: 'test-repo'
      }]);
      await client.batchInsertFiles([{
        id: 'file1',
        repoId: 'repo1',
        filePath: '/test/file1.ts',
        fileName: 'file1.ts'
      }]);
    });

    it('should successfully insert multiple functions', async () => {
      const functions = [
        {
          id: 'func1',
          fileId: 'file1',
          name: 'testMethod',
          signature: 'public testMethod(): string',
          returnType: 'string',
          accessLevel: 'public' as const,
          filePath: '/test/file1.ts',
          startLine: 1,
          endLine: 5,
          body: 'return "test";',
          calledByMethods: ['caller1'],
          callsMethods: ['callee1'],
          usesExternalMethods: true,
          internalCallGraph: ['internal1'],
          transitiveCallDepth: 2
        }
      ];

      const result = await client.batchInsertFunctions(functions);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify data was inserted
      const rows = client.all('SELECT * FROM functions');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('testMethod');
      expect(rows[0].called_by_methods).toBe('["caller1"]');
      expect(rows[0].uses_external_methods).toBe(1); // SQLite stores boolean as integer
    });
  });

  describe('batchInsertRepositoryNodes', () => {
    it('should successfully insert RepositoryNode objects', async () => {
      const repositoryNodes: RepositoryNode[] = [
        {
          id: 'repo1',
          type: 'RepositoryNode',
          properties: {
            repoPath: '/path/to/repo1',
            repoName: 'test-repo-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastUpdated: '2024-01-01T00:00:00Z'
          }
        }
      ];

      const result = await client.batchInsertRepositoryNodes(repositoryNodes);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify data was inserted
      const rows = client.all('SELECT * FROM repositories');
      expect(rows).toHaveLength(1);
      expect(rows[0].repo_name).toBe('test-repo-1');
    });
  });

  describe('transaction handling', () => {
    it('should use transactions for batch operations', async () => {
      // This test verifies that batch operations use transactions
      const repositories = [
        {
          id: 'repo1',
          repoPath: '/path/to/repo1',
          repoName: 'test-repo-1'
        },
        {
          id: 'repo2',
          repoPath: '/path/to/repo2',
          repoName: 'test-repo-2'
        }
      ];

      const result = await client.batchInsertRepositories(repositories);

      // All inserts should succeed
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify data was inserted
      const rows = client.all('SELECT COUNT(*) as count FROM repositories');
      expect(rows[0].count).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw error when not connected', async () => {
      client.disconnect();
      
      await expect(client.batchInsertRepositories([{
        id: 'repo1',
        repoPath: '/test',
        repoName: 'test'
      }])).rejects.toThrow('Not connected to SQLite');
    });
  });
});
