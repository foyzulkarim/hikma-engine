# Design Document

## Overview

This design replaces LanceDB with SQLite-vec to achieve complete database unification in the hikma-engine codebase. The solution consolidates metadata, graph relationships, and vector embeddings into a single SQLite database using the sqlite-vec extension, eliminating the need for separate vector database infrastructure while maintaining all semantic search capabilities through SQL-based vector operations.

## Architecture

The unified architecture consolidates to a single-database system:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  (Core Indexer - orchestrates the pipeline)               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Processing Layer                          │
│  (File Scanner, AST Parser, Git Analyzer, etc.)           │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Persistence Layer                          │
│  (Data Loader + SQLite Client)                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Database Layer                            │
│  SQLite (RDBMS + GraphDB + VectorDB with sqlite-vec)      │
└─────────────────────────────────────────────────────────────┘
```

**Key Changes:**
- Remove LanceDB client and all vector database dependencies
- Extend SQLite schema with vector columns using BLOB storage
- Consolidate all search operations into unified SQL queries
- Simplify database connection management to single database
- Update health checks to monitor only SQLite

## Components and Interfaces

### 1. LanceDB Removal

**Files to Modify:**
- `src/persistence/db-clients.ts` - Remove LanceDBClient class
- `src/modules/data-loader.ts` - Remove LanceDB initialization and operations
- `src/modules/search-service.ts` - Remove LanceDB search operations
- `src/config/index.ts` - Remove LanceDB configuration
- `package.json` - Remove @lancedb/lancedb dependency

**LanceDBClient Removal:**
```typescript
// REMOVE: Entire LanceDBClient class (~200 lines)
export class LanceDBClient {
  // All methods and properties to be removed
}

// REMOVE: LanceDB-related imports
// import * as lancedb from '@lancedb/lancedb';
```

### 2. SQLite Vector Extension Integration

**SQLite Schema Extension:**
```sql
-- Add vector columns to existing tables
ALTER TABLE files ADD COLUMN embedding BLOB;
ALTER TABLE code_nodes ADD COLUMN embedding BLOB;
ALTER TABLE commits ADD COLUMN embedding BLOB;
ALTER TABLE directories ADD COLUMN embedding BLOB;
ALTER TABLE test_nodes ADD COLUMN embedding BLOB;
ALTER TABLE pull_requests ADD COLUMN embedding BLOB;

-- Create vector indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_embedding ON files(embedding);
CREATE INDEX IF NOT EXISTS idx_code_nodes_embedding ON code_nodes(embedding);
CREATE INDEX IF NOT EXISTS idx_commits_embedding ON commits(embedding);

-- Vector metadata table
CREATE TABLE IF NOT EXISTS vector_metadata (
  table_name TEXT PRIMARY KEY,
  dimension INTEGER NOT NULL,
  distance_metric TEXT DEFAULT 'cosine',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**SQLite Vector Operations:**
```typescript
export class SQLiteClient {
  private vectorEnabled = false;

  async connect(): Promise<void> {
    // Existing connection logic...
    
    // Load sqlite-vec extension
    try {
      this.db.loadExtension('vec0');
      this.vectorEnabled = true;
      this.logger.info('SQLite-vec extension loaded');
    } catch (error) {
      this.logger.warn('SQLite-vec extension not available');
    }
  }

  storeVector(tableName: string, id: string, embedding: number[]): void {
    if (!this.vectorEnabled || !embedding?.length) return;
    
    const vectorBlob = Buffer.from(new Float32Array(embedding).buffer);
    const sql = `UPDATE ${tableName} SET embedding = ? WHERE id = ?`;
    this.run(sql, [vectorBlob, id]);
  }

  vectorSearch(
    tableName: string,
    queryVector: number[],
    limit: number = 10,
    threshold: number = 0.8,
    whereClause?: string,
    whereParams?: any[]
  ): Array<{id: string, similarity: number, data: any}> {
    if (!this.vectorEnabled) return [];

    const queryBlob = Buffer.from(new Float32Array(queryVector).buffer);
    
    let sql = `
      SELECT *, (1 - vec_distance_cosine(embedding, ?)) as similarity
      FROM ${tableName} 
      WHERE embedding IS NOT NULL
    `;
    
    const params = [queryBlob];
    
    if (whereClause) {
      sql += ` AND ${whereClause}`;
      if (whereParams) params.push(...whereParams);
    }
    
    sql += ` ORDER BY similarity DESC LIMIT ?`;
    params.push(limit);

    const results = this.all(sql, params);
    
    return results
      .filter((row: any) => row.similarity >= threshold)
      .map((row: any) => ({
        id: row.id,
        similarity: row.similarity,
        data: row
      }));
  }
}
```

### 3. Data Loader Unification

**Simplified Data Loader Architecture:**
```typescript
export class DataLoader {
  private sqliteClient: SQLiteClient;
  // REMOVE: private lancedbClient: LanceDBClient;

  constructor(lancedbPath: string, sqlitePath: string, config: ConfigManager) {
    // REMOVE: LanceDB initialization
    this.sqliteClient = new SQLiteClient(sqlitePath);
    this.config = config;
  }

  private async connectToDatabases(): Promise<{ sqlite: boolean }> {
    const connectionStatus = { sqlite: false };

    try {
      await this.sqliteClient.connect();
      connectionStatus.sqlite = true;
    } catch (error) {
      this.logger.warn('SQLite connection failed', { error });
    }

    return connectionStatus;
  }

  // REMOVE: batchLoadToVectorDB method entirely

  private async batchLoadToSQLiteWithVectors(
    nodes: NodeWithEmbedding[], 
    edges: Edge[]
  ): Promise<void> {
    this.sqliteClient.transaction(() => {
      // Load metadata using existing batch methods
      this.batchLoadMetadata(nodes, edges);
      
      // Store vectors in same transaction
      for (const node of nodes) {
        if (node.embedding?.length > 0) {
          const tableName = this.getTableNameForNodeType(node.type);
          this.sqliteClient.storeVector(tableName, node.id, node.embedding);
        }
      }
    });
  }

  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<{
    success: boolean;
    results: { sqlite: { success: boolean; error?: string } };
  }> {
    const results = { sqlite: { success: false } };

    try {
      const connectionStatus = await this.connectToDatabases();
      
      if (!connectionStatus.sqlite) {
        throw new Error('Failed to connect to SQLite');
      }

      await this.batchLoadToSQLiteWithVectors(nodes, edges);
      results.sqlite.success = true;

      return { success: true, results };
    } catch (error) {
      this.logger.error('Data loading failed', { error });
      throw error;
    } finally {
      this.sqliteClient.disconnect();
    }
  }
}
```

### 4. Search Service Unification

**Unified Search Operations:**
```typescript
export class SearchService {
  private sqliteClient: SQLiteClient;
  // REMOVE: private lancedbClient: LanceDBClient;

  constructor(config: ConfigManager) {
    this.config = config;
    const dbConfig = config.getDatabaseConfig();
    
    this.embeddingService = new EmbeddingService(config);
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
    // REMOVE: LanceDB client initialization
  }

  async semanticSearch(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, nodeTypes, minSimilarity = 0.1 } = options;
    
    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embedQuery(query);
    
    const allResults: SearchResult[] = [];
    const nodeTypesToSearch = nodeTypes || [
      'CodeNode', 'FileNode', 'DirectoryNode', 'CommitNode', 'TestNode', 'PullRequestNode'
    ];

    // Search each table using SQLite vector search
    for (const nodeType of nodeTypesToSearch) {
      const tableName = this.getTableNameForNodeType(nodeType);
      
      const results = this.sqliteClient.vectorSearch(
        tableName,
        queryEmbedding,
        Math.ceil(limit * 1.5),
        minSimilarity
      );

      const searchResults = results.map(result => ({
        node: this.convertRowToNode(result.data, nodeType),
        similarity: result.similarity,
        rank: 0
      }));

      allResults.push(...searchResults);
    }

    return allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((result, index) => ({ ...result, rank: index + 1 }));
  }

  async hybridSearch(
    query: string,
    filters: MetadataFilters = {},
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const queryEmbedding = await this.embeddingService.embedQuery(query);
    const { limit = 10, minSimilarity = 0.1 } = options;
    
    const allResults: SearchResult[] = [];
    const { whereClause, params } = this.buildMetadataWhereClause(filters);

    // Unified search with vector + metadata filtering in single SQL
    const tables = [
      { name: 'files', type: 'FileNode' },
      { name: 'code_nodes', type: 'CodeNode' },
      { name: 'commits', type: 'CommitNode' }
    ];
    
    for (const table of tables) {
      const results = this.sqliteClient.vectorSearch(
        table.name,
        queryEmbedding,
        limit * 2,
        minSimilarity,
        whereClause,
        params
      );

      const searchResults = results.map(result => ({
        node: this.convertRowToNode(result.data, table.type as NodeType),
        similarity: result.similarity,
        rank: 0
      }));

      allResults.push(...searchResults);
    }

    // Sort and enhance results
    const sortedResults = allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return Promise.all(
      sortedResults.map(async (result, index) => {
        const metadata = await this.getNodeMetadata(result.node.id, result.node.type);
        return { ...result, rank: index + 1, metadata };
      })
    );
  }
}
```

### 5. Configuration System Updates

**Unified Configuration:**
```typescript
interface DatabaseConfig {
  sqlite: { 
    path: string;
    vectorExtension?: string;
  };
  // REMOVE: lancedb: { path: string };
}

const defaultConfig = {
  database: {
    sqlite: { 
      path: './data/metadata.db',
      vectorExtension: './extensions/vec0.so'
    }
    // REMOVE: lancedb configuration
  }
};

// Environment variable handling
getDatabaseConfig(): DatabaseConfig {
  return {
    sqlite: {
      path: process.env.HIKMA_SQLITE_PATH || './data/metadata.db',
      vectorExtension: process.env.HIKMA_SQLITE_VEC_EXTENSION || './extensions/vec0.so'
    }
    // REMOVE: LanceDB environment variables
  };
}
```

### 6. Health Check Service Updates

**Simplified Health Checks:**
```typescript
async getSystemHealth(): Promise<HealthCheckResult> {
  const checks: Record<string, HealthStatus> = {};

  // Only SQLite health check needed
  const sqliteCheck = await this.checkSQLite();
  checks.sqlite = {
    status: sqliteCheck.connected ? 'healthy' : 'unhealthy',
    details: {
      connected: sqliteCheck.connected,
      vectorEnabled: sqliteCheck.vectorEnabled,
      responseTime: sqliteCheck.responseTime
    }
  };

  // REMOVE: LanceDB health check
  // REMOVE: const lancedbCheck = await this.checkLanceDB();

  return { 
    checks, 
    overall: this.calculateOverallHealth(checks) 
  };
}

private async checkSQLite(): Promise<{
  connected: boolean;
  vectorEnabled: boolean;
  responseTime: number;
}> {
  const startTime = Date.now();
  
  try {
    // Test basic SQLite connection
    const testResult = this.sqliteClient.get('SELECT 1 as test');
    
    // Test vector extension
    let vectorEnabled = false;
    try {
      this.sqliteClient.get('SELECT vec_version()');
      vectorEnabled = true;
    } catch (error) {
      // Vector extension not available
    }
    
    return {
      connected: testResult?.test === 1,
      vectorEnabled,
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      connected: false,
      vectorEnabled: false,
      responseTime: Date.now() - startTime
    };
  }
}
```

## Data Models

### Vector Storage Schema

**Vector Column Integration:**
```sql
-- Files table with vector column
CREATE TABLE files (
  file_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  -- ... existing columns ...
  embedding BLOB,  -- Vector storage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Code nodes table with vector column
CREATE TABLE code_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  signature TEXT,
  -- ... existing columns ...
  embedding BLOB,  -- Vector storage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Vector Operations Schema:**
```sql
-- Vector similarity search with metadata filtering
SELECT 
  cn.*,
  (1 - vec_distance_cosine(cn.embedding, ?)) as similarity
FROM code_nodes cn
WHERE cn.embedding IS NOT NULL
  AND cn.language = ?
  AND cn.file_path LIKE ?
ORDER BY similarity DESC
LIMIT ?;

-- Hybrid search across multiple tables
SELECT 
  'CodeNode' as node_type,
  id,
  name,
  file_path,
  (1 - vec_distance_cosine(embedding, ?)) as similarity
FROM code_nodes
WHERE embedding IS NOT NULL
UNION ALL
SELECT 
  'FileNode' as node_type,
  file_id as id,
  file_name as name,
  file_path,
  (1 - vec_distance_cosine(embedding, ?)) as similarity
FROM files
WHERE embedding IS NOT NULL
ORDER BY similarity DESC
LIMIT ?;
```

### Unified Data Flow

**Single Database Flow:**
1. **Indexing**: Files → AST Parser → Embeddings → SQLite (metadata + vectors)
2. **Search**: Query → Embedding → SQLite vector search → Results
3. **Hybrid**: Query + Filters → SQLite unified query → Enhanced results

**Node Processing with Vectors:**
```typescript
interface NodeWithEmbedding extends BaseNode {
  embedding: number[];
}

// Storage flow
const processNode = async (node: NodeWithEmbedding) => {
  // Store metadata in regular columns
  await sqliteClient.insertNode(node);
  
  // Store vector in BLOB column (same transaction)
  await sqliteClient.storeVector(tableName, node.id, node.embedding);
};
```

## Error Handling

### Graceful Vector Degradation

**Vector Extension Fallback:**
```typescript
class SQLiteClient {
  private vectorEnabled = false;

  async connect(): Promise<void> {
    // Always connect to SQLite
    await this.connectToSQLite();
    
    // Try to load vector extension
    try {
      this.db.loadExtension('vec0');
      this.vectorEnabled = true;
      this.logger.info('Vector search enabled');
    } catch (error) {
      this.logger.warn('Vector search disabled, falling back to text search');
    }
  }

  vectorSearch(...args): SearchResult[] {
    if (!this.vectorEnabled) {
      this.logger.debug('Vector search unavailable, using text fallback');
      return this.textSearch(...args);
    }
    
    try {
      return this.performVectorSearch(...args);
    } catch (error) {
      this.logger.warn('Vector search failed, falling back to text search');
      return this.textSearch(...args);
    }
  }
}
```

### Unified Error Handling

**Single Database Error Management:**
```typescript
// Simplified error handling for single database
try {
  await this.sqliteClient.connect();
  await this.loadDataWithVectors(nodes, edges);
} catch (error) {
  this.logger.error('Database operation failed', { error });
  throw new DatabaseOperationError('SQLite', 'Unified operation failed', error);
}
```

## Testing Strategy

### Unit Testing Updates

**Remove LanceDB Tests:**
- Remove all LanceDBClient unit tests
- Remove LanceDB connection tests
- Remove LanceDB search operation tests

**Add SQLite Vector Tests:**
```typescript
describe('SQLiteClient Vector Operations', () => {
  it('should store and retrieve vectors', async () => {
    const embedding = Array.from({length: 384}, () => Math.random());
    await sqliteClient.storeVector('code_nodes', 'test-id', embedding);
    
    const results = await sqliteClient.vectorSearch('code_nodes', embedding, 1);
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBeGreaterThan(0.9);
  });

  it('should perform hybrid search with metadata filtering', async () => {
    const results = await sqliteClient.vectorSearch(
      'code_nodes',
      queryEmbedding,
      10,
      0.5,
      'language = ?',
      ['typescript']
    );
    
    expect(results.every(r => r.data.language === 'typescript')).toBe(true);
  });
});
```

### Integration Testing Updates

**Unified Integration Tests:**
```typescript
describe('Unified Database Integration', () => {
  it('should load all data types to single SQLite database', async () => {
    const result = await dataLoader.load(nodes, edges);
    
    expect(result.success).toBe(true);
    expect(result.results.sqlite.success).toBe(true);
    // REMOVE: LanceDB assertions
  });

  it('should perform semantic search using SQLite vectors', async () => {
    const results = await searchService.semanticSearch('authentication function');
    
    expect(results).toHaveLength(10);
    expect(results[0].similarity).toBeGreaterThan(0.1);
  });

  it('should perform hybrid search with unified queries', async () => {
    const results = await searchService.hybridSearch(
      'database connection',
      { language: 'typescript' }
    );
    
    expect(results.every(r => r.metadata?.language === 'typescript')).toBe(true);
  });
});
```

### Performance Testing

**SQLite Vector Performance:**
- Test vector search performance vs LanceDB baseline
- Test hybrid query performance with unified SQL
- Test concurrent search operations
- Optimize SQLite vector indexes

## Implementation Phases

### Phase 1: SQLite Vector Extension Setup
1. Add sqlite-vec dependency to package.json
2. Extend SQLite schema with vector columns
3. Add vector extension loading to SQLiteClient
4. Implement basic vector storage and search methods

### Phase 2: Remove LanceDB Dependencies
1. Remove LanceDBClient class from db-clients.ts
2. Remove @lancedb/lancedb from package.json
3. Remove LanceDB configuration from config system
4. Update Docker configuration to remove LanceDB requirements

### Phase 3: Update Data Loader
1. Remove LanceDB initialization from DataLoader
2. Update load method to store vectors in SQLite
3. Simplify connection management to single database
4. Update batch operations to include vector storage

### Phase 4: Update Search Service
1. Remove LanceDB search operations
2. Implement SQLite vector search methods
3. Update semantic search to use SQLite vectors
4. Enhance hybrid search with unified SQL queries

### Phase 5: Testing and Validation
1. Update unit tests to remove LanceDB tests
2. Add comprehensive SQLite vector tests
3. Update integration tests for unified architecture
4. Performance testing and optimization

### Phase 6: Documentation and Deployment
1. Update configuration documentation
2. Update API documentation
3. Update Docker and deployment configurations
4. Update user documentation for simplified architecture
