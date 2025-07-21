import Database, { Database as DatabaseType } from 'better-sqlite3';
import { getLogger } from '../../utils/logger';
import {
  getErrorMessage,
  DatabaseConnectionError,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  CircuitBreaker,
} from '../../utils/error-handling';
import { UnitOfWork } from '../unit-of-work';

export class SQLiteClient {
  private db: DatabaseType;
  private logger = getLogger('SQLiteClient');
  private isConnected = false;
  private vectorEnabled = false;
  private circuitBreaker = new CircuitBreaker(5, 60000);

  constructor(private path: string) {
    this.logger.info(`Initializing SQLite client`, { path });
    try {
      this.db = new Database(path);
      this.logger.debug('SQLite database instance created successfully');
    } catch (error) {
      this.logger.error('Failed to create SQLite database instance', {
        error: getErrorMessage(error),
        path,
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
    return this.db;
  }

  public getUnitOfWork(): UnitOfWork {
    return new UnitOfWork(this.db);
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
