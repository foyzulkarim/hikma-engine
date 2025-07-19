# Design Document

## Overview

This design addresses critical build errors in the hikma-engine codebase and implements a robust database storage system supporting both RDBMS (SQLite) and GraphDB (TinkerGraph) persistence. The solution focuses on fixing TypeScript compilation issues, resolving variable scoping problems, correcting type mismatches, and implementing a working polyglot persistence layer.

## Architecture

The solution follows a layered architecture with clear separation of concerns:

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
│  SQLite (RDBMS) + TinkerGraph (GraphDB) + LanceDB (Vector) │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Build Error Fixes

**Core Indexer Fixes (`src/core/indexer.ts`)**
- Fix variable scoping issues with `allNodes`, `allEdges`, and `nodesWithEmbeddings`
- Add missing imports for `path` module and `RepositoryNode` type
- Resolve undefined `repoNode` variable by implementing repository node creation
- Fix implicit type annotations and variable redeclarations

**AST Parser Fixes (`src/modules/ast-parser.ts`)**
- Fix FileNode properties type mismatch by adding required fields
- Remove invalid `id` property from Edge interface usage
- Ensure proper type compliance with the defined interfaces

**File Scanner Fixes (`src/modules/file-scanner.ts`)**
- Fix undefined `filePaths` variable by correcting the variable name
- Fix type mismatch in `fs.stat()` and `path.extname()` calls
- Implement proper FileMetadata interface usage

### 2. Database Storage Implementation

**SQLite Database Schema**
```sql
-- Core entities
repositories (repo_id, path, name, created_at, updated_at)
files (file_id, repo_id, path, filename, language, size_kb, content_hash, file_type)
functions (id, file_id, name, signature, return_type, access_level, start_line, end_line)
commits (id, hash, author, date, message, diff_summary)

-- Relationships
function_calls (id, caller_id, callee_id)
file_imports (id, file_id, imported_file_id)
file_relations (id, file_id, related_file_id, relation_type)
file_commits (id, file_id, commit_id)

-- Metadata
indexing_state (key, value, updated_at)
```

**TinkerGraph Schema**
- Vertices: Repository, File, Function, Commit, Directory nodes
- Edges: CALLS, DEFINED_IN, CONTAINS, MODIFIED, AUTHORED relationships
- Properties: All node properties stored as vertex/edge attributes

**Database Client Architecture**
```typescript
interface DatabaseClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnectedToDatabase(): boolean;
}

class SQLiteClient implements DatabaseClient {
  // Relational data operations
  run(sql: string, params?: any[]): any;
  prepare(sql: string): Statement;
  all(sql: string, params?: any[]): any[];
}

class TinkerGraphClient implements DatabaseClient {
  // Graph operations
  addVertex(label: string, properties: Record<string, any>): Promise<any>;
  addEdge(fromId: string, toId: string, label: string, properties?: Record<string, any>): Promise<any>;
}
```

### 3. Data Persistence Flow

**Batch Processing Pipeline**
1. **Data Preparation**: Group nodes by type for efficient batch operations
2. **Parallel Persistence**: Write to SQLite and TinkerGraph simultaneously
3. **Error Handling**: Continue with successful operations if one database fails
4. **Transaction Management**: Use prepared statements for SQLite batch inserts

**Data Transformation**
- Convert knowledge graph nodes to database-specific formats
- Handle type-specific property mappings
- Maintain referential integrity across databases

## Data Models

### Node Type Mappings

**FileNode → SQLite**
```sql
INSERT INTO files (file_id, repo_id, path, filename, language, size_kb, content_hash, file_type)
VALUES (node.id, node.properties.repoId, node.properties.filePath, ...)
```

**FunctionNode → SQLite**
```sql
INSERT INTO functions (id, file_id, name, signature, return_type, access_level, ...)
VALUES (node.id, node.properties.fileId, node.properties.name, ...)
```

**Edge → TinkerGraph**
```javascript
g.V(edge.source).addE(edge.type).to(g.V(edge.target)).property('key', 'value')
```

### Database-Specific Optimizations

**SQLite Optimizations**
- Prepared statements for batch inserts
- Indexes on frequently queried columns (repo_id, file_id, path)
- Foreign key constraints for data integrity
- Efficient schema design for fast lookups

**TinkerGraph Optimizations**
- Batch vertex creation before edge creation
- Property indexing for common traversal patterns
- Connection pooling for concurrent operations
- Graceful handling of missing vertices during edge creation

## Error Handling

### Build Error Resolution Strategy
1. **Static Analysis**: Identify all TypeScript compilation errors
2. **Systematic Fixes**: Address each error category methodically
3. **Type Safety**: Ensure all fixes maintain type safety
4. **Validation**: Verify fixes don't introduce new issues

### Database Error Handling
1. **Connection Resilience**: Retry logic for database connections
2. **Partial Failure Recovery**: Continue with available databases if one fails
3. **Data Consistency**: Rollback mechanisms for critical operations
4. **Logging**: Comprehensive error logging with context

### Error Categories and Responses
```typescript
// Connection errors
try {
  await database.connect();
} catch (error) {
  logger.error('Database connection failed', { error });
  // Continue with other databases
}

// Data insertion errors
try {
  await insertBatch(nodes);
} catch (error) {
  logger.warn('Batch insert failed, trying individual inserts', { error });
  // Fallback to individual inserts
}
```

## Testing Strategy

### Unit Testing
- **Build Fixes**: Verify each fixed component compiles and functions correctly
- **Database Operations**: Test CRUD operations for each database client
- **Data Transformations**: Validate node-to-database mappings
- **Error Scenarios**: Test error handling and recovery mechanisms

### Integration Testing
- **End-to-End Pipeline**: Test complete indexing pipeline with database persistence
- **Database Consistency**: Verify data consistency across multiple databases
- **Performance**: Test batch operations with realistic data volumes
- **Failure Scenarios**: Test partial database failures and recovery

### Test Data Strategy
- **Mock Databases**: Use in-memory databases for fast unit tests
- **Sample Repositories**: Create test repositories with known structures
- **Edge Cases**: Test with malformed data, large files, and complex relationships
- **Performance Benchmarks**: Establish baseline performance metrics

## Implementation Phases

### Phase 1: Build Error Resolution
1. Fix variable scoping issues in core indexer
2. Add missing imports and type definitions
3. Resolve type mismatches in AST parser and file scanner
4. Verify successful compilation

### Phase 2: Database Schema Implementation
1. Update SQLite schema with missing tables
2. Implement proper table relationships and indexes
3. Add data validation and constraints
4. Test schema with sample data

### Phase 3: Data Persistence Implementation
1. Implement batch insert operations for SQLite
2. Implement graph operations for TinkerGraph
3. Add error handling and retry logic
4. Test with realistic data volumes

### Phase 4: Integration and Testing
1. End-to-end testing of the complete pipeline
2. Performance optimization and tuning
3. Error scenario testing and validation
4. Documentation and code cleanup
