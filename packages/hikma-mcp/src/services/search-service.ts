/**
 * Search service for hikma-mcp
 *
 * Provides semantic search capabilities using the hikma-engine index.
 * Uses @xenova/transformers for local embeddings.
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import { pipeline, env } from '@xenova/transformers';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { DatabaseError, EmbeddingError } from '../utils/errors';

// Configure transformers.js
env.allowRemoteModels = true;
env.allowLocalModels = true;

export interface SearchResult {
  id: string;
  nodeId: string;
  nodeType: string;
  filePath: string;
  sourceText: string;
  similarity: number;
  lineStart?: number;
  lineEnd?: number;
  name?: string;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  nodeTypes?: string[];
  filePattern?: string;
  language?: string;
}

export interface FileInfo {
  filePath: string;
  language: string;
  summary?: string;
  lineCount: number;
}

export interface SymbolInfo {
  name: string;
  type: string;
  filePath: string;
  line: number;
  column?: number;
  signature?: string;
  docstring?: string;
  exported?: boolean;
}

export interface CallerInfo {
  name: string;
  filePath: string;
  line: number;
  callSiteLine?: number;
  depth: number;
}

export interface DependencyInfo {
  module: string;
  filePath?: string;
  symbols: string[];
  isExternal: boolean;
}

export interface RelatedCodeInfo {
  filePath: string;
  line: number;
  name?: string;
  relationship: string;
  relevance: number;
}

export class SearchService {
  private db: DatabaseType;
  private embeddingPipeline: any = null;
  private isInitialized = false;
  private vectorEnabled = false;
  private projectPath: string;

  constructor(dbPath: string, projectPath: string) {
    this.projectPath = projectPath;
    logger.debug(`Initializing SearchService with database: ${dbPath}`);

    try {
      this.db = new Database(dbPath, { readonly: true });
      logger.debug('Database connection established');
    } catch (error) {
      throw new DatabaseError('connect', String(error));
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('Initializing search service...');

    // Load vector extension
    this.loadVectorExtension();

    // Load embedding model
    await this.loadEmbeddingModel();

    // Verify database structure
    this.verifyDatabaseStructure();

    this.isInitialized = true;
    logger.info('Search service initialized successfully');
  }

  private loadVectorExtension(): void {
    try {
      // Try to find the vector extension
      const extensionPaths = [
        process.env.HIKMA_SQLITE_VEC_EXTENSION,
        path.resolve(this.projectPath, '.hikma', 'extensions', 'vec0'),
        path.resolve(__dirname, '../../../../extensions/vec0'),
        './extensions/vec0',
      ].filter(Boolean) as string[];

      for (const extPath of extensionPaths) {
        try {
          this.db.loadExtension(extPath);
          this.db.prepare('SELECT vec_version()').get();
          this.vectorEnabled = true;
          logger.info(`Vector extension loaded from: ${extPath}`);
          return;
        } catch {
          // Try next path
        }
      }

      logger.warn('Vector extension not found, semantic search will be limited');
    } catch (error) {
      logger.warn('Failed to load vector extension:', error);
    }
  }

  private async loadEmbeddingModel(): Promise<void> {
    try {
      logger.info('Loading embedding model (all-MiniLM-L6-v2)...');
      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      logger.info('Embedding model loaded successfully');
    } catch (error) {
      throw new EmbeddingError(`Failed to load model: ${error}`);
    }
  }

  private verifyDatabaseStructure(): void {
    try {
      // Check for embedding_nodes table
      const tableInfo = this.db.prepare("PRAGMA table_info(embedding_nodes)").all();
      if (tableInfo.length === 0) {
        throw new DatabaseError('verify', 'embedding_nodes table not found');
      }
      logger.debug('Database structure verified');
    } catch (error) {
      throw new DatabaseError('verify', String(error));
    }
  }

  async embedQuery(query: string): Promise<number[]> {
    if (!this.embeddingPipeline) {
      throw new EmbeddingError('Embedding model not loaded');
    }

    try {
      const result = await this.embeddingPipeline(query, {
        pooling: 'mean',
        normalize: true,
      });

      return Array.from(result.data);
    } catch (error) {
      throw new EmbeddingError(`Query embedding failed: ${error}`);
    }
  }

  async semanticSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const startTime = Date.now();
    const {
      limit = 10,
      minSimilarity = 0.3,
      nodeTypes,
      filePattern,
    } = options;

    logger.debug(`Semantic search: "${query.substring(0, 50)}..."`, { limit, minSimilarity });

    try {
      if (this.vectorEnabled) {
        return await this.vectorSearch(query, options);
      } else {
        return await this.textSearch(query, options);
      }
    } finally {
      const elapsed = Date.now() - startTime;
      logger.debug(`Search completed in ${elapsed}ms`);
    }
  }

  private async vectorSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { limit = 10, minSimilarity = 0.3, nodeTypes, filePattern } = options;

    // Generate query embedding
    const queryEmbedding = await this.embedQuery(query);
    const queryBlob = Buffer.from(new Float32Array(queryEmbedding).buffer);

    // Build SQL query
    let sql = `
      SELECT
        id,
        node_id as nodeId,
        node_type as nodeType,
        file_path as filePath,
        source_text as sourceText,
        vec_distance_cosine(embedding, ?) as distance
      FROM embedding_nodes
      WHERE embedding IS NOT NULL
    `;

    const params: any[] = [queryBlob];

    // Add filters
    if (nodeTypes && nodeTypes.length > 0) {
      const placeholders = nodeTypes.map(() => '?').join(',');
      sql += ` AND node_type IN (${placeholders})`;
      params.push(...nodeTypes);
    }

    if (filePattern) {
      sql += ` AND file_path LIKE ?`;
      params.push(`%${filePattern}%`);
    }

    // Add similarity threshold
    const distanceThreshold = 1 - minSimilarity;
    sql += ` AND vec_distance_cosine(embedding, ?) <= ?`;
    params.push(queryBlob, distanceThreshold);

    sql += ` ORDER BY distance ASC LIMIT ?`;
    params.push(limit);

    const results = this.db.prepare(sql).all(...params) as any[];

    return results
      .filter(row => !this.isTestFile(row.filePath))
      .map((row, index) => ({
        id: row.id,
        nodeId: row.nodeId,
        nodeType: row.nodeType,
        filePath: row.filePath,
        sourceText: row.sourceText,
        similarity: 1 - row.distance,
        ...this.extractLineInfo(row.sourceText),
        name: this.extractName(row.sourceText, row.nodeType),
      }));
  }

  private async textSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { limit = 10, nodeTypes, filePattern } = options;

    let sql = `
      SELECT
        id,
        node_id as nodeId,
        node_type as nodeType,
        file_path as filePath,
        source_text as sourceText
      FROM embedding_nodes
      WHERE source_text LIKE ?
    `;

    const params: any[] = [`%${query}%`];

    if (nodeTypes && nodeTypes.length > 0) {
      const placeholders = nodeTypes.map(() => '?').join(',');
      sql += ` AND node_type IN (${placeholders})`;
      params.push(...nodeTypes);
    }

    if (filePattern) {
      sql += ` AND file_path LIKE ?`;
      params.push(`%${filePattern}%`);
    }

    sql += ` ORDER BY LENGTH(source_text) ASC LIMIT ?`;
    params.push(limit);

    const results = this.db.prepare(sql).all(...params) as any[];

    return results
      .filter(row => !this.isTestFile(row.filePath))
      .map((row, index) => ({
        id: row.id,
        nodeId: row.nodeId,
        nodeType: row.nodeType,
        filePath: row.filePath,
        sourceText: row.sourceText,
        similarity: 0.7, // Default similarity for text search
        ...this.extractLineInfo(row.sourceText),
        name: this.extractName(row.sourceText, row.nodeType),
      }));
  }

  async getFileSummary(filePath: string): Promise<FileInfo | null> {
    try {
      // First try to get from files table if it exists
      const fileRow = this.db.prepare(`
        SELECT file_path, language, line_count
        FROM files
        WHERE file_path LIKE ?
        LIMIT 1
      `).get(`%${filePath}`) as any;

      if (fileRow) {
        // Get AI summary from embedding_nodes if available
        const summaryRow = this.db.prepare(`
          SELECT source_text
          FROM embedding_nodes
          WHERE file_path LIKE ? AND node_type = 'FileNode'
          LIMIT 1
        `).get(`%${filePath}`) as any;

        return {
          filePath: fileRow.file_path,
          language: fileRow.language || this.detectLanguage(filePath),
          summary: summaryRow?.source_text,
          lineCount: fileRow.line_count || 0,
        };
      }

      // Fallback: check if file exists in embedding_nodes
      const embeddingRow = this.db.prepare(`
        SELECT file_path, source_text
        FROM embedding_nodes
        WHERE file_path LIKE ?
        LIMIT 1
      `).get(`%${filePath}`) as any;

      if (embeddingRow) {
        return {
          filePath: embeddingRow.file_path,
          language: this.detectLanguage(embeddingRow.file_path),
          summary: embeddingRow.source_text,
          lineCount: 0,
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get file summary: ${error}`);
      return null;
    }
  }

  async getFileSymbols(filePath: string): Promise<SymbolInfo[]> {
    try {
      const results = this.db.prepare(`
        SELECT
          node_id as nodeId,
          node_type as nodeType,
          source_text as sourceText,
          file_path as filePath
        FROM embedding_nodes
        WHERE file_path LIKE ?
          AND node_type IN ('FunctionNode', 'CodeNode', 'ClassNode', 'MethodNode')
        ORDER BY node_type, node_id
      `).all(`%${filePath}`) as any[];

      return results.map(row => ({
        name: this.extractName(row.sourceText, row.nodeType),
        type: this.mapNodeType(row.nodeType),
        filePath: row.filePath,
        line: this.extractLineNumber(row.sourceText),
        signature: this.extractSignature(row.sourceText),
        exported: this.isExported(row.sourceText),
      }));
    } catch (error) {
      logger.error(`Failed to get file symbols: ${error}`);
      return [];
    }
  }

  async findSymbol(symbolName: string, symbolType?: string): Promise<SymbolInfo[]> {
    try {
      let sql = `
        SELECT
          node_id as nodeId,
          node_type as nodeType,
          source_text as sourceText,
          file_path as filePath
        FROM embedding_nodes
        WHERE source_text LIKE ?
      `;

      const params: any[] = [`%${symbolName}%`];

      if (symbolType && symbolType !== 'any') {
        const nodeTypes = this.symbolTypeToNodeTypes(symbolType);
        const placeholders = nodeTypes.map(() => '?').join(',');
        sql += ` AND node_type IN (${placeholders})`;
        params.push(...nodeTypes);
      }

      sql += ` ORDER BY
        CASE WHEN source_text LIKE ? THEN 0 ELSE 1 END,
        LENGTH(source_text)
      LIMIT 20`;
      params.push(`${symbolName}%`);

      const results = this.db.prepare(sql).all(...params) as any[];

      return results
        .filter(row => !this.isTestFile(row.filePath))
        .map(row => ({
          name: this.extractName(row.sourceText, row.nodeType) || symbolName,
          type: this.mapNodeType(row.nodeType),
          filePath: row.filePath,
          line: this.extractLineNumber(row.sourceText),
          signature: this.extractSignature(row.sourceText),
          exported: this.isExported(row.sourceText),
        }));
    } catch (error) {
      logger.error(`Failed to find symbol: ${error}`);
      return [];
    }
  }

  async getStats(): Promise<{
    totalNodes: number;
    totalFiles: number;
    nodeTypes: Record<string, number>;
    vectorEnabled: boolean;
  }> {
    try {
      const totalNodes = (this.db.prepare('SELECT COUNT(*) as count FROM embedding_nodes').get() as any)?.count || 0;

      let totalFiles = 0;
      try {
        totalFiles = (this.db.prepare('SELECT COUNT(*) as count FROM files').get() as any)?.count || 0;
      } catch {
        // files table might not exist
      }

      const nodeTypeResults = this.db.prepare(`
        SELECT node_type, COUNT(*) as count
        FROM embedding_nodes
        GROUP BY node_type
      `).all() as any[];

      const nodeTypes: Record<string, number> = {};
      for (const row of nodeTypeResults) {
        nodeTypes[row.node_type] = row.count;
      }

      return {
        totalNodes,
        totalFiles,
        nodeTypes,
        vectorEnabled: this.vectorEnabled,
      };
    } catch (error) {
      logger.error(`Failed to get stats: ${error}`);
      return {
        totalNodes: 0,
        totalFiles: 0,
        nodeTypes: {},
        vectorEnabled: this.vectorEnabled,
      };
    }
  }

  // ============================================
  // Phase 2: Graph Query Methods
  // ============================================

  /**
   * Find functions that call a given function
   */
  async findCallers(functionName: string, depth: number = 1): Promise<CallerInfo[]> {
    try {
      // First, find the target function in graph_nodes
      const targetNodes = this.db.prepare(`
        SELECT id, business_key, file_path, line, properties
        FROM graph_nodes
        WHERE (business_key LIKE ? OR properties LIKE ?)
          AND node_type IN ('FunctionNode', 'CodeNode', 'MethodNode')
        LIMIT 5
      `).all(`%${functionName}%`, `%"name":"${functionName}"%`) as any[];

      if (targetNodes.length === 0) {
        return [];
      }

      const callers: CallerInfo[] = [];
      const visited = new Set<string>();

      // Recursively find callers up to specified depth
      const findCallersRecursive = (nodeIds: string[], currentDepth: number) => {
        if (currentDepth > depth || nodeIds.length === 0) return;

        for (const nodeId of nodeIds) {
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);

          // Find edges where this node is the target (CALLS relationship)
          const edges = this.db.prepare(`
            SELECT e.source_id, e.source_business_key, e.line as call_line,
                   n.file_path, n.line, n.properties
            FROM graph_edges e
            JOIN graph_nodes n ON e.source_id = n.id
            WHERE e.target_id = ?
              AND e.edge_type = 'CALLS'
          `).all(nodeId) as any[];

          for (const edge of edges) {
            const props = this.safeParseJson(edge.properties);
            const name = props?.name || edge.source_business_key?.split(':').pop() || 'unknown';

            if (!this.isTestFile(edge.file_path)) {
              callers.push({
                name,
                filePath: edge.file_path,
                line: edge.line || 1,
                callSiteLine: edge.call_line,
                depth: currentDepth,
              });
            }

            // Recurse to find callers of callers
            if (currentDepth < depth) {
              findCallersRecursive([edge.source_id], currentDepth + 1);
            }
          }
        }
      };

      const targetIds = targetNodes.map(n => n.id);
      findCallersRecursive(targetIds, 1);

      return callers;
    } catch (error) {
      logger.error(`Failed to find callers: ${error}`);
      return [];
    }
  }

  /**
   * Find functions that a given function calls
   */
  async findCallees(functionName: string, depth: number = 1): Promise<CallerInfo[]> {
    try {
      // Find the source function
      const sourceNodes = this.db.prepare(`
        SELECT id, business_key, file_path, line, properties
        FROM graph_nodes
        WHERE (business_key LIKE ? OR properties LIKE ?)
          AND node_type IN ('FunctionNode', 'CodeNode', 'MethodNode')
        LIMIT 5
      `).all(`%${functionName}%`, `%"name":"${functionName}"%`) as any[];

      if (sourceNodes.length === 0) {
        return [];
      }

      const callees: CallerInfo[] = [];
      const visited = new Set<string>();

      const findCalleesRecursive = (nodeIds: string[], currentDepth: number) => {
        if (currentDepth > depth || nodeIds.length === 0) return;

        for (const nodeId of nodeIds) {
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);

          // Find edges where this node is the source (CALLS relationship)
          const edges = this.db.prepare(`
            SELECT e.target_id, e.target_business_key, e.line as call_line,
                   n.file_path, n.line, n.properties
            FROM graph_edges e
            JOIN graph_nodes n ON e.target_id = n.id
            WHERE e.source_id = ?
              AND e.edge_type = 'CALLS'
          `).all(nodeId) as any[];

          for (const edge of edges) {
            const props = this.safeParseJson(edge.properties);
            const name = props?.name || edge.target_business_key?.split(':').pop() || 'unknown';

            if (!this.isTestFile(edge.file_path)) {
              callees.push({
                name,
                filePath: edge.file_path,
                line: edge.line || 1,
                callSiteLine: edge.call_line,
                depth: currentDepth,
              });
            }

            if (currentDepth < depth) {
              findCalleesRecursive([edge.target_id], currentDepth + 1);
            }
          }
        }
      };

      const sourceIds = sourceNodes.map(n => n.id);
      findCalleesRecursive(sourceIds, 1);

      return callees;
    } catch (error) {
      logger.error(`Failed to find callees: ${error}`);
      return [];
    }
  }

  /**
   * Find dependencies (imports) for a file
   */
  async findDependencies(filePath: string): Promise<{
    imports: DependencyInfo[];
    importedBy: DependencyInfo[];
  }> {
    try {
      const imports: DependencyInfo[] = [];
      const importedBy: DependencyInfo[] = [];

      // Find imports from this file
      const importEdges = this.db.prepare(`
        SELECT e.target_business_key, e.properties,
               n.file_path as target_file
        FROM graph_edges e
        LEFT JOIN graph_nodes n ON e.target_id = n.id
        WHERE e.source_business_key LIKE ?
          AND e.edge_type IN ('IMPORTS', 'REFERENCES')
      `).all(`%${filePath}%`) as any[];

      for (const edge of importEdges) {
        const props = this.safeParseJson(edge.properties);
        const moduleName = edge.target_business_key || props?.module || 'unknown';
        const isExternal = !edge.target_file || edge.target_file.includes('node_modules');

        imports.push({
          module: moduleName,
          filePath: edge.target_file,
          symbols: props?.symbols || [],
          isExternal,
        });
      }

      // Find files that import this file
      const importedByEdges = this.db.prepare(`
        SELECT e.source_business_key, e.properties,
               n.file_path as source_file
        FROM graph_edges e
        LEFT JOIN graph_nodes n ON e.source_id = n.id
        WHERE e.target_business_key LIKE ?
          AND e.edge_type IN ('IMPORTS', 'REFERENCES')
      `).all(`%${filePath}%`) as any[];

      for (const edge of importedByEdges) {
        const props = this.safeParseJson(edge.properties);

        if (edge.source_file && !this.isTestFile(edge.source_file)) {
          importedBy.push({
            module: edge.source_file,
            filePath: edge.source_file,
            symbols: props?.symbols || [],
            isExternal: false,
          });
        }
      }

      return { imports, importedBy };
    } catch (error) {
      logger.error(`Failed to find dependencies: ${error}`);
      return { imports: [], importedBy: [] };
    }
  }

  /**
   * Find code related to a given location
   */
  async findRelated(
    filePath: string,
    line?: number,
    relationshipTypes: string[] = ['calls', 'called_by', 'similar_code']
  ): Promise<RelatedCodeInfo[]> {
    const related: RelatedCodeInfo[] = [];

    try {
      // Find the node at this location
      let nodeQuery = `
        SELECT id, node_type, properties, file_path, line
        FROM graph_nodes
        WHERE file_path LIKE ?
      `;
      const params: any[] = [`%${filePath}%`];

      if (line) {
        nodeQuery += ` AND line <= ? ORDER BY line DESC LIMIT 1`;
        params.push(line);
      } else {
        nodeQuery += ` LIMIT 1`;
      }

      const sourceNode = this.db.prepare(nodeQuery).get(...params) as any;

      if (!sourceNode) {
        // Fall back to semantic search for similar code
        if (relationshipTypes.includes('similar_code')) {
          const searchResults = await this.semanticSearch(filePath, { limit: 5 });
          for (const result of searchResults) {
            if (result.filePath !== filePath) {
              related.push({
                filePath: result.filePath,
                line: result.lineStart || 1,
                name: result.name,
                relationship: 'similar_code',
                relevance: result.similarity,
              });
            }
          }
        }
        return related;
      }

      // Find calls from this node
      if (relationshipTypes.includes('calls')) {
        const callees = await this.findCallees(sourceNode.id, 1);
        for (const callee of callees.slice(0, 5)) {
          related.push({
            filePath: callee.filePath,
            line: callee.line,
            name: callee.name,
            relationship: 'calls',
            relevance: 0.9,
          });
        }
      }

      // Find callers of this node
      if (relationshipTypes.includes('called_by')) {
        const callers = await this.findCallers(sourceNode.id, 1);
        for (const caller of callers.slice(0, 5)) {
          related.push({
            filePath: caller.filePath,
            line: caller.line,
            name: caller.name,
            relationship: 'called_by',
            relevance: 0.9,
          });
        }
      }

      // Find similar code using embeddings
      if (relationshipTypes.includes('similar_code')) {
        const props = this.safeParseJson(sourceNode.properties);
        const searchText = props?.name || props?.signature || filePath;
        const searchResults = await this.semanticSearch(searchText, { limit: 5 });

        for (const result of searchResults) {
          if (result.filePath !== filePath) {
            related.push({
              filePath: result.filePath,
              line: result.lineStart || 1,
              name: result.name,
              relationship: 'similar_code',
              relevance: result.similarity,
            });
          }
        }
      }

      // Find files in same module
      if (relationshipTypes.includes('same_module')) {
        const dirPath = path.dirname(filePath);
        const sameModuleFiles = this.db.prepare(`
          SELECT DISTINCT file_path
          FROM graph_nodes
          WHERE file_path LIKE ?
            AND file_path != ?
          LIMIT 5
        `).all(`${dirPath}%`, filePath) as any[];

        for (const file of sameModuleFiles) {
          if (!this.isTestFile(file.file_path)) {
            related.push({
              filePath: file.file_path,
              line: 1,
              relationship: 'same_module',
              relevance: 0.7,
            });
          }
        }
      }

      return related;
    } catch (error) {
      logger.error(`Failed to find related code: ${error}`);
      return related;
    }
  }

  /**
   * Get all files in the index
   */
  async getAllFiles(): Promise<string[]> {
    try {
      const files = this.db.prepare(`
        SELECT DISTINCT file_path FROM graph_nodes
        WHERE file_path IS NOT NULL
        ORDER BY file_path
      `).all() as any[];

      return files
        .map(f => f.file_path)
        .filter(f => !this.isTestFile(f));
    } catch (error) {
      logger.error(`Failed to get all files: ${error}`);
      return [];
    }
  }

  /**
   * Get module/directory structure
   */
  async getModuleStructure(): Promise<Record<string, string[]>> {
    try {
      const files = await this.getAllFiles();
      const modules: Record<string, string[]> = {};

      for (const file of files) {
        const dir = path.dirname(file);
        if (!modules[dir]) {
          modules[dir] = [];
        }
        modules[dir].push(path.basename(file));
      }

      return modules;
    } catch (error) {
      logger.error(`Failed to get module structure: ${error}`);
      return {};
    }
  }

  private safeParseJson(str: string | null): any {
    if (!str) return {};
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }

  close(): void {
    try {
      this.db.close();
      logger.debug('Database connection closed');
    } catch (error) {
      logger.error(`Failed to close database: ${error}`);
    }
  }

  // Helper methods

  private isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(ts|js|tsx|jsx)$/i.test(filePath) ||
      /\/tests?\//.test(filePath) ||
      /\/__tests__\//.test(filePath);
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
    };
    return langMap[ext] || 'unknown';
  }

  private extractLineInfo(sourceText: string): { lineStart?: number; lineEnd?: number } {
    // Try to extract line info from source text if present
    const lineMatch = sourceText.match(/line[s]?\s*(\d+)(?:\s*-\s*(\d+))?/i);
    if (lineMatch) {
      return {
        lineStart: parseInt(lineMatch[1], 10),
        lineEnd: lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined,
      };
    }
    return {};
  }

  private extractName(sourceText: string, nodeType: string): string {
    // Try to extract function/class name from source text
    const patterns = [
      /(?:function|class|interface|type|const|let|var)\s+(\w+)/,
      /^(\w+)\s*[(:=]/,
      /(\w+)\s*\(/,
    ];

    for (const pattern of patterns) {
      const match = sourceText.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return sourceText.substring(0, 30).trim();
  }

  private extractSignature(sourceText: string): string | undefined {
    // Try to extract function signature
    const match = sourceText.match(/^[^{]+/);
    if (match) {
      return match[0].trim().substring(0, 100);
    }
    return undefined;
  }

  private extractLineNumber(sourceText: string): number {
    const match = sourceText.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  private isExported(sourceText: string): boolean {
    return /^export\s/.test(sourceText);
  }

  private mapNodeType(nodeType: string): string {
    const typeMap: Record<string, string> = {
      'FunctionNode': 'function',
      'CodeNode': 'function',
      'ClassNode': 'class',
      'MethodNode': 'method',
      'InterfaceNode': 'interface',
      'TypeNode': 'type',
      'VariableNode': 'variable',
      'FileNode': 'file',
    };
    return typeMap[nodeType] || nodeType.toLowerCase().replace('Node', '');
  }

  private symbolTypeToNodeTypes(symbolType: string): string[] {
    const typeMap: Record<string, string[]> = {
      'function': ['FunctionNode', 'CodeNode', 'MethodNode'],
      'class': ['ClassNode'],
      'interface': ['InterfaceNode'],
      'variable': ['VariableNode'],
      'type': ['TypeNode', 'InterfaceNode'],
    };
    return typeMap[symbolType] || ['FunctionNode', 'CodeNode', 'ClassNode'];
  }
}
