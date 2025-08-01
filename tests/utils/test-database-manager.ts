/**
 * @file Test Database Manager - Handles test database lifecycle and operations
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export type TestEnvironment = 'unit' | 'integration' | 'e2e' | 'performance';

export interface DatabaseConfig {
  path: string;
  vectorExtension: string;
  inMemory: boolean;
  cleanup: boolean;
}

export interface TestData {
  repositories?: any[];
  files?: any[];
  nodes?: any[];
  edges?: any[];
  embeddings?: any[];
}

export class TestDatabaseManager {
  private environment: TestEnvironment;
  private databases: Map<string, Database.Database> = new Map();
  private tempPaths: string[] = [];
  private config: DatabaseConfig;

  constructor(environment: TestEnvironment) {
    this.environment = environment;
    this.config = this.getEnvironmentConfig();
  }

  private getEnvironmentConfig(): DatabaseConfig {
    const baseConfig = {
      vectorExtension: path.join(__dirname, '../../extensions/vec0.dylib'),
      cleanup: true,
    };

    switch (this.environment) {
      case 'unit':
        return {
          ...baseConfig,
          path: ':memory:',
          inMemory: true,
        };
      case 'integration':
        return {
          ...baseConfig,
          path: path.join(__dirname, '../temp', `integration-${uuidv4()}.db`),
          inMemory: false,
        };
      case 'e2e':
        return {
          ...baseConfig,
          path: path.join(__dirname, '../temp', `e2e-${uuidv4()}.db`),
          inMemory: false,
        };
      case 'performance':
        return {
          ...baseConfig,
          path: path.join(__dirname, '../temp', `performance-${uuidv4()}.db`),
          inMemory: false,
        };
      default:
        throw new Error(`Unknown test environment: ${this.environment}`);
    }
  }

  async initialize(): Promise<void> {
    // Ensure temp directory exists
    if (!this.config.inMemory) {
      const tempDir = path.dirname(this.config.path);
      await fs.mkdir(tempDir, { recursive: true });
    }
  }

  async createFreshDatabase(name: string = 'default'): Promise<Database.Database> {
    // Close existing database if it exists
    if (this.databases.has(name)) {
      this.databases.get(name)?.close();
      this.databases.delete(name);
    }

    // Create new database
    const dbPath = this.config.inMemory 
      ? ':memory:' 
      : `${this.config.path.replace('.db', '')}-${name}.db`;
    
    const db = new Database(dbPath);
    
    // Load vector extension if available
    try {
      if (!this.config.inMemory && await this.vectorExtensionExists()) {
        db.loadExtension(this.config.vectorExtension);
      }
    } catch (error) {
      console.warn('Vector extension not available for tests:', error);
    }

    // Initialize schema
    await this.initializeSchema(db);
    
    this.databases.set(name, db);
    
    if (!this.config.inMemory) {
      this.tempPaths.push(dbPath);
    }

    return db;
  }

  private async vectorExtensionExists(): Promise<boolean> {
    try {
      await fs.access(this.config.vectorExtension);
      return true;
    } catch {
      return false;
    }
  }

  private async initializeSchema(db: Database.Database): Promise<void> {
    // Create basic schema for tests
    const schema = `
      -- Repositories table
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Files table
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        extension TEXT,
        language TEXT,
        size INTEGER,
        hash TEXT,
        content TEXT,
        file_extension TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repository_id) REFERENCES repositories(id)
      );

      -- Graph nodes table
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        file_id TEXT,
        properties TEXT, -- JSON
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(id)
      );

      -- Graph edges table
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        properties TEXT, -- JSON
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES graph_nodes(id),
        FOREIGN KEY (target_id) REFERENCES graph_nodes(id)
      );

      -- Embedding nodes table (if vector extension is available)
      CREATE TABLE IF NOT EXISTS embedding_nodes (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        node_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        source_text TEXT NOT NULL,
        embedding BLOB,
        dimensions INTEGER,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (node_id) REFERENCES graph_nodes(id)
      );

      -- Phase status table
      CREATE TABLE IF NOT EXISTS phase_status (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        phase_name TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL DEFAULT 0.0,
        metadata TEXT, -- JSON
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repository_id) REFERENCES repositories(id)
      );

      -- Indexing state table
      CREATE TABLE IF NOT EXISTS indexing_state (
        id TEXT PRIMARY KEY,
        state_key TEXT NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Additional tables for stats
      CREATE TABLE IF NOT EXISTS code_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        signature TEXT,
        language TEXT,
        file_path TEXT,
        start_line INTEGER,
        end_line INTEGER,
        source_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commits (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        message TEXT,
        author TEXT,
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pull_requests (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS functions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        signature_embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_files_repository_id ON files(repository_id);
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_graph_nodes_file_id ON graph_nodes(file_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_source_id ON graph_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_target_id ON graph_edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_embedding_nodes_node_id ON embedding_nodes(node_id);
      CREATE INDEX IF NOT EXISTS idx_indexing_state_key ON indexing_state(state_key);
      CREATE INDEX IF NOT EXISTS idx_phase_status_repository_id ON phase_status(repository_id);
    `;

    db.exec(schema);
  }

  async seedDatabase(data: TestData, dbName: string = 'default'): Promise<void> {
    const db = this.databases.get(dbName);
    if (!db) {
      throw new Error(`Database ${dbName} not found`);
    }

    // Seed repositories
    if (data.repositories) {
      const insertRepo = db.prepare(`
        INSERT INTO repositories (id, name, path, url)
        VALUES (?, ?, ?, ?)
      `);
      
      for (const repo of data.repositories) {
        insertRepo.run(repo.id, repo.name, repo.path, repo.url);
      }
    }

    // Seed files
    if (data.files) {
      const insertFile = db.prepare(`
        INSERT INTO files (id, repository_id, path, name, extension, size, hash, content)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const file of data.files) {
        insertFile.run(
          file.id, file.repository_id, file.path, file.name,
          file.extension, file.size, file.hash, file.content
        );
      }
    }

    // Seed nodes
    if (data.nodes) {
      const insertNode = db.prepare(`
        INSERT INTO graph_nodes (id, type, name, file_id, properties)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const node of data.nodes) {
        insertNode.run(
          node.id, node.type, node.name, node.file_id,
          JSON.stringify(node.properties || {})
        );
      }
    }

    // Seed edges
    if (data.edges) {
      const insertEdge = db.prepare(`
        INSERT INTO graph_edges (id, source_id, target_id, type, properties)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const edge of data.edges) {
        insertEdge.run(
          edge.id, edge.source_id, edge.target_id, edge.type,
          JSON.stringify(edge.properties || {})
        );
      }
    }

    // Seed embeddings
    if (data.embeddings) {
      const insertEmbedding = db.prepare(`
        INSERT INTO embedding_nodes (id, node_id, embedding, dimensions, model)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const embedding of data.embeddings) {
        const embeddingBlob = Buffer.from(new Float32Array(embedding.vector).buffer);
        insertEmbedding.run(
          embedding.id, embedding.node_id, embeddingBlob,
          embedding.dimensions, embedding.model
        );
      }
    }
  }

  getDatabase(name: string = 'default'): Database.Database | undefined {
    return this.databases.get(name);
  }

  getDatabasePath(name: string = 'default'): string {
    if (this.config.inMemory) {
      return ':memory:';
    }
    return name === 'default' ? this.config.path : `${this.config.path.replace('.db', '')}-${name}.db`;
  }

  async cleanup(): Promise<void> {
    // Close and recreate databases for complete cleanup
    for (const [name, db] of this.databases) {
      try {
        db.close();
      } catch (error) {
        console.warn(`Error closing database ${name}:`, error);
      }
    }
    this.databases.clear();
  }

  async destroy(): Promise<void> {
    // Close all databases
    for (const [name, db] of this.databases) {
      try {
        db.close();
      } catch (error) {
        console.warn(`Error closing database ${name}:`, error);
      }
    }
    this.databases.clear();

    // Remove temporary database files
    if (this.config.cleanup && !this.config.inMemory) {
      for (const dbPath of this.tempPaths) {
        try {
          await fs.unlink(dbPath);
        } catch (error) {
          // Ignore errors when removing temp files
        }
      }
    }
    this.tempPaths = [];
  }

  async createSnapshot(dbName: string = 'default'): Promise<string> {
    const db = this.databases.get(dbName);
    if (!db || this.config.inMemory) {
      throw new Error('Snapshots not supported for in-memory databases');
    }

    const snapshotId = uuidv4();
    const snapshotPath = `${this.config.path.replace('.db', '')}-snapshot-${snapshotId}.db`;
    
    // Create backup by copying the database file
    const currentPath = this.getDatabasePath(dbName);
    await fs.copyFile(currentPath, snapshotPath);

    this.tempPaths.push(snapshotPath);
    return snapshotId;
  }

  async restoreSnapshot(snapshotId: string, dbName: string = 'default'): Promise<void> {
    const snapshotPath = `${this.config.path.replace('.db', '')}-snapshot-${snapshotId}.db`;
    
    // Close current database
    const currentDb = this.databases.get(dbName);
    if (currentDb) {
      currentDb.close();
    }

    // Copy snapshot to current database path
    const currentPath = this.getDatabasePath(dbName);
    await fs.copyFile(snapshotPath, currentPath);

    // Reopen database
    const db = new Database(currentPath);
    this.databases.set(dbName, db);
  }
}
