# SQLite-vec Implementation for Hikma Engine

Replace LanceDB with SQLite-vec for **complete database unification**. With TinkerGraph removed and SQLite already handling graph data, everything will be in a single SQLite database: metadata + graph + vectors.

## 🎯 **What Changes**

**For Users:** Nothing! They still run:
```bash
npm start /path/to/repo
```

**For Developers:** Replace LanceDB with SQLite-vec to achieve complete database unification.

## 🏆 **Final Architecture**

**Single SQLite Database Contains:**
- ✅ **Metadata**: Files, commits, functions, etc.
- ✅ **Graph Data**: Relationships and traversals (existing enhanced graph schema)
- ✅ **Vector Embeddings**: Semantic search capabilities
- ✅ **All in One File**: Perfect for local tool usage

## 📋 **Implementation Steps**

### **1. Update Dependencies**

```json
// package.json
{
  "dependencies": {
    // Remove:
    // "@lancedb/lancedb": "^0.11.0",
    
    // Add:
    "sqlite-vec": "^0.1.0",
    
    // Keep:
    "better-sqlite3": "^11.0.0"
  }
}
```

### **2. Update SQLiteClient**

**Add vector support to existing SQLiteClient:**

```typescript
// src/persistence/db-clients.ts
export class SQLiteClient {
  private vectorEnabled = false;

  async connect(): Promise<void> {
    // Existing connection code...
    await withRetry(
      async () => {
        this.logger.info('Connecting to SQLite');
        await this.testConnection();
        this.initializeTables();
        
        // Load sqlite-vec extension
        try {
          this.db.loadExtension('vec0');
          this.vectorEnabled = true;
          this.logger.info('SQLite-vec extension loaded');
        } catch (error) {
          this.logger.warn('SQLite-vec extension not available, vector search disabled');
        }
        
        this.isConnected = true;
        this.logger.info('Connected to SQLite successfully');
      },
      DEFAULT_RETRY_CONFIG,
      this.logger,
      'SQLite connection'
    );
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
  }

  /**
   * Store vector with record
   */
  storeVector(tableName: string, id: string, embedding: number[]): void {
    if (!this.vectorEnabled || !embedding || embedding.length === 0) {
      return;
    }

    const vectorBlob = Buffer.from(new Float32Array(embedding).buffer);
    const sql = `UPDATE ${tableName} SET embedding = ? WHERE id = ?`;
    
    try {
      this.run(sql, [vectorBlob, id]);
    } catch (error) {
      this.logger.warn(`Failed to store vector for ${tableName}:${id}`, { error: getErrorMessage(error) });
    }
  }

  /**
   * Vector similarity search
   */
  vectorSearch(
    tableName: string,
    queryVector: number[],
    limit: number = 10,
    threshold: number = 0.8,
    whereClause?: string,
    whereParams?: any[]
  ): Array<{id: string, similarity: number, data: any}> {
    if (!this.vectorEnabled) {
      this.logger.warn('Vector search not available');
      return [];
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
      return [];
    }
  }

  // Update existing batch methods to include vectors
  async batchInsertFileNodes(fileNodes: FileNode[]): Promise<{success: number, failed: number, errors: string[]}> {
    // Add embedding to the INSERT statement
    const stmt = this.prepare(`
      INSERT OR REPLACE INTO files (
        file_id, repo_id, file_path, file_name, file_extension, language, 
        size_kb, content_hash, file_type, ai_summary, imports, exports,
        embedding, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((nodeList: FileNode[]) => {
      for (const node of nodeList) {
        try {
          const embedding = (node as any).embedding;
          const vectorBlob = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;
          
          stmt.run(
            node.id,
            node.properties.repoId || '',
            node.properties.filePath,
            node.properties.fileName,
            node.properties.fileExtension || null,
            node.properties.language || null,
            node.properties.sizeKb || null,
            node.properties.contentHash || null,
            node.properties.fileType || 'source',
            node.properties.aiSummary || null,
            JSON.stringify(node.properties.imports || []),
            JSON.stringify(node.properties.exports || []),
            vectorBlob
          );
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert file node ${node.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }
    });

    try {
      insertMany(fileNodes);
      this.logger.info(`Batch inserted file nodes`, { success, failed, total: fileNodes.length });
    } catch (error) {
      this.logger.error('Batch file node insert transaction failed', { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  // Similar updates for other batch insert methods...
}
```

### **3. Update DataLoader**

**Remove LanceDB, store vectors in SQLite:**

```typescript
// src/modules/data-loader.ts
export class DataLoader {
  // Remove lancedbClient entirely
  // private lancedbClient: LanceDBClient;

  constructor(lancedbPath: string, sqlitePath: string, config: ConfigManager) {
    // Remove LanceDB initialization
    // this.lancedbClient = new LanceDBClient(lancedbPath);
    
    this.sqliteClient = new SQLiteClient(sqlitePath);
    this.config = config;
    // ...
  }

  private async connectToDatabases(): Promise<{ sqlite: boolean }> {
    const connectionStatus = { sqlite: false };

    // Only connect to SQLite
    try {
      await this.connectToSQLite();
      connectionStatus.sqlite = true;
      this.logger.info('SQLite connected successfully');
    } catch (error) {
      this.logger.warn('Failed to connect to SQLite', { error: getErrorMessage(error) });
    }

    return connectionStatus;
  }

  // Remove batchLoadToVectorDB method entirely

  private async batchLoadToSqlite(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes to SQLite`);

    try {
      this.logger.info(`Starting SQLite batch load for ${nodes.length} nodes`);

      // Use transaction for data consistency
      this.sqliteClient.transaction(() => {
        // Group nodes by type for efficient batch processing
        const nodesByType = this.groupNodesByType(nodes);

        // Process each node type (existing logic)
        for (const nodeType of ['RepositoryNode', 'FileNode', 'DirectoryNode', 'CommitNode', 'PullRequestNode', 'CodeNode', 'TestNode', 'FunctionNode']) {
          const typeNodes = nodesByType[nodeType];
          if (!typeNodes || typeNodes.length === 0) continue;

          this.logger.debug(`Loading ${typeNodes.length} ${nodeType} nodes to SQLite`);

          // Call existing batch insert methods (now updated to include vectors)
          switch (nodeType) {
            case 'FileNode':
              this.sqliteClient.batchInsertFileNodes(typeNodes as unknown as FileNode[]);
              break;
            // ... other cases
          }
        }
      });

      this.logger.info('SQLite batch load completed successfully');
      operation();
    } catch (error) {
      this.logger.error('SQLite batch load failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<{
    success: boolean;
    results: { sqlite: { success: boolean; error?: string } };
  }> {
    const results = { sqlite: { success: false } };

    try {
      // Validation
      const validation = this.performDataValidation(nodes, edges);
      if (!validation.valid) {
        throw new DataValidationError('Data validation failed', validation.errors);
      }

      // Connect to SQLite only
      const connectionStatus = await this.connectToDatabases();
      
      if (!connectionStatus.sqlite) {
        throw new Error('Failed to connect to SQLite');
      }

      // Load everything to SQLite (metadata + vectors)
      await this.batchLoadToSqlite(nodes, edges);
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
}
```

### **4. Update SearchService**

**Replace LanceDB search with SQLite vector search:**

```typescript
// src/modules/search-service.ts
export class SearchService {
  // Remove lancedbClient
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
      this.logger.info('Loading embedding model...');
      await this.embeddingService.loadModel();
      
      this.logger.info('Connecting to SQLite...');
      await this.sqliteClient.connect();
      
      this.isInitialized = true;
      this.logger.info('Search service initialized successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to initialize search service', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

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

      // Search each table using SQLite vector search
      for (const nodeType of nodeTypesToSearch) {
        const tableName = this.getTableNameForNodeType(nodeType);
        
        try {
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

      // Search tables with combined vector + metadata filtering
      const tables = [
        { name: 'files', type: 'FileNode' },
        { name: 'code_nodes', type: 'CodeNode' },
        { name: 'commits', type: 'CommitNode' }
      ];
      
      for (const table of tables) {
        try {
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
      this.sqliteClient.disconnect();
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

### **5. Update Docker Configuration**

**Add sqlite-vec extension to Docker:**

```dockerfile
# Dockerfile.api
FROM node:18-alpine AS base

# Install sqlite-vec extension
RUN apk add --no-cache sqlite-dev build-base curl
RUN curl -L https://github.com/asg017/sqlite-vec/releases/download/v0.1.0/sqlite-vec-0.1.0-loadable-linux-x86_64.tar.gz | tar -xz
RUN cp vec0.so /usr/local/lib/

# Rest of existing Dockerfile...
```

**Update docker-compose.yml:**

```yaml
# Remove LanceDB-related services and volumes
services:
  hikma-api:
    # existing configuration
    environment:
      # Remove:
      # - HIKMA_LANCEDB_PATH=/app/data/lancedb
      
      # Keep:
      - HIKMA_SQLITE_PATH=/app/data/metadata.db
      
      # Add:
      - HIKMA_SQLITE_VEC_EXTENSION=/usr/local/lib/vec0.so
```

## 🎉 **Result**

**Complete Database Unification:**

### **For Users:**
- ✅ **Single database file** - metadata + graph + vectors all in one SQLite file
- ✅ **Same command**: `npm start /path/to/repo`
- ✅ **Perfect backup** - just copy the .db file
- ✅ **Standard tools** - inspect everything with SQLite browser
- ✅ **Zero complexity** - no database management needed

### **For Developers:**
- ✅ **Ultimate simplification** - single database for all operations
- ✅ **Unified queries** - join metadata, graph, and vector data in SQL
- ✅ **Better performance** - no cross-database operations
- ✅ **Easier testing** - everything in one database
- ✅ **Simpler deployment** - just SQLite + extension

### **For Architecture:**
- ✅ **Complete unification** - from multiple databases to one
- ✅ **Enhanced capabilities** - metadata + graph + vectors in unified queries
- ✅ **Perfect for local tool** - single file contains entire knowledge base
- ✅ **Maintainable** - leverage existing SQLite expertise for everything

**This is the ideal architecture for a local code indexing tool!** 🎯
