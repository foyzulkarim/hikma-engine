/**
 * @file Provides client implementations for interacting with various databases used by hikma-engine.
 *       This includes Better-SQLite3 for relational metadata, graph storage, and vector operations via sqlite-vec.
 */

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


/**
 * Client for SQLite (Relational Database with Vector Support).
 */
export class SQLiteClient {
  private db: DatabaseType;
  private logger = getLogger('SQLiteClient');
  private isConnected = false;
  private vectorEnabled = false;
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
          
          // Load sqlite-vec extension for vector operations
          this.loadVectorExtension();
          
          // Initialize tables if they don't exist
          this.initializeTables();
          
          this.isConnected = true;
          this.logger.info('Connected to SQLite successfully', { vectorEnabled: this.vectorEnabled });
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
   * Loads the sqlite-vec extension for vector operations.
   */
  private loadVectorExtension(): void {
    try {
      // Try to load sqlite-vec extension
      const extensionPath = process.env.HIKMA_SQLITE_VEC_EXTENSION || './extensions/vec0';
      this.db.loadExtension(extensionPath);
      
      // Test if vector functions are available
      this.db.prepare('SELECT vec_version()').get();
      
      this.vectorEnabled = true;
      this.logger.info('sqlite-vec extension loaded successfully', { extensionPath });
    } catch (error) {
      this.vectorEnabled = false;
      const errorMsg = getErrorMessage(error);
      this.logger.warn('Failed to load sqlite-vec extension, vector operations will be disabled', { 
        error: errorMsg,
        extensionPath: process.env.HIKMA_SQLITE_VEC_EXTENSION || './extensions/vec0'
      });
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

    // Create enhanced graph storage tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        business_key TEXT NOT NULL,
        node_type TEXT NOT NULL,
        properties TEXT NOT NULL,
        -- Cross-cutting properties for fast queries
        repo_id TEXT,
        commit_sha TEXT,
        file_path TEXT,
        line INTEGER,
        col INTEGER,
        signature_hash TEXT,
        labels TEXT, -- JSON array
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        source_business_key TEXT NOT NULL,
        target_business_key TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        properties TEXT, -- JSON for edge properties
        -- Common edge properties extracted for performance
        line INTEGER,
        col INTEGER,
        dynamic BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Enhanced graph table indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_business_key ON graph_nodes(business_key)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_repo ON graph_nodes(repo_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_file ON graph_nodes(file_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_signature ON graph_nodes(signature_hash)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(edge_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_source_type ON graph_edges(source_id, edge_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_target_type ON graph_edges(target_id, edge_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_business_keys ON graph_edges(source_business_key, target_business_key)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_location ON graph_edges(line, col)`);

    // Add vector columns for embedding storage (sqlite-vec integration)
    this.addVectorColumns();

    this.logger.debug('SQLite tables initialized successfully');
  }

  /**
   * Adds vector columns to existing tables for embedding storage using sqlite-vec.
   * This method extends the schema to support vector operations for semantic search.
   */
  private addVectorColumns(): void {
    this.logger.debug('Adding vector columns for embedding storage');

    if (!this.vectorEnabled) {
      this.logger.debug('Vector extension not available, skipping vector column creation');
      return;
    }

    try {
      // Add embedding columns to key tables for semantic search
      
      // Files table - for file content embeddings
      this.db.exec(`
        ALTER TABLE files ADD COLUMN content_embedding BLOB;
      `);
      
      // Code nodes table - for code snippet embeddings  
      this.db.exec(`
        ALTER TABLE code_nodes ADD COLUMN code_embedding BLOB;
      `);
      
      // Functions table - for function signature and body embeddings
      this.db.exec(`
        ALTER TABLE functions ADD COLUMN signature_embedding BLOB;
      `);
      this.db.exec(`
        ALTER TABLE functions ADD COLUMN body_embedding BLOB;
      `);
      
      // Commits table - for commit message embeddings
      this.db.exec(`
        ALTER TABLE commits ADD COLUMN message_embedding BLOB;
      `);
      
      // Pull requests table - for PR title and body embeddings
      this.db.exec(`
        ALTER TABLE pull_requests ADD COLUMN title_embedding BLOB;
      `);
      this.db.exec(`
        ALTER TABLE pull_requests ADD COLUMN body_embedding BLOB;
      `);
      
      // Directories table - for directory summary embeddings
      this.db.exec(`
        ALTER TABLE directories ADD COLUMN summary_embedding BLOB;
      `);
      
      // Test nodes table - for test body embeddings
      this.db.exec(`
        ALTER TABLE test_nodes ADD COLUMN test_embedding BLOB;
      `);

      // Create vector indexes for performance optimization
      this.createVectorIndexes();

      this.logger.debug('Vector columns added successfully to all tables');
      
    } catch (error) {
      // Handle case where columns already exist
      const errorMsg = getErrorMessage(error);
      if (errorMsg.includes('duplicate column name') || errorMsg.includes('already exists')) {
        this.logger.debug('Vector columns already exist, skipping creation');
        // Still try to create indexes in case they don't exist
        try {
          this.createVectorIndexes();
        } catch (indexError) {
          this.logger.debug('Vector indexes may already exist', { error: getErrorMessage(indexError) });
        }
      } else {
        this.logger.error('Failed to add vector columns', { error: errorMsg });
        throw error;
      }
    }
  }

  /**
   * Creates vector indexes for performance optimization.
   */
  private createVectorIndexes(): void {
    if (!this.vectorEnabled) {
      return;
    }

    try {
      this.logger.debug('Creating vector indexes for performance optimization');
      
      // Note: sqlite-vec uses different indexing approach than traditional SQL indexes
      // Vector similarity searches are optimized internally by the extension
      // We can create regular indexes on related columns for hybrid queries
      
      // Index for files with embeddings
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_files_has_embedding ON files(file_id) WHERE content_embedding IS NOT NULL`);
      
      // Index for functions with embeddings  
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_has_signature_embedding ON functions(id) WHERE signature_embedding IS NOT NULL`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_has_body_embedding ON functions(id) WHERE body_embedding IS NOT NULL`);
      
      // Index for commits with embeddings
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_commits_has_embedding ON commits(id) WHERE message_embedding IS NOT NULL`);
      
      // Index for pull requests with embeddings
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pull_requests_has_title_embedding ON pull_requests(id) WHERE title_embedding IS NOT NULL`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pull_requests_has_body_embedding ON pull_requests(id) WHERE body_embedding IS NOT NULL`);
      
      // Index for directories with embeddings
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_directories_has_embedding ON directories(id) WHERE summary_embedding IS NOT NULL`);
      
      // Index for code nodes with embeddings
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_nodes_has_embedding ON code_nodes(id) WHERE code_embedding IS NOT NULL`);
      
      // Index for test nodes with embeddings
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_nodes_has_embedding ON test_nodes(id) WHERE test_embedding IS NOT NULL`);

      this.logger.debug('Vector indexes created successfully');
    } catch (error) {
      this.logger.warn('Failed to create some vector indexes', { error: getErrorMessage(error) });
    }
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
    contentEmbedding?: number[];
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
        size_kb, content_hash, file_type, ai_summary, imports, exports, content_embedding,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((fileList: typeof files) => {
      for (const file of fileList) {
        try {
          const embeddingBlob = file.contentEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(file.contentEmbedding).buffer) 
            : null;
            
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
            file.exports ? JSON.stringify(file.exports) : null,
            embeddingBlob
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
    summaryEmbedding?: number[];
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!directories || directories.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO directories (id, repo_id, dir_path, dir_name, ai_summary, summary_embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((dirList: typeof directories) => {
      for (const dir of dirList) {
        try {
          const embeddingBlob = dir.summaryEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(dir.summaryEmbedding).buffer) 
            : null;
            
          stmt.run(
            dir.id,
            dir.repoId,
            dir.dirPath,
            dir.dirName,
            dir.aiSummary || null,
            embeddingBlob
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
    codeEmbedding?: number[];
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
        start_line, end_line, code_embedding, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((nodeList: typeof codeNodes) => {
      for (const node of nodeList) {
        try {
          const embeddingBlob = node.codeEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(node.codeEmbedding).buffer) 
            : null;
            
          stmt.run(
            node.id,
            node.name,
            node.signature || null,
            node.body || null,
            node.docstring || null,
            node.language,
            node.filePath,
            node.startLine,
            node.endLine,
            embeddingBlob
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
    testEmbedding?: number[];
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!testNodes || testNodes.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO test_nodes (
        id, name, file_path, start_line, end_line, framework, test_body, test_embedding,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((nodeList: typeof testNodes) => {
      for (const node of nodeList) {
        try {
          const embeddingBlob = node.testEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(node.testEmbedding).buffer) 
            : null;
            
          stmt.run(
            node.id,
            node.name,
            node.filePath,
            node.startLine,
            node.endLine,
            node.framework || null,
            node.testBody || null,
            embeddingBlob
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
    signatureEmbedding?: number[];
    bodyEmbedding?: number[];
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
        signature_embedding, body_embedding, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((funcList: typeof functions) => {
      for (const func of funcList) {
        try {
          const signatureEmbeddingBlob = func.signatureEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(func.signatureEmbedding).buffer) 
            : null;
          const bodyEmbeddingBlob = func.bodyEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(func.bodyEmbedding).buffer) 
            : null;
            
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
            func.transitiveCallDepth || 0,
            signatureEmbeddingBlob,
            bodyEmbeddingBlob
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
    messageEmbedding?: number[];
  }>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    if (!commits || commits.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO commits (id, hash, author, date, message, diff_summary, message_embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((commitList: typeof commits) => {
      for (const commit of commitList) {
        try {
          const embeddingBlob = commit.messageEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(commit.messageEmbedding).buffer) 
            : null;
            
          stmt.run(
            commit.id,
            commit.hash,
            commit.author,
            commit.date,
            commit.message,
            commit.diffSummary || null,
            embeddingBlob
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
    titleEmbedding?: number[];
    bodyEmbedding?: number[];
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
        title_embedding, body_embedding, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((prList: typeof pullRequests) => {
      for (const pr of prList) {
        try {
          const titleEmbeddingBlob = pr.titleEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(pr.titleEmbedding).buffer) 
            : null;
          const bodyEmbeddingBlob = pr.bodyEmbedding && this.vectorEnabled 
            ? Buffer.from(new Float32Array(pr.bodyEmbedding).buffer) 
            : null;
            
          stmt.run(
            pr.id,
            pr.prId,
            pr.title,
            pr.author,
            pr.createdAt,
            pr.mergedAt || null,
            pr.url,
            pr.body || null,
            titleEmbeddingBlob,
            bodyEmbeddingBlob
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
   * Checks if vector operations are enabled.
   */
  get isVectorEnabled(): boolean {
    return this.vectorEnabled;
  }

  // ============================================================================
  // ENHANCED GRAPH DATABASE OPERATIONS
  // ============================================================================

  /**
   * Batch insert enhanced nodes into the graph storage.
   * @param {EnhancedBaseNode[]} nodes - Array of enhanced nodes to insert.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertEnhancedGraphNodes(nodes: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!nodes || nodes.length === 0) {
      this.logger.debug('No enhanced graph nodes to insert');
      return { success: 0, failed: 0, errors: [] };
    }

    this.logger.info(`Starting batch insert of ${nodes.length} enhanced graph nodes`);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graph_nodes (
        id, business_key, node_type, properties, repo_id, commit_sha, 
        file_path, line, col, signature_hash, labels, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((nodeList: any[]) => {
      for (const node of nodeList) {
        try {
          stmt.run(
            node.id,
            node.businessKey,
            node.type,
            JSON.stringify(node.properties),
            node.repoId || null,
            node.commitSha || null,
            node.filePath || null,
            node.line || null,
            node.col || null,
            node.signatureHash || null,
            node.labels ? JSON.stringify(node.labels) : null
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert enhanced graph node ${node.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(nodes);
      this.logger.info(`Batch inserted enhanced graph nodes`, { success, failed, total: nodes.length });
    } catch (error) {
      this.logger.error('Batch enhanced graph node insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Batch insert enhanced edges into the graph storage.
   * @param {EnhancedEdge[]} edges - Array of enhanced edges to insert.
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Insert results.
   */
  async batchInsertEnhancedGraphEdges(edges: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!edges || edges.length === 0) {
      this.logger.debug('No enhanced graph edges to insert');
      return { success: 0, failed: 0, errors: [] };
    }

    this.logger.info(`Starting batch insert of ${edges.length} enhanced graph edges`);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graph_edges (
        id, source_id, target_id, source_business_key, target_business_key,
        edge_type, properties, line, col, dynamic, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((edgeList: any[]) => {
      for (const edge of edgeList) {
        try {
          const edgeId = `${edge.sourceBusinessKey}-${edge.type}-${edge.targetBusinessKey}`;
          stmt.run(
            edgeId,
            edge.source,
            edge.target,
            edge.sourceBusinessKey,
            edge.targetBusinessKey,
            edge.type,
            edge.properties ? JSON.stringify(edge.properties) : null,
            edge.line || null,
            edge.col || null,
            edge.dynamic ? 1 : 0
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert enhanced graph edge ${edge.sourceBusinessKey}->${edge.targetBusinessKey}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(edges);
      this.logger.info(`Batch inserted enhanced graph edges`, { success, failed, total: edges.length });
    } catch (error) {
      this.logger.error('Batch enhanced graph edge insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Find nodes by business key pattern.
   * @param {string} pattern - Business key pattern (supports LIKE syntax).
   * @returns {any[]} Array of matching nodes.
   */
  findNodesByBusinessKey(pattern: string): any[] {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    const sql = `
      SELECT id, business_key, node_type, properties, repo_id, commit_sha, 
             file_path, line, col, signature_hash, labels
      FROM graph_nodes 
      WHERE business_key LIKE ?
    `;

    const results = this.all(sql, [pattern]);
    return results.map(row => ({
      id: row.id,
      businessKey: row.business_key,
      type: row.node_type,
      properties: JSON.parse(row.properties),
      repoId: row.repo_id,
      commitSha: row.commit_sha,
      filePath: row.file_path,
      line: row.line,
      col: row.col,
      signatureHash: row.signature_hash,
      labels: row.labels ? JSON.parse(row.labels) : []
    }));
  }

  /**
   * Find all functions that a specific function calls (with location info).
   * @param {string} functionBusinessKey - The function business key.
   * @returns {any[]} Array of called functions with call locations.
   */
  findFunctionCallsWithLocation(functionBusinessKey: string): any[] {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    const sql = `
      SELECT n.business_key, n.properties, e.line, e.col, e.dynamic, e.properties as edge_props
      FROM graph_nodes n
      JOIN graph_edges e ON n.business_key = e.target_business_key
      WHERE e.source_business_key = ? AND e.edge_type = 'CALLS'
      ORDER BY e.line, e.col
    `;

    const results = this.all(sql, [functionBusinessKey]);
    return results.map(row => ({
      businessKey: row.business_key,
      properties: JSON.parse(row.properties),
      callLocation: {
        line: row.line,
        col: row.col,
        dynamic: row.dynamic === 1
      },
      edgeProperties: row.edge_props ? JSON.parse(row.edge_props) : {}
    }));
  }

  /**
   * Find all variables that a function reads or writes.
   * @param {string} functionBusinessKey - The function business key.
   * @param {'READS' | 'WRITES'} accessType - Type of variable access.
   * @returns {any[]} Array of variables with access locations.
   */
  findVariableAccess(functionBusinessKey: string, accessType: 'READS' | 'WRITES'): any[] {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    const sql = `
      SELECT n.business_key, n.properties, e.line, e.col, e.properties as edge_props
      FROM graph_nodes n
      JOIN graph_edges e ON n.business_key = e.target_business_key
      WHERE e.source_business_key = ? AND e.edge_type = ?
      ORDER BY e.line, e.col
    `;

    const results = this.all(sql, [functionBusinessKey, accessType]);
    return results.map(row => ({
      businessKey: row.business_key,
      properties: JSON.parse(row.properties),
      accessLocation: {
        line: row.line,
        col: row.col
      },
      edgeProperties: row.edge_props ? JSON.parse(row.edge_props) : {}
    }));
  }

  /**
   * Find all functions in a file with their declarations.
   * @param {string} fileBusinessKey - The file business key.
   * @returns {any[]} Array of functions declared in the file.
   */
  findFunctionsInFileEnhanced(fileBusinessKey: string): any[] {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    const sql = `
      SELECT n.business_key, n.properties, n.line, n.col
      FROM graph_nodes n
      JOIN graph_edges e ON n.business_key = e.source_business_key
      WHERE e.target_business_key = ? AND e.edge_type = 'DECLARES' 
        AND n.node_type IN ('Function', 'ArrowFunction')
      ORDER BY n.line
    `;

    const results = this.all(sql, [fileBusinessKey]);
    return results.map(row => ({
      businessKey: row.business_key,
      properties: JSON.parse(row.properties),
      location: {
        line: row.line,
        col: row.col
      }
    }));
  }

  /**
   * Find data flow: trace how data flows from one variable to another.
   * @param {string} sourceVarBusinessKey - Source variable business key.
   * @param {number} maxDepth - Maximum depth to trace (default: 3).
   * @returns {any[]} Array representing the data flow path.
   */
  findDataFlow(sourceVarBusinessKey: string, maxDepth: number = 3): any[] {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    // Recursive CTE to find data flow paths
    const sql = `
      WITH RECURSIVE data_flow(source_key, target_key, path, depth) AS (
        -- Base case: direct reads/writes
        SELECT e.source_business_key, e.target_business_key, 
               e.source_business_key || ' -> ' || e.target_business_key, 1
        FROM graph_edges e
        WHERE e.target_business_key = ? AND e.edge_type IN ('READS', 'WRITES')
        
        UNION ALL
        
        -- Recursive case: follow function calls
        SELECT df.source_key, e.target_business_key,
               df.path || ' -> ' || e.target_business_key, df.depth + 1
        FROM data_flow df
        JOIN graph_edges e ON df.source_key = e.source_business_key
        WHERE e.edge_type = 'CALLS' AND df.depth < ?
      )
      SELECT DISTINCT source_key, target_key, path, depth
      FROM data_flow
      ORDER BY depth, path
    `;

    const results = this.all(sql, [sourceVarBusinessKey, maxDepth]);
    return results;
  }

  /**
   * Get enhanced graph statistics with detailed breakdowns.
   * @returns {Promise<EnhancedGraphStats>} Comprehensive graph statistics.
   */
  async getEnhancedGraphStats(): Promise<{
    nodeCount: number;
    edgeCount: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
    repoBreakdown: Record<string, number>;
    fileLanguages: Record<string, number>;
    functionComplexity: {
      avgLoc: number;
      maxLoc: number;
      totalFunctions: number;
    };
  }> {
    try {
      const nodeCount = (this.db.prepare('SELECT COUNT(*) as count FROM graph_nodes').get() as { count: number } | undefined)?.count || 0;
      const edgeCount = (this.db.prepare('SELECT COUNT(*) as count FROM graph_edges').get() as { count: number } | undefined)?.count || 0;

      // Node type distribution
      const nodeTypeResults = this.db.prepare('SELECT node_type, COUNT(*) as count FROM graph_nodes GROUP BY node_type').all() as Array<{node_type: string, count: number}>;
      const nodeTypes: Record<string, number> = {};
      nodeTypeResults.forEach(row => {
        nodeTypes[row.node_type] = row.count;
      });

      // Edge type distribution
      const edgeTypeResults = this.db.prepare('SELECT edge_type, COUNT(*) as count FROM graph_edges GROUP BY edge_type').all() as Array<{edge_type: string, count: number}>;
      const edgeTypes: Record<string, number> = {};
      edgeTypeResults.forEach(row => {
        edgeTypes[row.edge_type] = row.count;
      });

      // Repository breakdown
      const repoResults = this.db.prepare('SELECT repo_id, COUNT(*) as count FROM graph_nodes WHERE repo_id IS NOT NULL GROUP BY repo_id').all() as Array<{repo_id: string, count: number}>;
      const repoBreakdown: Record<string, number> = {};
      repoResults.forEach(row => {
        repoBreakdown[row.repo_id] = row.count;
      });

      // File language distribution
      const langResults = this.db.prepare(`
        SELECT JSON_EXTRACT(properties, '$.language') as language, COUNT(*) as count 
        FROM graph_nodes 
        WHERE node_type = 'File' AND JSON_EXTRACT(properties, '$.language') IS NOT NULL
        GROUP BY JSON_EXTRACT(properties, '$.language')
      `).all() as Array<{language: string, count: number}>;
      const fileLanguages: Record<string, number> = {};
      langResults.forEach(row => {
        fileLanguages[row.language] = row.count;
      });

      // Function complexity stats
      const funcStats = this.db.prepare(`
        SELECT 
          AVG(JSON_EXTRACT(properties, '$.loc')) as avg_loc,
          MAX(JSON_EXTRACT(properties, '$.loc')) as max_loc,
          COUNT(*) as total_functions
        FROM graph_nodes 
        WHERE node_type IN ('Function', 'ArrowFunction')
      `).get() as {avg_loc: number, max_loc: number, total_functions: number} | undefined;

      const functionComplexity = {
        avgLoc: funcStats?.avg_loc || 0,
        maxLoc: funcStats?.max_loc || 0,
        totalFunctions: funcStats?.total_functions || 0
      };

      return {
        nodeCount,
        edgeCount,
        nodeTypes,
        edgeTypes,
        repoBreakdown,
        fileLanguages,
        functionComplexity
      };
    } catch (error) {
      this.logger.error('Failed to get enhanced graph stats', { error: getErrorMessage(error) });
      throw error;
    }
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

  // ============================================================================
  // VECTOR SEARCH OPERATIONS (sqlite-vec integration)
  // ============================================================================

  /**
   * Stores a vector for a specific record.
   * @param {string} table - The table name (files, functions, commits, etc.)
   * @param {string} column - The embedding column name
   * @param {string} recordId - The record ID to update
   * @param {number[]} embedding - The embedding vector
   * @returns {Promise<void>}
   */
  async storeVector(table: string, column: string, recordId: string, embedding: number[]): Promise<void> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!this.vectorEnabled) {
      this.logger.warn('Vector operations not available, skipping embedding storage', { table, recordId });
      return;
    }

    try {
      // Convert embedding array to binary format for sqlite-vec
      const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
      
      const sql = `UPDATE ${table} SET ${column} = ? WHERE ${this.getIdColumn(table)} = ?`;
      this.run(sql, [embeddingBlob, recordId]);
      
      this.logger.debug(`Stored embedding for ${table}.${recordId}`, { 
        embeddingDimensions: embedding.length,
        column 
      });
    } catch (error) {
      this.logger.error(`Failed to store embedding for ${table}.${recordId}`, { 
        error: getErrorMessage(error),
        column 
      });
      throw new DatabaseOperationError('SQLite', 'storeEmbedding', getErrorMessage(error), error);
    }
  }

  /**
   * Performs vector similarity search using sqlite-vec.
   * @param {string} table - The table to search in
   * @param {string} column - The embedding column to search
   * @param {number[]} queryEmbedding - The query embedding vector
   * @param {number} limit - Maximum number of results to return
   * @param {number} threshold - Similarity threshold (optional)
   * @returns {Promise<Array<{id: string, similarity: number, data: any}>>}
   */
  async vectorSearch(
    table: string, 
    column: string, 
    queryEmbedding: number[], 
    limit: number = 10,
    threshold?: number
  ): Promise<Array<{id: string, similarity: number, data: any}>> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!this.vectorEnabled) {
      this.logger.warn('Vector operations not available, returning empty results', { table, column });
      return [];
    }

    try {
      const queryBlob = Buffer.from(new Float32Array(queryEmbedding).buffer);
      const idColumn = this.getIdColumn(table);
      
      let sql = `
        SELECT ${idColumn}, 
               vec_distance_cosine(${column}, ?) as similarity,
               *
        FROM ${table} 
        WHERE ${column} IS NOT NULL
      `;
      
      const params: any[] = [queryBlob];
      
      if (threshold !== undefined) {
        // Convert similarity threshold to distance threshold (1 - similarity)
        const distanceThreshold = 1 - threshold;
        sql += ` AND vec_distance_cosine(${column}, ?) <= ?`;
        params.push(queryBlob, distanceThreshold);
      }
      
      sql += ` ORDER BY similarity ASC LIMIT ?`;
      params.push(limit);

      const results = this.all(sql, params);
      
      return results.map(row => ({
        id: row[idColumn],
        similarity: 1 - row.similarity, // Convert distance to similarity
        data: row
      }));
      
    } catch (error) {
      this.logger.error(`Vector search failed for ${table}.${column}`, { 
        error: getErrorMessage(error),
        queryDimensions: queryEmbedding.length 
      });
      throw new DatabaseOperationError('SQLite', 'vectorSearch', getErrorMessage(error), error);
    }
  }

  /**
   * Performs semantic search across multiple tables and embedding types.
   * @param {number[]} queryEmbedding - The query embedding vector
   * @param {number} limit - Maximum number of results per table
   * @returns {Promise<{files: any[], functions: any[], commits: any[], pullRequests: any[]}>}
   */
  async semanticSearch(queryEmbedding: number[], limit: number = 5): Promise<{
    files: any[];
    functions: any[];
    commits: any[];
    pullRequests: any[];
  }> {
    try {
      const [files, functions, commits, pullRequests] = await Promise.all([
        this.vectorSearch('files', 'content_embedding', queryEmbedding, limit),
        this.vectorSearch('functions', 'signature_embedding', queryEmbedding, limit),
        this.vectorSearch('commits', 'message_embedding', queryEmbedding, limit),
        this.vectorSearch('pull_requests', 'title_embedding', queryEmbedding, limit)
      ]);

      return { files, functions, commits, pullRequests };
    } catch (error) {
      this.logger.error('Semantic search failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Batch stores embeddings for multiple records.
   * @param {string} table - The table name
   * @param {string} column - The embedding column name
   * @param {Array<{id: string, embedding: number[]}>} records - Records with embeddings
   * @returns {Promise<{success: number, failed: number, errors: string[]}>}
   */
  async batchStoreEmbeddings(
    table: string, 
    column: string, 
    records: Array<{id: string, embedding: number[]}>
  ): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }

    if (!records || records.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    this.logger.info(`Starting batch embedding storage for ${records.length} records in ${table}.${column}`);

    const idColumn = this.getIdColumn(table);
    const stmt = this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const updateMany = this.db.transaction((recordList: typeof records) => {
      for (const record of recordList) {
        try {
          const embeddingBlob = Buffer.from(new Float32Array(record.embedding).buffer);
          stmt.run(embeddingBlob, record.id);
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to store embedding for ${record.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      updateMany(records);
      this.logger.info(`Batch stored embeddings`, { success, failed, total: records.length });
    } catch (error) {
      this.logger.error('Batch embedding storage transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Gets the appropriate ID column name for a table.
   * @param {string} table - The table name
   * @returns {string} The ID column name
   */
  private getIdColumn(table: string): string {
    switch (table) {
      case 'files':
        return 'file_id';
      case 'repositories':
        return 'repo_id';
      case 'functions':
      case 'commits':
      case 'pull_requests':
      case 'directories':
      case 'code_nodes':
      case 'test_nodes':
        return 'id';
      default:
        return 'id';
    }
  }

  /**
   * Checks if sqlite-vec extension is available and working.
   * @returns {Promise<boolean>} True if vector operations are available
   */
  async isVectorSearchAvailable(): Promise<boolean> {
    return this.vectorEnabled;
  }
}


