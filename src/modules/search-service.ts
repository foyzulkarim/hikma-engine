/**
 * @file Provides search functionality for the hikma-engine knowledge graph.
 *       Supports both semantic vector search and metadata-based queries using unified SQLite storage.
 */

import { EmbeddingService } from './embedding-service';
import { SQLiteClient } from '../persistence/db-clients';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import { BaseNode, NodeWithEmbedding, NodeType } from '../types';

/**
 * Search result interface.
 */
export interface SearchResult {
  node: NodeWithEmbedding;
  similarity: number;
  rank: number;
}

/**
 * Search options interface.
 */
export interface SearchOptions {
  limit?: number;
  nodeTypes?: NodeType[];
  minSimilarity?: number;
  includeMetadata?: boolean;
}

/**
 * Metadata search filters.
 */
export interface MetadataFilters {
  fileExtension?: string;
  author?: string;
  language?: string;
  filePath?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

/**
 * Combined search result with metadata.
 */
export interface EnhancedSearchResult extends SearchResult {
  metadata?: {
    filePath?: string;
    fileName?: string;
    author?: string;
    language?: string;
    lastModified?: string;
  };
}

/**
 * Search service for semantic and metadata-based queries.
 */
export class SearchService {
  private embeddingService: EmbeddingService;
  private sqliteClient: SQLiteClient;
  private config: ConfigManager;
  private logger = getLogger('SearchService');
  private isInitialized = false;

  constructor(config: ConfigManager) {
    this.config = config;
    const dbConfig = config.getDatabaseConfig();
    
    this.embeddingService = new EmbeddingService(config);
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
  }

  /**
   * Initializes the search service by loading models and connecting to database.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug('Search service already initialized');
      return;
    }

    const operation = this.logger.operation('Initializing search service');
    
    try {
      this.logger.info('Loading embedding model...');
      await this.embeddingService.loadModel();
      
      this.logger.info('Connecting to SQLite database...');
      await this.sqliteClient.connect();
      
      // Check if vector search is available
      const vectorAvailable = await this.sqliteClient.isVectorSearchAvailable();
      if (vectorAvailable) {
        this.logger.info('Vector search capabilities available');
      } else {
        this.logger.warn('Vector search not available, semantic search will be limited');
      }
      
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
   * Performs semantic search using vector embeddings.
   * @param query - The search query string
   * @param options - Search options
   * @returns Array of search results
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
      minSimilarity = 0.1,
      includeMetadata = false
    } = options;

    const operation = this.logger.operation(`Semantic search: "${query}"`);
    
    try {
      this.logger.info('Performing semantic search', { 
        query: query.substring(0, 100), 
        limit, 
        nodeTypes 
      });

      // Check if vector search is available
      const vectorAvailable = await this.sqliteClient.isVectorSearchAvailable();
      if (!vectorAvailable) {
        this.logger.warn('Vector search not available, falling back to text-based search');
        try {
          const textResults = await this.searchCodeByText(query, { limit });
          return textResults;
        } catch (error) {
          this.logger.warn('Text search also failed, returning empty results', { error: getErrorMessage(error) });
          return [];
        }
      }

      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedQuery(query);
      
      // Search in SQLite using vector similarity for each node type
      const allResults: SearchResult[] = [];
      const nodeTypesToSearch = nodeTypes || [
        'Code', 'File', 'Commit', 'Test', 'PullRequest'
      ];

      for (const nodeType of nodeTypesToSearch) {
        try {
          const results = await this.searchNodeTypeWithVectors(nodeType, queryEmbedding, limit, minSimilarity);
          allResults.push(...results);
        } catch (error) {
          this.logger.warn(`Failed to search ${nodeType} nodes`, { error: getErrorMessage(error) });
        }
      }

      // Sort by similarity and limit results
      const sortedResults = allResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

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
   * Searches a specific node type using vector similarity.
   */
  private async searchNodeTypeWithVectors(
    nodeType: string, 
    queryEmbedding: number[], 
    limit: number, 
    minSimilarity: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      switch (nodeType) {
        case 'File':
          const fileResults = await this.sqliteClient.vectorSearch('files', 'content_embedding', queryEmbedding, limit, minSimilarity);
          results.push(...fileResults.map(r => this.convertToSearchResult(r, 'File')));
          break;
          
        case 'Function':
          // Search both signature and body embeddings
          const sigResults = await this.sqliteClient.vectorSearch('functions', 'signature_embedding', queryEmbedding, limit, minSimilarity);
          const bodyResults = await this.sqliteClient.vectorSearch('functions', 'body_embedding', queryEmbedding, limit, minSimilarity);
          results.push(...sigResults.map(r => this.convertToSearchResult(r, 'Function')));
          results.push(...bodyResults.map(r => this.convertToSearchResult(r, 'Function')));
          break;
          
        case 'Commit':
          const commitResults = await this.sqliteClient.vectorSearch('commits', 'message_embedding', queryEmbedding, limit, minSimilarity);
          results.push(...commitResults.map(r => this.convertToSearchResult(r, 'Commit')));
          break;
          

          
        case 'Code':
          const codeResults = await this.sqliteClient.vectorSearch('code_nodes', 'code_embedding', queryEmbedding, limit, minSimilarity);
          results.push(...codeResults.map(r => this.convertToSearchResult(r, 'Code')));
          break;
          
        case 'Test':
          const testResults = await this.sqliteClient.vectorSearch('test_nodes', 'test_embedding', queryEmbedding, limit, minSimilarity);
          results.push(...testResults.map(r => this.convertToSearchResult(r, 'Test')));
          break;
          
        case 'PullRequest':
          // Search both title and body embeddings
          const titleResults = await this.sqliteClient.vectorSearch('pull_requests', 'title_embedding', queryEmbedding, limit, minSimilarity);
          const prBodyResults = await this.sqliteClient.vectorSearch('pull_requests', 'body_embedding', queryEmbedding, limit, minSimilarity);
          results.push(...titleResults.map(r => this.convertToSearchResult(r, 'PullRequest')));
          results.push(...prBodyResults.map(r => this.convertToSearchResult(r, 'PullRequest')));
          break;
      }
    } catch (error) {
      this.logger.warn(`Vector search failed for ${nodeType}`, { error: getErrorMessage(error) });
    }
    
    return results;
  }

  /**
   * Converts SQLite vector search result to SearchResult format.
   */
  private convertToSearchResult(result: {id: string, similarity: number, data: any}, nodeType: string): SearchResult {
    return {
      node: {
        id: result.id,
        type: nodeType as NodeType,
        properties: result.data,
        embedding: [] // Don't return embedding in search results
      },
      similarity: result.similarity,
      rank: 0 // Will be set when sorting
    };
  }

  /**
   * Performs metadata-based search using SQL queries.
   * @param filters - Metadata filters
   * @param options - Search options
   * @returns Array of node IDs matching the filters
   */
  async metadataSearch(
    filters: MetadataFilters,
    options: SearchOptions = {}
  ): Promise<string[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { limit = 100 } = options;
    const operation = this.logger.operation('Metadata search');
    
    try {
      this.logger.info('Performing metadata search', { filters });

      const allNodeIds: string[] = [];

      // Search files table
      if (filters.fileExtension || filters.filePath) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.fileExtension) {
          conditions.push('file_extension = ?');
          params.push(filters.fileExtension);
        }

        if (filters.filePath) {
          conditions.push('file_path LIKE ?');
          params.push(`%${filters.filePath}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT id FROM files ${whereClause} LIMIT ?`;
        
        const results = this.sqliteClient.all(sql, [...params, limit]);
        allNodeIds.push(...results.map((row: any) => row.id));
      }

      // Search code_nodes table
      if (filters.language || filters.filePath) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.language) {
          conditions.push('language = ?');
          params.push(filters.language);
        }

        if (filters.filePath) {
          conditions.push('file_path LIKE ?');
          params.push(`%${filters.filePath}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT id FROM code_nodes ${whereClause} LIMIT ?`;
        
        const results = this.sqliteClient.all(sql, [...params, limit]);
        allNodeIds.push(...results.map((row: any) => row.id));
      }

      // Search commits table
      if (filters.author || filters.dateRange) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.author) {
          conditions.push('author LIKE ?');
          params.push(`%${filters.author}%`);
        }

        if (filters.dateRange) {
          conditions.push('date BETWEEN ? AND ?');
          params.push(filters.dateRange.start, filters.dateRange.end);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT id FROM commits ${whereClause} LIMIT ?`;
        
        const results = this.sqliteClient.all(sql, [...params, limit]);
        allNodeIds.push(...results.map((row: any) => row.id));
      }

      // Remove duplicates and limit results
      const uniqueNodeIds = Array.from(new Set(allNodeIds)).slice(0, limit);

      this.logger.info('Metadata search completed', {
        filters,
        resultsFound: uniqueNodeIds.length
      });

      operation();
      return uniqueNodeIds;
    } catch (error) {
      this.logger.error('Metadata search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Performs hybrid search combining semantic and metadata filtering.
   * @param query - The search query string
   * @param filters - Metadata filters
   * @param options - Search options
   * @returns Array of enhanced search results
   */
  async hybridSearch(
    query: string,
    filters: MetadataFilters = {},
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const operation = this.logger.operation(`Hybrid search: "${query}"`);
    
    try {
      this.logger.info('Performing hybrid search', { 
        query: query.substring(0, 100), 
        filters 
      });

      let semanticResults: SearchResult[] = [];
      
      // Try semantic search first
      try {
        semanticResults = await this.semanticSearch(query, {
          ...options,
          limit: (options.limit || 10) * 3 // Get more results for filtering
        });
      } catch (error) {
        this.logger.warn('Semantic search failed in hybrid search, using metadata only', { error: getErrorMessage(error) });
      }

      // Then, get metadata-filtered node IDs
      const metadataNodeIds = Object.keys(filters).length > 0 
        ? await this.metadataSearch(filters, { limit: 1000 })
        : [];

      // Filter semantic results by metadata if filters are provided
      let filteredResults = semanticResults;
      if (metadataNodeIds.length > 0) {
        const metadataSet = new Set(metadataNodeIds);
        filteredResults = semanticResults.filter(result => 
          metadataSet.has(result.node.id)
        );
      }

      // If both semantic search failed and no metadata results, try direct text search for code nodes
      if (filteredResults.length === 0 && options.nodeTypes?.includes('CodeNode')) {
        this.logger.info('Both semantic and metadata search failed, trying direct text search');
        try {
          const textResults = await this.searchCodeByText(query, { 
            limit: options.limit || 10,
            language: filters.language
          });
          filteredResults = textResults;
        } catch (error) {
          this.logger.warn('Direct text search also failed', { error: getErrorMessage(error) });
        }
      }

      // Enhance results with metadata
      const enhancedResults: EnhancedSearchResult[] = await Promise.all(
        filteredResults.slice(0, options.limit || 10).map(async (result, index) => {
          const metadata = await this.getNodeMetadata(result.node.id, result.node.type);
          return {
            ...result,
            rank: index + 1,
            metadata
          };
        })
      );

      this.logger.info('Hybrid search completed', {
        query: query.substring(0, 50),
        semanticResults: semanticResults.length,
        filteredResults: enhancedResults.length
      });

      operation();
      return enhancedResults;
    } catch (error) {
      this.logger.error('Hybrid search failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Gets metadata for a specific node.
   * @param nodeId - The node ID
   * @param nodeType - The node type
   * @returns Metadata object
   */
  private async getNodeMetadata(nodeId: string, nodeType: NodeType): Promise<any> {
    try {
      let sql = '';
      let result: any = null;
      
      switch (nodeType) {
        case 'FileNode':
          sql = 'SELECT file_path, file_name, file_extension, updated_at FROM files WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            return {
              filePath: result.file_path,
              fileName: result.file_name,
              fileExtension: result.file_extension,
              lastModified: result.updated_at
            };
          }
          break;
        case 'CodeNode':
          sql = 'SELECT file_path, language, updated_at FROM code_nodes WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            return {
              filePath: result.file_path,
              language: result.language,
              lastModified: result.updated_at
            };
          }
          break;
        case 'CommitNode':
          sql = 'SELECT author, date FROM commits WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            return {
              author: result.author,
              date: result.date
            };
          }
          break;
        case 'TestNode':
          sql = 'SELECT file_path, framework, updated_at FROM test_nodes WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            return {
              filePath: result.file_path,
              framework: result.framework,
              lastModified: result.updated_at
            };
          }
          break;
        case 'PullRequestNode':
          sql = 'SELECT author, title, url, created_at_pr FROM pull_requests WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            return {
              author: result.author,
              title: result.title,
              url: result.url,
              createdAt: result.created_at_pr
            };
          }
          break;
        default:
          return {};
      }

      return {};
    } catch (error) {
      this.logger.warn('Failed to get node metadata', { nodeId, error: getErrorMessage(error) });
      return {};
    }
  }

  /**
   * Gets the SQLite table name for a given node type.
   * @param nodeType - The node type
   * @returns Table name
   */
  private getTableNameForNodeType(nodeType: NodeType): string {
    return nodeType.toLowerCase() + 's';
  }

  /**
   * Searches for similar code patterns.
   * @param codeSnippet - Code snippet to find similar patterns for
   * @param language - Programming language filter
   * @param options - Search options
   * @returns Array of similar code nodes
   */
  async findSimilarCode(
    codeSnippet: string,
    language?: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const filters: MetadataFilters = {};
    if (language) {
      filters.language = language;
    }

    return this.hybridSearch(codeSnippet, filters, {
      ...options,
      nodeTypes: ['CodeNode']
    });
  }

  /**
   * Searches code nodes by text matching in SQLite metadata.
   * @param searchText - Text to search for
   * @param options - Search options
   * @returns Promise<SearchResult[]>
   */
  private async searchCodeByText(
    searchText: string,
    options: { limit?: number; language?: string } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, language } = options;
    
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      
      // Search in name and signature fields
      conditions.push('(name LIKE ? OR signature LIKE ?)');
      params.push(`%${searchText}%`, `%${searchText}%`);
      
      if (language) {
        conditions.push('language = ?');
        params.push(language);
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT * FROM code_nodes ${whereClause} LIMIT ?`;
      
      const results = this.sqliteClient.all(sql, [...params, limit]);
      
      return results.map((row: any, index: number) => ({
        node: {
          id: row.id,
          type: 'CodeNode' as NodeType,
          properties: {
            name: row.name,
            signature: row.signature,
            language: row.language,
            filePath: row.file_path,
            startLine: row.start_line,
            endLine: row.end_line
          },
          embedding: [] // Empty embedding for text search results
        } as NodeWithEmbedding,
        similarity: 1.0, // Perfect match for text search
        rank: index + 1
      }));
    } catch (error) {
      this.logger.error('Code text search failed', { error: getErrorMessage(error) });
      return [];
    }
  }

  /**
   * Searches for files by content or metadata.
   * @param query - Search query
   * @param fileExtension - File extension filter
   * @param options - Search options
   * @returns Array of file nodes
   */
  async searchFiles(
    query: string,
    fileExtension?: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const filters: MetadataFilters = {};
    if (fileExtension) {
      filters.fileExtension = fileExtension;
    }

    return this.hybridSearch(query, filters, {
      ...options,
      nodeTypes: ['FileNode']
    });
  }

  /**
   * Searches commit history.
   * @param query - Search query
   * @param author - Author filter
   * @param dateRange - Date range filter
   * @param options - Search options
   * @returns Array of commit nodes
   */
  async searchCommits(
    query: string,
    author?: string,
    dateRange?: { start: string; end: string },
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const filters: MetadataFilters = {};
    if (author) {
      filters.author = author;
    }
    if (dateRange) {
      filters.dateRange = dateRange;
    }

    return this.hybridSearch(query, filters, {
      ...options,
      nodeTypes: ['CommitNode']
    });
  }

  /**
   * Performs comprehensive search across all databases and node types.
   * This method combines semantic search, metadata search, and direct text search
   * to provide the most complete search results possible.
   * @param query - Search query
   * @param options - Search options
   * @returns Promise<SearchResult[]>
   */
  async comprehensiveSearch(
    query: string,
    options: SearchOptions & { metadataFilters?: MetadataFilters } = {}
  ): Promise<SearchResult[]> {
    const operation = this.logger.operation(`Comprehensive search: "${query}"`);
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      const { limit = 20, minSimilarity = 0.5, metadataFilters = {} } = options;
      const allNodeTypes: NodeType[] = ['CodeNode', 'FileNode', 'CommitNode', 'TestNode', 'PullRequestNode'];
      
      const allResults: SearchResult[] = [];
      
      // 1. Try semantic search across all node types
      try {
        const semanticResults = await this.semanticSearch(query, {
          limit: Math.ceil(limit * 0.4), // 40% from semantic search
          minSimilarity,
          nodeTypes: allNodeTypes
        });
        allResults.push(...semanticResults.map(r => ({ ...r, searchType: 'semantic' })));
        this.logger.info(`Semantic search found ${semanticResults.length} results`);
      } catch (error) {
        this.logger.warn('Semantic search failed in comprehensive search', { error: getErrorMessage(error) });
      }
      
      // 2. Metadata search across all node types
       try {
         const metadataNodeIds = await this.metadataSearch(metadataFilters, {
            limit: Math.ceil(limit * 0.3) // 30% from metadata search
          });
          const metadataResults = await this.getNodesByIds(metadataNodeIds);
         allResults.push(...metadataResults.map(r => ({ ...r, searchType: 'metadata' })));
         this.logger.info(`Metadata search found ${metadataResults.length} results`);
       } catch (error) {
         this.logger.warn('Metadata search failed in comprehensive search', { error: getErrorMessage(error) });
       }
      
      // 3. Direct text search for code nodes
      try {
        const textResults = await this.searchCodeByText(query, {
          limit: Math.ceil(limit * 0.2), // 20% from text search
          language: metadataFilters.language
        });
        allResults.push(...textResults.map(r => ({ ...r, searchType: 'text' })));
        this.logger.info(`Text search found ${textResults.length} results`);
      } catch (error) {
        this.logger.warn('Text search failed in comprehensive search', { error: getErrorMessage(error) });
      }
      
      // 4. File name search
      try {
        const fileResults = await this.searchFilesByName(query, {
          limit: Math.ceil(limit * 0.1) // 10% from file search
        });
        allResults.push(...fileResults.map(r => ({ ...r, searchType: 'file' })));
        this.logger.info(`File search found ${fileResults.length} results`);
      } catch (error) {
        this.logger.warn('File search failed in comprehensive search', { error: getErrorMessage(error) });
      }
      
      // Deduplicate and rank results
      const deduplicatedResults = this.deduplicateResults(allResults);
      const rankedResults = this.rankComprehensiveResults(deduplicatedResults, query);
      
      // Limit final results
      const finalResults = rankedResults.slice(0, limit);
      
      this.logger.info(`Comprehensive search completed`, {
        query,
        totalResults: finalResults.length,
        semanticCount: finalResults.filter(r => (r as any).searchType === 'semantic').length,
         metadataCount: finalResults.filter(r => (r as any).searchType === 'metadata').length,
         textCount: finalResults.filter(r => (r as any).searchType === 'text').length,
         fileCount: finalResults.filter(r => (r as any).searchType === 'file').length
      });
      
      return finalResults;
     } catch (error) {
       this.logger.error('Comprehensive search failed', { error: getErrorMessage(error) });
       throw error;
     } finally {
         operation();
       }
  }

  /**
   * Converts node IDs to SearchResult objects.
   * @param nodeIds - Array of node IDs
   * @returns Promise<SearchResult[]>
   */
  private async getNodesByIds(nodeIds: string[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    for (const nodeId of nodeIds) {
      try {
        // Try to get node from different tables
        let node: NodeWithEmbedding | null = null;
        
        // Check code_nodes table
        let sql = 'SELECT * FROM code_nodes WHERE id = ?';
        let result = this.sqliteClient.get(sql, [nodeId]);
        if (result) {
          node = {
            id: result.id,
            type: 'CodeNode' as NodeType,
            properties: {
              name: result.name,
              signature: result.signature,
              language: result.language,
              filePath: result.file_path,
              startLine: result.start_line,
              endLine: result.end_line
            },
            embedding: []
          };
        }
        
        // Check files table if not found
        if (!node) {
          sql = 'SELECT * FROM files WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            node = {
              id: result.id,
              type: 'FileNode' as NodeType,
              properties: {
                filePath: result.file_path,
                fileName: result.file_name,
                fileExtension: result.file_extension
              },
              embedding: []
            };
          }
        }
        
        // Check commits table if not found
        if (!node) {
          sql = 'SELECT * FROM commits WHERE id = ?';
          result = this.sqliteClient.get(sql, [nodeId]);
          if (result) {
            node = {
              id: result.id,
              type: 'CommitNode' as NodeType,
              properties: {
                message: result.message,
                author: result.author,
                date: result.date,
                hash: result.hash
              },
              embedding: []
            };
          }
        }
        
        if (node) {
          results.push({
            node,
            similarity: 0.8, // Default similarity for metadata results
            rank: results.length + 1
          });
        }
      } catch (error) {
        this.logger.warn('Failed to get node by ID', { nodeId, error: getErrorMessage(error) });
      }
    }
    
    return results;
  }

  /**
   * Searches files by name pattern.
   * @param query - Search query
   * @param options - Search options
   * @returns Promise<SearchResult[]>
   */
  private async searchFilesByName(
    query: string,
    options: { limit?: number } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10 } = options;
    
    try {
      const sql = `
        SELECT * FROM files 
        WHERE file_path LIKE ? OR file_name LIKE ?
        ORDER BY 
          CASE 
            WHEN file_name LIKE ? THEN 1
            WHEN file_path LIKE ? THEN 2
            ELSE 3
          END
        LIMIT ?
      `;
      
      const searchPattern = `%${query}%`;
      const exactPattern = `%${query}%`;
      
      const results = this.sqliteClient.all(sql, [
        searchPattern, searchPattern, exactPattern, exactPattern, limit
      ]);
      
      return results.map((row: any, index: number) => ({
        node: {
          id: row.id,
          type: 'FileNode' as NodeType,
          properties: {
            filePath: row.file_path,
            fileName: row.file_name,
            size: row.size,
            language: row.language,
            lastModified: row.last_modified
          },
          embedding: [] // Empty embedding for file search results
        } as NodeWithEmbedding,
        similarity: 0.9, // High similarity for name matches
        rank: index + 1
      }));
    } catch (error) {
      this.logger.error('File name search failed', { error: getErrorMessage(error) });
      return [];
    }
  }

  /**
   * Deduplicates search results based on node ID.
   * @param results - Array of search results
   * @returns SearchResult[]
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const deduplicated: SearchResult[] = [];
    
    for (const result of results) {
      if (!seen.has(result.node.id)) {
        seen.add(result.node.id);
        deduplicated.push(result);
      }
    }
    
    return deduplicated;
  }

  /**
   * Ranks comprehensive search results based on relevance and search type.
   * @param results - Array of search results
   * @param query - Original search query
   * @returns SearchResult[]
   */
  private rankComprehensiveResults(results: SearchResult[], query: string): SearchResult[] {
    return results.sort((a, b) => {
      // Prioritize by search type (semantic > text > metadata > file)
      const typeWeights = {
        semantic: 4,
        text: 3,
        metadata: 2,
        file: 1
      };
      
      const aWeight = typeWeights[(a as any).searchType as keyof typeof typeWeights] || 0;
       const bWeight = typeWeights[(b as any).searchType as keyof typeof typeWeights] || 0;
      
      if (aWeight !== bWeight) {
        return bWeight - aWeight;
      }
      
      // Then by similarity score
      if (a.similarity !== b.similarity) {
        return b.similarity - a.similarity;
      }
      
      // Finally by exact name match
      const aName = a.node.properties.name || a.node.properties.fileName || '';
      const bName = b.node.properties.name || b.node.properties.fileName || '';
      
      const aExactMatch = aName.toLowerCase().includes(query.toLowerCase());
      const bExactMatch = bName.toLowerCase().includes(query.toLowerCase());
      
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;
      
      return 0;
    });
  }

  /**
   * Disconnects from SQLite database.
   */
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

  /**
   * Gets search service statistics.
   * @returns Service statistics
   */
  async getStats(): Promise<{
    isInitialized: boolean;
    embeddingModel: string;
    totalIndexedNodes: number;
  }> {
    try {
      const embeddingStats = await this.embeddingService.getStats();
      const sqliteStats = await this.sqliteClient.getIndexingStats();
      
      return {
        isInitialized: this.isInitialized,
        embeddingModel: embeddingStats.model,
        totalIndexedNodes: sqliteStats.totalFiles + sqliteStats.totalCommits
      };
    } catch (error) {
      this.logger.error('Failed to get search stats', { error: getErrorMessage(error) });
      throw error;
    }
  }
}
