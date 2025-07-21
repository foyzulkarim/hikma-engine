import Database, { Database as DatabaseType } from 'better-sqlite3';
import { getLogger } from '../../utils/logger';
import {
  getErrorMessage,
  DatabaseConnectionError,
  DatabaseOperationError,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  CircuitBreaker,
} from '../../utils/error-handling';
import { UnitOfWork } from '../unit-of-work';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Modern SQLiteClient designed for phase-based indexing architecture
 */
export class SQLiteClient {
  private db: DatabaseType;
  private logger = getLogger('SQLiteClient');
  private isConnected = false;
  private vectorEnabled = false;
  private circuitBreaker = new CircuitBreaker(5, 60000);

  constructor(private dbPath: string) {
    this.logger.info(`Initializing SQLite client`, { path: dbPath });
    try {
      // Ensure the directory exists before creating the database
      const dbDir = path.dirname(path.resolve(this.dbPath));
      if (!fs.existsSync(dbDir)) {
        this.logger.info(`Creating database directory`, { directory: dbDir });
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      this.db = new Database(this.dbPath);
      this.logger.debug('SQLite database instance created successfully');
    } catch (error) {
      this.logger.error('Failed to create SQLite database instance', {
        error: getErrorMessage(error),
        path: this.dbPath,
      });
      throw new DatabaseConnectionError(
        'SQLite',
        `Failed to create database instance: ${getErrorMessage(error)}`,
        error,
      );
    }
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.debug('Already connected to SQLite');
      return;
    }

    try {
      await withRetry(
        async () => {
          this.logger.info('Connecting to SQLite');
          await this.testConnection();
          this.loadVectorExtension();
          this.isConnected = true;
          this.logger.info('Connected to SQLite successfully', {
            vectorEnabled: this.vectorEnabled,
          });
        },
        DEFAULT_RETRY_CONFIG,
        this.logger,
        'SQLite connection',
      );
    } catch (error) {
      this.logger.error('Failed to connect to SQLite after retries', {
        error: getErrorMessage(error),
        circuitBreakerState: this.circuitBreaker.getState(),
      });
      throw new DatabaseConnectionError(
        'SQLite',
        `Connection failed: ${getErrorMessage(error)}`,
        error,
      );
    }
  }

  public disconnect(): void {
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
      this.logger.error('Failed to disconnect from SQLite', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  public getDb(): DatabaseType {
    if (!this.isConnected) {
      throw new DatabaseConnectionError('SQLite', 'Not connected to SQLite. Call connect() first.');
    }
    return this.db;
  }

  public getUnitOfWork(): UnitOfWork {
    return new UnitOfWork(this.getDb());
  }

  // Convenience methods for common operations
  public run(sql: string, params?: any[]): any {
    const db = this.getDb();
    try {
      this.logger.debug(`Executing SQLite query`, { 
        sql: sql.substring(0, 100),
        paramCount: params?.length || 0
      });
      
      const stmt = db.prepare(sql);
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

  public prepare(sql: string): Database.Statement {
    const db = this.getDb();
    try {
      this.logger.debug(`Preparing SQLite statement`, { sql: sql.substring(0, 100) });
      const stmt = db.prepare(sql);
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

  public all(sql: string, params?: any[]): any[] {
    const db = this.getDb();
    this.logger.debug(`Executing SQLite SELECT query`, { sql: sql.substring(0, 100) });
    const stmt = db.prepare(sql);
    return params && params.length > 0 ? stmt.all(...params) : stmt.all();
  }

  public get(sql: string, params?: any[]): any {
    const db = this.getDb();
    this.logger.debug(`Executing SQLite GET query`, { sql: sql.substring(0, 100) });
    const stmt = db.prepare(sql);
    return params && params.length > 0 ? stmt.get(...params) : stmt.get();
  }

  public transaction<T>(fn: () => T): T {
    const db = this.getDb();
    const transaction = db.transaction(fn);
    try {
      const result = transaction();
      this.logger.debug('Transaction completed successfully');
      return result;
    } catch (error) {
      this.logger.error('Transaction failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  // Vector operations
  public async storeVector(table: string, column: string, recordId: string, embedding: number[]): Promise<void> {
    if (!this.vectorEnabled) {
      this.logger.warn('Vector operations not available, skipping embedding storage', { table, recordId });
      return;
    }

    try {
      const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
      const sql = `UPDATE ${table} SET ${column} = ? WHERE id = ?`;
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

  public async vectorSearch(
    table: string, 
    column: string, 
    queryEmbedding: number[], 
    limit: number = 10,
    threshold?: number
  ): Promise<Array<{id: string, similarity: number, data: any}>> {
    if (!this.vectorEnabled) {
      this.logger.warn('Vector operations not available, returning empty results', { table, column });
      return [];
    }

    try {
      const queryBlob = Buffer.from(new Float32Array(queryEmbedding).buffer);
      
      let sql = `
        SELECT id, 
               vec_distance_cosine(${column}, ?) as similarity,
               *
        FROM ${table} 
        WHERE ${column} IS NOT NULL
      `;
      
      const params: any[] = [queryBlob];
      
      if (threshold !== undefined) {
        const distanceThreshold = 1 - threshold;
        sql += ` AND vec_distance_cosine(${column}, ?) <= ?`;
        params.push(queryBlob, distanceThreshold);
      }
      
      sql += ` ORDER BY similarity ASC LIMIT ?`;
      params.push(limit);

      const results = this.all(sql, params);
      
      return results.map(row => ({
        id: row.id,
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

  // State management for phases
  public getLastIndexedCommit(): string | null {
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

  public setLastIndexedCommit(commitHash: string): void {
    try {
      this.run(
        `INSERT OR REPLACE INTO indexing_state (id, key, value, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [`last_indexed_commit`, 'last_indexed_commit', commitHash]
      );
      this.logger.debug('Set last indexed commit', { commitHash });
    } catch (error) {
      this.logger.error('Failed to set last indexed commit', { error: getErrorMessage(error) });
      throw error;
    }
  }

  // Connection status
  public isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  public get isVectorEnabled(): boolean {
    return this.vectorEnabled;
  }

  public async isVectorSearchAvailable(): Promise<boolean> {
    return this.vectorEnabled;
  }

  // Stats for monitoring
  public async getIndexingStats(): Promise<{
    totalFiles: number;
    totalCommits: number;
    lastIndexed: string | null;
  }> {
    try {
      const fileCount = (this.get('SELECT COUNT(*) as count FROM files') as { count: number } | undefined)?.count || 0;
      const commitCount = (this.get('SELECT COUNT(*) as count FROM commits') as { count: number } | undefined)?.count || 0;
      const lastIndexed = this.getLastIndexedCommit();

      return {
        totalFiles: fileCount,
        totalCommits: commitCount,
        lastIndexed,
      };
    } catch (error) {
      this.logger.error('Failed to get indexing stats', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async testConnection(): Promise<void> {
    try {
      this.db.prepare('SELECT 1').get();
      this.logger.debug('SQLite connection test successful');
    } catch (error) {
      this.logger.warn('SQLite connection test failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  private loadVectorExtension(): void {
    try {
      const extensionPath =
        process.env.HIKMA_SQLITE_VEC_EXTENSION || './extensions/vec0';
      this.db.loadExtension(extensionPath);
      this.db.prepare('SELECT vec_version()').get();
      this.vectorEnabled = true;
      this.logger.info('sqlite-vec extension loaded successfully', {
        extensionPath,
      });
    } catch (error) {
      this.vectorEnabled = false;
      const errorMsg = getErrorMessage(error);
      this.logger.warn(
        'Failed to load sqlite-vec extension, vector operations will be disabled',
        {
          error: errorMsg,
          extensionPath:
            process.env.HIKMA_SQLITE_VEC_EXTENSION || './extensions/vec0',
        },
      );
    }
  }
}
