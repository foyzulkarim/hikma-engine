# Unified Database Architecture

## Overview

The Hikma Engine implements a novel unified database architecture that consolidates three different data paradigms—relational, graph, and vector data—into a single SQLite database file. This approach provides the benefits of ACID transactions, simplified deployment, and unified querying while supporting complex data relationships and semantic search capabilities.

## Architecture Principles

### Single Database, Multiple Paradigms

The unified architecture stores three distinct types of data in one SQLite database:

1. **Relational Data**: Traditional structured data in normalized tables
2. **Graph Data**: Node and edge relationships for code structure analysis
3. **Vector Data**: High-dimensional embeddings for semantic search

### Key Benefits

- **ACID Compliance**: All operations benefit from SQLite's transaction guarantees
- **Simplified Deployment**: Single file database with no external dependencies
- **Unified Queries**: Cross-paradigm queries using standard SQL
- **Performance**: Optimized indexes for each data access pattern
- **Consistency**: Foreign key constraints maintain referential integrity

## Data Storage Patterns

### 1. Relational Data (RDBMS)

Standard SQL tables store structured application data with proper normalization and constraints.

#### Core Tables

**Repositories Table**
```sql
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    repo_path TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Files Table**
```sql
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_extension TEXT,
    language TEXT,
    size_kb REAL,
    content_hash TEXT,
    file_type TEXT CHECK (file_type IN ('source', 'test', 'config', 'dev', 'vendor')),
    ai_summary TEXT,
    imports TEXT, -- JSON array
    exports TEXT, -- JSON array
    content_embedding BLOB, -- Vector embedding
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
```

#### Indexing Strategy
```sql
-- Repository indexes
CREATE INDEX IF NOT EXISTS idx_repositories_path ON repositories(repo_path);
CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(repo_name);

-- File indexes
CREATE INDEX IF NOT EXISTS idx_files_repo_id ON files(repo_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(file_path);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash);
```

### 2. Graph Data

Graph relationships are stored in two dedicated tables optimized for traversal operations.

#### Graph Nodes Table
```sql
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    business_key TEXT NOT NULL,
    node_type TEXT NOT NULL,
    properties TEXT NOT NULL, -- JSON object
    repo_id TEXT,
    commit_sha TEXT,
    file_path TEXT,
    line INTEGER,
    col INTEGER,
    signature_hash TEXT,
    labels TEXT, -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Graph Edges Table
```sql
CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    source_business_key TEXT NOT NULL,
    target_business_key TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    properties TEXT, -- JSON object
    line INTEGER,
    col INTEGER,
    dynamic BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Graph Traversal Optimization
```sql
-- Optimized indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_graph_nodes_repo_type ON graph_nodes(repo_id, node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_file_path ON graph_nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_business_key ON graph_nodes(business_key);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_signature ON graph_nodes(signature_hash);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source_target ON graph_edges(source_id, target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_edge_type ON graph_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source_business_key ON graph_edges(source_business_key);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target_business_key ON graph_edges(target_business_key);
```

### 3. Vector Data

High-dimensional embeddings are stored as BLOBs with specialized functions for similarity calculations.

#### Embedding Nodes Table
```sql
CREATE TABLE IF NOT EXISTS embedding_nodes (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    embedding TEXT NOT NULL, -- Stored as BLOB in practice
    source_text TEXT,
    node_type TEXT,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_embedding_nodes_node_id ON embedding_nodes(node_id);
```

#### Vector Storage Format

Embeddings are stored as binary BLOBs using Float32Array format:

```typescript
// Store vector
const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

// Retrieve and convert back
const floatArray = new Float32Array(embeddingBlob.buffer);
const embedding = Array.from(floatArray);
```

## Custom SQLite Extension

### vec0.dylib Integration

The system uses a custom SQLite extension (`vec0.dylib`) that provides vector similarity functions:

- **vec_distance_cosine(vector1, vector2)**: Calculates cosine distance between two vectors
- Optimized for high-dimensional embeddings
- Returns distance values (lower = more similar)

### Vector Search Implementation

```typescript
export async function vectorSearch(
  client: SQLiteClient,
  table: string,
  column: string,
  queryEmbedding: number[],
  limit: number = 10,
  threshold?: number,
): Promise<Array<{ id: string; similarity: number; data: any }>> {
  const db = client.getDb();
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

  const results = db.prepare(sql).all(...params);
  return results.map((row: any) => ({
    id: row.id,
    similarity: 1 - row.similarity, // Convert distance to similarity
    data: row,
  }));
}
```

## Schema Generation System

### Dynamic Schema Creation

The system uses a dynamic schema generation approach that creates tables from model definitions:

```typescript
// src/persistence/utils/schema-generator.ts
export function generateCreateTableCommand<T extends BaseDTO>(
  model: BaseModel<T>
): string {
  const tableName = model.getTableName();
  const schema = model.getSchema();
  
  const columns: string[] = [];
  const constraints: string[] = [];
  
  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith('FOREIGN KEY') || key.startsWith('UNIQUE') || key.startsWith('CHECK')) {
      constraints.push(`${key} ${value}`);
    } else {
      columns.push(`${key} ${value}`);
    }
  }
  
  const allDefinitions = [...columns, ...constraints];
  
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
    ${allDefinitions.join(',\n    ')}
  )`;
}
```

### Model-Driven Architecture

Each data model extends `BaseModel` and defines its schema:

```typescript
export class FileModel extends BaseModel<FileDTO> {
  getTableName(): string {
    return 'files';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      repo_id: 'TEXT NOT NULL',
      file_path: 'TEXT NOT NULL',
      // ... other columns
      content_embedding: 'BLOB', // Vector embedding
      'FOREIGN KEY (repo_id)': 'REFERENCES repositories(id) ON DELETE CASCADE'
    };
  }
}
```

## Cross-Paradigm Queries

### Unified Query Examples

The unified architecture enables powerful cross-paradigm queries:

#### 1. Semantic Search with Metadata Filtering
```sql
SELECT 
    f.file_path,
    f.language,
    en.source_text,
    vec_distance_cosine(en.embedding, ?) as similarity
FROM embedding_nodes en
JOIN graph_nodes gn ON en.node_id = gn.id
JOIN files f ON gn.file_path = f.file_path
WHERE f.language = 'typescript'
  AND gn.node_type = 'function'
  AND vec_distance_cosine(en.embedding, ?) < 0.3
ORDER BY similarity ASC
LIMIT 10;
```

#### 2. Graph Traversal with Vector Context
```sql
WITH RECURSIVE function_calls AS (
  -- Base case: starting function
  SELECT ge.source_id, ge.target_id, 0 as depth
  FROM graph_edges ge
  WHERE ge.source_business_key = ?
    AND ge.edge_type = 'calls'
  
  UNION ALL
  
  -- Recursive case: follow call chain
  SELECT ge.source_id, ge.target_id, fc.depth + 1
  FROM graph_edges ge
  JOIN function_calls fc ON ge.source_id = fc.target_id
  WHERE fc.depth < 3
)
SELECT 
    gn.business_key,
    gn.properties,
    en.source_text,
    vec_distance_cosine(en.embedding, ?) as semantic_similarity
FROM function_calls fc
JOIN graph_nodes gn ON fc.target_id = gn.id
LEFT JOIN embedding_nodes en ON gn.id = en.node_id
ORDER BY fc.depth, semantic_similarity ASC;
```

#### 3. Repository Analysis with All Data Types
```sql
SELECT 
    r.repo_name,
    COUNT(DISTINCT f.id) as file_count,
    COUNT(DISTINCT gn.id) as node_count,
    COUNT(DISTINCT ge.id) as edge_count,
    COUNT(DISTINCT en.id) as embedding_count,
    AVG(f.size_kb) as avg_file_size
FROM repositories r
LEFT JOIN files f ON r.id = f.repo_id
LEFT JOIN graph_nodes gn ON r.id = gn.repo_id
LEFT JOIN graph_edges ge ON gn.id = ge.source_id
LEFT JOIN embedding_nodes en ON gn.id = en.node_id
GROUP BY r.id, r.repo_name;
```

## Performance Considerations

### Indexing Strategy

1. **Relational Indexes**: Standard B-tree indexes on frequently queried columns
2. **Graph Indexes**: Composite indexes optimized for traversal patterns
3. **Vector Indexes**: Node-based indexes for embedding lookups

### Query Optimization

1. **Prepared Statements**: All queries use prepared statements for performance
2. **Transaction Batching**: Bulk operations use transactions for consistency
3. **Index Hints**: Strategic use of covering indexes for complex queries

### Memory Management

1. **Connection Pooling**: Efficient SQLite connection management
2. **BLOB Handling**: Optimized binary data storage and retrieval
3. **Query Result Streaming**: Large result sets use streaming where possible

## Data Consistency

### Foreign Key Constraints

The system maintains referential integrity across paradigms:

```sql
-- Embedding nodes reference graph nodes
FOREIGN KEY (node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE

-- Files reference repositories
FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
```

### Transaction Management

All cross-paradigm operations use transactions:

```typescript
const updateMany = db.transaction((records: Array<{ id: string; embedding: number[] }>) => {
  for (const record of records) {
    // Update relational data
    updateFileStmt.run(record.id);
    
    // Update graph data
    updateNodeStmt.run(record.id);
    
    // Update vector data
    const embeddingBlob = Buffer.from(new Float32Array(record.embedding).buffer);
    updateEmbeddingStmt.run(embeddingBlob, record.id);
  }
});
```

## Usage Examples

### Storing Data Across Paradigms

```typescript
// 1. Store relational data
const repository = await repositoryRepo.create({
  id: 'repo-1',
  repo_path: '/path/to/repo',
  repo_name: 'my-project'
});

// 2. Store graph data
const node = await graphNodeRepo.create({
  id: 'node-1',
  business_key: 'function:authenticate',
  node_type: 'function',
  properties: JSON.stringify({ name: 'authenticate', params: ['username', 'password'] }),
  repo_id: 'repo-1'
});

// 3. Store vector data
await storeVector(client, 'embedding_nodes', 'embedding', 'node-1', [0.1, 0.2, 0.3, ...]);
```

### Querying Across Paradigms

```typescript
// Semantic search with metadata filtering
const results = await semanticSearch(client, queryEmbedding, 10);

// Graph traversal
const connectedNodes = await db.prepare(`
  SELECT target_id FROM graph_edges 
  WHERE source_id = ? AND edge_type = 'calls'
`).all(nodeId);

// Combined analysis
const analysis = await db.prepare(`
  SELECT 
    f.language,
    COUNT(*) as function_count,
    AVG(vec_distance_cosine(en.embedding, ?)) as avg_similarity
  FROM files f
  JOIN graph_nodes gn ON f.file_path = gn.file_path
  JOIN embedding_nodes en ON gn.id = en.node_id
  WHERE gn.node_type = 'function'
  GROUP BY f.language
`).all(queryEmbedding);
```

## Migration and Maintenance

### Schema Evolution

The dynamic schema generation system supports evolution:

1. **Model Updates**: Modify model schema definitions
2. **Migration Scripts**: Generate ALTER TABLE statements
3. **Version Control**: Track schema changes with migrations

### Backup and Recovery

Single-file database simplifies backup:

```bash
# Backup
cp database.db database.backup.db

# Restore
cp database.backup.db database.db
```

### Monitoring and Analytics

Built-in statistics and monitoring:

```typescript
// Database statistics
const stats = await db.prepare(`
  SELECT 
    'repositories' as table_name, COUNT(*) as count FROM repositories
  UNION ALL
  SELECT 'files', COUNT(*) FROM files
  UNION ALL
  SELECT 'graph_nodes', COUNT(*) FROM graph_nodes
  UNION ALL
  SELECT 'graph_edges', COUNT(*) FROM graph_edges
  UNION ALL
  SELECT 'embedding_nodes', COUNT(*) FROM embedding_nodes
`).all();
```

## Conclusion

The unified database architecture provides a powerful foundation for applications requiring multiple data paradigms. By consolidating relational, graph, and vector data into a single SQLite database, the system achieves:

- **Simplified Architecture**: Single database file with no external dependencies
- **ACID Guarantees**: Full transaction support across all data types
- **Performance**: Optimized indexes and query patterns for each paradigm
- **Flexibility**: Cross-paradigm queries enable complex analytics
- **Maintainability**: Model-driven schema generation and unified tooling

This approach is particularly well-suited for applications like code analysis, knowledge management, and semantic search where different data paradigms need to work together seamlessly.