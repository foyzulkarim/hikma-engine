/**
 * @file Provides client implementations for interacting with various databases used by hikma-engine.
 *       This includes LanceDB for vector storage, Better-SQLite3 for relational metadata, and Gremlin for graph traversal.
 */

import * as lancedb from '@lancedb/lancedb';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { getLogger } from '../utils/logger';
import { 
  getErrorMessage, 
  getErrorStack, 
  logError, 
  DatabaseConnectionError, 
  DatabaseOperationError, 
  DataValidationError,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  CircuitBreaker
} from '../utils/error-handling';
import { 
  BaseNode,
  Edge,
  RepositoryNode, 
  FileNode, 
  DirectoryNode, 
  CodeNode, 
  TestNode, 
  FunctionNode, 
  CommitNode, 
  PullRequestNode 
} from '../types';
// Import Gremlin for TinkerGraph operations
// Note: Using mock implementation for development - replace with actual gremlin imports when server is available
interface DriverRemoteConnection {
  close(): Promise<void>;
}

interface GraphTraversalSource {
  addV(label: string): VertexTraversal;
  V(id?: string): VertexTraversal;
}

interface VertexTraversal {
  property(key: string, value: any): VertexTraversal;
  next(): Promise<{ value: any }>;
  addE(label: string): EdgeTraversal;
}

interface EdgeTraversal {
  to(target: VertexTraversal): EdgeTraversal;
  property(key: string, value: any): EdgeTraversal;
  next(): Promise<{ value: any }>;
}

/**
 * Client for LanceDB (Vector Database).
 */
export class LanceDBClient {
  private db: any; // Placeholder for LanceDB connection
  private logger = getLogger('LanceDBClient');
  private isConnected = false;

  /**
   * Initializes the LanceDB client.
   * @param {string} path - The file system path where the LanceDB database will be stored.
   */
  constructor(private path: string) {
    this.logger.info(`Initializing LanceDB client`, { path });
  }

  /**
   * Establishes a connection to the LanceDB database.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.debug('Already connected to LanceDB');
      return;
    }

    try {
      this.logger.info('Connecting to LanceDB');
      this.db = await lancedb.connect(this.path);
      this.isConnected = true;
      this.logger.info('Connected to LanceDB successfully');
    } catch (error) {
      this.logger.error('Failed to connect to LanceDB', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Disconnects from the LanceDB database.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      this.logger.debug('Already disconnected from LanceDB');
      return;
    }

    try {
      this.logger.info('Disconnecting from LanceDB');
      if (this.db && this.db.close) {
        await this.db.close();
      }
      this.isConnected = false;
      this.logger.info('Disconnected from LanceDB successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from LanceDB', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Retrieves a table from the LanceDB database.
   * @param {string} tableName - The name of the table to retrieve.
   * @returns {any} A mock or actual LanceDB table object.
   */
  async getTable(tableName: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to LanceDB. Call connect() first.');
    }

    this.logger.debug(`Getting LanceDB table: ${tableName}`);
    try {
      return await this.db.openTable(tableName);
    } catch (error) {
      // If table doesn't exist, return null
      this.logger.warn(`Table ${tableName} does not exist`, { error: getErrorMessage(error) });
      return null;
    }
  }

  /**
   * Creates a table in LanceDB if it doesn't exist.
   * @param {string} tableName - The name of the table to create.
   * @param {any[]} schema - The schema definition for the table.
   * @returns {Promise<any>} The created table object.
   */
  async createTable(tableName: string, schema: any[]): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to LanceDB. Call connect() first.');
    }

    try {
      this.logger.info(`Creating LanceDB table: ${tableName}`);
      const table = await this.db.createTable(tableName, schema);
      this.logger.info(`LanceDB table created successfully: ${tableName}`);
      return table;
    } catch (error) {
      this.logger.error(`Failed to create LanceDB table: ${tableName}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Checks if the client is connected.
   */
  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }
}

/**
 * Client for SQLite (Relational Database).
 */
export class SQLiteClient {
  private db: DatabaseType;
  private logger = getLogger('SQLiteClient');
  private isConnected = false;
  private circuitBreaker = new CircuitBreaker(5, 60000);

  /**
   * Initializes the SQLite client.
   * @param {string} path - The file system path for the SQLite database file.
   */
  constructor(private path: string) {
    this.logger.info(`Initializing SQLite client`, { path });
    try {
      // better-sqlite3 connects on instantiation
      this.db = new Database(path);
      this.logger.debug('SQLite database instance created successfully');
    } catch (error) {
      this.logger.error('Failed to create SQLite database instance', { 
        error: getErrorMessage(error),
        path 
      });
      throw new DatabaseConnectionError('SQLite', `Failed to create database instance: ${getErrorMessage(error)}`, error);
    }
  }

  /**
   * Establishes a connection to the SQLite database with retry logic.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.debug('Already connected to SQLite');
      return;
    }

    try {
      await withRetry(
        async () => {
          this.logger.info('Connecting to SQLite');
          
          // Test the connection with a simple query
          await this.testConnection();
          
          // Initialize tables if they don't exist
          this.initializeTables();
          
          this.isConnected = true;
          this.logger.info('Connected to SQLite successfully');
        },
        DEFAULT_RETRY_CONFIG,
        this.logger,
        'SQLite connection'
      );
    } catch (error) {
      this.logger.error('Failed to connect to SQLite after retries', { 
        error: getErrorMessage(error),
        circuitBreakerState: this.circuitBreaker.getState()
      });
      throw new DatabaseConnectionError('SQLite', `Connection failed: ${getErrorMessage(error)}`, error);
    }
  }

  /**
   * Tests the SQLite connection with a simple query.
   */
  private async testConnection(): Promise<void> {
    try {
      this.db.prepare('SELECT 1').get();
      this.logger.debug('SQLite connection test successful');
    } catch (error) {
      this.logger.warn('SQLite connection test failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Disconnects from the SQLite database.
   */
  disconnect(): void {
    if (!this.isConnected) {
      this.logger.debug('Already disconnected from SQLite');
      return;
    }

    try {
      this.logger.info('Disconnecting from SQLite');
      this.db.close();
      this.isConnected = false;
      this.logger.info('Disconnected from SQLite successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from SQLite', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Initializes the required tables for hikma-engine.
   */
  private initializeTables(): void {
    this.logger.debug('Initializing SQLite tables');

    // Create repositories table - updated to match RepositoryNode properties
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        repo_id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create directories table for DirectoryNode
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS directories (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        dir_path TEXT NOT NULL,
        dir_name TEXT NOT NULL,
        ai_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(repo_id)
      )
    `);

    // Create files table - updated to match FileNode properties
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        file_id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_extension TEXT,
        language TEXT,
        size_kb REAL,
        content_hash TEXT,
        file_type TEXT CHECK (file_type IN ('source', 'test', 'config', 'dev', 'vendor')),
        ai_summary TEXT,
        imports TEXT, -- JSON array of import strings
        exports TEXT, -- JSON array of export strings
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(repo_id)
      )
    `);

    // Create code_nodes table for CodeNode
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        signature TEXT,
        body TEXT,
        docstring TEXT,
        language TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create test_nodes table for TestNode
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        framework TEXT,
        test_body TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create pull_requests table for PullRequestNode
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pull_requests (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at_pr DATETIME NOT NULL,
        merged_at DATETIME,
        url TEXT NOT NULL,
        body TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create commits table - updated to match CommitNode properties
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commits (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        author TEXT NOT NULL,
        date TEXT NOT NULL,
        message TEXT NOT NULL,
        diff_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create functions table - updated to match FunctionNode properties
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS functions (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        name TEXT NOT NULL,
        signature TEXT NOT NULL,
        return_type TEXT NOT NULL,
        access_level TEXT CHECK (access_level IN ('public', 'private', 'protected')) NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        body TEXT NOT NULL,
        called_by_methods TEXT, -- JSON array of method names
        calls_methods TEXT, -- JSON array of method names
        uses_external_methods BOOLEAN DEFAULT FALSE,
        internal_call_graph TEXT, -- JSON array of internal calls
        transitive_call_depth INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(file_id)
      )
    `);

    // Create indexing_state table for tracking indexing progress
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS indexing_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create file_imports table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_imports (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        imported_file_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(file_id),
        FOREIGN KEY (imported_file_id) REFERENCES files(file_id)
      )
    `);

    // Create file_relations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_relations (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        related_file_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,  -- uses, used_by, depends_on, related_test
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(file_id),
        FOREIGN KEY (related_file_id) REFERENCES files(file_id)
      )
    `);

    // Create file_commits table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_commits (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        commit_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(file_id),
        FOREIGN KEY (commit_id) REFERENCES commits(id)
      )
    `);

    // Create function_calls table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS function_calls (
        id TEXT PRIMARY KEY,
        caller_id TEXT NOT NULL,
        callee_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (caller_id) REFERENCES functions(id),
        FOREIGN KEY (callee_id) REFERENCES functions(id)
      )
    `);

    // Create function_commits table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS function_commits (
        id TEXT PRIMARY KEY,
        function_id TEXT NOT NULL,
        commit_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (function_id) REFERENCES functions(id),
        FOREIGN KEY (commit_id) REFERENCES commits(id)
      )
    `);

    // Add comprehensive indexes for performance
    // Repository indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_repositories_path ON repositories(repo_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(repo_name)`);

    // Directory indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_directories_repo_id ON directories(repo_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_directories_path ON directories(dir_path)`);

    // File indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_files_repo_id ON files(repo_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(file_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_files_language ON files(language)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash)`);

    // Code node indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_nodes_file_path ON code_nodes(file_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_nodes_language ON code_nodes(language)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_nodes_name ON code_nodes(name)`);

    // Test node indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_nodes_file_path ON test_nodes(file_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_nodes_framework ON test_nodes(framework)`);

    // Pull request indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pull_requests_pr_id ON pull_requests(pr_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pull_requests_created_at ON pull_requests(created_at_pr)`);

    // Function indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_file_id ON functions(file_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(name)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_access_level ON functions(access_level)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_file_path ON functions(file_path)`);

    // Commit indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_commits_hash ON commits(hash)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(author)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_commits_date ON commits(date)`);

    // Relationship table indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_imports_file_id ON file_imports(file_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_imports_imported_file_id ON file_imports(imported_file_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_relations_file_id ON file_relations(file_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_relations_related_file_id ON file_relations(related_file_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_relations_type ON file_relations(relation_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_commits_file_id ON file_commits(file_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_file_commits_commit_id ON file_commits(commit_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_function_calls_caller_id ON function_calls(caller_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_function_calls_callee_id ON function_calls(callee_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_function_commits_function_id ON function_commits(function_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_function_commits_commit_id ON function_commits(commit_id)`);

    // Indexing state indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_indexing_state_key ON indexing_state(key)`);

    this.logger.debug('SQLite tables initialized successfully');
  }



  /**
   * Executes a SQL query with error handling and logging.
   * @param {string} sql - The SQL query string.
   * @param {any[]} [params] - Optional parameters for the SQL query.
   * @returns {any} The result of the SQL execution.
   */
  run(sql: string, params?: any[]): any {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    try {
      this.logger.debug(`Executing SQLite query`, { 
        sql: sql.substring(0, 100),
        paramCount: params?.length || 0
      });
      
      const stmt = this.db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      
      this.logger.debug('SQLite query executed successfully', {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      });
      
      return result;
    } catch (error) {
      this.logger.error('SQLite query execution failed', {
        error: getErrorMessage(error),
        sql: sql.substring(0, 100),
        paramCount: params?.length || 0
      });
      throw new DatabaseOperationError('SQLite', 'run', getErrorMessage(error), error);
    }
  }

  /**
   * Prepares a SQL statement for repeated execution with error handling.
   * @param {string} sql - The SQL query string to prepare.
   * @returns {Database.Statement} The prepared statement object.
   */
  prepare(sql: string): Database.Statement {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    try {
      this.logger.debug(`Preparing SQLite statement`, { sql: sql.substring(0, 100) });
      const stmt = this.db.prepare(sql);
      this.logger.debug('SQLite statement prepared successfully');
      return stmt;
    } catch (error) {
      this.logger.error('Failed to prepare SQLite statement', {
        error: getErrorMessage(error),
        sql: sql.substring(0, 100)
      });
      throw new DatabaseOperationError('SQLite', 'prepare', getErrorMessage(error), error);
    }
  }

  /**
   * Executes a SELECT query and returns all results.
   * @param {string} sql - The SQL query string.
   * @param {any[]} [params] - Optional parameters for the SQL query.
   * @returns {any[]} Array of result rows.
   */
  all(sql: string, params?: any[]): any[] {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    this.logger.debug(`Executing SQLite SELECT query`, { sql: sql.substring(0, 100) });
    const stmt = this.db.prepare(sql);
    return params && params.length > 0 ? stmt.all(...params) : stmt.all();
  }

  /**
   * Executes a SELECT query and returns the first result.
   * @param {string} sql - The SQL query string.
   * @param {any[]} [params] - Optional parameters for the SQL query.
   * @returns {any} First result row or undefined.
   */
  get(sql: string, params?: any[]): any {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    this.logger.debug(`Executing SQLite GET query`, { sql: sql.substring(0, 100) });
    const stmt = this.db.prepare(sql);
    return params && params.length > 0 ? stmt.get(...params) : stmt.get();
  }

  /**
   * Gets the last indexed commit hash from the SQLite database.
   * @returns {string | null} The last indexed commit hash, or null if not found.
   */
  getLastIndexedCommit(): string | null {
    try {
      const result = this.get(
        'SELECT value FROM indexing_state WHERE key = ?',
        ['last_indexed_commit']
      );
      return result?.value || null;
    } catch (error) {
      this.logger.warn('Failed to get last indexed commit', { error: getErrorMessage(error) });
      return null;
    }
  }

  /**
   * Sets the last indexed commit hash in the SQLite database.
   * @param {string} commitHash - The commit hash to store.
   */
  setLastIndexedCommit(commitHash: string): void {
    try {
      this.run(
        `INSERT OR REPLACE INTO indexing_state (key, value, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        ['last_indexed_commit', commitHash]
      );
      this.logger.debug('Set last indexed commit', { commitHash });
    } catch (error) {
      this.logger.error('Failed to set last indexed commit', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Gets indexing statistics from the database.
   * @returns {Promise<{totalFiles: number, totalDirectories: number, totalCommits: number, totalCodeNodes: number, totalTestNodes: number, totalPullRequests: number, lastIndexed: string | null}>}
   */
  async getIndexingStats(): Promise<{
    totalFiles: number;
    totalDirectories: number;
    totalCommits: number;
    totalCodeNodes: number;
    totalTestNodes: number;
    totalPullRequests: number;
    lastIndexed: string | null;
  }> {
    try {
      const fileCount = (this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number } | undefined)?.count || 0;
      const dirCount = (this.db.prepare('SELECT COUNT(*) as count FROM directories').get() as { count: number } | undefined)?.count || 0;
      const commitCount = (this.db.prepare('SELECT COUNT(*) as count FROM commits').get() as { count: number } | undefined)?.count || 0;
      const codeNodeCount = (this.db.prepare('SELECT COUNT(*) as count FROM code_nodes').get() as { count: number } | undefined)?.count || 0;
      const testNodeCount = (this.db.prepare('SELECT COUNT(*) as count FROM test_nodes').get() as { count: number } | undefined)?.count || 0;
      const pullRequestCount = (this.db.prepare('SELECT COUNT(*) as count FROM pull_requests').get() as { count: number } | undefined)?.count || 0;
      const lastIndexed = this.getLastIndexedCommit();

      return {
        totalFiles: fileCount,
        totalDirectories: dirCount,
        totalCommits: commitCount,
        totalCodeNodes: codeNodeCount,
        totalTestNodes: testNodeCount,
        totalPullRequests: pullRequestCount,
        lastIndexed,
      };
    } catch (error) {
      this.logger.error('Failed to get indexing stats', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Executes multiple operations within a transaction for data consistency.
   * @param {() => void} operations - Function containing the operations to execute.
   */
  transaction(operations: () => void): void {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    const transaction = this.db.transaction(operations);
    try {
      transaction();
      this.logger.debug('Transaction completed successfully');
    } catch (error) {
      this.logger.error('Transaction failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Batch insert repositories with transaction management and error handling.
   * @param {Array<{id: string, repoPath: string, repoName: string, createdAt?: string, lastUpdated?: string}>} repositories - Array of repository data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertRepositories(repositories: Array<{
    id: string;
    repoPath: string;
    repoName: string;
    createdAt?: string;
    lastUpdated?: string;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!repositories || repositories.length === 0) {
      this.logger.debug('No repositories to insert');
      return { success: 0, failed: 0, errors: [] };
    }

    // Validate data before insertion
    const validation = this.validateRepositories(repositories);
    if (!validation.valid) {
      this.logger.error('Repository data validation failed', { errors: validation.errors });
      throw new DataValidationError('Repository validation failed', validation.errors);
    }

    this.logger.info(`Starting batch insert of ${repositories.length} repositories`);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO repositories (repo_id, repo_path, repo_name, created_at, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((repos: typeof repositories) => {
      for (const repo of repos) {
        try {
          stmt.run(
            repo.id,
            repo.repoPath,
            repo.repoName,
            repo.createdAt || new Date().toISOString(),
            repo.lastUpdated || new Date().toISOString()
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert repository ${repo.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(repositories);
      this.logger.info(`Batch inserted repositories`, { success, failed, total: repositories.length });
    } catch (error) {
      this.logger.error('Batch repository insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert files with transaction management and error handling.
   * @param {Array<{id: string, repoId: string, filePath: string, fileName: string, fileExtension?: string, language?: string, sizeKb?: number, contentHash?: string, fileType?: string, aiSummary?: string, imports?: string[], exports?: string[]}>} files - Array of file data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertFiles(files: Array<{
    id: string;
    repoId: string;
    filePath: string;
    fileName: string;
    fileExtension?: string;
    language?: string;
    sizeKb?: number;
    contentHash?: string;
    fileType?: 'source' | 'test' | 'config' | 'dev' | 'vendor';
    aiSummary?: string;
    imports?: string[];
    exports?: string[];
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!files || files.length === 0) {
      this.logger.debug('No files to insert');
      return { success: 0, failed: 0, errors: [] };
    }

    // Validate data before insertion
    const validation = this.validateFiles(files);
    if (!validation.valid) {
      this.logger.error('File data validation failed', { errors: validation.errors });
      throw new DataValidationError('File validation failed', validation.errors);
    }

    this.logger.info(`Starting batch insert of ${files.length} files`);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO files (
        file_id, repo_id, file_path, file_name, file_extension, language, 
        size_kb, content_hash, file_type, ai_summary, imports, exports,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((fileList: typeof files) => {
      for (const file of fileList) {
        try {
          stmt.run(
            file.id,
            file.repoId,
            file.filePath,
            file.fileName,
            file.fileExtension || null,
            file.language || null,
            file.sizeKb || null,
            file.contentHash || null,
            file.fileType || null,
            file.aiSummary || null,
            file.imports ? JSON.stringify(file.imports) : null,
            file.exports ? JSON.stringify(file.exports) : null
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert file ${file.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(files);
      this.logger.info(`Batch inserted files`, { success, failed, total: files.length });
    } catch (error) {
      this.logger.error('Batch file insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert directories with transaction management and error handling.
   * @param {Array<{id: string, repoId: string, dirPath: string, dirName: string, aiSummary?: string}>} directories - Array of directory data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertDirectories(directories: Array<{
    id: string;
    repoId: string;
    dirPath: string;
    dirName: string;
    aiSummary?: string;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!directories || directories.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO directories (id, repo_id, dir_path, dir_name, ai_summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((dirList: typeof directories) => {
      for (const dir of dirList) {
        try {
          stmt.run(
            dir.id,
            dir.repoId,
            dir.dirPath,
            dir.dirName,
            dir.aiSummary || null
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert directory ${dir.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(directories);
      this.logger.info(`Batch inserted directories`, { success, failed, total: directories.length });
    } catch (error) {
      this.logger.error('Batch directory insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert code nodes with transaction management and error handling.
   * @param {Array<{id: string, name: string, signature?: string, body?: string, docstring?: string, language: string, filePath: string, startLine: number, endLine: number}>} codeNodes - Array of code node data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertCodeNodes(codeNodes: Array<{
    id: string;
    name: string;
    signature?: string;
    body?: string;
    docstring?: string;
    language: string;
    filePath: string;
    startLine: number;
    endLine: number;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!codeNodes || codeNodes.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_nodes (
        id, name, signature, body, docstring, language, file_path, 
        start_line, end_line, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((nodeList: typeof codeNodes) => {
      for (const node of nodeList) {
        try {
          stmt.run(
            node.id,
            node.name,
            node.signature || null,
            node.body || null,
            node.docstring || null,
            node.language,
            node.filePath,
            node.startLine,
            node.endLine
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert code node ${node.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(codeNodes);
      this.logger.info(`Batch inserted code nodes`, { success, failed, total: codeNodes.length });
    } catch (error) {
      this.logger.error('Batch code node insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert test nodes with transaction management and error handling.
   * @param {Array<{id: string, name: string, filePath: string, startLine: number, endLine: number, framework?: string, testBody?: string}>} testNodes - Array of test node data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertTestNodes(testNodes: Array<{
    id: string;
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    framework?: string;
    testBody?: string;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!testNodes || testNodes.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO test_nodes (
        id, name, file_path, start_line, end_line, framework, test_body,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((nodeList: typeof testNodes) => {
      for (const node of nodeList) {
        try {
          stmt.run(
            node.id,
            node.name,
            node.filePath,
            node.startLine,
            node.endLine,
            node.framework || null,
            node.testBody || null
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert test node ${node.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(testNodes);
      this.logger.info(`Batch inserted test nodes`, { success, failed, total: testNodes.length });
    } catch (error) {
      this.logger.error('Batch test node insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert functions with transaction management and error handling.
   * @param {Array<{id: string, fileId: string, name: string, signature: string, returnType: string, accessLevel: string, filePath: string, startLine: number, endLine: number, body: string, calledByMethods?: string, callsMethods?: string, usesExternalMethods?: boolean, internalCallGraph?: string, transitiveCallDepth?: number}>} functions - Array of function data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertFunctions(functions: Array<{
    id: string;
    fileId: string;
    name: string;
    signature: string;
    returnType: string;
    accessLevel: 'public' | 'private' | 'protected';
    filePath: string;
    startLine: number;
    endLine: number;
    body: string;
    calledByMethods?: string; // JSON string
    callsMethods?: string; // JSON string
    usesExternalMethods?: boolean;
    internalCallGraph?: string; // JSON string
    transitiveCallDepth?: number;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!functions || functions.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO functions (
        id, file_id, name, signature, return_type, access_level, file_path,
        start_line, end_line, body, called_by_methods, calls_methods,
        uses_external_methods, internal_call_graph, transitive_call_depth,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((funcList: typeof functions) => {
      for (const func of funcList) {
        try {
          // Debug logging to identify problematic data types
          const params = [
            func.id,
            func.fileId,
            func.name,
            func.signature,
            func.returnType,
            func.accessLevel,
            func.filePath,
            func.startLine,
            func.endLine,
            func.body,
            func.calledByMethods || null, // Already JSON string
            func.callsMethods || null, // Already JSON string
            func.usesExternalMethods ? 1 : 0, // Convert boolean to integer for SQLite
            func.internalCallGraph || null, // Already JSON string
            func.transitiveCallDepth || 0
          ];
          
          // Check for invalid data types
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            if (param !== null && typeof param !== 'string' && typeof param !== 'number' && typeof param !== 'bigint' && !Buffer.isBuffer(param)) {
              this.logger.error(`Invalid parameter type at index ${i}`, { 
                index: i, 
                value: param, 
                type: typeof param,
                funcId: func.id 
              });
            }
          }
          
          stmt.run(...params);
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert function ${func.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(functions);
      this.logger.info(`Batch inserted functions`, { success, failed, total: functions.length });
    } catch (error) {
      this.logger.error('Batch function insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert commits with transaction management and error handling.
   * @param {Array<{id: string, hash: string, author: string, date: string, message: string, diffSummary?: string}>} commits - Array of commit data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertCommits(commits: Array<{
    id: string;
    hash: string;
    author: string;
    date: string;
    message: string;
    diffSummary?: string;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!commits || commits.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO commits (id, hash, author, date, message, diff_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((commitList: typeof commits) => {
      for (const commit of commitList) {
        try {
          stmt.run(
            commit.id,
            commit.hash,
            commit.author,
            commit.date,
            commit.message,
            commit.diffSummary || null
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert commit ${commit.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(commits);
      this.logger.info(`Batch inserted commits`, { success, failed, total: commits.length });
    } catch (error) {
      this.logger.error('Batch commit insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert pull requests with transaction management and error handling.
   * @param {Array<{id: string, prId: string, title: string, author: string, createdAt: string, mergedAt?: string, url: string, body?: string}>} pullRequests - Array of pull request data.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertPullRequests(pullRequests: Array<{
    id: string;
    prId: string;
    title: string;
    author: string;
    createdAt: string;
    mergedAt?: string;
    url: string;
    body?: string;
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!pullRequests || pullRequests.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pull_requests (
        id, pr_id, title, author, created_at_pr, merged_at, url, body,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((prList: typeof pullRequests) => {
      for (const pr of prList) {
        try {
          stmt.run(
            pr.id,
            pr.prId,
            pr.title,
            pr.author,
            pr.createdAt,
            pr.mergedAt || null,
            pr.url,
            pr.body || null
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert pull request ${pr.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(pullRequests);
      this.logger.info(`Batch inserted pull requests`, { success, failed, total: pullRequests.length });
    } catch (error) {
      this.logger.error('Batch pull request insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Convenience method to batch insert RepositoryNode objects.
   * @param {RepositoryNode[]} repositoryNodes - Array of RepositoryNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertRepositoryNodes(repositoryNodes: RepositoryNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const repositories = repositoryNodes.map(node => ({
      id: node.id,
      repoPath: node.properties.repoPath,
      repoName: node.properties.repoName,
      createdAt: node.properties.createdAt,
      lastUpdated: node.properties.lastUpdated
    }));
    return this.batchInsertRepositories(repositories);
  }

  /**
   * Convenience method to batch insert FileNode objects.
   * @param {FileNode[]} fileNodes - Array of FileNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertFileNodes(fileNodes: FileNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const files = fileNodes.map(node => ({
      id: node.id,
      repoId: node.properties.repoId,
      filePath: node.properties.filePath,
      fileName: node.properties.fileName,
      fileExtension: node.properties.fileExtension,
      language: node.properties.language,
      sizeKb: node.properties.sizeKb,
      contentHash: node.properties.contentHash,
      fileType: node.properties.fileType,
      aiSummary: node.properties.aiSummary,
      imports: node.properties.imports,
      exports: node.properties.exports
    }));
    return this.batchInsertFiles(files);
  }

  /**
   * Convenience method to batch insert DirectoryNode objects.
   * @param {DirectoryNode[]} directoryNodes - Array of DirectoryNode objects.
   * @param {string} repoId - Repository ID to associate with directories.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertDirectoryNodes(directoryNodes: DirectoryNode[], repoId: string): Promise<{success: number, failed: number, errors: string[]}> {
    const directories = directoryNodes.map(node => ({
      id: node.id,
      repoId: repoId,
      dirPath: node.properties.dirPath,
      dirName: node.properties.dirName,
      aiSummary: node.properties.aiSummary
    }));
    return this.batchInsertDirectories(directories);
  }

  /**
   * Convenience method to batch insert CodeNode objects.
   * @param {CodeNode[]} codeNodes - Array of CodeNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertCodeNodeObjects(codeNodes: CodeNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const nodes = codeNodes.map(node => ({
      id: node.id,
      name: node.properties.name,
      signature: node.properties.signature,
      body: node.properties.body,
      docstring: node.properties.docstring,
      language: node.properties.language,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine
    }));
    return this.batchInsertCodeNodes(nodes);
  }

  /**
   * Convenience method to batch insert TestNode objects.
   * @param {TestNode[]} testNodes - Array of TestNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertTestNodeObjects(testNodes: TestNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const nodes = testNodes.map(node => ({
      id: node.id,
      name: node.properties.name,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine,
      framework: node.properties.framework,
      testBody: node.properties.testBody
    }));
    return this.batchInsertTestNodes(nodes);
  }

  /**
   * Convenience method to batch insert FunctionNode objects.
   * @param {FunctionNode[]} functionNodes - Array of FunctionNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertFunctionNodes(functionNodes: FunctionNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const functions = functionNodes.map(node => ({
      id: node.id,
      fileId: node.properties.fileId,
      name: node.properties.name,
      signature: node.properties.signature,
      returnType: node.properties.returnType,
      accessLevel: node.properties.accessLevel,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine,
      body: node.properties.body,
      calledByMethods: JSON.stringify(node.properties.calledByMethods || []),
      callsMethods: JSON.stringify(node.properties.callsMethods || []),
      usesExternalMethods: node.properties.usesExternalMethods,
      internalCallGraph: JSON.stringify(node.properties.internalCallGraph || []),
      transitiveCallDepth: node.properties.transitiveCallDepth
    }));
    return this.batchInsertFunctions(functions);
  }

  /**
   * Convenience method to batch insert CommitNode objects.
   * @param {CommitNode[]} commitNodes - Array of CommitNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertCommitNodes(commitNodes: CommitNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const commits = commitNodes.map(node => ({
      id: node.id,
      hash: node.properties.hash,
      author: node.properties.author,
      date: node.properties.date,
      message: node.properties.message,
      diffSummary: node.properties.diffSummary
    }));
    return this.batchInsertCommits(commits);
  }

  /**
   * Convenience method to batch insert PullRequestNode objects.
   * @param {PullRequestNode[]} pullRequestNodes - Array of PullRequestNode objects.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertPullRequestNodes(pullRequestNodes: PullRequestNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    const pullRequests = pullRequestNodes.map(node => ({
      id: node.id,
      prId: node.properties.prId,
      title: node.properties.title,
      author: node.properties.author,
      createdAt: node.properties.createdAt,
      mergedAt: node.properties.mergedAt,
      url: node.properties.url,
      body: node.properties.body
    }));
    return this.batchInsertPullRequests(pullRequests);
  }

  /**
   * Checks if the client is connected.
   */
  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  /**
   * Validates repository data before insertion.
   * @param repositories - Array of repository data to validate
   * @returns Validation result with errors if any
   */
  private validateRepositories(repositories: Array<{
    id: string;
    repoPath: string;
    repoName: string;
    createdAt?: string;
    lastUpdated?: string;
  }>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [index, repo] of repositories.entries()) {
      if (!repo.id || typeof repo.id !== 'string' || repo.id.trim() === '') {
        errors.push(`Repository ${index}: ID is required and must be a non-empty string`);
      }
      
      if (!repo.repoPath || typeof repo.repoPath !== 'string' || repo.repoPath.trim() === '') {
        errors.push(`Repository ${index}: repoPath is required and must be a non-empty string`);
      }
      
      if (!repo.repoName || typeof repo.repoName !== 'string' || repo.repoName.trim() === '') {
        errors.push(`Repository ${index}: repoName is required and must be a non-empty string`);
      }
      
      if (repo.createdAt && !this.isValidISODate(repo.createdAt)) {
        errors.push(`Repository ${index}: createdAt must be a valid ISO date string`);
      }
      
      if (repo.lastUpdated && !this.isValidISODate(repo.lastUpdated)) {
        errors.push(`Repository ${index}: lastUpdated must be a valid ISO date string`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates file data before insertion.
   * @param files - Array of file data to validate
   * @returns Validation result with errors if any
   */
  private validateFiles(files: Array<{
    id: string;
    repoId: string;
    filePath: string;
    fileName: string;
    fileExtension?: string;
    language?: string;
    sizeKb?: number;
    contentHash?: string;
    fileType?: 'source' | 'test' | 'config' | 'dev' | 'vendor';
    aiSummary?: string;
    imports?: string[];
    exports?: string[];
  }>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validFileTypes = ['source', 'test', 'config', 'dev', 'vendor'];
    
    for (const [index, file] of files.entries()) {
      if (!file.id || typeof file.id !== 'string' || file.id.trim() === '') {
        errors.push(`File ${index}: ID is required and must be a non-empty string`);
      }
      
      if (!file.repoId || typeof file.repoId !== 'string' || file.repoId.trim() === '') {
        errors.push(`File ${index}: repoId is required and must be a non-empty string`);
      }
      
      if (!file.filePath || typeof file.filePath !== 'string' || file.filePath.trim() === '') {
        errors.push(`File ${index}: filePath is required and must be a non-empty string`);
      }
      
      if (!file.fileName || typeof file.fileName !== 'string' || file.fileName.trim() === '') {
        errors.push(`File ${index}: fileName is required and must be a non-empty string`);
      }
      
      if (file.sizeKb !== undefined && (typeof file.sizeKb !== 'number' || file.sizeKb < 0)) {
        errors.push(`File ${index}: sizeKb must be a non-negative number`);
      }
      
      if (file.fileType && !validFileTypes.includes(file.fileType)) {
        errors.push(`File ${index}: fileType must be one of: ${validFileTypes.join(', ')}`);
      }
      
      if (file.imports && !Array.isArray(file.imports)) {
        errors.push(`File ${index}: imports must be an array`);
      }
      
      if (file.exports && !Array.isArray(file.exports)) {
        errors.push(`File ${index}: exports must be an array`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates if a string is a valid ISO date.
   * @param dateString - The date string to validate
   * @returns True if valid ISO date
   */
  private isValidISODate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && date.toISOString() === dateString;
  }
}

/**
 * Client for TinkerGraph (Graph Database) using Gremlin.
 */
export class TinkerGraphClient {
  private g: GraphTraversalSource | null = null;
  private connection: DriverRemoteConnection | null = null;
  private logger = getLogger('TinkerGraphClient');
  private isConnected = false;
  private circuitBreaker = new CircuitBreaker(5, 60000);
  private vertexCache = new Map<string, any>(); // Cache for created vertices
  private maxRetries = 3;
  private retryDelay = 1000;

  /**
   * Initializes the TinkerGraph client.
   * @param {string} url - The WebSocket URL for the Gremlin server (e.g., 'ws://localhost:8182/gremlin').
   */
  constructor(private url: string) {
    this.logger.info(`Initializing TinkerGraph client`, { url });
  }

  /**
   * Establishes a connection to the TinkerGraph database with retry logic and circuit breaker.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.debug('Already connected to TinkerGraph');
      return;
    }

    try {
      await this.circuitBreaker.execute(async () => {
        await withRetry(
          async () => {
            this.logger.info('Connecting to TinkerGraph', { url: this.url });
            
            // Validate connection URL before proceeding
            this.validateConnectionUrl();
            
            // Mock implementation for development - no actual server required
            // TODO: Replace with actual Gremlin connection when server is available
            this.connection = { 
              close: async () => {
                this.logger.debug('Closing TinkerGraph connection');
              }
            };
            
            this.g = this.createMockGraphTraversalSource();
            this.isConnected = true;
            this.vertexCache.clear();
            
            this.logger.info('Connected to TinkerGraph successfully');
          },
          DEFAULT_RETRY_CONFIG,
          this.logger,
          'TinkerGraph connection'
        );
      });
    } catch (error) {
      this.logger.error('Failed to connect to TinkerGraph after retries', { 
        error: getErrorMessage(error),
        circuitBreakerState: this.circuitBreaker.getState()
      });
      throw new DatabaseConnectionError('TinkerGraph', `Connection failed: ${getErrorMessage(error)}`, error);
    }
  }

  /**
   * Validates the connection URL format.
   */
  private validateConnectionUrl(): void {
    if (!this.url || typeof this.url !== 'string') {
      throw new Error('TinkerGraph URL is required and must be a string');
    }
    
    if (!this.url.startsWith('ws://') && !this.url.startsWith('wss://')) {
      throw new Error('Invalid TinkerGraph URL: must start with ws:// or wss://');
    }
    
    this.logger.debug('TinkerGraph URL validation passed', { url: this.url });
  }

  /**
   * Delay utility for retry logic.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Creates a mock GraphTraversalSource for development.
   */
  private createMockGraphTraversalSource(): GraphTraversalSource {
    return {
      addV: (label: string) => this.createMockVertexTraversal(label),
      V: (id?: string) => this.createMockVertexTraversal('', id)
    };
  }

  /**
   * Creates a mock vertex traversal for development.
   */
  private createMockVertexTraversal(label: string, id?: string): VertexTraversal {
    const properties: Record<string, any> = {};
    
    return {
      property: (key: string, value: any) => {
        properties[key] = value;
        return this.createMockVertexTraversal(label, id);
      },
      next: async () => {
        const vertexId = id || `mock-${label}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const vertex = { id: vertexId, label, properties: { ...properties } };
        
        // Cache the vertex for edge creation
        if (!id) {
          this.vertexCache.set(vertexId, vertex);
        }
        
        return { value: vertex };
      },
      addE: (edgeLabel: string) => this.createMockEdgeTraversal(id || '', edgeLabel)
    };
  }

  /**
   * Creates a mock edge traversal for development.
   */
  private createMockEdgeTraversal(fromId: string, label: string): EdgeTraversal {
    const properties: Record<string, any> = {};
    
    return {
      to: (target: VertexTraversal) => {
        return this.createMockEdgeTraversal(fromId, label);
      },
      property: (key: string, value: any) => {
        properties[key] = value;
        return this.createMockEdgeTraversal(fromId, label);
      },
      next: async () => {
        const edgeId = `mock-edge-${label}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const edge = { 
          id: edgeId, 
          label, 
          properties: { ...properties },
          from: fromId,
          to: 'target-vertex-id' // In real implementation, this would be resolved
        };
        return { value: edge };
      }
    };
  }



  /**
   * Disconnects from the TinkerGraph database.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      this.logger.debug('Already disconnected from TinkerGraph');
      return;
    }

    try {
      this.logger.info('Disconnecting from TinkerGraph');
      
      if (this.connection?.close) {
        await this.connection.close();
      }
      
      this.connection = null;
      this.g = null;
      this.isConnected = false;
      this.vertexCache.clear();
      
      this.logger.info('Disconnected from TinkerGraph successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from TinkerGraph', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Returns the Gremlin GraphTraversalSource for executing graph traversals.
   * @returns {GraphTraversalSource} The Gremlin traversal source.
   */
  getGraphTraversalSource(): GraphTraversalSource {
    if (!this.isConnected || !this.g) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    this.logger.debug('Getting TinkerGraph traversal source');
    return this.g;
  }

  /**
   * Adds a vertex to the graph with retry logic.
   * @param {string} label - The vertex label.
   * @param {Record<string, any>} properties - The vertex properties.
   * @returns {Promise<any>} The created vertex.
   */
  async addVertex(label: string, properties: Record<string, any>): Promise<any> {
    if (!this.isConnected || !this.g) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`Adding vertex: ${label} (attempt ${attempt}/${this.maxRetries})`, { properties });
        
        let traversal = this.g.addV(label);
        
        // Add properties to the vertex
        for (const [key, value] of Object.entries(properties)) {
          if (value !== undefined && value !== null) {
            traversal = traversal.property(key, value);
          }
        }
        
        const result = await traversal.next();
        const vertex = result.value;
        
        // Cache the vertex for potential edge creation
        this.vertexCache.set(vertex.id, vertex);
        
        this.logger.debug(`Successfully added vertex: ${label}`, { vertexId: vertex.id });
        return vertex;
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Failed to add vertex: ${label} (attempt ${attempt})`, { 
          error: getErrorMessage(error),
          attempt,
          maxRetries: this.maxRetries
        });
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay);
        }
      }
    }
    
    this.logger.error(`Failed to add vertex: ${label} after all retries`, { 
      error: getErrorMessage(lastError),
      maxRetries: this.maxRetries
    });
    throw lastError || new Error(`Failed to add vertex: ${label}`);
  }

  /**
   * Adds an edge to the graph with retry logic and vertex validation.
   * @param {string} fromVertexId - The source vertex ID.
   * @param {string} toVertexId - The target vertex ID.
   * @param {string} label - The edge label.
   * @param {Record<string, any>} properties - The edge properties.
   * @returns {Promise<any>} The created edge.
   */
  async addEdge(
    fromVertexId: string, 
    toVertexId: string, 
    label: string, 
    properties: Record<string, any> = {}
  ): Promise<any> {
    if (!this.isConnected || !this.g) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`Adding edge: ${fromVertexId} -[${label}]-> ${toVertexId} (attempt ${attempt}/${this.maxRetries})`, { properties });
        
        // Validate that both vertices exist
        const fromV = await this.g.V(fromVertexId).next();
        const toV = await this.g.V(toVertexId).next();

        if (!fromV.value) {
          throw new Error(`Source vertex not found: ${fromVertexId}`);
        }
        
        if (!toV.value) {
          throw new Error(`Target vertex not found: ${toVertexId}`);
        }

        // Create the edge
        let traversal = this.g.V(fromVertexId).addE(label).to(this.g.V(toVertexId));
        
        // Add properties to the edge
        for (const [key, value] of Object.entries(properties)) {
          if (value !== undefined && value !== null) {
            traversal = traversal.property(key, value);
          }
        }
        
        const result = await traversal.next();
        const edge = result.value;
        
        this.logger.debug(`Successfully added edge: ${label}`, { 
          edgeId: edge.id,
          from: fromVertexId,
          to: toVertexId
        });
        return edge;
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Failed to add edge: ${label} (attempt ${attempt})`, { 
          error: getErrorMessage(error),
          from: fromVertexId,
          to: toVertexId,
          attempt,
          maxRetries: this.maxRetries
        });
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay);
        }
      }
    }
    
    this.logger.error(`Failed to add edge: ${label} after all retries`, { 
      error: getErrorMessage(lastError),
      from: fromVertexId,
      to: toVertexId,
      maxRetries: this.maxRetries
    });
    throw lastError || new Error(`Failed to add edge: ${label}`);
  }

  /**
   * Batch creates vertices for all node types with error handling.
   * @param {BaseNode[]} nodes - Array of nodes to create as vertices.
   * @returns {Promise<{success: number, failed: number, errors: string[], vertices: any[]}>} Batch operation results.
   */
  async batchCreateVertices(nodes: BaseNode[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
    vertices: any[];
  }> {
    if (!this.isConnected || !this.g) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    if (!nodes || nodes.length === 0) {
      return { success: 0, failed: 0, errors: [], vertices: [] };
    }

    this.logger.info(`Starting batch vertex creation`, { totalNodes: nodes.length });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const vertices: any[] = [];

    // Process nodes in batches to avoid overwhelming the server
    const batchSize = 50;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      
      for (const node of batch) {
        try {
          const vertex = await this.addVertex(node.type, {
            nodeId: node.id,
            ...node.properties
          });
          
          vertices.push(vertex);
          success++;
          
        } catch (error) {
          failed++;
          const errorMsg = `Failed to create vertex for node ${node.id} (${node.type}): ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
      
      // Small delay between batches to prevent overwhelming the server
      if (i + batchSize < nodes.length) {
        await this.delay(100);
      }
    }

    this.logger.info(`Batch vertex creation completed`, { 
      success, 
      failed, 
      total: nodes.length,
      errorCount: errors.length
    });

    return { success, failed, errors, vertices };
  }

  /**
   * Batch creates edges with proper error handling and vertex validation.
   * @param {Edge[]} edges - Array of edges to create.
   * @returns {Promise<{success: number, failed: number, errors: string[], edges: any[]}>} Batch operation results.
   */
  async batchCreateEdges(edges: Edge[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
    edges: any[];
  }> {
    if (!this.isConnected || !this.g) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    if (!edges || edges.length === 0) {
      return { success: 0, failed: 0, errors: [], edges: [] };
    }

    this.logger.info(`Starting batch edge creation`, { totalEdges: edges.length });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const createdEdges: any[] = [];

    // Process edges in batches
    const batchSize = 50;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize);
      
      for (const edge of batch) {
        try {
          const createdEdge = await this.addEdge(
            edge.source,
            edge.target,
            edge.type,
            edge.properties || {}
          );
          
          createdEdges.push(createdEdge);
          success++;
          
        } catch (error) {
          failed++;
          const errorMsg = `Failed to create edge ${edge.source} -[${edge.type}]-> ${edge.target}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
      
      // Small delay between batches
      if (i + batchSize < edges.length) {
        await this.delay(100);
      }
    }

    this.logger.info(`Batch edge creation completed`, { 
      success, 
      failed, 
      total: edges.length,
      errorCount: errors.length
    });

    return { success, failed, errors, edges: createdEdges };
  }

  /**
   * Creates vertices for specific node types with optimized properties.
   * @param {RepositoryNode[]} repositories - Repository nodes to create.
   * @returns {Promise<{success: number, failed: number, errors: string[], vertices: any[]}>}
   */
  async batchCreateRepositoryVertices(repositories: RepositoryNode[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
    vertices: any[];
  }> {
    this.logger.info(`Creating repository vertices`, { count: repositories.length });
    
    const vertices: any[] = [];
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const repo of repositories) {
      try {
        const vertex = await this.addVertex('Repository', {
          nodeId: repo.id,
          repoPath: repo.properties.repoPath,
          repoName: repo.properties.repoName,
          createdAt: repo.properties.createdAt,
          lastUpdated: repo.properties.lastUpdated
        });
        
        vertices.push(vertex);
        success++;
      } catch (error) {
        failed++;
        const errorMsg = `Failed to create repository vertex ${repo.id}: ${getErrorMessage(error)}`;
        errors.push(errorMsg);
        this.logger.warn(errorMsg);
      }
    }

    return { success, failed, errors, vertices };
  }

  /**
   * Creates vertices for file nodes with optimized properties.
   * @param {FileNode[]} files - File nodes to create.
   * @returns {Promise<{success: number, failed: number, errors: string[], vertices: any[]}>}
   */
  async batchCreateFileVertices(files: FileNode[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
    vertices: any[];
  }> {
    this.logger.info(`Creating file vertices`, { count: files.length });
    
    const vertices: any[] = [];
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const vertex = await this.addVertex('File', {
          nodeId: file.id,
          filePath: file.properties.filePath,
          fileName: file.properties.fileName,
          fileExtension: file.properties.fileExtension,
          repoId: file.properties.repoId,
          language: file.properties.language,
          sizeKb: file.properties.sizeKb,
          contentHash: file.properties.contentHash,
          fileType: file.properties.fileType,
          aiSummary: file.properties.aiSummary,
          imports: file.properties.imports ? JSON.stringify(file.properties.imports) : null,
          exports: file.properties.exports ? JSON.stringify(file.properties.exports) : null
        });
        
        vertices.push(vertex);
        success++;
      } catch (error) {
        failed++;
        const errorMsg = `Failed to create file vertex ${file.id}: ${getErrorMessage(error)}`;
        errors.push(errorMsg);
        this.logger.warn(errorMsg);
      }
    }

    return { success, failed, errors, vertices };
  }

  /**
   * Creates vertices for function nodes with optimized properties.
   * @param {FunctionNode[]} functions - Function nodes to create.
   * @returns {Promise<{success: number, failed: number, errors: string[], vertices: any[]}>}
   */
  async batchCreateFunctionVertices(functions: FunctionNode[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
    vertices: any[];
  }> {
    this.logger.info(`Creating function vertices`, { count: functions.length });
    
    const vertices: any[] = [];
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const func of functions) {
      try {
        const vertex = await this.addVertex('Function', {
          nodeId: func.id,
          name: func.properties.name,
          signature: func.properties.signature,
          returnType: func.properties.returnType,
          accessLevel: func.properties.accessLevel,
          fileId: func.properties.fileId,
          filePath: func.properties.filePath,
          startLine: func.properties.startLine,
          endLine: func.properties.endLine,
          body: func.properties.body,
          calledByMethods: JSON.stringify(func.properties.calledByMethods),
          callsMethods: JSON.stringify(func.properties.callsMethods),
          usesExternalMethods: func.properties.usesExternalMethods,
          internalCallGraph: JSON.stringify(func.properties.internalCallGraph),
          transitiveCallDepth: func.properties.transitiveCallDepth
        });
        
        vertices.push(vertex);
        success++;
      } catch (error) {
        failed++;
        const errorMsg = `Failed to create function vertex ${func.id}: ${getErrorMessage(error)}`;
        errors.push(errorMsg);
        this.logger.warn(errorMsg);
      }
    }

    return { success, failed, errors, vertices };
  }

  /**
   * Validates connection and reconnects if necessary.
   * @returns {Promise<boolean>} True if connected, false otherwise.
   */
  async ensureConnection(): Promise<boolean> {
    if (this.isConnected && this.g) {
      return true;
    }

    try {
      await this.connect();
      return true;
    } catch (error) {
      this.logger.error('Failed to ensure connection', { error: getErrorMessage(error) });
      return false;
    }
  }

  /**
   * Gets statistics about the graph database.
   * @returns {Promise<{vertexCount: number, edgeCount: number}>} Graph statistics.
   */
  async getGraphStats(): Promise<{vertexCount: number, edgeCount: number}> {
    if (!this.isConnected || !this.g) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    try {
      // Mock implementation - in real TinkerGraph, this would query actual counts
      const vertexCount = this.vertexCache.size;
      const edgeCount = 0; // Would be tracked separately in real implementation
      
      this.logger.debug('Retrieved graph statistics', { vertexCount, edgeCount });
      return { vertexCount, edgeCount };
    } catch (error) {
      this.logger.error('Failed to get graph statistics', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Checks if the client is connected.
   */
  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }
}
