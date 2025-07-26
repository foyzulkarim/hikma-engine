/**
 * @file Enhanced search functionality specifically designed for the embedding_nodes table.
 *       Provides semantic vector search and metadata-based queries using the unified embedding storage.
 */

import { EmbeddingService } from './embedding-service';
import { SQLiteClient } from '../persistence/db-clients';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import { BaseNode, NodeWithEmbedding, NodeType } from '../types';

/**
 * Enhanced search result interface for embedding_nodes table.
 */
export interface EmbeddingSearchResult {
  node: {
    id: string;
    nodeId: string;
    nodeType: string;
    filePath: string;
    sourceText: string;
    embedding?: number[];
  };
  similarity: number;
  rank: number;
}

/**
 * Search options for embedding-based search.
 */
export interface EmbeddingSearchOptions {
  limit?: number;
  nodeTypes?: string[];
  minSimilarity?: number;
  filePaths?: string[];
  includeEmbedding?: boolean;
}

/**
 * Metadata filters for embedding nodes.
 */
export interface EmbeddingMetadataFilters {
  nodeType?: string;
  filePath?: string;
  fileExtension?: string;
  sourceTextContains?: string;
}

/**
 * Enhanced search service specifically for embedding_nodes table.
 */
export class EnhancedSearchService {
  private embeddingService: EmbeddingService;
  private sqliteClient: SQLiteClient;
  private config: ConfigManager;
  private logger = getLogger('EnhancedSearchService');
  private isInitialized = false;

  constructor(config: ConfigManager) {
    this.config = config;
    const dbConfig = config.getDatabaseConfig();
    
    this.embeddingService = new EmbeddingService(config);
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
  }

  /**
   * Initializes the enhanced search service.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug('Enhanced search service already initialized');
      return;
    }

    const operation = this.logger.operation('Initializing enhanced search service');
    
    try {
      this.logger.info('Loading embedding model...');
      await this.embeddingService.loadModel();
      
      this.logger.info('Connecting to SQLite database...');
      await this.sqliteClient.connect();
      
      // Verify embedding_nodes table exists
      await this.verifyEmbeddingTable();
      
      this.isInitialized = true;
      this.logger.info('Enhanced search service initialized successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to initialize enhanced search service', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Performs semantic search using vector embeddings on embedding_nodes table.
   */
  async semanticSearch(
    query: string, 
    options: EmbeddingSearchOptions = {}
  ): Promise<EmbeddingSearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      limit = 10,
      nodeTypes,
      minSimilarity = 0.1,
      filePaths,
      includeEmbedding = false
    } = options;

    const operation = this.logger.operation(`Semantic search on embeddings: "${query}"`);
    
    try {
      this.logger.info('Performing semantic search on embedding_nodes', { 
        query: query.substring(0, 100), 
        limit, 
        nodeTypes,
        filePaths
      });

      // Check if vector search is available
      const vectorAvailable = await this.sqliteClient.isVectorSearchAvailable();
      if (!vectorAvailable) {
        this.logger.warn('Vector search not available, falling back to text-based search');
        return await this.textBasedSearch(query, options);
      }

      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedQuery(query);
      
      // Build SQL query with filters
      let sql = `
        SELECT id, node_id, node_type, file_path, source_text,
               vec_distance_cosine(embedding, ?) as distance
        FROM embedding_nodes 
        WHERE embedding IS NOT NULL
      `;
      
      const params: any[] = [Buffer.from(new Float32Array(queryEmbedding).buffer)];
      
      // Add filters
      if (nodeTypes && nodeTypes.length > 0) {
        const placeholders = nodeTypes.map(() => '?').join(',');
        sql += ` AND node_type IN (${placeholders})`;
        params.push(...nodeTypes);
      }
      
      if (filePaths && filePaths.length > 0) {
        const fileConditions = filePaths.map(() => 'file_path LIKE ?').join(' OR ');
        sql += ` AND (${fileConditions})`;
        params.push(...filePaths.map(path => `%${path}%`));
      }
      
      // Add similarity threshold
      if (minSimilarity > 0) {
        const distanceThreshold = 1 - minSimilarity;
        sql += ` AND vec_distance_cosine(embedding, ?) <= ?`;
        params.push(Buffer.from(new Float32Array(queryEmbedding).buffer), distanceThreshold);
      }
      
      sql += ` ORDER BY distance ASC LIMIT ?`;
      params.push(limit);

      const results = this.sqliteClient.all(sql, params);
      
      const searchResults: EmbeddingSearchResult[] = results.map((row: any, index: number) => ({
        node: {
          id: row.id,
          nodeId: row.node_id,
          nodeType: row.node_type,
          filePath: row.file_path,
          sourceText: row.source_text,
          ...(includeEmbedding && { embedding: this.deserializeEmbedding(row.embedding) })
        },
        similarity: 1 - row.distance, // Convert distance to similarity
        rank: index + 1
      }));

      this.logger.info('Semantic search completed', {
        query: query.substring(0, 50),
        resultsFound: searchResults.length,
        topSimilarity: searchResults[0]?.similarity || 0
      });

      operation();
      return searchResults;
    } catch (error) {
      this.logger.error('Semantic search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Performs text-based search when vector search is not available.
   */
  async textBasedSearch(
    query: string,
    options: EmbeddingSearchOptions = {}
  ): Promise<EmbeddingSearchResult[]> {
    const {
      limit = 10,
      nodeTypes,
      filePaths
    } = options;
    
    try {
      let sql = `
        SELECT id, node_id, node_type, file_path, source_text
        FROM embedding_nodes 
        WHERE source_text LIKE ?
      `;
      
      const params: any[] = [`%${query}%`];
      
      // Add filters
      if (nodeTypes && nodeTypes.length > 0) {
        const placeholders = nodeTypes.map(() => '?').join(',');
        sql += ` AND node_type IN (${placeholders})`;
        params.push(...nodeTypes);
      }
      
      if (filePaths && filePaths.length > 0) {
        const fileConditions = filePaths.map(() => 'file_path LIKE ?').join(' OR ');
        sql += ` AND (${fileConditions})`;
        params.push(...filePaths.map(path => `%${path}%`));
      }
      
      sql += ` ORDER BY LENGTH(source_text) ASC LIMIT ?`;
      params.push(limit);

      const results = this.sqliteClient.all(sql, params);
      
      return results.map((row: any, index: number) => ({
        node: {
          id: row.id,
          nodeId: row.node_id,
          nodeType: row.node_type,
          filePath: row.file_path,
          sourceText: row.source_text
        },
        similarity: 0.8, // Default similarity for text search
        rank: index + 1
      }));
    } catch (error) {
      this.logger.error('Text-based search failed', { error: getErrorMessage(error) });
      return [];
    }
  }

  /**
   * Performs metadata-based search on embedding_nodes.
   */
  async metadataSearch(
    filters: EmbeddingMetadataFilters,
    options: EmbeddingSearchOptions = {}
  ): Promise<EmbeddingSearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { limit = 100 } = options;
    const operation = this.logger.operation('Metadata search on embeddings');
    
    try {
      this.logger.info('Performing metadata search on embedding_nodes', { filters });

      let sql = 'SELECT id, node_id, node_type, file_path, source_text FROM embedding_nodes WHERE 1=1';
      const params: any[] = [];

      if (filters.nodeType) {
        sql += ' AND node_type = ?';
        params.push(filters.nodeType);
      }

      if (filters.filePath) {
        sql += ' AND file_path LIKE ?';
        params.push(`%${filters.filePath}%`);
      }

      if (filters.fileExtension) {
        sql += ' AND file_path LIKE ?';
        params.push(`%.${filters.fileExtension}`);
      }

      if (filters.sourceTextContains) {
        sql += ' AND source_text LIKE ?';
        params.push(`%${filters.sourceTextContains}%`);
      }

      sql += ' ORDER BY id LIMIT ?';
      params.push(limit);

      const results = this.sqliteClient.all(sql, params);
      
      const searchResults: EmbeddingSearchResult[] = results.map((row: any, index: number) => ({
        node: {
          id: row.id,
          nodeId: row.node_id,
          nodeType: row.node_type,
          filePath: row.file_path,
          sourceText: row.source_text
        },
        similarity: 0.9, // High similarity for metadata matches
        rank: index + 1
      }));

      this.logger.info('Metadata search completed', {
        filters,
        resultsFound: searchResults.length
      });

      operation();
      return searchResults;
    } catch (error) {
      this.logger.error('Metadata search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Performs hybrid search combining semantic and metadata filters.
   */
  async hybridSearch(
    query: string,
    filters: EmbeddingMetadataFilters = {},
    options: EmbeddingSearchOptions = {}
  ): Promise<EmbeddingSearchResult[]> {
    const { limit = 20 } = options;
    
    try {
      // Perform semantic search with metadata filters
      const semanticResults = await this.semanticSearch(query, {
        ...options,
        limit: Math.ceil(limit * 0.7), // 70% from semantic search
        nodeTypes: filters.nodeType ? [filters.nodeType] : options.nodeTypes,
        filePaths: filters.filePath ? [filters.filePath] : options.filePaths
      });
      
      // Perform metadata search
      const metadataResults = await this.metadataSearch(filters, {
        ...options,
        limit: Math.ceil(limit * 0.3) // 30% from metadata search
      });
      
      // Combine and deduplicate results
      const allResults = [...semanticResults, ...metadataResults];
      const uniqueResults = new Map<string, EmbeddingSearchResult>();
      
      for (const result of allResults) {
        const key = result.node.id;
        if (!uniqueResults.has(key) || uniqueResults.get(key)!.similarity < result.similarity) {
          uniqueResults.set(key, result);
        }
      }
      
      // Sort by similarity and limit
      return Array.from(uniqueResults.values())
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map((result, index) => ({ ...result, rank: index + 1 }));
        
    } catch (error) {
      this.logger.error('Hybrid search failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Gets statistics about the embedding_nodes table.
   */
  async getEmbeddingStats(): Promise<{
    totalNodes: number;
    nodeTypeBreakdown: Record<string, number>;
    filePathBreakdown: Record<string, number>;
    embeddingCoverage: number;
  }> {
    try {
      const totalNodes = this.sqliteClient.get('SELECT COUNT(*) as count FROM embedding_nodes')?.count || 0;
      
      const nodeTypeResults = this.sqliteClient.all(`
        SELECT node_type, COUNT(*) as count 
        FROM embedding_nodes 
        GROUP BY node_type 
        ORDER BY count DESC
      `);
      
      const filePathResults = this.sqliteClient.all(`
        SELECT file_path, COUNT(*) as count 
        FROM embedding_nodes 
        GROUP BY file_path 
        ORDER BY count DESC 
        LIMIT 20
      `);
      
      const embeddedCount = this.sqliteClient.get('SELECT COUNT(*) as count FROM embedding_nodes WHERE embedding IS NOT NULL')?.count || 0;
      
      const nodeTypeBreakdown: Record<string, number> = {};
      for (const row of nodeTypeResults) {
        nodeTypeBreakdown[row.node_type] = row.count;
      }
      
      const filePathBreakdown: Record<string, number> = {};
      for (const row of filePathResults) {
        filePathBreakdown[row.file_path] = row.count;
      }
      
      return {
        totalNodes,
        nodeTypeBreakdown,
        filePathBreakdown,
        embeddingCoverage: totalNodes > 0 ? embeddedCount / totalNodes : 0
      };
    } catch (error) {
      this.logger.error('Failed to get embedding stats', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Finds similar nodes to a given node ID.
   */
  async findSimilarNodes(
    nodeId: string,
    options: EmbeddingSearchOptions = {}
  ): Promise<EmbeddingSearchResult[]> {
    try {
      // Get the embedding for the source node
      const sourceNode = this.sqliteClient.get(
        'SELECT embedding, node_type, file_path FROM embedding_nodes WHERE node_id = ?',
        [nodeId]
      );
      
      if (!sourceNode || !sourceNode.embedding) {
        throw new Error(`Node ${nodeId} not found or has no embedding`);
      }
      
      const sourceEmbedding = this.deserializeEmbedding(sourceNode.embedding);
      
      // Perform vector search using the source embedding
      return await this.vectorSearchWithEmbedding(sourceEmbedding, {
        ...options,
        nodeTypes: options.nodeTypes || [sourceNode.node_type]
      });
    } catch (error) {
      this.logger.error('Failed to find similar nodes', { nodeId, error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Performs vector search with a given embedding.
   */
  private async vectorSearchWithEmbedding(
    embedding: number[],
    options: EmbeddingSearchOptions = {}
  ): Promise<EmbeddingSearchResult[]> {
    const {
      limit = 10,
      nodeTypes,
      minSimilarity = 0.1,
      filePaths
    } = options;
    
    let sql = `
      SELECT id, node_id, node_type, file_path, source_text,
             vec_distance_cosine(embedding, ?) as distance
      FROM embedding_nodes 
      WHERE embedding IS NOT NULL
    `;
    
    const params: any[] = [Buffer.from(new Float32Array(embedding).buffer)];
    
    // Add filters
    if (nodeTypes && nodeTypes.length > 0) {
      const placeholders = nodeTypes.map(() => '?').join(',');
      sql += ` AND node_type IN (${placeholders})`;
      params.push(...nodeTypes);
    }
    
    if (filePaths && filePaths.length > 0) {
      const fileConditions = filePaths.map(() => 'file_path LIKE ?').join(' OR ');
      sql += ` AND (${fileConditions})`;
      params.push(...filePaths.map(path => `%${path}%`));
    }
    
    if (minSimilarity > 0) {
      const distanceThreshold = 1 - minSimilarity;
      sql += ` AND vec_distance_cosine(embedding, ?) <= ?`;
      params.push(Buffer.from(new Float32Array(embedding).buffer), distanceThreshold);
    }
    
    sql += ` ORDER BY distance ASC LIMIT ?`;
    params.push(limit);

    const results = this.sqliteClient.all(sql, params);
    
    return results.map((row: any, index: number) => ({
      node: {
        id: row.id,
        nodeId: row.node_id,
        nodeType: row.node_type,
        filePath: row.file_path,
        sourceText: row.source_text
      },
      similarity: 1 - row.distance,
      rank: index + 1
    }));
  }

  /**
   * Verifies that the embedding_nodes table exists and has the expected structure.
   */
  private async verifyEmbeddingTable(): Promise<void> {
    try {
      const tableInfo = this.sqliteClient.all("PRAGMA table_info(embedding_nodes)");
      if (tableInfo.length === 0) {
        throw new Error('embedding_nodes table does not exist');
      }
      
      const requiredColumns = ['id', 'node_id', 'embedding', 'source_text', 'node_type', 'file_path'];
      const existingColumns = tableInfo.map((col: any) => col.name);
      
      for (const col of requiredColumns) {
        if (!existingColumns.includes(col)) {
          throw new Error(`Required column '${col}' missing from embedding_nodes table`);
        }
      }
      
      this.logger.info('embedding_nodes table structure verified', { columns: existingColumns });
    } catch (error) {
      this.logger.error('Failed to verify embedding_nodes table', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Deserializes embedding from database blob format.
   */
  private deserializeEmbedding(blob: Buffer): number[] {
    const float32Array = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
    return Array.from(float32Array);
  }

  /**
   * Disconnects from the database.
   */
  async disconnect(): Promise<void> {
    try {
      this.sqliteClient.disconnect();
      this.isInitialized = false;
      this.logger.info('Enhanced search service disconnected');
    } catch (error) {
      this.logger.error('Failed to disconnect enhanced search service', { error: getErrorMessage(error) });
      throw error;
    }
  }
}