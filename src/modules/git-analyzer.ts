/**
 * @file Analyzes Git repository history to extract commit information and track file evolution.
 *       Creates CommitNodes and PullRequestNodes with their relationships to files and other commits.
 *       Supports incremental analysis by processing only new commits since the last indexed state.
 */

import { simpleGit, SimpleGit, LogResult, DiffResult } from 'simple-git';
import * as path from 'path';
import { CommitNode, PullRequestNode, Edge, FileNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { SQLiteClient } from '../persistence/db-clients';
import { getErrorMessage, getErrorStack, logError } from '../utils/error-handling';

/**
 * Analyzes Git repository history and extracts commit-related information.
 */
export class GitAnalyzer {
  private projectRoot: string;
  private config: ConfigManager;
  private logger = getLogger('GitAnalyzer');
  private git: SimpleGit;
  private nodes: (CommitNode | PullRequestNode)[] = [];
  private edges: Edge[] = [];
  private sqliteClient: SQLiteClient;

  /**
   * @param {string} projectRoot - The absolute path to the root of the project.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(projectRoot: string, config: ConfigManager) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.git = simpleGit(projectRoot);
    
    const dbConfig = this.config.getDatabaseConfig();
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
  }

  /**
   * Returns the list of extracted nodes.
   * @returns {(CommitNode | PullRequestNode)[]} An array of nodes.
   */
  public getNodes(): (CommitNode | PullRequestNode)[] {
    return this.nodes;
  }

  /**
   * Returns the list of extracted edges.
   * @returns {Edge[]} An array of edges.
   */
  public getEdges(): Edge[] {
    return this.edges;
  }

  /**
   * Gets the current HEAD commit hash.
   * @returns {Promise<string | null>} The current commit hash or null if not found.
   */
  async getCurrentCommitHash(): Promise<string | null> {
    try {
      const log = await this.git.log(['-1']);
      return log.latest?.hash || null;
    } catch (error) {
      this.logger.warn('Failed to get current commit hash', { error: getErrorMessage(error) });
      return null;
    }
  }

  /**
   * Gets the last indexed commit hash from the database.
   * @returns {Promise<string | null>} The last indexed commit hash or null if not found.
   */
  async getLastIndexedCommit(): Promise<string | null> {
    try {
      await this.sqliteClient.connect();
      const result = this.sqliteClient.getLastIndexedCommit();
      await this.sqliteClient.disconnect();
      return result;
    } catch (error) {
      this.logger.warn('Failed to get last indexed commit', { error: getErrorMessage(error) });
      return null;
    }
  }

  /**
   * Sets the last indexed commit hash in the database.
   * @param {string} commitHash - The commit hash to store.
   * @returns {Promise<void>}
   */
  async setLastIndexedCommit(commitHash: string): Promise<void> {
    try {
      await this.sqliteClient.connect();
      await this.sqliteClient.setLastIndexedCommit(commitHash);
      await this.sqliteClient.disconnect();
      this.logger.debug('Updated last indexed commit', { commitHash });
    } catch (error) {
      this.logger.error('Failed to set last indexed commit', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Gets the list of files that have changed between two commits.
   * @param {string} fromCommit - The starting commit hash.
   * @param {string} toCommit - The ending commit hash.
   * @returns {Promise<string[]>} Array of changed file paths.
   */
  async getChangedFiles(fromCommit: string, toCommit: string): Promise<string[]> {
    try {
      const diff = await this.git.diff([`${fromCommit}..${toCommit}`, '--name-only']);
      const changedFiles = diff
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(file => path.resolve(this.projectRoot, file));
      
      this.logger.debug('Found changed files', { 
        fromCommit, 
        toCommit, 
        count: changedFiles.length 
      });
      
      return changedFiles;
    } catch (error) {
      this.logger.error('Failed to get changed files', { 
        error: getErrorMessage(error), 
        fromCommit, 
        toCommit 
      });
      throw error;
    }
  }

  /**
   * Creates a unique ID for a commit node.
   * @param {string} hash - The commit hash.
   * @returns {string} A unique identifier.
   */
  private createCommitNodeId(hash: string): string {
    return `commit:${hash}`;
  }

  /**
   * Creates a unique ID for a pull request node.
   * @param {string} prId - The pull request ID.
   * @returns {string} A unique identifier.
   */
  private createPullRequestNodeId(prId: string): string {
    return `pr:${prId}`;
  }

  /**
   * Extracts commit information and creates CommitNodes.
   * @param {string | null} sinceCommit - Optional commit hash to start from (for incremental analysis).
   * @returns {Promise<void>}
   */
  private async extractCommits(sinceCommit: string | null): Promise<void> {
    try {
      const logOptions: string[] = ['--all'];
      
      if (sinceCommit) {
        logOptions.push(`${sinceCommit}..HEAD`);
        this.logger.info('Extracting commits since last indexed commit', { sinceCommit });
      } else {
        this.logger.info('Extracting all commits (full analysis)');
      }

      const log: LogResult = await this.git.log(logOptions);
      
      this.logger.info(`Found ${log.all.length} commits to process`);

      for (const commit of log.all) {
        const commitNode: CommitNode = {
          id: this.createCommitNodeId(commit.hash),
          type: 'CommitNode',
          properties: {
            hash: commit.hash,
            author: commit.author_name,
            date: commit.date,
            message: commit.message,
            diffSummary: await this.getCommitDiffSummary(commit.hash),
          },
        };

        this.nodes.push(commitNode);
      }
    } catch (error) {
      this.logger.error('Failed to extract commits', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Gets a summary of changes in a commit.
   * @param {string} commitHash - The commit hash.
   * @returns {Promise<string>} A summary of the changes.
   */
  private async getCommitDiffSummary(commitHash: string): Promise<string> {
    try {
      const diffStat = await this.git.show([commitHash, '--stat', '--format=']);
      return diffStat.trim();
    } catch (error) {
      this.logger.warn(`Failed to get diff summary for commit ${commitHash}`, { error: getErrorMessage(error) });
      return 'Unable to generate diff summary';
    }
  }

  /**
   * Creates edges between commits and the files they modified.
   * @param {FileNode[]} fileNodes - Array of file nodes to link with commits.
   * @returns {Promise<void>}
   */
  private async createCommitFileEdges(fileNodes: FileNode[]): Promise<void> {
    const operation = this.logger.operation('Creating commit-file edges');
    
    try {
      for (const commitNode of this.nodes.filter(n => n.type === 'CommitNode') as CommitNode[]) {
        try {
          // Get files modified in this commit
          const diff = await this.git.show([commitNode.properties.hash, '--name-only', '--format=']);
          const modifiedFiles = diff
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(file => path.resolve(this.projectRoot, file));

          // Create MODIFIED edges
          for (const modifiedFile of modifiedFiles) {
            const fileNode = fileNodes.find(f => 
              path.resolve(this.projectRoot, f.properties.filePath) === modifiedFile
            );

            if (fileNode) {
              this.edges.push({
                source: commitNode.id,
                target: fileNode.id,
                type: 'MODIFIED',
              });

              // Also create EVOLVED_BY edge (reverse relationship)
              this.edges.push({
                source: fileNode.id,
                target: commitNode.id,
                type: 'EVOLVED_BY',
              });
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to process commit ${commitNode.properties.hash}`, { error: getErrorMessage(error) });
        }
      }
      
      operation();
    } catch (error) {
      this.logger.error('Failed to create commit-file edges', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Creates mock pull request nodes (placeholder for future GitHub/GitLab integration).
   * @returns {Promise<void>}
   */
  private async createMockPullRequests(): Promise<void> {
    // TODO: Integrate with GitHub/GitLab API to fetch actual pull requests
    this.logger.debug('Creating mock pull request nodes (placeholder implementation)');
    
    // Create a few mock PRs for demonstration
    const mockPRs = [
      {
        prId: 'mock-pr-1',
        title: 'Add new feature X',
        author: 'developer1',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/example/repo/pull/1',
        body: 'This PR adds feature X to improve functionality.',
      },
      {
        prId: 'mock-pr-2',
        title: 'Fix bug in component Y',
        author: 'developer2',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/example/repo/pull/2',
        body: 'This PR fixes a critical bug in component Y.',
      },
    ];

    for (const mockPR of mockPRs) {
      const prNode: PullRequestNode = {
        id: this.createPullRequestNodeId(mockPR.prId),
        type: 'PullRequestNode',
        properties: mockPR,
      };

      this.nodes.push(prNode);

      // Create INCLUDES_COMMIT edges (mock - link to recent commits)
      const recentCommits = this.nodes
        .filter(n => n.type === 'CommitNode')
        .slice(0, 2) as CommitNode[];

      for (const commit of recentCommits) {
        this.edges.push({
          source: prNode.id,
          target: commit.id,
          type: 'INCLUDES_COMMIT',
        });
      }
    }
  }

  /**
   * Analyzes the Git repository and extracts commit and pull request information.
   * @param {FileNode[]} fileNodes - Array of file nodes to link with commits.
   * @param {string | null} lastIndexedCommit - The last indexed commit hash for incremental analysis.
   * @returns {Promise<void>}
   */
  async analyzeRepo(fileNodes: FileNode[], lastIndexedCommit: string | null = null): Promise<void> {
    const operation = this.logger.operation('Git repository analysis');
    
    try {
      this.logger.info('Starting Git repository analysis', {
        projectRoot: this.projectRoot,
        fileCount: fileNodes.length,
        incremental: !!lastIndexedCommit,
      });

      // Reset state
      this.nodes = [];
      this.edges = [];

      // Check if we're in a Git repository
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        this.logger.warn('Not a Git repository, skipping Git analysis');
        operation();
        return;
      }

      // Extract commits
      await this.extractCommits(lastIndexedCommit);

      // Create commit-file relationships
      await this.createCommitFileEdges(fileNodes);

      // Create mock pull requests (placeholder)
      await this.createMockPullRequests();

      this.logger.info('Git analysis completed', {
        totalNodes: this.nodes.length,
        totalEdges: this.edges.length,
        nodeTypes: this.getNodeTypeStats(),
      });

      operation();
    } catch (error) {
      this.logger.error('Git analysis failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Gets statistics about the analyzed nodes by type.
   * @returns {Record<string, number>} Node type statistics.
   */
  private getNodeTypeStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const node of this.nodes) {
      stats[node.type] = (stats[node.type] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Gets repository statistics.
   * @returns {Promise<{totalCommits: number, authors: string[], latestCommit: string | null}>}
   */
  async getRepoStats(): Promise<{
    totalCommits: number;
    authors: string[];
    latestCommit: string | null;
  }> {
    try {
      const log = await this.git.log();
      const authors = [...new Set(log.all.map(commit => commit.author_name))];
      const latestCommit = log.latest?.hash || null;

      return {
        totalCommits: log.total,
        authors,
        latestCommit,
      };
    } catch (error) {
      this.logger.error('Failed to get repository stats', { error: getErrorMessage(error) });
      throw error;
    }
  }
}
