# Design Document

## Overview

This design removes all TinkerGraph dependencies from the hikma-engine codebase and consolidates graph data storage and operations into SQLite. The solution leverages SQLite's enhanced graph storage capabilities that are already implemented in the system, eliminating the need for a separate graph database server while maintaining all graph functionality through SQL-based operations.

## Architecture

The simplified architecture removes the TinkerGraph layer and consolidates to a two-database system:

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
│  (Data Loader + Database Clients)                         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Database Layer                            │
│  SQLite (RDBMS + GraphDB) + LanceDB (Vector)              │
└─────────────────────────────────────────────────────────────┘
```

**Key Changes:**
- Remove TinkerGraph client and all Gremlin dependencies
- Consolidate graph operations into SQLite enhanced graph tables
- Simplify database connection management to two databases
- Update health checks to monitor only LanceDB and SQLite

## Components and Interfaces

### 1. TinkerGraph Removal

**Files to Modify:**
- `src/persistence/db-clients.ts` - Remove TinkerGraphClient class
- `src/modules/data-loader.ts` - Remove TinkerGraph initialization and operations
- `src/config/index.ts` - Remove TinkerGraph configuration
- `src/api/services/health-check.ts` - Remove TinkerGraph health checks

**TinkerGraphClient Removal:**
```typescript
// REMOVE: Entire TinkerGraphClient class (~600 lines)
export class TinkerGraphClient {
  // All methods and properties to be removed
}

// REMOVE: Gremlin-related interfaces
interface DriverRemoteConnection { ... }
interface GraphTraversalSource { ... }
interface VertexTraversal { ... }
interface EdgeTraversal { ... }
```

### 2. SQLite Enhanced Graph Operations

**Current SQLite Graph Schema (Already Implemented):**
```sql
-- Enhanced graph storage tables (already exist)
CREATE TABLE graph_nodes (
  id TEXT PRIMARY KEY,
  business_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  properties TEXT,
  repo_id TEXT,
  commit_sha TEXT,
  file_path TEXT,
  line INTEGER,
  col INTEGER,
  signature_hash TEXT,
  labels TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE graph_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_business_key TEXT,
  target_business_key TEXT,
  edge_type TEXT NOT NULL,
  properties TEXT,
  line INTEGER,
  col INTEGER,
  dynamic BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES graph_nodes(id),
  FOREIGN KEY (target_id) REFERENCES graph_nodes(id)
);
```

**Graph Query Operations (Using Existing SQLite Methods):**
```typescript
// Already implemented in SQLiteClient
async batchInsertEnhancedGraphNodes(nodes: EnhancedBaseNode[]): Promise<BatchResult>
async batchInsertEnhancedGraphEdges(edges: EnhancedEdge[]): Promise<BatchResult>
async getEnhancedGraphStats(): Promise<EnhancedGraphStats>

// Graph traversal using SQL recursive CTEs
async findConnectedNodes(nodeId: string, depth: number): Promise<Node[]>
async getNodeRelationships(nodeId: string): Promise<Edge[]>
```

### 3. Data Loader Simplification

**Current Data Loader Architecture:**
```typescript
export class DataLoader {
  private lancedbClient: LanceDBClient;
  private sqliteClient: SQLiteClient;
  // REMOVE: private tinkerGraphClient: TinkerGraphClient;

  constructor(lancedbPath: string, sqlitePath: string, config: ConfigManager) {
    this.lancedbClient = new LanceDBClient(lancedbPath);
    this.sqliteClient = new SQLiteClient(sqlitePath);
    // REMOVE: TinkerGraph initialization
  }
}
```

**Simplified Connection Management:**
```typescript
private async connectToDatabases(): Promise<{
  lancedb: boolean;
  sqlite: boolean;
  // REMOVE: tinkergraph: boolean;
}> {
  // Only connect to LanceDB and SQLite
  // Remove TinkerGraph connection logic
}
```

**Graph Data Persistence (Already Implemented):**
```typescript
private async batchLoadToGraphDB(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
  // Already uses SQLite enhanced graph tables
  const enhancedNodes = nodes.map(node => ({
    id: node.id,
    businessKey: node.id,
    type: node.type,
    properties: node.properties,
    // ... other enhanced node properties
  }));

  const enhancedEdges = edges.map(edge => ({
    id: `${edge.source}-${edge.type}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    // ... other enhanced edge properties
  }));

  await this.sqliteClient.batchInsertEnhancedGraphNodes(enhancedNodes);
  await this.sqliteClient.batchInsertEnhancedGraphEdges(enhancedEdges);
}
```

### 4. Configuration System Updates

**Remove TinkerGraph Configuration:**
```typescript
// REMOVE from config interface
interface DatabaseConfig {
  lancedb: { path: string };
  sqlite: { path: string };
  // REMOVE: tinkergraph: { url: string };
}

// REMOVE from default config
const defaultConfig = {
  database: {
    lancedb: { path: './data/lancedb' },
    sqlite: { path: './data/metadata.db' },
    // REMOVE: tinkergraph: { url: 'ws://localhost:8182/gremlin' }
  }
};

// REMOVE environment variable handling
// REMOVE: if (process.env.HIKMA_TINKERGRAPH_URL) { ... }
```

### 5. Health Check Service Updates

**Simplified Health Checks:**
```typescript
async getSystemHealth(): Promise<HealthCheckResult> {
  const checks: Record<string, HealthStatus> = {};

  // Keep existing LanceDB and SQLite checks
  const lancedbCheck = await this.checkLanceDB();
  const sqliteCheck = await this.checkSQLite();

  // REMOVE: TinkerGraph health check
  // REMOVE: const tinkerGraphCheck = await this.checkTinkerGraph();

  checks.lancedb = { ... };
  checks.sqlite = { ... };
  // REMOVE: checks.tinkergraph = { ... };

  return { checks, overall: this.calculateOverallHealth(checks) };
}

// REMOVE: private async checkTinkerGraph() method
```

## Data Models

### Graph Data Flow (Simplified)

**Current Flow (Already Working):**
1. **Node Processing**: AST Parser → Enhanced Nodes → SQLite graph_nodes table
2. **Edge Processing**: Relationship Analysis → Enhanced Edges → SQLite graph_edges table
3. **Graph Queries**: SQL recursive CTEs for traversal operations

**Enhanced Node Mapping (Already Implemented):**
```typescript
interface EnhancedBaseNode {
  id: string;
  businessKey: string;
  type: string;
  properties: Record<string, any>;
  repoId?: string;
  commitSha?: string;
  filePath?: string;
  line?: number;
  col?: number;
  signatureHash: string;
  labels: string[];
}
```

**Enhanced Edge Mapping (Already Implemented):**
```typescript
interface EnhancedEdge {
  id: string;
  source: string;
  target: string;
  sourceBusinessKey: string;
  targetBusinessKey: string;
  type: string;
  properties: Record<string, any>;
  line?: number;
  col?: number;
  dynamic: boolean;
}
```

### Graph Query Capabilities

**SQLite Graph Traversal (Using Recursive CTEs):**
```sql
-- Find all nodes connected to a specific node (depth-limited)
WITH RECURSIVE connected_nodes(id, depth) AS (
  SELECT id, 0 FROM graph_nodes WHERE id = ?
  UNION ALL
  SELECT ge.target_id, cn.depth + 1
  FROM graph_edges ge
  JOIN connected_nodes cn ON ge.source_id = cn.id
  WHERE cn.depth < ?
)
SELECT gn.* FROM graph_nodes gn
JOIN connected_nodes cn ON gn.id = cn.id;

-- Get relationship statistics
SELECT edge_type, COUNT(*) as count
FROM graph_edges
GROUP BY edge_type;
```

## Error Handling

### Database Connection Simplification

**Simplified Connection Error Handling:**
```typescript
// Remove TinkerGraph-specific error handling
// Keep existing LanceDB and SQLite error handling patterns
private async connectToDatabases(): Promise<ConnectionStatus> {
  const connectionPromises = [
    this.connectToLanceDB().catch(error => {
      this.logger.warn('LanceDB connection failed', { error });
    }),
    this.connectToSQLite().catch(error => {
      this.logger.warn('SQLite connection failed', { error });
    })
    // REMOVE: TinkerGraph connection promise
  ];

  await Promise.allSettled(connectionPromises);
  // Simplified connection status tracking
}
```

### Graph Operation Error Handling

**Consolidated Error Handling:**
```typescript
// Use existing SQLite error handling for all graph operations
try {
  await this.sqliteClient.batchInsertEnhancedGraphNodes(nodes);
  await this.sqliteClient.batchInsertEnhancedGraphEdges(edges);
} catch (error) {
  this.logger.error('Graph data persistence failed', { error });
  throw new DatabaseOperationError('SQLite', 'Graph persistence failed', error);
}
```

## Testing Strategy

### Unit Testing Updates

**Remove TinkerGraph Tests:**
- Remove all TinkerGraphClient unit tests
- Remove TinkerGraph connection tests
- Remove TinkerGraph health check tests

**Enhanced SQLite Graph Testing:**
- Test enhanced graph node insertion
- Test enhanced graph edge insertion
- Test graph traversal queries
- Test graph statistics queries

### Integration Testing Updates

**Simplified Integration Tests:**
```typescript
describe('DataLoader Integration', () => {
  it('should load data to LanceDB and SQLite only', async () => {
    // Test data loading without TinkerGraph
    const result = await dataLoader.load(nodes, edges);
    
    expect(result.results.lancedb.success).toBe(true);
    expect(result.results.sqlite.success).toBe(true);
    // REMOVE: TinkerGraph assertions
  });

  it('should perform graph queries using SQLite', async () => {
    // Test graph traversal using SQLite
    const stats = await sqliteClient.getEnhancedGraphStats();
    expect(stats.nodeCount).toBeGreaterThan(0);
    expect(stats.edgeCount).toBeGreaterThan(0);
  });
});
```

### Performance Testing

**SQLite Graph Performance:**
- Test recursive CTE performance for graph traversal
- Test graph statistics query performance
- Compare performance with previous TinkerGraph implementation
- Optimize SQLite indexes for graph operations

## Implementation Phases

### Phase 1: Remove TinkerGraph Dependencies
1. Remove TinkerGraphClient class from db-clients.ts
2. Remove Gremlin imports and interfaces
3. Remove TinkerGraph configuration from config system
4. Update package.json to remove Gremlin dependencies

### Phase 2: Update Data Loader
1. Remove TinkerGraph initialization from DataLoader constructor
2. Remove TinkerGraph connection logic
3. Update batchLoadToGraphDB to use only SQLite (already implemented)
4. Update connection status tracking

### Phase 3: Update Health Checks
1. Remove checkTinkerGraph method
2. Update getSystemHealth to exclude TinkerGraph
3. Update health check response format
4. Update API documentation

### Phase 4: Documentation and Configuration
1. Update configuration documentation
2. Remove TinkerGraph environment variables
3. Update API documentation
4. Update deployment documentation

### Phase 5: Testing and Validation
1. Update unit tests to remove TinkerGraph tests
2. Update integration tests for two-database architecture
3. Validate graph functionality using SQLite
4. Performance testing and optimization
