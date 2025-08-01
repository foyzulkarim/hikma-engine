/**
 * @file MockSQLiteClient - Mock implementation of SQLiteClient for testing
 */

import { jest } from '@jest/globals';
import Database from 'better-sqlite3';

export interface MockSQLiteClientOptions {
  shouldFailConnection?: boolean;
  shouldFailQueries?: boolean;
  vectorEnabled?: boolean;
  mockData?: Record<string, any[]>;
}

export class MockSQLiteClient {
  private connected = false;
  private vectorEnabled: boolean;
  private mockData: Record<string, any[]>;
  private shouldFailConnection: boolean;
  private shouldFailQueries: boolean;
  private transactionActive = false;

  // Public properties
  public isVectorEnabled: boolean;

  // Mock methods
  public connect = jest.fn();
  public disconnect = jest.fn();
  public getDb = jest.fn();
  public getUnitOfWork = jest.fn();
  public run = jest.fn();
  public prepare = jest.fn();
  public all = jest.fn();
  public get = jest.fn();
  public transaction = jest.fn();
  public storeVector = jest.fn();
  public vectorSearch = jest.fn();
  public getLastIndexedCommit = jest.fn();
  public setLastIndexedCommit = jest.fn();
  public isConnectedToDatabase = jest.fn();
  public isVectorSearchAvailable = jest.fn();
  public getIndexingStats = jest.fn();

  constructor(dbPath: string, options: MockSQLiteClientOptions = {}) {
    this.vectorEnabled = options.vectorEnabled ?? true;
    this.isVectorEnabled = this.vectorEnabled;
    this.mockData = options.mockData ?? {};
    this.shouldFailConnection = options.shouldFailConnection ?? false;
    this.shouldFailQueries = options.shouldFailQueries ?? false;

    this.setupMockImplementations();
  }

  private setupMockImplementations(): void {
    // Connection management
    this.connect.mockImplementation(async () => {
      if (this.shouldFailConnection) {
        throw new Error('Mock connection failure');
      }
      this.connected = true;
    });

    this.disconnect.mockImplementation(() => {
      this.connected = false;
    });

    this.isConnectedToDatabase.mockImplementation(() => this.connected);

    // Database operations
    this.getDb.mockImplementation(() => {
      if (!this.connected) {
        throw new Error('Not connected to database');
      }
      return this.createMockDatabase();
    });

    this.run.mockImplementation(((sql: string, params?: any[]) => {
      if (this.shouldFailQueries) {
        throw new Error('Mock query failure');
      }
      
      // Simulate INSERT/UPDATE/DELETE operations
      const changes = sql.toLowerCase().includes('insert') || 
                     sql.toLowerCase().includes('update') || 
                     sql.toLowerCase().includes('delete') ? 1 : 0;
      
      return {
        changes,
        lastInsertRowid: changes > 0 ? Math.floor(Math.random() * 1000) + 1 : undefined
      };
    }) as any);

    this.prepare.mockImplementation(((sql: string) => {
      return this.createMockStatement(sql);
    }) as any);

    this.all.mockImplementation(((sql: string, params?: any[]) => {
      if (this.shouldFailQueries) {
        throw new Error('Mock query failure');
      }
      
      // Extract table name from SQL for mock data lookup
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : 'unknown';
      
      return this.mockData[tableName] || [];
    }) as any);

    this.get.mockImplementation(((sql: string, params?: any[]) => {
      const results = this.all(sql, params) as any[];
      return results.length > 0 ? results[0] : null;
    }) as any);

    this.transaction.mockImplementation(((<T>(fn: () => T): T => {
      if (this.shouldFailQueries) {
        throw new Error('Mock transaction failure');
      }
      
      this.transactionActive = true;
      try {
        const result = fn();
        this.transactionActive = false;
        return result;
      } catch (error) {
        this.transactionActive = false;
        throw error;
      }
    }) as any));

    // Vector operations
    this.storeVector.mockImplementation((async (table: string, column: string, recordId: string, embedding: number[]) => {
      if (!this.vectorEnabled) {
        return;
      }
      // Simulate storing vector embedding
    }) as any);

    this.vectorSearch.mockImplementation((async (
      table: string, 
      column: string, 
      queryEmbedding: number[], 
      limit: number = 10,
      threshold?: number
    ) => {
      if (!this.vectorEnabled) {
        return [];
      }
      
      // Return mock search results
      const mockResults = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
        id: `mock-result-${i + 1}`,
        similarity: 0.9 - (i * 0.1),
        data: {
          id: `mock-result-${i + 1}`,
          name: `Mock Result ${i + 1}`,
          type: 'test'
        }
      }));
      
      return threshold ? mockResults.filter(r => r.similarity >= threshold) : mockResults;
    }) as any);

    this.isVectorSearchAvailable.mockImplementation(async () => this.vectorEnabled);

    // State management
    this.getLastIndexedCommit.mockImplementation(() => {
      return this.mockData.indexing_state?.find(s => s.key === 'last_indexed_commit')?.value || null;
    });

    this.setLastIndexedCommit.mockImplementation(((commitHash: string) => {
      if (!this.mockData.indexing_state) {
        this.mockData.indexing_state = [];
      }
      
      const existing = this.mockData.indexing_state.find(s => s.key === 'last_indexed_commit');
      if (existing) {
        existing.value = commitHash;
      } else {
        this.mockData.indexing_state.push({
          id: 'last_indexed_commit',
          key: 'last_indexed_commit',
          value: commitHash,
          updated_at: new Date().toISOString()
        });
      }
    }) as any);

    // Stats
    this.getIndexingStats.mockImplementation(async () => {
      return {
        totalFiles: this.mockData.files?.length || 0,
        totalCommits: this.mockData.commits?.length || 0,
        lastIndexed: this.getLastIndexedCommit()
      };
    });

    // Unit of work
    this.getUnitOfWork.mockImplementation(() => {
      return {
        begin: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        isActive: jest.fn().mockReturnValue(this.transactionActive)
      };
    });
  }

  private createMockDatabase(): Partial<Database.Database> {
    return {
      prepare: this.prepare,
      exec: jest.fn(),
      close: jest.fn(),
      pragma: jest.fn(),
      loadExtension: jest.fn()
    } as any;
  }

  private createMockStatement(sql: string): Partial<Database.Statement> {
    return {
      run: jest.fn().mockImplementation((...params: any[]) => {
        if (this.shouldFailQueries) {
          throw new Error('Mock statement execution failure');
        }
        return {
          changes: 1,
          lastInsertRowid: Math.floor(Math.random() * 1000) + 1
        };
      }),
      get: jest.fn().mockImplementation((...params: any[]) => {
        if (this.shouldFailQueries) {
          throw new Error('Mock statement execution failure');
        }
        
        // Extract table name for mock data lookup
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        const results = this.mockData[tableName] || [];
        
        return results.length > 0 ? results[0] : null;
      }),
      all: jest.fn().mockImplementation((...params: any[]) => {
        if (this.shouldFailQueries) {
          throw new Error('Mock statement execution failure');
        }
        
        // Extract table name for mock data lookup
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        
        return this.mockData[tableName] || [];
      })
    } as any;
  }

  // Helper methods for testing
  public setMockData(tableName: string, data: any[]): void {
    this.mockData[tableName] = data;
  }

  public getMockData(tableName: string): any[] {
    return this.mockData[tableName] || [];
  }

  public simulateConnectionFailure(shouldFail: boolean = true): void {
    this.shouldFailConnection = shouldFail;
  }

  public simulateQueryFailure(shouldFail: boolean = true): void {
    this.shouldFailQueries = shouldFail;
  }

  public enableVectorOperations(enabled: boolean = true): void {
    this.vectorEnabled = enabled;
    this.isVectorEnabled = enabled;
  }

  public isTransactionActive(): boolean {
    return this.transactionActive;
  }

  public resetMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockReset();
      }
    });
    this.setupMockImplementations();
  }

  public clearMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockClear();
      }
    });
  }
}
