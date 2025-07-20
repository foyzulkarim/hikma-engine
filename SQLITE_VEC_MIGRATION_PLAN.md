# SQLite-vec Implementation Plan for Hikma Engine

Based on analysis of your codebase, here's a comprehensive plan to migrate from LanceDB to SQLite-vec while maintaining system reliability and performance.

## 🎯 **Migration Strategy Overview**

**Approach**: Gradual migration with feature flags and dual-write capability
**Timeline**: 12 weeks (3 months)  
**Risk Level**: Low (with proper validation and rollback procedures)

---

## 📋 **Phase 1: Foundation & Setup** *(Weeks 1-2)*

### **1.1 Dependencies & Configuration**

**Update package.json:**
```json
{
  "dependencies": {
    "sqlite-vec": "^0.1.0",
    "better-sqlite3": "^11.0.0"
  }
}
```

**Add configuration support in `src/config/index.ts`:**
```typescript
export interface VectorConfig {
  backend: 'lancedb' | 'sqlite-vec';
  dimensions: number;
  indexType: 'flat' | 'ivf';
  batchSize: number;
}

export class ConfigManager {
  getVectorConfig(): VectorConfig {
    return {
      backend: process.env.HIKMA_VECTOR_BACKEND as 'lancedb' | 'sqlite-vec' || 'lancedb',
      dimensions: parseInt(process.env.HIKMA_VECTOR_DIMENSIONS || '384'),
      indexType: process.env.HIKMA_VECTOR_INDEX_TYPE as 'flat' | 'ivf' || 'flat',
      batchSize: parseInt(process.env.HIKMA_VECTOR_BATCH_SIZE || '100')
    };
  }
}
```

### **1.2 Database Schema Extension**

**Create migration script `scripts/migrate-to-sqlite-vec.sql`:**
```sql
-- Load sqlite-vec extension
.load ./sqlite-vec

-- Add vector columns to existing tables
ALTER TABLE files ADD COLUMN embedding BLOB;
ALTER TABLE code_nodes ADD COLUMN embedding BLOB;
ALTER TABLE commits ADD COLUMN embedding BLOB;
ALTER TABLE directories ADD COLUMN embedding BLOB;
ALTER TABLE test_nodes ADD COLUMN embedding BLOB;
ALTER TABLE pull_requests ADD COLUMN embedding BLOB;

-- Create vector indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_embedding ON files(embedding) USING vec;
CREATE INDEX IF NOT EXISTS idx_code_nodes_embedding ON code_nodes(embedding) USING vec;
CREATE INDEX IF NOT EXISTS idx_commits_embedding ON commits(embedding) USING vec;

-- Add metadata for vector operations
CREATE TABLE IF NOT EXISTS vector_metadata (
  table_name TEXT PRIMARY KEY,
  dimension INTEGER NOT NULL,
  distance_metric TEXT DEFAULT 'cosine',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO vector_metadata (table_name, dimension) VALUES
  ('files', 384),
  ('code_nodes', 384),
  ('commits', 384),
  ('directories', 384),
  ('test_nodes', 384),
  ('pull_requests', 384);
```

### **1.3 Docker Configuration Update**

**Update `Dockerfile.api` to include sqlite-vec:**
```dockerfile
FROM node:18-alpine AS base

# Install sqlite-vec extension
RUN apk add --no-cache sqlite-dev build-base
RUN wget https://github.com/asg017/sqlite-vec/releases/download/v0.1.0/sqlite-vec-0.1.0-loadable-linux-x86_64.tar.gz
RUN tar -xzf sqlite-vec-0.1.0-loadable-linux-x86_64.tar.gz
RUN cp vec0.so /usr/local/lib/

# Rest of existing Dockerfile...
```

---

## 📋 **Phase 2: Core Implementation** *(Weeks 3-6)*

### **2.1 Extend SQLiteClient with Vector Operations**

**Add to `src/persistence/db-clients.ts`:**
```typescript
export class SQLiteClient {
  private vectorEnabled = false;

  async enableVectorSupport(): Promise<void> {
    try {
      // Load sqlite-vec extension
      this.db.loadExtension('vec0');
      this.vectorEnabled = true;
      this.logger.info('SQLite-vec extension loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load sqlite-vec extension', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Insert vector embedding into specified table
   */
  async insertVector(tableName: string, id: string, embedding: number[]): Promise<void> {
    if (!this.vectorEnabled) {
      throw new Error('Vector support not enabled');
    }

    const vectorBlob = Buffer.from(new Float32Array(embedding).buffer);
    const sql = `UPDATE ${tableName} SET embedding = ? WHERE id = ?`;
    
    try {
      this.run(sql, [vectorBlob, id]);
    } catch (error) {
      this.logger.error(`Failed to insert vector for ${tableName}:${id}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Batch insert vectors for multiple records
   */
  async batchInsertVectors(tableName: string, vectors: Array<{id: string, embedding: number[]}>): Promise<{success: number, failed: number, errors: string[]}> {
    if (!this.vectorEnabled) {
      throw new Error('Vector support not enabled');
    }

    const stmt = this.prepare(`UPDATE ${tableName} SET embedding = ? WHERE id = ?`);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((vectorList: typeof vectors) => {
      for (const vector of vectorList) {
        try {
          const vectorBlob = Buffer.from(new Float32Array(vector.embedding).buffer);
          stmt.run(vectorBlob, vector.id);
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to insert vector for ${vector.id}: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
        }
      }
    });

    try {
      insertMany(vectors);
      this.logger.info(`Batch inserted vectors to ${tableName}`, { success, failed, total: vectors.length });
    } catch (error) {
      this.logger.error(`Batch vector insert failed for ${tableName}`, { error: getErrorMessage(error) });
      throw error;
    }

    return { success, failed, errors };
  }

  /**
   * Perform vector similarity search
   */
  async vectorSearch(
    tableName: string, 
    queryVector: number[], 
    limit: number = 10,
    threshold: number = 0.8,
    additionalWhere?: string,
    additionalParams?: any[]
  ): Promise<Array<{id: string, similarity: number, data: any}>> {
    if (!this.vectorEnabled) {
      throw new Error('Vector support not enabled');
    }

    const queryBlob = Buffer.from(new Float32Array(queryVector).buffer);
    
    let sql = `
      SELECT *, vec_distance_cosine(embedding, ?) as distance
      FROM ${tableName} 
      WHERE embedding IS NOT NULL
    `;
    
    const params = [queryBlob];
    
    if (additionalWhere) {
      sql += ` AND ${additionalWhere}`;
      if (additionalParams) {
        params.push(...additionalParams);
      }
    }
    
    sql += ` ORDER BY distance ASC LIMIT ?`;
    params.push(limit);

    try {
      const results = this.all(sql, params);
      
      return results
        .map((row: any) => ({
          id: row.id,
          similarity: 1 - row.distance, // Convert distance to similarity
          data: row
        }))
        .filter(result => result.similarity >= threshold);
        
    } catch (error) {
      this.logger.error(`Vector search failed for ${tableName}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Get vector statistics for a table
   */
  async getVectorStats(tableName: string): Promise<{
    totalVectors: number;
    avgDimension: number;
    nullVectors: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_vectors,
        COUNT(*) - COUNT(embedding) as null_vectors
      FROM ${tableName}
    `;
    
    const result = this.get(sql);
    
    return {
      totalVectors: result.with_vectors || 0,
      avgDimension: 384, // Fixed for now, could be dynamic
      nullVectors: result.null_vectors || 0
    };
  }
}
```

### **2.2 Update DataLoader for SQLite-vec Support**

**Modify `src/modules/data-loader.ts`:**
```typescript
export class DataLoader {
  private vectorConfig: VectorConfig;

  constructor(lancedbPath: string, sqlitePath: string, config: ConfigManager) {
    // Existing constructor code...
    this.vectorConfig = config.getVectorConfig();
  }

  /**
   * Load vectors to SQLite-vec instead of LanceDB
   */
  private async batchLoadToSQLiteVec(nodes: NodeWithEmbedding[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} vectors to SQLite-vec`);

    try {
      // Enable vector support if not already enabled
      if (!this.sqliteClient.vectorEnabled) {
        await this.sqliteClient.enableVectorSupport();
      }

      // Group nodes by type for batch processing
      const nodesByType = this.groupNodesByType(nodes);

      for (const [nodeType, typeNodes] of Object.entries(nodesByType)) {
        if (typeNodes.length === 0) continue;

        const tableName = this.getTableNameForNodeType(nodeType);
        const vectors = typeNodes.map(node => ({
          id: node.id,
          embedding: node.embedding
        }));

        this.logger.debug(`Loading ${vectors.length} vectors to ${tableName}`);
        
        const result = await this.sqliteClient.batchInsertVectors(tableName, vectors);
        
        this.logger.info(`Loaded vectors to ${tableName}`, {
          success: result.success,
          failed: result.failed,
          errors: result.errors.slice(0, 3) // Log first 3 errors
        });
      }

      operation();
    } catch (error) {
      this.logger.error('SQLite-vec batch load failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Main load method with vector backend selection
   */
  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<{
    success: boolean;
    results: {
      lancedb?: { success: boolean; error?: string };
      sqliteVec?: { success: boolean; error?: string };
      sqlite: { success: boolean; error?: string };
    };
  }> {
    // Existing validation code...

    const results: any = {
      sqlite: { success: false }
    };

    try {
      const connectionStatus = await this.connectToDatabases();
      
      // Load to SQLite metadata (always)
      if (connectionStatus.sqlite) {
        await this.batchLoadToSqlite(nodes, edges);
        results.sqlite.success = true;
      }

      // Load vectors based on configuration
      if (this.vectorConfig.backend === 'sqlite-vec' && connectionStatus.sqlite) {
        try {
          await this.batchLoadToSQLiteVec(nodes);
          results.sqliteVec = { success: true };
          this.logger.info('SQLite-vec loading completed successfully');
        } catch (error) {
          results.sqliteVec = { success: false, error: getErrorMessage(error) };
          this.logger.error('SQLite-vec loading failed', { error: getErrorMessage(error) });
        }
      } else if (this.vectorConfig.backend === 'lancedb' && connectionStatus.lancedb) {
        // Existing LanceDB loading logic
        try {
          await this.batchLoadToVectorDB(nodes);
          results.lancedb = { success: true };
        } catch (error) {
          results.lancedb = { success: false, error: getErrorMessage(error) };
        }
      }

      const successfulLoads = Object.values(results).filter(r => r.success).length;
      
      return {
        success: successfulLoads > 0,
        results
      };

    } catch (error) {
      this.logger.error('Data loading failed', { error: getErrorMessage(error) });
      throw error;
    } finally {
      await this.disconnectFromDatabases();
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

---

## 📋 **Phase 3: Search Service Integration** *(Weeks 7-8)*

### **3.1 Add SQLite-vec Search Methods**

**Update `src/modules/search-service.ts`:**
```typescript
export class SearchService {
  private vectorConfig: VectorConfig;

  constructor(config: ConfigManager) {
    this.config = config;
    this.vectorConfig = config.getVectorConfig();
    // Existing constructor code...
  }

  /**
   * Perform semantic search using SQLite-vec
   */
  async semanticSearchSQLiteVec(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      nodeTypes,
      minSimilarity = 0.1
    } = options;

    const operation = this.logger.operation(`SQLite-vec semantic search: "${query}"`);

    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.embedQuery(query);
      
      const allResults: SearchResult[] = [];
      const nodeTypesToSearch = nodeTypes || [
        'CodeNode', 'FileNode', 'DirectoryNode', 'CommitNode', 'TestNode', 'PullRequestNode'
      ];

      for (const nodeType of nodeTypesToSearch) {
        const tableName = this.getTableNameForNodeType(nodeType);
        
        try {
          const results = await this.sqliteClient.vectorSearch(
            tableName,
            queryEmbedding,
            Math.ceil(limit * 1.5), // Get more results for filtering
            minSimilarity
          );

          const searchResults = results.map(result => ({
            node: this.convertRowToNode(result.data, nodeType),
            similarity: result.similarity,
            rank: 0 // Will be set after sorting
          }));

          allResults.push(...searchResults);
        } catch (error) {
          this.logger.warn(`SQLite-vec search failed for ${nodeType}`, { error: getErrorMessage(error) });
        }
      }

      // Sort by similarity and limit results
      const sortedResults = allResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map((result, index) => ({ ...result, rank: index + 1 }));

      this.logger.info('SQLite-vec semantic search completed', {
        query: query.substring(0, 50),
        resultsFound: sortedResults.length,
        topSimilarity: sortedResults[0]?.similarity || 0
      });

      operation();
      return sortedResults;
    } catch (error) {
      this.logger.error('SQLite-vec semantic search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Enhanced hybrid search using SQLite-vec
   */
  async hybridSearchSQLiteVec(
    query: string,
    filters: MetadataFilters = {},
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const operation = this.logger.operation(`SQLite-vec hybrid search: "${query}"`);

    try {
      const queryEmbedding = await this.embeddingService.embedQuery(query);
      const { limit = 10, minSimilarity = 0.1 } = options;
      
      const allResults: SearchResult[] = [];

      // Build WHERE clause for metadata filters
      const { whereClause, params } = this.buildMetadataWhereClause(filters);

      // Search each node type with combined vector + metadata filtering
      const nodeTypes = ['files', 'code_nodes', 'commits'];
      
      for (const tableName of nodeTypes) {
        try {
          const results = await this.sqliteClient.vectorSearch(
            tableName,
            queryEmbedding,
            limit * 2,
            minSimilarity,
            whereClause,
            params
          );

          const searchResults = results.map(result => ({
            node: this.convertRowToNode(result.data, this.getNodeTypeFromTable(tableName)),
            similarity: result.similarity,
            rank: 0
          }));

          allResults.push(...searchResults);
        } catch (error) {
          this.logger.warn(`Hybrid search failed for ${tableName}`, { error: getErrorMessage(error) });
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

      this.logger.info('SQLite-vec hybrid search completed', {
        query: query.substring(0, 50),
        resultsFound: enhancedResults.length
      });

      operation();
      return enhancedResults;
    } catch (error) {
      this.logger.error('SQLite-vec hybrid search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Main semantic search method with backend selection
   */
  async semanticSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Route to appropriate backend based on configuration
    if (this.vectorConfig.backend === 'sqlite-vec') {
      return this.semanticSearchSQLiteVec(query, options);
    } else {
      return this.semanticSearchLanceDB(query, options); // Existing method
    }
  }

  /**
   * Main hybrid search method with backend selection  
   */
  async hybridSearch(
    query: string,
    filters: MetadataFilters = {},
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    if (this.vectorConfig.backend === 'sqlite-vec') {
      return this.hybridSearchSQLiteVec(query, filters, options);
    } else {
      return this.hybridSearchLanceDB(query, filters, options); // Existing method
    }
  }

  private buildMetadataWhereClause(filters: MetadataFilters): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.language) {
      conditions.push('language = ?');
      params.push(filters.language);
    }

    if (filters.fileExtension) {
      conditions.push('file_extension = ?');
      params.push(filters.fileExtension);
    }

    if (filters.author) {
      conditions.push('author LIKE ?');
      params.push(`%${filters.author}%`);
    }

    if (filters.filePath) {
      conditions.push('file_path LIKE ?');
      params.push(`%${filters.filePath}%`);
    }

    if (filters.dateRange) {
      conditions.push('date BETWEEN ? AND ?');
      params.push(filters.dateRange.start, filters.dateRange.end);
    }

    return {
      whereClause: conditions.length > 0 ? conditions.join(' AND ') : '',
      params
    };
  }

  private getNodeTypeFromTable(tableName: string): NodeType {
    const mapping: Record<string, NodeType> = {
      'files': 'FileNode',
      'code_nodes': 'CodeNode',
      'commits': 'CommitNode',
      'directories': 'DirectoryNode',
      'test_nodes': 'TestNode',
      'pull_requests': 'PullRequestNode'
    };
    return mapping[tableName] || 'CodeNode';
  }

  private convertRowToNode(row: any, nodeType: NodeType): NodeWithEmbedding {
    // Convert database row to NodeWithEmbedding based on node type
    const baseNode = {
      id: row.id,
      type: nodeType,
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : []
    };

    switch (nodeType) {
      case 'FileNode':
        return {
          ...baseNode,
          properties: {
            filePath: row.file_path,
            fileName: row.file_name,
            fileExtension: row.file_extension,
            language: row.language,
            sizeKb: row.size_kb,
            repoId: row.repo_id
          }
        };
      case 'CodeNode':
        return {
          ...baseNode,
          properties: {
            name: row.name,
            signature: row.signature,
            language: row.language,
            filePath: row.file_path,
            startLine: row.start_line,
            endLine: row.end_line
          }
        };
      case 'CommitNode':
        return {
          ...baseNode,
          properties: {
            hash: row.hash,
            message: row.message,
            author: row.author,
            date: row.date
          }
        };
      default:
        return {
          ...baseNode,
          properties: {}
        };
    }
  }
}
```

---

## 📋 **Phase 4: Migration & Testing** *(Weeks 9-12)*

### **4.1 Feature Flag Implementation**

**Create `src/utils/feature-flags.ts`:**
```typescript
export class FeatureFlags {
  private static instance: FeatureFlags;
  private flags: Map<string, boolean> = new Map();

  static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) {
      FeatureFlags.instance = new FeatureFlags();
    }
    return FeatureFlags.instance;
  }

  constructor() {
    this.loadFlags();
  }

  private loadFlags(): void {
    this.flags.set('use_sqlite_vec', process.env.HIKMA_USE_SQLITE_VEC === 'true');
    this.flags.set('dual_write_vectors', process.env.HIKMA_DUAL_WRITE_VECTORS === 'true');
    this.flags.set('compare_vector_backends', process.env.HIKMA_COMPARE_BACKENDS === 'true');
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) || false;
  }

  enable(flag: string): void {
    this.flags.set(flag, true);
  }

  disable(flag: string): void {
    this.flags.set(flag, false);
  }
}
```

### **4.2 Dual-Write Implementation for Safe Migration**

**Update DataLoader for dual-write capability:**
```typescript
export class DataLoader {
  /**
   * Dual-write vectors to both backends during migration
   */
  private async dualWriteVectors(nodes: NodeWithEmbedding[]): Promise<{
    lancedb: { success: boolean; error?: string };
    sqliteVec: { success: boolean; error?: string };
  }> {
    const results = {
      lancedb: { success: false },
      sqliteVec: { success: false }
    };

    // Write to both backends in parallel
    const writePromises = [
      this.batchLoadToVectorDB(nodes)
        .then(() => { results.lancedb.success = true; })
        .catch(error => { results.lancedb.error = getErrorMessage(error); }),
      
      this.batchLoadToSQLiteVec(nodes)
        .then(() => { results.sqliteVec.success = true; })
        .catch(error => { results.sqliteVec.error = getErrorMessage(error); })
    ];

    await Promise.allSettled(writePromises);

    this.logger.info('Dual-write completed', {
      lancedbSuccess: results.lancedb.success,
      sqliteVecSuccess: results.sqliteVec.success
    });

    return results;
  }

  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<any> {
    const featureFlags = FeatureFlags.getInstance();
    
    // Existing SQLite metadata loading...
    await this.batchLoadToSqlite(nodes, edges);

    // Vector storage based on feature flags
    if (featureFlags.isEnabled('dual_write_vectors')) {
      return await this.dualWriteVectors(nodes);
    } else if (featureFlags.isEnabled('use_sqlite_vec')) {
      await this.batchLoadToSQLiteVec(nodes);
    } else {
      await this.batchLoadToVectorDB(nodes); // Existing LanceDB
    }
  }
}
```

### **4.3 Performance Benchmarking Tools**

**Create `scripts/benchmark-vectors.ts`:**
```typescript
#!/usr/bin/env ts-node

import { performance } from 'perf_hooks';
import { ConfigManager } from '../src/config';
import { EmbeddingService } from '../src/modules/embedding-service';
import { SearchService } from '../src/modules/search-service';
import { SQLiteClient, LanceDBClient } from '../src/persistence/db-clients';

interface BenchmarkResult {
  backend: 'lancedb' | 'sqlite-vec';
  operation: string;
  duration: number;
  throughput: number;
  memoryUsage: number;
  resultCount: number;
}

class VectorBenchmark {
  private config: ConfigManager;
  private results: BenchmarkResult[] = [];

  constructor() {
    this.config = new ConfigManager();
  }

  async runBenchmarks(): Promise<void> {
    console.log('🚀 Starting Vector Backend Benchmarks\n');

    // Test data preparation
    const testQueries = [
      'function authentication login',
      'database connection pool',
      'error handling middleware',
      'user interface component',
      'api endpoint validation'
    ];

    const testSizes = [100, 1000, 5000, 10000];

    for (const size of testSizes) {
      console.log(`\n📊 Testing with ${size} vectors...`);
      
      // Benchmark LanceDB
      await this.benchmarkLanceDB(testQueries, size);
      
      // Benchmark SQLite-vec
      await this.benchmarkSQLiteVec(testQueries, size);
    }

    this.generateReport();
  }

  private async benchmarkLanceDB(queries: string[], vectorCount: number): Promise<void> {
    const searchService = new SearchService(this.config);
    await searchService.initialize();

    for (const query of queries) {
      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed;

      try {
        const results = await searchService.semanticSearchLanceDB(query, { limit: 10 });
        
        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        this.results.push({
          backend: 'lancedb',
          operation: `search_${vectorCount}`,
          duration: endTime - startTime,
          throughput: results.length / ((endTime - startTime) / 1000),
          memoryUsage: endMemory - startMemory,
          resultCount: results.length
        });
      } catch (error) {
        console.error(`LanceDB benchmark failed for query "${query}":`, error);
      }
    }

    await searchService.disconnect();
  }

  private async benchmarkSQLiteVec(queries: string[], vectorCount: number): Promise<void> {
    const searchService = new SearchService(this.config);
    await searchService.initialize();

    for (const query of queries) {
      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed;

      try {
        const results = await searchService.semanticSearchSQLiteVec(query, { limit: 10 });
        
        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        this.results.push({
          backend: 'sqlite-vec',
          operation: `search_${vectorCount}`,
          duration: endTime - startTime,
          throughput: results.length / ((endTime - startTime) / 1000),
          memoryUsage: endMemory - startMemory,
          resultCount: results.length
        });
      } catch (error) {
        console.error(`SQLite-vec benchmark failed for query "${query}":`, error);
      }
    }

    await searchService.disconnect();
  }

  private generateReport(): void {
    console.log('\n📈 BENCHMARK RESULTS\n');
    console.log('='.repeat(80));

    // Group results by operation and backend
    const grouped = this.results.reduce((acc, result) => {
      const key = `${result.operation}_${result.backend}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(result);
      return acc;
    }, {} as Record<string, BenchmarkResult[]>);

    // Calculate averages
    Object.entries(grouped).forEach(([key, results]) => {
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
      const avgMemory = results.reduce((sum, r) => sum + r.memoryUsage, 0) / results.length;

      console.log(`${key}:`);
      console.log(`  Average Duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Average Throughput: ${avgThroughput.toFixed(2)} results/sec`);
      console.log(`  Average Memory: ${(avgMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log('');
    });

    // Performance comparison
    this.comparePerformance();
  }

  private comparePerformance(): void {
    console.log('🔍 PERFORMANCE COMPARISON\n');
    
    const lancedbResults = this.results.filter(r => r.backend === 'lancedb');
    const sqliteVecResults = this.results.filter(r => r.backend === 'sqlite-vec');

    if (lancedbResults.length > 0 && sqliteVecResults.length > 0) {
      const lancedbAvgDuration = lancedbResults.reduce((sum, r) => sum + r.duration, 0) / lancedbResults.length;
      const sqliteVecAvgDuration = sqliteVecResults.reduce((sum, r) => sum + r.duration, 0) / sqliteVecResults.length;

      const performanceRatio = lancedbAvgDuration / sqliteVecAvgDuration;
      
      if (performanceRatio > 1.1) {
        console.log(`✅ SQLite-vec is ${performanceRatio.toFixed(2)}x faster than LanceDB`);
      } else if (performanceRatio < 0.9) {
        console.log(`⚠️  LanceDB is ${(1/performanceRatio).toFixed(2)}x faster than SQLite-vec`);
      } else {
        console.log(`🤝 Performance is similar between backends (${performanceRatio.toFixed(2)}x)`);
      }
    }

    console.log('\n💡 RECOMMENDATION:');
    this.generateRecommendation();
  }

  private generateRecommendation(): void {
    const lancedbResults = this.results.filter(r => r.backend === 'lancedb');
    const sqliteVecResults = this.results.filter(r => r.backend === 'sqlite-vec');

    if (sqliteVecResults.length === 0) {
      console.log('❌ SQLite-vec benchmarks failed - stick with LanceDB');
      return;
    }

    if (lancedbResults.length === 0) {
      console.log('❌ LanceDB benchmarks failed - migrate to SQLite-vec');
      return;
    }

    const sqliteVecAvgDuration = sqliteVecResults.reduce((sum, r) => sum + r.duration, 0) / sqliteVecResults.length;
    const lancedbAvgDuration = lancedbResults.reduce((sum, r) => sum + r.duration, 0) / lancedbResults.length;

    if (sqliteVecAvgDuration <= lancedbAvgDuration * 1.2) { // Within 20% performance
      console.log('✅ Migrate to SQLite-vec - performance is acceptable and operational benefits are significant');
    } else {
      console.log('⚠️  Consider keeping LanceDB - significant performance difference detected');
    }
  }
}

// Run benchmarks
const benchmark = new VectorBenchmark();
benchmark.runBenchmarks().catch(console.error);
```

### **4.4 Integration Testing**

**Create `src/tests/integration/vector-backends.test.ts`:**
```typescript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { ConfigManager } from '../../config';
import { SearchService } from '../../modules/search-service';
import { DataLoader } from '../../modules/data-loader';
import { EmbeddingService } from '../../modules/embedding-service';
import { FeatureFlags } from '../../utils/feature-flags';

describe('Vector Backend Integration Tests', () => {
  let config: ConfigManager;
  let searchService: SearchService;
  let dataLoader: DataLoader;
  let embeddingService: EmbeddingService;

  beforeAll(async () => {
    config = new ConfigManager();
    searchService = new SearchService(config);
    dataLoader = new DataLoader('test-lancedb', 'test.db', config);
    embeddingService = new EmbeddingService(config);
    
    await searchService.initialize();
  });

  afterAll(async () => {
    await searchService.disconnect();
  });

  describe('SQLite-vec Backend', () => {
    test('should perform semantic search with SQLite-vec', async () => {
      const featureFlags = FeatureFlags.getInstance();
      featureFlags.enable('use_sqlite_vec');

      const results = await searchService.semanticSearch('authentication function', {
        limit: 5,
        nodeTypes: ['CodeNode']
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('similarity');
      expect(results[0]).toHaveProperty('node');
      expect(results[0].similarity).toBeGreaterThan(0);
    });

    test('should perform hybrid search with metadata filtering', async () => {
      const results = await searchService.hybridSearch(
        'database connection',
        { language: 'typescript' },
        { limit: 5 }
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('metadata');
    });

    test('should handle vector insertion and retrieval', async () => {
      const testNodes = [
        {
          id: 'test-node-1',
          type: 'CodeNode' as const,
          properties: {
            name: 'testFunction',
            signature: 'testFunction(): void',
            language: 'typescript',
            filePath: '/test/file.ts',
            startLine: 1,
            endLine: 5
          },
          embedding: Array.from({ length: 384 }, () => Math.random())
        }
      ];

      const loadResult = await dataLoader.load(testNodes, []);
      expect(loadResult.success).toBe(true);

      // Search for the inserted node
      const searchResults = await searchService.semanticSearch('testFunction', {
        limit: 1,
        nodeTypes: ['CodeNode']
      });

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].node.properties.name).toBe('testFunction');
    });
  });

  describe('Backend Comparison', () => {
    test('should produce similar results from both backends', async () => {
      const query = 'user authentication';
      const options = { limit: 10, nodeTypes: ['CodeNode'] as const };

      // Test LanceDB
      const featureFlags = FeatureFlags.getInstance();
      featureFlags.disable('use_sqlite_vec');
      const lancedbResults = await searchService.semanticSearch(query, options);

      // Test SQLite-vec
      featureFlags.enable('use_sqlite_vec');
      const sqliteVecResults = await searchService.semanticSearch(query, options);

      // Results should be similar (allowing for some variance in ranking)
      expect(lancedbResults.length).toBeGreaterThan(0);
      expect(sqliteVecResults.length).toBeGreaterThan(0);
      
      // Check that top results have reasonable similarity scores
      expect(lancedbResults[0].similarity).toBeGreaterThan(0.1);
      expect(sqliteVecResults[0].similarity).toBeGreaterThan(0.1);

      // Log comparison for manual review
      console.log('LanceDB top result:', lancedbResults[0]);
      console.log('SQLite-vec top result:', sqliteVecResults[0]);
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent searches', async () => {
      const queries = [
        'authentication function',
        'database connection',
        'error handling',
        'user interface',
        'api endpoint'
      ];

      const startTime = Date.now();
      
      const promises = queries.map(query => 
        searchService.semanticSearch(query, { limit: 5 })
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(queries.length);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
});
```

---

## 🧪 **Testing Strategy**

### **Unit Tests**
```bash
# Test SQLite vector operations
npm test -- --testPathPattern=sqlite-vec

# Test search service with both backends
npm test -- --testPathPattern=search-service

# Test data loader vector storage
npm test -- --testPathPattern=data-loader
```

### **Integration Tests**
```bash
# Full integration test suite
npm run test:integration

# Vector backend comparison tests
npm test -- --testPathPattern=vector-backends

# API endpoint tests with both backends
npm run test:api
```

### **Performance Tests**
```bash
# Run vector benchmarks
npm run benchmark:vectors

# Load testing with different backends
npm run test:performance

# Memory usage profiling
npm run profile:memory
```

---

## 📊 **Performance Benchmarking**

### **Benchmark Metrics to Track**

1. **Query Latency**
   - Semantic search response time
   - Hybrid search response time
   - Concurrent query performance

2. **Throughput**
   - Queries per second
   - Vector insertions per second
   - Batch operation performance

3. **Resource Usage**
   - Memory consumption
   - CPU utilization
   - Disk I/O patterns

4. **Scalability**
   - Performance with different vector counts
   - Concurrent user handling
   - Database size impact

### **Benchmark Execution**
```bash
# Run comprehensive benchmarks
./scripts/benchmark-vectors.ts

# Compare specific operations
npm run benchmark:search
npm run benchmark:insert
npm run benchmark:hybrid

# Generate performance report
npm run benchmark:report
```

---

## ⚠️ **Risk Mitigation**

### **Rollback Strategy**
1. **Feature Flag Rollback**: Instant switch back to LanceDB
2. **Data Consistency**: Dual-write ensures no data loss
3. **Performance Monitoring**: Automated alerts for regression
4. **Gradual Migration**: Percentage-based traffic routing

### **Monitoring & Alerts**
```typescript
// Add to existing monitoring
const vectorMetrics = {
  searchLatency: 'vector_search_duration_ms',
  searchThroughput: 'vector_search_per_second',
  errorRate: 'vector_search_errors_total',
  memoryUsage: 'vector_db_memory_bytes'
};

// Alert thresholds
const alerts = {
  searchLatency: { threshold: 2000, severity: 'warning' },
  errorRate: { threshold: 0.05, severity: 'critical' },
  memoryUsage: { threshold: 1024 * 1024 * 1024, severity: 'warning' }
};
```

### **Data Validation**
```typescript
// Validate search result consistency
async function validateSearchConsistency(query: string): Promise<boolean> {
  const lancedbResults = await searchService.semanticSearchLanceDB(query);
  const sqliteVecResults = await searchService.semanticSearchSQLiteVec(query);
  
  // Check result overlap (should be >70% similar)
  const overlap = calculateResultOverlap(lancedbResults, sqliteVecResults);
  return overlap > 0.7;
}
```

---

## 🚀 **Implementation Timeline**

### **Week 1-2: Foundation**
- [ ] Install sqlite-vec dependencies
- [ ] Update Docker configuration
- [ ] Create database migration scripts
- [ ] Add vector configuration options

### **Week 3-4: Core Implementation**
- [ ] Extend SQLiteClient with vector methods
- [ ] Update DataLoader for SQLite-vec support
- [ ] Implement feature flags
- [ ] Create benchmarking tools

### **Week 5-6: Search Integration**
- [ ] Add SQLite-vec search methods
- [ ] Update SearchService routing
- [ ] Implement hybrid search optimization
- [ ] Create integration tests

### **Week 7-8: Testing & Validation**
- [ ] Run comprehensive benchmarks
- [ ] Execute integration test suite
- [ ] Validate search result quality
- [ ] Performance optimization

### **Week 9-10: Migration Preparation**
- [ ] Enable dual-write mode
- [ ] Monitor data consistency
- [ ] Gradual traffic migration (10% → 50% → 100%)
- [ ] Performance monitoring

### **Week 11-12: Completion**
- [ ] Full migration to SQLite-vec
- [ ] Remove LanceDB dependencies
- [ ] Update documentation
- [ ] Post-migration optimization

---

## ✅ **Success Criteria**

### **Performance Requirements**
- [ ] Query latency ≤ 2s (current requirement)
- [ ] Throughput ≥ 100 req/sec (current requirement)
- [ ] Memory usage reduction by 20%
- [ ] Search result quality maintained (>95% similarity)

### **Operational Benefits**
- [ ] Database count reduced from 3 to 2
- [ ] Deployment complexity reduced
- [ ] Monitoring overhead reduced
- [ ] Development velocity improved

### **Technical Validation**
- [ ] All tests passing with SQLite-vec backend
- [ ] Zero data loss during migration
- [ ] Rollback procedures validated
- [ ] Documentation updated

---

## 🎯 **Next Steps**

1. **Start with Phase 1** - Set up dependencies and configuration
2. **Run benchmarks** - Validate performance assumptions
3. **Implement feature flags** - Enable safe experimentation
4. **Begin core implementation** - Start with SQLiteClient extensions
5. **Test incrementally** - Validate each component before proceeding

This plan provides a comprehensive, low-risk approach to migrating your Hikma Engine from LanceDB to SQLite-vec while maintaining system reliability and performance.
