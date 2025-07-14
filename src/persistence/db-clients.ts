/**
 * @file Provides client implementations for interacting with various databases used by hikma-engine.
 *       This includes LanceDB for vector storage, Better-SQLite3 for relational metadata, and Gremlin for graph traversal.
 */

import * as lancedb from '@lancedb/lancedb';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { getLogger } from '../utils/logger';
import { getErrorMessage, getErrorStack, logError } from '../utils/error-handling';
// Mock Gremlin imports for now since we're using mock implementation
const DriverRemoteConnection = null;
const GraphTraversalSource = null;
const Graph = null;

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
    return await this.db.table(tableName);
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

  /**
   * Initializes the SQLite client.
   * @param {string} path - The file system path for the SQLite database file.
   */
  constructor(private path: string) {
    this.logger.info(`Initializing SQLite client`, { path });
    // better-sqlite3 connects on instantiation
    this.db = new Database(path);
  }

  /**
   * Establishes a connection to the SQLite database. (For better-sqlite3, connection is in constructor).
   */
  connect(): void {
    if (this.isConnected) {
      this.logger.debug('Already connected to SQLite');
      return;
    }

    try {
      this.logger.info('Connecting to SQLite');
      // Initialize tables if they don't exist
      this.initializeTables();
      this.isConnected = true;
      this.logger.info('Connected to SQLite successfully');
    } catch (error) {
      this.logger.error('Failed to connect to SQLite', { error: getErrorMessage(error) });
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

    // Create indexing state table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS indexing_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create files table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_extension TEXT,
        ai_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create directories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS directories (
        id TEXT PRIMARY KEY,
        dir_path TEXT NOT NULL,
        dir_name TEXT NOT NULL,
        ai_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create code_nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        signature TEXT,
        language TEXT,
        file_path TEXT,
        start_line INTEGER,
        end_line INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create commits table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commits (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        author TEXT,
        date TEXT,
        message TEXT,
        diff_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create test_nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        file_path TEXT,
        start_line INTEGER,
        end_line INTEGER,
        framework TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create pull_requests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pull_requests (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL,
        title TEXT,
        author TEXT,
        created_at_pr DATETIME,
        merged_at DATETIME,
        url TEXT,
        body TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.logger.debug('SQLite tables initialized successfully');
  }

  /**
   * Executes a SQL query.
   * @param {string} sql - The SQL query string.
   * @param {any[]} [params] - Optional parameters for the SQL query.
   * @returns {any} The result of the SQL execution.
   */
  run(sql: string, params?: any[]): any {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    this.logger.debug(`Executing SQLite query`, { sql: sql.substring(0, 100) });
    const stmt = this.db.prepare(sql);
    return params ? stmt.run(...params) : stmt.run();
  }

  /**
   * Prepares a SQL statement for repeated execution.
   * @param {string} sql - The SQL query string to prepare.
   * @returns {Database.Statement} The prepared statement object.
   */
  prepare(sql: string): Database.Statement {
    if (!this.isConnected) {
      throw new Error('Not connected to SQLite. Call connect() first.');
    }

    this.logger.debug(`Preparing SQLite statement`, { sql: sql.substring(0, 100) });
    return this.db.prepare(sql);
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
    return this.db.prepare(sql).all(params);
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
    return this.db.prepare(sql).get(params);
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
   * @returns {Promise<{totalFiles: number, totalDirectories: number, totalCommits: number, lastIndexed: string | null}>}
   */
  async getIndexingStats(): Promise<{
    totalFiles: number;
    totalDirectories: number;
    totalCommits: number;
    lastIndexed: string | null;
  }> {
    try {
      const fileCount = this.get('SELECT COUNT(*) as count FROM files')?.count || 0;
      const dirCount = this.get('SELECT COUNT(*) as count FROM directories')?.count || 0;
      const commitCount = this.get('SELECT COUNT(*) as count FROM commits')?.count || 0;
      const lastIndexed = this.getLastIndexedCommit();

      return {
        totalFiles: fileCount,
        totalDirectories: dirCount,
        totalCommits: commitCount,
        lastIndexed,
      };
    } catch (error) {
      this.logger.error('Failed to get indexing stats', { error: getErrorMessage(error) });
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
 * Client for TinkerGraph (Graph Database) using Gremlin.
 */
export class TinkerGraphClient {
  private g: any; // GraphTraversalSource placeholder
  private connection: any; // DriverRemoteConnection placeholder
  private logger = getLogger('TinkerGraphClient');
  private isConnected = false;

  /**
   * Initializes the TinkerGraph client.
   * @param {string} url - The WebSocket URL for the Gremlin server (e.g., 'ws://localhost:8182/gremlin').
   */
  constructor(private url: string) {
    this.logger.info(`Initializing TinkerGraph client`, { url });
  }

  /**
   * Establishes a connection to the TinkerGraph database.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.debug('Already connected to TinkerGraph');
      return;
    }

    try {
      this.logger.info('Connecting to TinkerGraph (mock mode)');
      // Mock implementation for development - no actual server required
      this.connection = { close: async () => {} };
      this.g = {
        addV: (label: string) => ({
          property: (key: string, value: any) => ({
            property: (key: string, value: any) => ({ next: async () => ({ value: { id: `mock-${Date.now()}` } }) }),
            next: async () => ({ value: { id: `mock-${Date.now()}` } })
          }),
          next: async () => ({ value: { id: `mock-${Date.now()}` } })
        }),
        V: (id: string) => ({
          next: async () => ({ value: { id } }),
          addE: (label: string) => ({
            to: (target: any) => ({
              property: (key: string, value: any) => ({
                property: (key: string, value: any) => ({ next: async () => ({ value: { id: `mock-edge-${Date.now()}` } }) }),
                next: async () => ({ value: { id: `mock-edge-${Date.now()}` } })
              }),
              next: async () => ({ value: { id: `mock-edge-${Date.now()}` } })
            })
          })
        })
      };
      this.isConnected = true;
      this.logger.info('Connected to TinkerGraph successfully (mock mode)');
    } catch (error) {
      this.logger.error('Failed to connect to TinkerGraph', { error: getErrorMessage(error) });
      throw error;
    }
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
      // TODO: Simulate or close connection
      if (this.connection?.close) {
        await this.connection.close();
      }
      this.connection = null;
      this.g = null;
      this.isConnected = false;
      this.logger.info('Disconnected from TinkerGraph successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from TinkerGraph', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Returns the Gremlin GraphTraversalSource for executing graph traversals.
   * @returns {any} The Gremlin traversal source.
   */
  getGraphTraversalSource(): any {
    if (!this.isConnected) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    this.logger.debug('Getting TinkerGraph traversal source');
    // TODO: Return actual traversal source
    return this.g;
  }

  /**
   * Adds a vertex to the graph.
   * @param {string} label - The vertex label.
   * @param {Record<string, any>} properties - The vertex properties.
   * @returns {Promise<any>} The created vertex.
   */
  async addVertex(label: string, properties: Record<string, any>): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    try {
      this.logger.debug(`Adding vertex: ${label}`, { properties });
      let traversal = this.g.addV(label);
      for (const key in properties) {
        traversal = traversal.property(key, properties[key]);
      }
      const vertex = await traversal.next();
      return vertex.value;
    } catch (error) {
      this.logger.error(`Failed to add vertex: ${label}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Adds an edge to the graph.
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
    if (!this.isConnected) {
      throw new Error('Not connected to TinkerGraph. Call connect() first.');
    }

    try {
      this.logger.debug(`Adding edge: ${fromVertexId} -[${label}]-> ${toVertexId}`, { properties });
      const fromV = await this.g.V(fromVertexId).next();
      const toV = await this.g.V(toVertexId).next();

      if (!fromV.value || !toV.value) {
        throw new Error(`One or both vertices not found: fromVertexId=${fromVertexId}, toVertexId=${toVertexId}`);
      }

      let traversal = this.g.V(fromVertexId).addE(label).to(this.g.V(toVertexId));
      for (const key in properties) {
        traversal = traversal.property(key, properties[key]);
      }
      const edge = await traversal.next();
      return edge.value;
    } catch (error) {
      this.logger.error(`Failed to add edge: ${label}`, { error: getErrorMessage(error) });
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
