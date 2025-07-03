/**
 * @file Responsible for loading processed nodes and edges into the polyglot persistence layer.
 *       Manages data persistence across LanceDB (vector), TinkerGraph (graph), and SQLite (relational) databases.
 */

import { NodeWithEmbedding, Edge, FileNode, DirectoryNode, CodeNode, CommitNode, TestNode, PullRequestNode } from '../types';
import { LanceDBClient, SQLiteClient, TinkerGraphClient } from '../persistence/db-clients';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';

/**
 * Loads processed data into the various database systems.
 */
export class DataLoader {
  private lancedbPath: string;
  private sqlitePath: string;
  private tinkergraphUrl: string;
  private config: ConfigManager;
  private logger = getLogger('DataLoader');

  private lancedbClient: LanceDBClient;
  private sqliteClient: SQLiteClient;
  private tinkergraphClient: TinkerGraphClient;

  /**
   * Initializes the DataLoader with database connection parameters.
   * @param {string} lancedbPath - Path to the LanceDB database.
   * @param {string} sqlitePath - Path to the SQLite database file.
   * @param {string} tinkergraphUrl - URL for the TinkerGraph Gremlin server.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(lancedbPath: string, sqlitePath: string, tinkergraphUrl: string, config: ConfigManager) {
    this.lancedbPath = lancedbPath;
    this.sqlitePath = sqlitePath;
    this.tinkergraphUrl = tinkergraphUrl;
    this.config = config;

    // Initialize database clients
    this.lancedbClient = new LanceDBClient(lancedbPath);
    this.sqliteClient = new SQLiteClient(sqlitePath);
    this.tinkergraphClient = new TinkerGraphClient(tinkergraphUrl);

    this.logger.info('DataLoader initialized', {
      lancedbPath,
      sqlitePath,
      tinkergraphUrl,
    });
  }

  /**
   * Establishes connections to all databases.
   */
  private async connectToDatabases(): Promise<void> {
    const operation = this.logger.operation('Connecting to databases');
    
    try {
      this.logger.info('Connecting to all databases');
      
      await Promise.all([
        this.lancedbClient.connect(),
        this.tinkergraphClient.connect(),
      ]);
      
      this.sqliteClient.connect();
      
      this.logger.info('Connected to all databases successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to connect to databases', { error: error.message });
      operation();
      throw error;
    }
  }

  /**
   * Disconnects from all databases.
   */
  private async disconnectFromDatabases(): Promise<void> {
    const operation = this.logger.operation('Disconnecting from databases');
    
    try {
      this.logger.info('Disconnecting from all databases');
      
      await Promise.all([
        this.lancedbClient.disconnect(),
        this.tinkergraphClient.disconnect(),
      ]);
      
      this.sqliteClient.disconnect();
      
      this.logger.info('Disconnected from all databases successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to disconnect from databases', { error: error.message });
      operation();
      throw error;
    }
  }

  /**
   * Loads nodes with embeddings into LanceDB for vector similarity search.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   */
  private async batchLoadToVectorDB(nodes: NodeWithEmbedding[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes to LanceDB`);
    
    try {
      this.logger.info(`Starting LanceDB batch load for ${nodes.length} nodes`);
      
      // Group nodes by type for better organization
      const nodesByType = this.groupNodesByType(nodes);
      
      for (const [nodeType, typeNodes] of Object.entries(nodesByType)) {
        if (typeNodes.length === 0) continue;
        
        this.logger.debug(`Loading ${typeNodes.length} ${nodeType} nodes to LanceDB`);
        
        // Prepare data for LanceDB
        const vectorData = typeNodes.map(node => ({
          id: node.id,
          type: node.type,
          properties: JSON.stringify(node.properties),
          embedding: node.embedding,
        }));
        
        // Create or get table for this node type
        const tableName = `${nodeType.toLowerCase()}s`;
        const table = await this.lancedbClient.createTable(tableName, vectorData);
        
        // Insert data (mock implementation)
        table.insert(vectorData);
        
        this.logger.debug(`Loaded ${typeNodes.length} ${nodeType} nodes to LanceDB table: ${tableName}`);
      }
      
      this.logger.info('LanceDB batch load completed successfully');
      operation();
    } catch (error) {
      this.logger.error('LanceDB batch load failed', { error: error.message });
      operation();
      throw error;
    }
  }

  /**
   * Loads nodes and edges into TinkerGraph for graph traversal queries.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes.
   * @param {Edge[]} edges - Array of edges.
   */
  private async batchLoadToGraphDB(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes and ${edges.length} edges to TinkerGraph`);
    
    try {
      this.logger.info(`Starting TinkerGraph batch load for ${nodes.length} nodes and ${edges.length} edges`);
      
      // Load vertices (nodes)
      const vertexMap = new Map<string, any>();
      
      for (const node of nodes) {
        try {
          const vertex = await this.tinkergraphClient.addVertex(node.type, {
            id: node.id,
            ...node.properties,
          });
          vertexMap.set(node.id, vertex);
        } catch (error) {
          this.logger.warn(`Failed to add vertex: ${node.id}`, { error: error.message });
        }
      }
      
      this.logger.debug(`Added ${vertexMap.size} vertices to TinkerGraph`);
      
      // Load edges
      let edgesAdded = 0;
      for (const edge of edges) {
        try {
          if (vertexMap.has(edge.source) && vertexMap.has(edge.target)) {
            await this.tinkergraphClient.addEdge(
              edge.source,
              edge.target,
              edge.type,
              edge.properties || {}
            );
            edgesAdded++;
          } else {
            this.logger.warn(`Skipping edge due to missing vertices`, { 
              edge: edge.type,
              source: edge.source,
              target: edge.target 
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to add edge: ${edge.type}`, { error: error.message });
        }
      }
      
      this.logger.info('TinkerGraph batch load completed', {
        verticesAdded: vertexMap.size,
        edgesAdded,
        edgesSkipped: edges.length - edgesAdded,
      });
      
      operation();
    } catch (error) {
      this.logger.error('TinkerGraph batch load failed', { error: error.message });
      operation();
      throw error;
    }
  }

  /**
   * Loads node metadata into SQLite for fast lookups and keyword search.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes.
   */
  private async batchLoadToSqlite(nodes: NodeWithEmbedding[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes to SQLite`);
    
    try {
      this.logger.info(`Starting SQLite batch load for ${nodes.length} nodes`);
      
      // Group nodes by type for efficient batch processing
      const nodesByType = this.groupNodesByType(nodes);
      
      // Prepare batch insert statements
      const statements = this.prepareSQLiteStatements();
      
      // Process each node type
      for (const [nodeType, typeNodes] of Object.entries(nodesByType)) {
        if (typeNodes.length === 0) continue;
        
        this.logger.debug(`Loading ${typeNodes.length} ${nodeType} nodes to SQLite`);
        
        switch (nodeType) {
          case 'FileNode':
            await this.insertFileNodes(typeNodes as FileNode[], statements.files);
            break;
          case 'DirectoryNode':
            await this.insertDirectoryNodes(typeNodes as DirectoryNode[], statements.directories);
            break;
          case 'CodeNode':
            await this.insertCodeNodes(typeNodes as CodeNode[], statements.codeNodes);
            break;
          case 'CommitNode':
            await this.insertCommitNodes(typeNodes as CommitNode[], statements.commits);
            break;
          case 'TestNode':
            await this.insertTestNodes(typeNodes as TestNode[], statements.testNodes);
            break;
          case 'PullRequestNode':
            await this.insertPullRequestNodes(typeNodes as PullRequestNode[], statements.pullRequests);
            break;
          default:
            this.logger.warn(`Unknown node type for SQLite insertion: ${nodeType}`);
        }
      }
      
      this.logger.info('SQLite batch load completed successfully');
      operation();
    } catch (error) {
      this.logger.error('SQLite batch load failed', { error: error.message });
      operation();
      throw error;
    }
  }

  /**
   * Groups nodes by their type for efficient processing.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes to group.
   * @returns {Record<string, NodeWithEmbedding[]>} Nodes grouped by type.
   */
  private groupNodesByType(nodes: NodeWithEmbedding[]): Record<string, NodeWithEmbedding[]> {
    const grouped: Record<string, NodeWithEmbedding[]> = {};
    
    for (const node of nodes) {
      if (!grouped[node.type]) {
        grouped[node.type] = [];
      }
      grouped[node.type].push(node);
    }
    
    return grouped;
  }

  /**
   * Prepares SQLite prepared statements for batch inserts.
   * @returns {Record<string, any>} Prepared statements for each table.
   */
  private prepareSQLiteStatements(): Record<string, any> {
    return {
      files: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO files (id, file_path, file_name, file_extension, ai_summary, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      directories: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO directories (id, dir_path, dir_name, ai_summary, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      codeNodes: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO code_nodes (id, name, signature, language, file_path, start_line, end_line, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      commits: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO commits (id, hash, author, date, message, diff_summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      testNodes: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO test_nodes (id, name, file_path, start_line, end_line, framework, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      pullRequests: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO pull_requests (id, pr_id, title, author, created_at_pr, merged_at, url, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
    };
  }

  /**
   * Inserts FileNode data into SQLite.
   */
  private async insertFileNodes(nodes: FileNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.filePath,
          node.properties.fileName,
          node.properties.fileExtension,
          node.properties.aiSummary || null
        );
      } catch (error) {
        this.logger.warn(`Failed to insert FileNode: ${node.id}`, { error: error.message });
      }
    }
  }

  /**
   * Inserts DirectoryNode data into SQLite.
   */
  private async insertDirectoryNodes(nodes: DirectoryNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.dirPath,
          node.properties.dirName,
          node.properties.aiSummary || null
        );
      } catch (error) {
        this.logger.warn(`Failed to insert DirectoryNode: ${node.id}`, { error: error.message });
      }
    }
  }

  /**
   * Inserts CodeNode data into SQLite.
   */
  private async insertCodeNodes(nodes: CodeNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.name,
          node.properties.signature || null,
          node.properties.language,
          node.properties.filePath,
          node.properties.startLine,
          node.properties.endLine
        );
      } catch (error) {
        this.logger.warn(`Failed to insert CodeNode: ${node.id}`, { error: error.message });
      }
    }
  }

  /**
   * Inserts CommitNode data into SQLite.
   */
  private async insertCommitNodes(nodes: CommitNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.hash,
          node.properties.author,
          node.properties.date,
          node.properties.message,
          node.properties.diffSummary || null
        );
      } catch (error) {
        this.logger.warn(`Failed to insert CommitNode: ${node.id}`, { error: error.message });
      }
    }
  }

  /**
   * Inserts TestNode data into SQLite.
   */
  private async insertTestNodes(nodes: TestNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.name,
          node.properties.filePath,
          node.properties.startLine,
          node.properties.endLine,
          node.properties.framework || null
        );
      } catch (error) {
        this.logger.warn(`Failed to insert TestNode: ${node.id}`, { error: error.message });
      }
    }
  }

  /**
   * Inserts PullRequestNode data into SQLite.
   */
  private async insertPullRequestNodes(nodes: PullRequestNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.prId,
          node.properties.title,
          node.properties.author,
          node.properties.createdAt,
          node.properties.mergedAt || null,
          node.properties.url,
          node.properties.body || null
        );
      } catch (error) {
        this.logger.warn(`Failed to insert PullRequestNode: ${node.id}`, { error: error.message });
      }
    }
  }

  /**
   * Main method to load all nodes and edges into the polyglot persistence layer.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   * @param {Edge[]} edges - Array of edges.
   */
  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes and ${edges.length} edges to all databases`);
    
    try {
      this.logger.info('Starting polyglot data loading', {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypes: this.getNodeTypeStats(nodes),
      });

      // Connect to all databases
      await this.connectToDatabases();

      // Load data to all databases in parallel for better performance
      await Promise.all([
        this.batchLoadToVectorDB(nodes),
        this.batchLoadToGraphDB(nodes, edges),
        this.batchLoadToSqlite(nodes),
      ]);

      this.logger.info('Polyglot data loading completed successfully');
      operation();
    } catch (error) {
      this.logger.error('Polyglot data loading failed', { error: error.message });
      operation();
      throw error;
    } finally {
      // Always disconnect from databases
      try {
        await this.disconnectFromDatabases();
      } catch (disconnectError) {
        this.logger.warn('Failed to disconnect from some databases', { error: disconnectError.message });
      }
    }
  }

  /**
   * Gets statistics about the nodes by type.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes.
   * @returns {Record<string, number>} Node type statistics.
   */
  private getNodeTypeStats(nodes: NodeWithEmbedding[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const node of nodes) {
      stats[node.type] = (stats[node.type] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Gets loading statistics and database health information.
   * @returns {Promise<{databases: Record<string, boolean>, lastLoad: Date | null}>}
   */
  async getStats(): Promise<{
    databases: Record<string, boolean>;
    lastLoad: Date | null;
  }> {
    try {
      // Check database connectivity
      const databases = {
        lancedb: this.lancedbClient.isConnectedToDatabase(),
        sqlite: this.sqliteClient.isConnectedToDatabase(),
        tinkergraph: this.tinkergraphClient.isConnectedToDatabase(),
      };

      // TODO: Get last load timestamp from SQLite
      const lastLoad = null;

      return {
        databases,
        lastLoad,
      };
    } catch (error) {
      this.logger.error('Failed to get DataLoader stats', { error: error.message });
      throw error;
    }
  }
}
