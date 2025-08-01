/**
 * @file Unit tests for GitAnalyzer
 * Tests Git repository analysis, commit extraction, file change tracking, and pull request handling
 */

import { jest } from '@jest/globals';
import { GitAnalyzer } from './git-analyzer';
import { ConfigManager } from '../config';
import { CommitNode, PullRequestNode, Edge, FileNode } from '../types';
import { TestDataFactory } from '../../tests/utils/TestDataFactory';
import { MockSQLiteClient } from '../../tests/utils/mocks/MockSQLiteClient';

// Mock dependencies
jest.mock('../config');
jest.mock('../utils/logger', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    operation: jest.fn(() => jest.fn())
  }))
}));
jest.mock('../utils/error-handling', () => ({
  getErrorMessage: jest.fn((error: any) => error?.message || 'Unknown error'),
  getErrorStack: jest.fn((error: any) => error?.stack || 'No stack'),
  logError: jest.fn()
}));
jest.mock('simple-git', () => ({
  simpleGit: jest.fn()
}));
jest.mock('../persistence/db/connection', () => ({
  SQLiteClient: jest.fn().mockImplementation(() => {
    return new MockSQLiteClient('/test/db.sqlite');
  })
}));

describe('GitAnalyzer', () => {
  let gitAnalyzer: GitAnalyzer;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockGit: any;
  let mockSQLiteClient: MockSQLiteClient;

  const projectRoot = '/test/project';

  const mockDatabaseConfig = {
    sqlite: {
      path: '/test/db.sqlite',
      vectorExtension: './extensions/vec0.dylib'
    }
  };

  beforeEach(() => {
    // Reset test data factory
    TestDataFactory.resetCounter();

    // Create mock config
    mockConfig = {
      getDatabaseConfig: jest.fn().mockReturnValue(mockDatabaseConfig)
    } as any;

    // Create mock git instance
    mockGit = {
      checkIsRepo: jest.fn(),
      log: jest.fn(),
      show: jest.fn(),
      diff: jest.fn()
    };

    // Mock simple-git
    const { simpleGit } = require('simple-git');
    (simpleGit as jest.MockedFunction<any>).mockReturnValue(mockGit);

    // Create analyzer instance
    gitAnalyzer = new GitAnalyzer(projectRoot, mockConfig);

    // Get the mock SQLite client instance
    mockSQLiteClient = (gitAnalyzer as any).sqliteClient as MockSQLiteClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with project root and config', () => {
      expect(gitAnalyzer).toBeDefined();
      expect(gitAnalyzer.getNodes()).toEqual([]);
      expect(gitAnalyzer.getEdges()).toEqual([]);
    });

    it('should initialize SQLite client with correct path', () => {
      expect(mockConfig.getDatabaseConfig).toHaveBeenCalled();
    });

    it('should create simple-git instance with project root', () => {
      const { simpleGit } = require('simple-git');
      expect(simpleGit).toHaveBeenCalledWith(projectRoot);
    });
  });

  describe('Repository Detection', () => {
    it('should detect valid Git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.log.mockResolvedValue({
        all: [],
        total: 0,
        latest: null
      });

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      expect(mockGit.checkIsRepo).toHaveBeenCalled();
    });

    it('should handle non-Git repository gracefully', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false);

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      expect(mockGit.log).not.toHaveBeenCalled();
      expect(gitAnalyzer.getNodes()).toEqual([]);
      expect(gitAnalyzer.getEdges()).toEqual([]);
    });

    it('should handle Git repository check errors', async () => {
      mockGit.checkIsRepo.mockRejectedValue(new Error('Git check failed'));

      const fileNodes: FileNode[] = [];
      await expect(gitAnalyzer.analyzeRepo(fileNodes)).rejects.toThrow('Git check failed');
    });
  });

  describe('Commit Extraction', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should extract commits from repository', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'John Doe',
          date: '2023-01-01T10:00:00Z',
          message: 'Initial commit'
        },
        {
          hash: 'def456',
          author_name: 'Jane Smith',
          date: '2023-01-02T11:00:00Z',
          message: 'Add feature X'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 2,
        latest: mockCommits[0]
      });

      mockGit.show.mockResolvedValue('1 file changed, 10 insertions(+)');

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode') as CommitNode[];

      expect(commitNodes).toHaveLength(2);
      expect(commitNodes[0].properties.hash).toBe('abc123');
      expect(commitNodes[0].properties.author).toBe('John Doe');
      expect(commitNodes[0].properties.message).toBe('Initial commit');
      expect(commitNodes[1].properties.hash).toBe('def456');
    });

    it('should handle incremental commit extraction', async () => {
      const mockCommits = [
        {
          hash: 'new123',
          author_name: 'Developer',
          date: '2023-01-03T12:00:00Z',
          message: 'New commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show.mockResolvedValue('2 files changed, 5 insertions(+), 2 deletions(-)');

      const fileNodes: FileNode[] = [];
      const lastIndexedCommit = 'old456';
      
      await gitAnalyzer.analyzeRepo(fileNodes, lastIndexedCommit);

      expect(mockGit.log).toHaveBeenCalledWith(['old456..HEAD']);

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode') as CommitNode[];

      expect(commitNodes).toHaveLength(1);
      expect(commitNodes[0].properties.hash).toBe('new123');
    });

    it('should extract diff summaries for commits', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Test commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show.mockResolvedValue('src/file.ts | 10 ++++++++++\n1 file changed, 10 insertions(+)');

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode') as CommitNode[];

      expect(commitNodes[0].properties.diffSummary).toContain('src/file.ts');
      expect(commitNodes[0].properties.diffSummary).toContain('10 insertions');
    });

    it('should handle diff summary extraction errors', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Test commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show.mockRejectedValue(new Error('Show failed'));

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode') as CommitNode[];

      expect(commitNodes[0].properties.diffSummary).toBe('Unable to generate diff summary');
    });

    it('should handle empty repository', async () => {
      mockGit.log.mockResolvedValue({
        all: [],
        total: 0,
        latest: null
      });

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode');

      expect(commitNodes).toHaveLength(0);
    });
  });

  describe('File Change Tracking', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should get changed files between commits', async () => {
      const fromCommit = 'abc123';
      const toCommit = 'def456';
      const changedFiles = 'src/file1.ts\nsrc/file2.js\nREADME.md';

      mockGit.diff.mockResolvedValue(changedFiles);

      const result = await gitAnalyzer.getChangedFiles(fromCommit, toCommit);

      expect(mockGit.diff).toHaveBeenCalledWith([`${fromCommit}..${toCommit}`, '--name-only']);
      expect(result).toHaveLength(3);
      expect(result).toContain('/test/project/src/file1.ts');
      expect(result).toContain('/test/project/src/file2.js');
      expect(result).toContain('/test/project/README.md');
    });

    it('should handle empty diff results', async () => {
      mockGit.diff.mockResolvedValue('');

      const result = await gitAnalyzer.getChangedFiles('abc123', 'def456');

      expect(result).toEqual([]);
    });

    it('should handle diff errors', async () => {
      mockGit.diff.mockRejectedValue(new Error('Diff failed'));

      await expect(gitAnalyzer.getChangedFiles('abc123', 'def456')).rejects.toThrow('Diff failed');
    });

    it('should convert relative paths to absolute paths', async () => {
      const changedFiles = 'src/utils.ts\nlib/helpers.js';
      mockGit.diff.mockResolvedValue(changedFiles);

      const result = await gitAnalyzer.getChangedFiles('abc123', 'def456');

      expect(result.every(path => path.startsWith('/test/project/'))).toBe(true);
    });
  });

  describe('Commit-File Relationships', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should create edges between commits and modified files', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Modify files'
        }
      ];

      const fileNodes: FileNode[] = [
        TestDataFactory.createFile({
          id: 'file-1',
          path: 'src/utils.ts'
        }),
        TestDataFactory.createFile({
          id: 'file-2',
          path: 'src/helpers.ts'
        })
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show
        .mockResolvedValueOnce('1 file changed, 5 insertions(+)') // For diff summary
        .mockResolvedValueOnce('src/utils.ts\nsrc/helpers.ts'); // For modified files

      await gitAnalyzer.analyzeRepo(fileNodes);

      const edges = gitAnalyzer.getEdges();
      const modifiedEdges = edges.filter(e => e.type === 'MODIFIED');
      const evolvedByEdges = edges.filter(e => e.type === 'EVOLVED_BY');

      expect(modifiedEdges).toHaveLength(2);
      expect(evolvedByEdges).toHaveLength(2);

      // Check that edges connect commits to files
      const commitNodes = gitAnalyzer.getNodes().filter(n => n.type === 'CommitNode');
      const commitId = commitNodes[0].id;

      expect(modifiedEdges.some(e => e.source === commitId && e.target === 'file-1')).toBe(true);
      expect(modifiedEdges.some(e => e.source === commitId && e.target === 'file-2')).toBe(true);
    });

    it('should handle commits with no file modifications', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Empty commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show
        .mockResolvedValueOnce('0 files changed') // For diff summary
        .mockResolvedValueOnce(''); // For modified files (empty)

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const edges = gitAnalyzer.getEdges();
      const modifiedEdges = edges.filter(e => e.type === 'MODIFIED');

      expect(modifiedEdges).toHaveLength(0);
    });

    it('should handle file path resolution errors', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Test commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show
        .mockResolvedValueOnce('1 file changed')
        .mockRejectedValueOnce(new Error('Show failed'));

      const fileNodes: FileNode[] = [];
      
      // Should not throw, but log warning
      await expect(gitAnalyzer.analyzeRepo(fileNodes)).resolves.not.toThrow();
    });
  });

  describe('Pull Request Handling', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: 'abc123',
            author_name: 'Developer',
            date: '2023-01-01T10:00:00Z',
            message: 'Test commit'
          }
        ],
        total: 1,
        latest: null
      });
      mockGit.show.mockResolvedValue('1 file changed');
    });

    it('should create mock pull request nodes', async () => {
      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const nodes = gitAnalyzer.getNodes();
      const prNodes = nodes.filter(n => n.type === 'PullRequestNode') as PullRequestNode[];

      expect(prNodes.length).toBeGreaterThan(0);
      expect(prNodes[0].properties.title).toBeDefined();
      expect(prNodes[0].properties.author).toBeDefined();
      expect(prNodes[0].properties.url).toBeDefined();
    });

    it('should create edges between pull requests and commits', async () => {
      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const edges = gitAnalyzer.getEdges();
      const includesCommitEdges = edges.filter(e => e.type === 'INCLUDES_COMMIT');

      expect(includesCommitEdges.length).toBeGreaterThan(0);

      const nodes = gitAnalyzer.getNodes();
      const prNodes = nodes.filter(n => n.type === 'PullRequestNode');
      const commitNodes = nodes.filter(n => n.type === 'CommitNode');

      // Verify edges connect PRs to commits
      includesCommitEdges.forEach(edge => {
        expect(prNodes.some(pr => pr.id === edge.source)).toBe(true);
        expect(commitNodes.some(commit => commit.id === edge.target)).toBe(true);
      });
    });
  });

  describe('Current Commit Tracking', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should get current HEAD commit hash', async () => {
      const mockCommit = {
        hash: 'current123',
        author_name: 'Developer',
        date: '2023-01-01T10:00:00Z',
        message: 'Current commit'
      };

      mockGit.log.mockResolvedValue({
        all: [mockCommit],
        total: 1,
        latest: mockCommit
      });

      const currentHash = await gitAnalyzer.getCurrentCommitHash();

      expect(mockGit.log).toHaveBeenCalledWith(['-1']);
      expect(currentHash).toBe('current123');
    });

    it('should handle empty repository for current commit', async () => {
      mockGit.log.mockResolvedValue({
        all: [],
        total: 0,
        latest: null
      });

      const currentHash = await gitAnalyzer.getCurrentCommitHash();

      expect(currentHash).toBeNull();
    });

    it('should handle git log errors for current commit', async () => {
      mockGit.log.mockRejectedValue(new Error('Git log failed'));

      const currentHash = await gitAnalyzer.getCurrentCommitHash();

      expect(currentHash).toBeNull();
    });
  });

  describe('Last Indexed Commit Management', () => {
    it('should get last indexed commit from database', async () => {
      mockSQLiteClient.setMockData('indexing_state', [
        {
          id: 'last_indexed_commit',
          key: 'last_indexed_commit',
          value: 'stored123',
          updated_at: '2023-01-01T10:00:00Z'
        }
      ]);

      const lastCommit = await gitAnalyzer.getLastIndexedCommit();

      expect(lastCommit).toBe('stored123');
      expect(mockSQLiteClient.connect).toHaveBeenCalled();
      expect(mockSQLiteClient.disconnect).toHaveBeenCalled();
    });

    it('should return null if no last indexed commit exists', async () => {
      mockSQLiteClient.setMockData('indexing_state', []);

      const lastCommit = await gitAnalyzer.getLastIndexedCommit();

      expect(lastCommit).toBeNull();
    });

    it('should handle database errors when getting last indexed commit', async () => {
      mockSQLiteClient.simulateConnectionFailure(true);

      const lastCommit = await gitAnalyzer.getLastIndexedCommit();

      expect(lastCommit).toBeNull();
    });

    it('should set last indexed commit in database', async () => {
      const commitHash = 'new123';

      await gitAnalyzer.setLastIndexedCommit(commitHash);

      expect(mockSQLiteClient.connect).toHaveBeenCalled();
      expect(mockSQLiteClient.setLastIndexedCommit).toHaveBeenCalledWith(commitHash);
      expect(mockSQLiteClient.disconnect).toHaveBeenCalled();
    });

    it('should handle database errors when setting last indexed commit', async () => {
      mockSQLiteClient.simulateConnectionFailure(true);

      await expect(gitAnalyzer.setLastIndexedCommit('test123')).rejects.toThrow();
    });
  });

  describe('Repository Statistics', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should provide repository statistics', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'John Doe',
          date: '2023-01-01T10:00:00Z',
          message: 'Commit 1'
        },
        {
          hash: 'def456',
          author_name: 'Jane Smith',
          date: '2023-01-02T11:00:00Z',
          message: 'Commit 2'
        },
        {
          hash: 'ghi789',
          author_name: 'John Doe',
          date: '2023-01-03T12:00:00Z',
          message: 'Commit 3'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 3,
        latest: mockCommits[0]
      });

      const stats = await gitAnalyzer.getRepoStats();

      expect(stats.totalCommits).toBe(3);
      expect(stats.authors).toEqual(['John Doe', 'Jane Smith']);
      expect(stats.latestCommit).toBe('abc123');
    });

    it('should handle empty repository statistics', async () => {
      mockGit.log.mockResolvedValue({
        all: [],
        total: 0,
        latest: null
      });

      const stats = await gitAnalyzer.getRepoStats();

      expect(stats.totalCommits).toBe(0);
      expect(stats.authors).toEqual([]);
      expect(stats.latestCommit).toBeNull();
    });

    it('should handle git log errors in statistics', async () => {
      mockGit.log.mockRejectedValue(new Error('Git log failed'));

      await expect(gitAnalyzer.getRepoStats()).rejects.toThrow('Git log failed');
    });
  });

  describe('Node Type Statistics', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should track node type statistics', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Test commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show.mockResolvedValue('1 file changed');

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode');
      const prNodes = nodes.filter(n => n.type === 'PullRequestNode');

      expect(commitNodes).toHaveLength(1);
      expect(prNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle git command failures gracefully', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.log.mockRejectedValue(new Error('Git command failed'));

      const fileNodes: FileNode[] = [];
      await expect(gitAnalyzer.analyzeRepo(fileNodes)).rejects.toThrow('Git command failed');
    });

    it('should handle malformed commit data', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      
      const malformedCommits = [
        {
          // Missing required fields
          hash: 'abc123',
          message: 'Test commit'
          // Missing author_name and date
        }
      ];

      mockGit.log.mockResolvedValue({
        all: malformedCommits,
        total: 1,
        latest: malformedCommits[0]
      });

      mockGit.show.mockResolvedValue('1 file changed');

      const fileNodes: FileNode[] = [];
      
      // Should handle gracefully
      await expect(gitAnalyzer.analyzeRepo(fileNodes)).resolves.not.toThrow();

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode') as CommitNode[];

      expect(commitNodes).toHaveLength(1);
      expect(commitNodes[0].properties.hash).toBe('abc123');
    });

    it('should handle concurrent analysis operations', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: 'abc123',
            author_name: 'Developer',
            date: '2023-01-01T10:00:00Z',
            message: 'Test commit'
          }
        ],
        total: 1,
        latest: null
      });
      mockGit.show.mockResolvedValue('1 file changed');

      const fileNodes1: FileNode[] = [];
      const fileNodes2: FileNode[] = [];

      // Create separate analyzer instances
      const analyzer1 = new GitAnalyzer('/project1', mockConfig);
      const analyzer2 = new GitAnalyzer('/project2', mockConfig);

      const [result1, result2] = await Promise.all([
        analyzer1.analyzeRepo(fileNodes1),
        analyzer2.analyzeRepo(fileNodes2)
      ]);

      expect(analyzer1.getNodes().length).toBeGreaterThan(0);
      expect(analyzer2.getNodes().length).toBeGreaterThan(0);
    });

    it('should handle very large commit histories', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);

      // Generate large number of commits
      const largeCommitHistory = Array.from({ length: 1000 }, (_, i) => ({
        hash: `commit${i}`,
        author_name: `Author${i % 10}`,
        date: `2023-01-${String(i % 30 + 1).padStart(2, '0')}T10:00:00Z`,
        message: `Commit ${i}`
      }));

      mockGit.log.mockResolvedValue({
        all: largeCommitHistory,
        total: 1000,
        latest: largeCommitHistory[0]
      });

      mockGit.show.mockResolvedValue('1 file changed');

      const fileNodes: FileNode[] = [];
      const startTime = Date.now();
      
      await gitAnalyzer.analyzeRepo(fileNodes);
      
      const endTime = Date.now();

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode');

      expect(commitNodes).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should reset state between analysis sessions', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.show.mockResolvedValue('1 file changed');

      // First analysis
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: 'first123',
            author_name: 'Developer',
            date: '2023-01-01T10:00:00Z',
            message: 'First commit'
          }
        ],
        total: 1,
        latest: null
      });

      const fileNodes1: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes1);
      const nodes1 = gitAnalyzer.getNodes();

      // Second analysis
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: 'second456',
            author_name: 'Developer',
            date: '2023-01-02T10:00:00Z',
            message: 'Second commit'
          }
        ],
        total: 1,
        latest: null
      });

      const fileNodes2: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes2);
      const nodes2 = gitAnalyzer.getNodes();

      // Second analysis should replace first
      const commitNodes2 = nodes2.filter(n => n.type === 'CommitNode') as CommitNode[];
      expect(commitNodes2.some(c => c.properties.hash === 'second456')).toBe(true);
      expect(commitNodes2.some(c => c.properties.hash === 'first123')).toBe(false);
    });
  });

  describe('Performance Optimization', () => {
    beforeEach(() => {
      mockGit.checkIsRepo.mockResolvedValue(true);
    });

    it('should handle batch commit processing efficiently', async () => {
      const batchSize = 100;
      const commits = Array.from({ length: batchSize }, (_, i) => ({
        hash: `batch${i}`,
        author_name: 'Developer',
        date: '2023-01-01T10:00:00Z',
        message: `Batch commit ${i}`
      }));

      mockGit.log.mockResolvedValue({
        all: commits,
        total: batchSize,
        latest: commits[0]
      });

      mockGit.show.mockResolvedValue('1 file changed');

      const fileNodes: FileNode[] = [];
      const startTime = Date.now();
      
      await gitAnalyzer.analyzeRepo(fileNodes);
      
      const endTime = Date.now();

      const nodes = gitAnalyzer.getNodes();
      const commitNodes = nodes.filter(n => n.type === 'CommitNode');

      expect(commitNodes).toHaveLength(batchSize);
      expect(endTime - startTime).toBeLessThan(5000); // Should be reasonably fast
    });

    it('should minimize git command calls', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          author_name: 'Developer',
          date: '2023-01-01T10:00:00Z',
          message: 'Test commit'
        }
      ];

      mockGit.log.mockResolvedValue({
        all: mockCommits,
        total: 1,
        latest: mockCommits[0]
      });

      mockGit.show.mockResolvedValue('1 file changed');

      const fileNodes: FileNode[] = [];
      await gitAnalyzer.analyzeRepo(fileNodes);

      // Should call git commands efficiently
      expect(mockGit.checkIsRepo).toHaveBeenCalledTimes(1);
      expect(mockGit.log).toHaveBeenCalledTimes(1);
    });
  });
});
