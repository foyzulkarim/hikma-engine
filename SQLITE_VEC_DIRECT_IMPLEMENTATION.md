# SQLite-vec Direct Implementation Plan for Hikma Engine

Since Hikma Engine runs locally and users index their own repositories with reproducible data, we can **directly replace LanceDB with SQLite-vec** without any migration complexity.

## 🎯 **Simplified Approach**

**No Migration Needed!** Users will simply:
1. Update to the new version
2. Re-run indexing on their repositories
3. Get everything in a single SQLite database

## 📋 **Implementation Steps**

### **Step 1: Update Dependencies**

**Remove LanceDB, Add SQLite-vec:**
```json
// package.json changes
{
  "dependencies": {
    // Remove this:
    // "@lancedb/lancedb": "^0.11.0",
    
    // Add this:
    "sqlite-vec": "^0.1.0",
    
    // Keep existing:
    "better-sqlite3": "^11.0.0"
  }
}
```

### **Step 2: Update Database Schema**

**Add vector columns to existing SQLite tables:**
```sql
-- Add to existing SQLite initialization in db-clients.ts
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
```

### **Step 3: Update SQLiteClient**

**Add vector methods to existing SQLiteClient:**
```typescript
// src/persistence/db-clients.ts
export class SQLiteClient {
  private vectorEnabled = false;

  async connect(): Promise<void> {
    // Existing connection code...
    
    // Load sqlite-vec extension
    try {
      this.db.loadExtension('vec0'); // or path to sqlite-vec extension
      this.vectorEnabled = true;
      this.logger.info('SQLite-vec extension loaded');
    } catch (error) {
      this.logger.warn('SQLite-vec extension not available, vector search disabled');
    }
  }

  private initializeTables(): void {
    // Existing table creation code...
    
    // Add vector columns to existing tables
    const vectorColumns = [
      'ALTER TABLE files ADD COLUMN embedding BLOB',
      'ALTER TABLE code_nodes ADD COLUMN embedding BLOB',
      'ALTER TABLE commits ADD COLUMN embedding BLOB',
      'ALTER TABLE directories ADD COLUMN embedding BLOB',
      'ALTER TABLE test_nodes ADD COLUMN embedding BLOB',
      'ALTER TABLE pull_requests ADD COLUMN embedding BLOB'
    ];

    vectorColumns.forEach(sql => {
      try {
        this.db.exec(sql);
      } catch (error) {
        // Ignore "duplicate column" errors for existing databases
        if (!error.message.includes('duplicate column name')) {
          throw error;
        }
      }
    });

    // Create vector indexes
    if (this.vectorEnabled) {
      const vectorIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_files_embedding ON files(embedding)',
        'CREATE INDEX IF NOT EXISTS idx_code_nodes_embedding ON code_nodes(embedding)',
        'CREATE INDEX IF NOT EXISTS idx_commits_embedding ON commits(embedding)'
      ];
      
      vectorIndexes.forEach(sql => {
        try {
          this.db.exec(sql);
        } catch (error) {
          this.logger.warn('Failed to create vector index', { error: getErrorMessage(error) });
        }
      });
    }
  }

  /**
   * Store vector embedding with the record
   */
  async storeVector(tableName: string, id: string, embedding: number[]): Promise<void> {
    if (!this.vectorEnabled) {
      this.logger.debug('Vector storage disabled, skipping embedding');
      return;
    }

    const vectorBlob = Buffer.from(new Float32Array(embedding).buffer);
    const sql = `UPDATE ${tableName} SET embedding = ? WHERE id = ?`;
    
    try {
      this.run(sql, [vectorBlob, id]);
    } catch (error) {
      this.logger.error(`Failed to store vector for ${tableName}:${id}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Vector similarity search
   */
  async vectorSearch(
    tableName: string,
    queryVector: number[],
    limit: number = 10,
    threshold: number = 0.8,
    whereClause?: string,
    whereParams?: any[]
  ): Promise<Array<{id: string, similarity: number, data: any}>> {
    if (!this.vectorEnabled) {
      throw new Error('Vector search not available - sqlite-vec extension not loaded');
    }

    const queryBlob = Buffer.from(new Float32Array(queryVector).buffer);
    
    let sql = `
      SELECT *, (1 - vec_distance_cosine(embedding, ?)) as similarity
      FROM ${tableName} 
      WHERE embedding IS NOT NULL
    `;
    
    const params = [queryBlob];
    
    if (whereClause) {
      sql += ` AND ${whereClause}`;
      if (whereParams) {
        params.push(...whereParams);
      }
    }
    
    sql += ` ORDER BY similarity DESC LIMIT ?`;
    params.push(limit);

    try {
      const results = this.all(sql, params);
      
      return results
        .filter((row: any) => row.similarity >= threshold)
        .map((row: any) => ({
          id: row.id,
          similarity: row.similarity,
          data: row
        }));
        
    } catch (error) {
      this.logger.error(`Vector search failed for ${tableName}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  // Update existing batch insert methods to include vectors
  async batchInsertFileNodes(fileNodes: FileNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    // Existing implementation...
    // Add embedding column to INSERT statement
    const stmt = this.prepare(`
      INSERT OR REPLACE INTO files (
        file_id, repo_id, file_path, file_name, file_extension, language, 
        size_kb, content_hash, file_type, ai_summary, imports, exports,
        embedding, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    // Rest of implementation with embedding parameter...
  }
}
```

### **Step 4: Update DataLoader**

**Replace LanceDB storage with SQLite vector storage:**
```typescript
// src/modules/data-loader.ts
export class DataLoader {
  // Remove lancedbClient property
  // private lancedbClient: LanceDBClient;

  constructor(lancedbPath: string, sqlitePath: string, config: ConfigManager) {
    // Remove LanceDB client initialization
    // this.lancedbClient = new LanceDBClient(lancedbPath);
    
    this.sqliteClient = new SQLiteClient(sqlitePath);
    // ... rest of constructor
  }

  // Remove batchLoadToVectorDB method entirely

  // Update main load method
  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<{
    success: boolean;
    results: {
      sqlite: { success: boolean; error?: string };
    };
  }> {
    const results = {
      sqlite: { success: false }
    };

    try {
      // Connect only to SQLite
      await this.sqliteClient.connect();

      // Load all data including vectors to SQLite
      await this.batchLoadToSQLiteWithVectors(nodes, edges);
      results.sqlite.success = true;

      return {
        success: true,
        results
      };
    } catch (error) {
      this.logger.error('Data loading failed', { error: getErrorMessage(error) });
      throw error;
    } finally {
      this.sqliteClient.disconnect();
    }
  }

  /**
   * Load both metadata and vectors to SQLite
   */
  private async batchLoadToSQLiteWithVectors(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes with vectors to SQLite`);

    try {
      // Use transaction for consistency
      this.sqliteClient.transaction(() => {
        // Load metadata (existing logic)
        this.batchLoadMetadata(nodes, edges);
        
        // Store vectors
        this.batchStoreVectors(nodes);
      });

      this.logger.info('SQLite loading with vectors completed successfully');
      operation();
    } catch (error) {
      this.logger.error('SQLite loading with vectors failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  private batchStoreVectors(nodes: NodeWithEmbedding[]): void {
    for (const node of nodes) {
      if (node.embedding && node.embedding.length > 0) {
        const tableName = this.getTableNameForNodeType(node.type);
        try {
          this.sqliteClient.storeVector(tableName, node.id, node.embedding);
        } catch (error) {
          this.logger.warn(`Failed to store vector for ${node.id}`, { error: getErrorMessage(error) });
        }
      }
    }
  }

  private getTableNameForNodeType(nodeType: string): string {
    const mapping: Record<string, string> = {
      'FileNode': 'files',
      'CodeNode': 'code_nodes',
      'CommitNode': 'commits',
      'DirectoryNode': 'directories',
      'TestNode': 'test_nodes',
      'PullRequestNode': 'pull_requests'
    };
    return mapping[nodeType] || nodeType.toLowerCase();
  }
}
```

### **Step 5: Update SearchService**

**Replace LanceDB search with SQLite vector search:**
```typescript
// src/modules/search-service.ts
export class SearchService {
  // Remove lancedbClient property
  // private lancedbClient: LanceDBClient;

  constructor(config: ConfigManager) {
    this.config = config;
    const dbConfig = config.getDatabaseConfig();
    
    this.embeddingService = new EmbeddingService(config);
    // Remove LanceDB client
    // this.lancedbClient = new LanceDBClient(dbConfig.lancedb.path);
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const operation = this.logger.operation('Initializing search service');
    
    try {
      await this.embeddingService.loadModel();
      await this.sqliteClient.connect(); // Only SQLite connection needed
      
      this.isInitialized = true;
      this.logger.info('Search service initialized successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to initialize search service', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Semantic search using SQLite-vec (replaces LanceDB search)
   */
  async semanticSearch(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      limit = 10,
      nodeTypes,
      minSimilarity = 0.1
    } = options;

    const operation = this.logger.operation(`Semantic search: "${query}"`);
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedQuery(query);
      
      const allResults: SearchResult[] = [];
      const nodeTypesToSearch = nodeTypes || [
        'CodeNode', 'FileNode', 'DirectoryNode', 'CommitNode', 'TestNode', 'PullRequestNode'
      ];

      // Search each table with vectors
      for (const nodeType of nodeTypesToSearch) {
        const tableName = this.getTableNameForNodeType(nodeType);
        
        try {
          const results = await this.sqliteClient.vectorSearch(
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
        } catch (error) {
          this.logger.warn(`Failed to search in ${nodeType}`, { error: getErrorMessage(error) });
        }
      }

      // Sort by similarity and limit results
      const sortedResults = allResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map((result, index) => ({ ...result, rank: index + 1 }));

      this.logger.info('Semantic search completed', {
        query: query.substring(0, 50),
        resultsFound: sortedResults.length,
        topSimilarity: sortedResults[0]?.similarity || 0
      });

      operation();
      return sortedResults;
    } catch (error) {
      this.logger.error('Semantic search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Enhanced hybrid search with single SQL query
   */
  async hybridSearch(
    query: string,
    filters: MetadataFilters = {},
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const operation = this.logger.operation(`Hybrid search: "${query}"`);

    try {
      const queryEmbedding = await this.embeddingService.embedQuery(query);
      const { limit = 10, minSimilarity = 0.1 } = options;
      
      const allResults: SearchResult[] = [];

      // Build WHERE clause for metadata filters
      const { whereClause, params } = this.buildMetadataWhereClause(filters);

      // Search each table with combined vector + metadata filtering
      const tables = [
        { name: 'files', type: 'FileNode' },
        { name: 'code_nodes', type: 'CodeNode' },
        { name: 'commits', type: 'CommitNode' }
      ];
      
      for (const table of tables) {
        try {
          const results = await this.sqliteClient.vectorSearch(
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
        } catch (error) {
          this.logger.warn(`Hybrid search failed for ${table.name}`, { error: getErrorMessage(error) });
        }
      }

      // Sort and enhance results
      const sortedResults = allResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      const enhancedResults: EnhancedSearchResult[] = await Promise.all(
        sortedResults.map(async (result, index) => {
          const metadata = await this.getNodeMetadata(result.node.id, result.node.type);
          return {
            ...result,
            rank: index + 1,
            metadata
          };
        })
      );

      operation();
      return enhancedResults;
    } catch (error) {
      this.logger.error('Hybrid search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.sqliteClient.disconnect(); // Only SQLite to disconnect
      this.isInitialized = false;
      this.logger.info('Search service disconnected');
    } catch (error) {
      this.logger.error('Failed to disconnect search service', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private getTableNameForNodeType(nodeType: NodeType): string {
    const mapping: Record<NodeType, string> = {
      'FileNode': 'files',
      'CodeNode': 'code_nodes',
      'CommitNode': 'commits',
      'DirectoryNode': 'directories',
      'TestNode': 'test_nodes',
      'PullRequestNode': 'pull_requests'
    };
    return mapping[nodeType];
  }

  // Helper methods remain the same...
}
```

### **Step 6: Update Docker Configuration**

**Simplify Docker setup by removing LanceDB:**
```dockerfile
# Dockerfile.api - Add sqlite-vec extension
FROM node:18-alpine AS base

# Install sqlite-vec extension
RUN apk add --no-cache sqlite-dev build-base curl
RUN curl -L https://github.com/asg017/sqlite-vec/releases/download/v0.1.0/sqlite-vec-0.1.0-loadable-linux-x86_64.tar.gz | tar -xz
RUN cp vec0.so /usr/local/lib/

# Rest of existing Dockerfile...
```

**Update docker-compose.yml:**
```yaml
# Remove LanceDB-related services, keep only:
services:
  hikma-api:
    # existing configuration
    environment:
      # Remove LanceDB path
      # - HIKMA_LANCEDB_PATH=/app/data/lancedb
      - HIKMA_SQLITE_PATH=/app/data/metadata.db
      # Add sqlite-vec extension path
      - HIKMA_SQLITE_VEC_EXTENSION=/usr/local/lib/vec0.so
```

## 🎉 **Benefits of This Approach**

### **For Users:**
- ✅ **Single database file** - everything in one SQLite database
- ✅ **Easier backup** - just copy the .db file
- ✅ **Standard tools** - can inspect data with any SQLite browser
- ✅ **Smaller footprint** - no separate vector database to manage

### **For Development:**
- ✅ **Simpler codebase** - remove entire LanceDB client and logic
- ✅ **Unified queries** - combine vector and metadata search in single SQL
- ✅ **Better performance** - no cross-database joins needed
- ✅ **Easier testing** - everything in one database

### **For Deployment:**
- ✅ **Fewer dependencies** - remove LanceDB from Docker images
- ✅ **Simpler configuration** - one database path instead of multiple
- ✅ **Reduced complexity** - no database orchestration needed

## 🚀 **Implementation Timeline**

**Week 1:**
- [ ] Update dependencies (remove LanceDB, add sqlite-vec)
- [ ] Extend SQLite schema with vector columns
- [ ] Add vector methods to SQLiteClient

**Week 2:**
- [ ] Update DataLoader to store vectors in SQLite
- [ ] Update SearchService to use SQLite vector search
- [ ] Remove all LanceDB code

**Week 3:**
- [ ] Update Docker configuration
- [ ] Test with sample repositories
- [ ] Update documentation

**Week 4:**
- [ ] Performance testing and optimization
- [ ] Release new version

## 🎯 **User Experience**

Users simply:
1. **Update Hikma Engine** to the new version
2. **Re-run indexing** on their repositories: `npm start /path/to/repo`
3. **Get everything in SQLite** - vectors, metadata, and graph data all in one file

**That's it!** No migration, no complexity, just better architecture.

---

This approach is **much simpler and better** than the migration plan. Users get all the benefits of unified storage without any of the migration complexity!
