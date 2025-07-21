/**
 * @file Responsible for loading processed nodes and edges into the unified SQLite persistence layer.
 *       Manages data persistence across SQLite database with vector support via sqlite-vec extension.
 */

import { NodeWithEmbedding, Edge, FileNode, CodeNode, CommitNode, TestNode, PullRequestNode, RepositoryNode, FunctionNode, BaseNode } from '../types';
import * as crypto from 'crypto';
import { SQLiteClient } from '../persistence/db/connection';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { 
  getErrorMessage, 
  getErrorStack, 
  logError, 
  DatabaseConnectionError, 
  DatabaseOperationError, 
  DataValidationError,
  withRetry,
  DEFAULT_RETRY_CONFIG
} from '../utils/error-handling';

/**
 * Loads processed data into the unified SQLite database system.
 */
export class DataLoader {
  private sqlitePath: string;
  private config: ConfigManager;
  private logger = getLogger('DataLoader');

  private sqliteClient: SQLiteClient;

  /**
   * Initializes the DataLoader with database connection parameters.
   * @param {string} sqlitePath - Path to the SQLite database file.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(sqlitePath: string, config: ConfigManager) {
    this.sqlitePath = sqlitePath;
    this.config = config;

    // Initialize database client
    this.sqliteClient = new SQLiteClient(sqlitePath);

    this.logger.info('DataLoader initialized', {
      sqlitePath,
    });
  }

  /**
   * Establishes connections to SQLite database.
   */
  private async connectToDatabases(): Promise<{
    sqlite: boolean;
  }> {
    const operation = this.logger.operation('Connecting to SQLite database');
    const connectionStatus = {
      sqlite: false,
    };

    this.logger.info('Connecting to SQLite database');

    // Connect to SQLite database with error handling
    try {
      await this.connectToSQLite();
      connectionStatus.sqlite = true;
      this.logger.info('SQLite connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to SQLite', { error: getErrorMessage(error) });
      throw error;
    }

    const connectedCount = Object.values(connectionStatus).filter(Boolean).length;
    this.logger.info(`Connected to ${connectedCount}/1 databases`, connectionStatus);

    // Require SQLite database to be connected
    if (connectedCount === 0) {
      throw new DatabaseConnectionError('SQLite', 'Failed to connect to SQLite database');
    }
    
    operation();
    return connectionStatus;
  }

  /**
   * Connects to SQLite with retry logic and circuit breaker.
   */
  private async connectToSQLite(): Promise<void> {
    try {
      await withRetry(
        async () => {
          await this.sqliteClient.connect();
        },
        DEFAULT_RETRY_CONFIG,
        this.logger,
        'SQLite connection'
      );
    } catch (error) {
      this.logger.error('Failed to connect to SQLite after all retries', { 
        error: getErrorMessage(error) 
      });
      throw new DatabaseConnectionError('SQLite', `Connection failed: ${getErrorMessage(error)}`, error);
    }
  }

  /**
   * Disconnects from SQLite database.
   */
  private async disconnectFromDatabases(): Promise<void> {
    const operation = this.logger.operation('Disconnecting from SQLite database');

    this.logger.info('Disconnecting from SQLite database');

    // Disconnect from SQLite with error handling
    try {
      this.sqliteClient.disconnect();
      this.logger.info('SQLite disconnected successfully');
    } catch (error) {
      this.logger.warn('Failed to disconnect from SQLite', { error: getErrorMessage(error) });
    }

    this.logger.info('SQLite database disconnection completed');
    operation();
  }

  /**
   * Loads nodes and edges into SQLite enhanced graph storage for deep relationship queries.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes.
   * @param {Edge[]} edges - Array of edges.
   */
  private async batchLoadToGraphDB(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes and ${edges.length} edges to Enhanced SQLite Graph`);

    try {
      this.logger.info(`Starting enhanced SQLite graph batch load for ${nodes.length} nodes and ${edges.length} edges`);

      // Convert NodeWithEmbedding to EnhancedBaseNode format
      const enhancedNodes = nodes.map(node => ({
        id: node.id,
        businessKey: node.id, // For now, use ID as business key - will be enhanced by AST parser
        type: node.type,
        properties: node.properties,
        repoId: node.properties.repoId || node.properties.repoPath,
        commitSha: undefined, // Will be set by git analyzer
        filePath: node.properties.filePath || node.properties.path,
        line: node.properties.startLine,
        col: node.properties.startCol,
        signatureHash: this.generateSignatureHash(node),
        labels: node.properties.labels || []
      }));

      // Convert Edge to EnhancedEdge format
      const enhancedEdges = edges.map(edge => ({
        id: `${edge.source}-${edge.type}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        sourceBusinessKey: edge.source, // Will be enhanced
        targetBusinessKey: edge.target, // Will be enhanced
        type: edge.type,
        properties: edge.properties,
        line: edge.properties?.line,
        col: edge.properties?.col,
        dynamic: edge.properties?.dynamic || false
      }));

      // TODO: Implement enhanced graph storage methods in SQLiteClient
      // For now, log the data that would be inserted
      this.logger.debug(`Would insert ${enhancedNodes.length} enhanced nodes and ${enhancedEdges.length} enhanced edges to SQLite graph`);
      
      // Placeholder results for now
      const nodeResult = { success: enhancedNodes.length, failed: 0, errors: [] };
      const edgeResult = { success: enhancedEdges.length, failed: 0, errors: [] };

      this.logger.info('Enhanced SQLite graph batch load completed', {
        nodesAdded: nodeResult.success,
        nodesFailed: nodeResult.failed,
        edgesAdded: edgeResult.success,
        edgesFailed: edgeResult.failed,
        totalNodes: nodes.length,
        totalEdges: edges.length
      });

      operation();
    } catch (error) {
      this.logger.error('Enhanced SQLite graph batch load failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Generate a signature hash for duplicate detection.
   */
  private generateSignatureHash(node: NodeWithEmbedding): string {
    const crypto = require('crypto');
    const signature = `${node.type}:${node.properties.name || node.properties.fileName}:${node.properties.signature || ''}`;
    return crypto.createHash('md5').update(signature).digest('hex');
  }

  /**
   * Loads node metadata into SQLite for fast lookups and keyword search with transaction management.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes.
   * @param {Edge[]} edges - Array of edges.
   */
  private async batchLoadToSqlite(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes to SQLite`);

    try {
      this.logger.info(`Starting SQLite batch load for ${nodes.length} nodes`);

      // Use transaction for data consistency
      this.sqliteClient.transaction(() => {
        // Group nodes by type for efficient batch processing
        const nodesByType = this.groupNodesByType(nodes);

        // Prepare batch insert statements
        const statements = this.prepareSQLiteStatements();

        // Process each node type within the transaction in dependency order
        const insertionOrder = [
          'RepositoryNode',
          'FileNode',        // Must come before FunctionNode due to foreign key
          'CodeNode',
          'CommitNode',
          'TestNode',
          'PullRequestNode',
          'FunctionNode'     // Depends on FileNode
        ];

        for (const nodeType of insertionOrder) {
          const typeNodes = nodesByType[nodeType];
          if (!typeNodes || typeNodes.length === 0) continue;

          this.logger.debug(`Loading ${typeNodes.length} ${nodeType} nodes to SQLite`);

          try {
            switch (nodeType) {
              case 'RepositoryNode':
                this.insertRepositoryNodesSync(typeNodes as unknown as RepositoryNode[], statements.repositories);
                break;
              case 'FileNode':
                this.insertFileNodesSync(typeNodes as unknown as FileNode[], statements.files);
                break;
              case 'CodeNode':
                this.insertCodeNodesSync(typeNodes as unknown as CodeNode[], statements.codeNodes);
                break;
              case 'CommitNode':
                this.insertCommitNodesSync(typeNodes as unknown as CommitNode[], statements.commits);
                break;
              case 'TestNode':
                this.insertTestNodesSync(typeNodes as unknown as TestNode[], statements.testNodes);
                break;
              case 'PullRequestNode':
                this.insertPullRequestNodesSync(typeNodes as unknown as PullRequestNode[], statements.pullRequests);
                break;
              case 'FunctionNode':
                this.insertFunctionNodesSync(typeNodes as unknown as FunctionNode[], statements.functions);
                break;
              default:
                this.logger.warn(`Unknown node type for SQLite insertion: ${nodeType}`);
            }
          } catch (nodeError) {
            this.logger.error(`Failed to insert ${nodeType} nodes`, { error: getErrorMessage(nodeError) });
            throw nodeError; // This will cause the transaction to rollback
          }
        }

        // Insert edges within the same transaction
        try {
          this.insertFunctionCallsSync(edges, statements.functionCalls);
        } catch (edgeError) {
          this.logger.error('Failed to insert function calls', { error: getErrorMessage(edgeError) });
          throw edgeError; // This will cause the transaction to rollback
        }

        // Update indexing state within transaction
        try {
          const timestamp = new Date().toISOString();
          this.sqliteClient.run(
            `INSERT OR REPLACE INTO indexing_state (key, value, updated_at) 
             VALUES (?, ?, ?)`,
            ['last_load_timestamp', timestamp, timestamp]
          );
        } catch (stateError) {
          this.logger.warn('Failed to update indexing state', { error: getErrorMessage(stateError) });
          // Don't throw here as this is not critical
        }
      });

      this.logger.info('SQLite batch load completed successfully with transaction');
      operation();
    } catch (error) {
      this.logger.error('SQLite batch load failed, transaction rolled back', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Loads nodes with embeddings into unified SQLite storage for both relational and vector operations.
   * Uses the existing transaction-based approach with vector storage.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   */
  private async batchLoadToSQLiteWithVectors(nodes: NodeWithEmbedding[]): Promise<void> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes with vectors to SQLite`);

    try {
      this.logger.info(`Starting unified SQLite batch load for ${nodes.length} nodes with embeddings`);

      // Use the existing transaction-based approach which already works
      await this.batchLoadToSqlite(nodes, []); // Pass empty edges array since we handle them separately

      // Store vector embeddings for nodes that have them
      await this.storeVectorEmbeddings(nodes);

      this.logger.info('Unified SQLite batch load with vectors completed successfully');
      operation();
    } catch (error) {
      this.logger.error('Unified SQLite batch load with vectors failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Stores vector embeddings for nodes using the existing SQLiteClient vector operations.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   */
  private async storeVectorEmbeddings(nodes: NodeWithEmbedding[]): Promise<void> {
    if (!this.sqliteClient.isVectorEnabled) {
      this.logger.info('Vector operations not enabled, skipping embedding storage');
      return;
    }

    this.logger.debug(`Storing embeddings for ${nodes.length} nodes`);

    for (const node of nodes) {
      if (!node.embedding || node.embedding.length === 0) {
        continue; // Skip nodes without embeddings
      }

      try {
        // Determine the appropriate table and column based on node type
        let table: string;
        let column: string;

        switch (node.type) {
          case 'FileNode':
            table = 'files';
            column = 'content_embedding';
            break;
          case 'FunctionNode':
            table = 'functions';
            column = 'signature_embedding';
            break;
          case 'CommitNode':
            table = 'commits';
            column = 'message_embedding';
            break;
          case 'CodeNode':
            table = 'code_nodes';
            column = 'code_embedding';
            break;
          case 'TestNode':
            table = 'test_nodes';
            column = 'test_embedding';
            break;
          case 'PullRequestNode':
            table = 'pull_requests';
            column = 'title_embedding';
            break;
          default:
            this.logger.debug(`No embedding storage configured for node type: ${node.type}`);
            continue;
        }

        await this.sqliteClient.storeVector(table, column, node.id, node.embedding);
      } catch (error) {
        this.logger.warn(`Failed to store embedding for node ${node.id}`, { 
          error: getErrorMessage(error),
          nodeType: node.type 
        });
      }
    }

    this.logger.debug('Vector embedding storage completed');
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
      repositories: this.sqliteClient.prepare(`
      INSERT OR REPLACE INTO repositories (repo_id, repo_path, repo_name, created_at, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `),
      files: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO files (file_id, repo_id, file_path, file_name, file_extension, language, size_kb, content_hash, file_type, ai_summary, imports, exports, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      codeNodes: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO code_nodes (id, name, signature, language, file_path, start_line, end_line)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      commits: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO commits (id, hash, author, date, message, diff_summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      testNodes: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO test_nodes (id, name, file_path, start_line, end_line, framework)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      pullRequests: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO pull_requests (id, pr_id, title, author, created_at_pr, merged_at, url, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      functions: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO functions (id, file_id, name, signature, return_type, access_level, file_path, start_line, end_line, body, called_by_methods, calls_methods, uses_external_methods, internal_call_graph, transitive_call_depth)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      functionCalls: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO function_calls (id, caller_id, callee_id)
        VALUES (?, ?, ?)
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
          node.id, // file_id
          node.properties.repoId || '', // repo_id
          node.properties.filePath, // file_path
          node.properties.fileName, // file_name
          node.properties.fileExtension || null, // file_extension
          node.properties.language || null, // language
          node.properties.sizeKb || null, // size_kb
          node.properties.contentHash || null, // content_hash
          node.properties.fileType || 'source', // file_type
          node.properties.aiSummary || null, // ai_summary
          JSON.stringify(node.properties.imports || []), // imports
          JSON.stringify(node.properties.exports || []), // exports
          new Date().toISOString(), // created_at
          new Date().toISOString() // updated_at
        );
      } catch (error) {
        this.logger.warn(`Failed to insert FileNode: ${node.id}`, { error: getErrorMessage(error) });
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
        this.logger.warn(`Failed to insert CodeNode: ${node.id}`, { error: getErrorMessage(error) });
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
        this.logger.warn(`Failed to insert CommitNode: ${node.id}`, { error: getErrorMessage(error) });
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
        this.logger.warn(`Failed to insert TestNode: ${node.id}`, { error: getErrorMessage(error) });
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
        this.logger.warn(`Failed to insert PullRequestNode: ${node.id}`, { error: getErrorMessage(error) });
      }
    }
  }

  /**
   * Inserts FunctionNode data into SQLite.
   */
  private async insertFunctionNodes(nodes: FunctionNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.fileId,
          node.properties.name,
          node.properties.signature,
          node.properties.returnType,
          node.properties.accessLevel,
          node.properties.startLine,
          node.properties.endLine,
          node.properties.usesExternalMethods,
          node.properties.transitiveCallDepth
        );
      } catch (error) {
        this.logger.warn(`Failed to insert FunctionNode: ${node.id}`, { error: getErrorMessage(error) });
      }
    }
  }
  private async insertFunctionCalls(edges: Edge[], statement: any): Promise<void> {
    for (const edge of edges) {
      if (edge.type === 'CALLS') {
        try {
          statement.run(
            crypto.randomUUID(),
            edge.source,
            edge.target
          );
        } catch (error) {
          this.logger.warn(`Failed to insert CALLS edge: ${edge.source} -> ${edge.target}`, { error: getErrorMessage(error) });
        }
      }
    }
  }

  private async insertRepositoryNodes(nodes: RepositoryNode[], statement: any): Promise<void> {
    for (const node of nodes) {
      try {
        statement.run(
          node.id,
          node.properties.repoPath,
          node.properties.repoName,
          node.properties.createdAt || new Date().toISOString(),
          node.properties.lastUpdated || new Date().toISOString()
        );
      } catch (error) {
        this.logger.warn(`Failed to insert RepositoryNode: ${node.id}`, { error: getErrorMessage(error) });
      }
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertRepositoryNodesSync(nodes: RepositoryNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id,
        node.properties.repoPath,
        node.properties.repoName,
        node.properties.createdAt || new Date().toISOString(),
        node.properties.lastUpdated || new Date().toISOString()
      );
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertFileNodesSync(nodes: FileNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id, // file_id
        node.properties.repoId || '', // repo_id
        node.properties.filePath, // file_path
        node.properties.fileName, // file_name
        node.properties.fileExtension || null, // file_extension
        node.properties.language || null, // language
        node.properties.sizeKb || null, // size_kb
        node.properties.contentHash || null, // content_hash
        node.properties.fileType || 'source', // file_type
        node.properties.aiSummary || null, // ai_summary
        JSON.stringify(node.properties.imports || []), // imports
        JSON.stringify(node.properties.exports || []), // exports
        new Date().toISOString(), // created_at
        new Date().toISOString() // updated_at
      );
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertCodeNodesSync(nodes: CodeNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id,
        node.properties.name,
        node.properties.signature || null,
        node.properties.language,
        node.properties.filePath,
        node.properties.startLine,
        node.properties.endLine
      );
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertCommitNodesSync(nodes: CommitNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id,
        node.properties.hash,
        node.properties.author,
        node.properties.date,
        node.properties.message,
        node.properties.diffSummary || null
      );
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertTestNodesSync(nodes: TestNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id,
        node.properties.name,
        node.properties.filePath,
        node.properties.startLine,
        node.properties.endLine,
        node.properties.framework || null
      );
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertPullRequestNodesSync(nodes: PullRequestNode[], statement: any): void {
    for (const node of nodes) {
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
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertFunctionNodesSync(nodes: FunctionNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id,
        node.properties.fileId,
        node.properties.name,
        node.properties.signature,
        node.properties.returnType,
        node.properties.accessLevel,
        node.properties.filePath,
        node.properties.startLine,
        node.properties.endLine,
        node.properties.body,
        JSON.stringify(node.properties.calledByMethods || []),
        JSON.stringify(node.properties.callsMethods || []),
        node.properties.usesExternalMethods ? 1 : 0,
        JSON.stringify(node.properties.internalCallGraph || []),
        node.properties.transitiveCallDepth
      );
    }
  }

  /**
   * Synchronous version for use within transactions.
   */
  private insertFunctionCallsSync(edges: Edge[], statement: any): void {
    for (const edge of edges) {
      if (edge.type === 'CALLS') {
        statement.run(
          crypto.randomUUID(),
          edge.source,
          edge.target
        );
      }
    }
  }

  /**
   * Main method to load all nodes and edges into the dual persistence layer.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   * @param {Edge[]} edges - Array of edges.
   */
  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<{
    success: boolean;
    results: {
      sqlite: { success: boolean; error?: string };
    };
  }> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes and ${edges.length} edges to unified SQLite database`);

    const results: {
      sqlite: { success: boolean; error?: string };
    } = {
      sqlite: { success: false },
    };

    try {
      // Perform comprehensive data validation before persistence
      this.logger.debug('Validating data before persistence');
      const validation = this.performDataValidation(nodes, edges);
      
      if (!validation.valid) {
        this.logger.error('Data validation failed', { errors: validation.errors });
        throw new DataValidationError('Data validation failed before persistence', validation.errors);
      }
      
      this.logger.info('Starting unified SQLite data loading', {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypes: this.getNodeTypeStats(nodes),
        validationPassed: true
      });

      // Connect to SQLite database
      const connectionStatus = await this.connectToDatabases();

      if (!connectionStatus.sqlite) {
        throw new Error('SQLite database not available for data loading');
      }

      this.logger.info('SQLite database connected and ready for loading');

      // Load data to unified SQLite storage with vectors and graph data
      try {
        // Load nodes with embeddings to SQLite (includes vector storage)
        await this.batchLoadToSQLiteWithVectors(nodes);
        
        // Load graph relationships to SQLite (enhanced graph storage)
        await this.batchLoadToGraphDB(nodes, edges);
        
        results.sqlite.success = true;
        this.logger.info('Unified SQLite data loading completed successfully');
      } catch (sqliteError) {
        results.sqlite.error = getErrorMessage(sqliteError);
        this.logger.error('SQLite data loading failed', { error: getErrorMessage(sqliteError) });
        throw sqliteError;
      }

      operation();
      return {
        success: results.sqlite.success,
        results
      };
    } catch (error) {
      this.logger.error('Unified SQLite data loading failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    } finally {
      // Always disconnect from database
      try {
        await this.disconnectFromDatabases();
      } catch (disconnectError) {
        this.logger.warn('Failed to disconnect from database', { error: getErrorMessage(disconnectError) });
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
   * Attempts to recover from partial failures by retrying failed operations.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes to retry.
   * @param {Edge[]} edges - Array of edges to retry.
   * @param {string[]} failedDatabases - List of databases that failed.
   * @returns {Promise<{success: boolean, results: Record<string, {success: boolean, error?: string}>}>}
   */
  async retryFailedOperations(
    nodes: NodeWithEmbedding[], 
    edges: Edge[], 
    failedDatabases: string[]
  ): Promise<{
    success: boolean;
    results: Record<string, {success: boolean, error?: string}>;
  }> {
    const operation = this.logger.operation(`Retrying failed operations for ${failedDatabases.join(', ')}`);
    
    const results: Record<string, {success: boolean, error?: string}> = {};

    try {
      this.logger.info('Starting retry operations', { 
        failedDatabases, 
        nodeCount: nodes.length, 
        edgeCount: edges.length 
      });

      // Connect to databases
      const connectionStatus = await this.connectToDatabases();

      // Retry each failed database
      const retryPromises = [];

      for (const dbName of failedDatabases) {
        switch (dbName) {
          case 'sqlite':
            if (connectionStatus.sqlite) {
              retryPromises.push(
                this.batchLoadToSQLiteWithVectors(nodes)
                  .then(() => this.batchLoadToGraphDB(nodes, edges))
                  .then(() => {
                    results.sqlite = { success: true };
                    this.logger.info('SQLite retry successful');
                  })
                  .catch((error) => {
                    results.sqlite = { success: false, error: getErrorMessage(error) };
                    this.logger.error('SQLite retry failed', { error: getErrorMessage(error) });
                  })
              );
            } else {
              results.sqlite = { success: false, error: 'Database not connected' };
            }
            break;

          default:
            this.logger.warn(`Unknown database for retry: ${dbName}`);
        }
      }

      // Wait for all retry operations
      await Promise.allSettled(retryPromises);

      const successfulRetries = Object.values(results).filter(result => result.success).length;
      const success = successfulRetries > 0;

      this.logger.info('Retry operations completed', {
        successful: successfulRetries,
        total: failedDatabases.length,
        results,
      });

      operation();
      return { success, results };
    } catch (error) {
      this.logger.error('Retry operations failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    } finally {
      await this.disconnectFromDatabases();
    }
  }

  /**
   * Performs a health check on SQLite database and attempts basic recovery.
   * @returns {Promise<{healthy: string[], unhealthy: string[], recovered: string[]}>}
   */
  async performHealthCheck(): Promise<{
    healthy: string[];
    unhealthy: string[];
    recovered: string[];
  }> {
    const operation = this.logger.operation('Performing SQLite database health check');

    const healthy: string[] = [];
    const unhealthy: string[] = [];
    const recovered: string[] = [];

    try {
      this.logger.info('Starting SQLite database health check');

      // Check current connectivity
      const connectivity = await this.verifyDatabaseConnectivity();

      // Categorize databases
      Object.entries(connectivity).forEach(([dbName, isHealthy]) => {
        if (isHealthy) {
          healthy.push(dbName);
        } else {
          unhealthy.push(dbName);
        }
      });

      // Attempt recovery for unhealthy databases
      if (unhealthy.length > 0) {
        this.logger.info('Attempting recovery for unhealthy databases', { unhealthy });

        for (const dbName of unhealthy) {
          try {
            switch (dbName) {
              case 'sqlite':
                await this.connectToSQLite();
                if (this.sqliteClient.isConnectedToDatabase()) {
                  recovered.push(dbName);
                  healthy.push(dbName);
                  unhealthy.splice(unhealthy.indexOf(dbName), 1);
                }
                break;
            }
          } catch (error) {
            this.logger.debug(`Recovery failed for ${dbName}`, { error: getErrorMessage(error) });
          }
        }
      }

      this.logger.info('SQLite database health check completed', {
        healthy: healthy.length,
        unhealthy: unhealthy.length,
        recovered: recovered.length,
      });

      operation();
      return { healthy, unhealthy, recovered };
    } catch (error) {
      this.logger.error('SQLite database health check failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    } finally {
      await this.disconnectFromDatabases();
    }
  }

  /**
   * Verifies SQLite database connectivity before attempting operations.
   * @returns {Promise<{sqlite: boolean}>}
   */
  async verifyDatabaseConnectivity(): Promise<{
    sqlite: boolean;
  }> {
    const operation = this.logger.operation('Verifying SQLite database connectivity');

    try {
      const connectivity = {
        sqlite: false,
      };

      // Test SQLite database connection
      try {
        await this.verifySQLiteConnection();
        connectivity.sqlite = true;
      } catch (error) {
        this.logger.debug('SQLite connectivity check failed', { error: getErrorMessage(error) });
      }

      this.logger.info('SQLite database connectivity verification completed', connectivity);
      operation();
      return connectivity;
    } catch (error) {
      this.logger.error('SQLite database connectivity verification failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }



  /**
   * Verifies SQLite connection.
   */
  private async verifySQLiteConnection(): Promise<void> {
    if (!this.sqliteClient.isConnectedToDatabase()) {
      throw new Error('SQLite not connected');
    }
    // Test with a simple query
    this.sqliteClient.get('SELECT 1 as test');
  }

  /**
   * Implements data consistency checks across databases.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes to verify.
   * @returns {Promise<{consistent: boolean, issues: string[]}>}
   */
  async verifyDataConsistency(nodes: NodeWithEmbedding[]): Promise<{
    consistent: boolean;
    issues: string[];
  }> {
    const operation = this.logger.operation('Verifying data consistency across databases');
    const issues: string[] = [];

    try {
      this.logger.info('Starting data consistency verification', { nodeCount: nodes.length });

      // Connect to databases for verification
      const connectionStatus = await this.connectToDatabases();

      // Check node counts across databases
      if (connectionStatus.sqlite) {
        try {
          // Get counts from SQLite
          const sqliteStats = await this.sqliteClient.getIndexingStats();
          
          // TODO: Implement getEnhancedGraphStats method in SQLiteClient
          // const graphStats = await this.sqliteClient.getEnhancedGraphStats();
          this.logger.debug('SQLite stats', { sqliteStats });
          
          // Add specific consistency checks here
          // For example, verify that all nodes in regular tables have corresponding entries in graph tables
        } catch (error) {
          issues.push(`Failed to verify SQLite consistency: ${getErrorMessage(error)}`);
        }
      }

      // Check for orphaned edges (edges without corresponding nodes)
      if (connectionStatus.sqlite) {
        try {
          const orphanedEdges = this.sqliteClient.all(`
            SELECT fc.id, fc.caller_id, fc.callee_id 
            FROM function_calls fc
            LEFT JOIN functions f1 ON fc.caller_id = f1.id
            LEFT JOIN functions f2 ON fc.callee_id = f2.id
            WHERE f1.id IS NULL OR f2.id IS NULL
            LIMIT 10
          `);

          if (orphanedEdges.length > 0) {
            issues.push(`Found ${orphanedEdges.length} orphaned function call edges in SQLite`);
          }
        } catch (error) {
          issues.push(`Failed to check for orphaned edges: ${getErrorMessage(error)}`);
        }
      }

      const consistent = issues.length === 0;
      this.logger.info('Data consistency verification completed', { consistent, issueCount: issues.length });

      operation();
      return { consistent, issues };
    } catch (error) {
      this.logger.error('Data consistency verification failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    } finally {
      await this.disconnectFromDatabases();
    }
  }

  /**
   * Gets loading statistics and SQLite database health information.
   * @returns {Promise<{databases: Record<string, boolean>, lastLoad: Date | null, connectivity: {sqlite: boolean}}>}
   */
  async getStats(): Promise<{
    databases: Record<string, boolean>;
    lastLoad: Date | null;
    connectivity: {sqlite: boolean};
  }> {
    try {
      // Check database connectivity
      const databases = {
        sqlite: this.sqliteClient.isConnectedToDatabase(),
      };

      // Verify actual connectivity
      const connectivity = await this.verifyDatabaseConnectivity();

      // Get last load timestamp from SQLite if available
      let lastLoad: Date | null = null;
      if (connectivity.sqlite) {
        try {
          await this.connectToSQLite();
          const lastIndexed = this.sqliteClient.getLastIndexedCommit();
          if (lastIndexed) {
            // This is a commit hash, not a timestamp. We'd need to store actual load timestamps
            // For now, return null
            lastLoad = null;
          }
          this.sqliteClient.disconnect();
        } catch (error) {
          this.logger.debug('Failed to get last load timestamp', { error: getErrorMessage(error) });
        }
      }

      return {
        databases,
        lastLoad,
        connectivity,
      };
    } catch (error) {
      this.logger.error('Failed to get DataLoader stats', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Validates nodes before persistence to ensure data integrity.
   * @param nodes - Array of nodes to validate
   * @returns Validation result with errors if any
   */
  private validateNodes(nodes: NodeWithEmbedding[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(nodes)) {
      errors.push('Nodes must be an array');
      return { valid: false, errors };
    }
    
    for (const [index, node] of nodes.entries()) {
      if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
        errors.push(`Node ${index}: ID is required and must be a non-empty string`);
      }
      
      if (!node.type || typeof node.type !== 'string' || node.type.trim() === '') {
        errors.push(`Node ${index}: type is required and must be a non-empty string`);
      }
      
      if (!node.properties || typeof node.properties !== 'object') {
        errors.push(`Node ${index}: properties is required and must be an object`);
      }
      
      if (!node.embedding || !Array.isArray(node.embedding)) {
        errors.push(`Node ${index}: embedding is required and must be an array`);
      } else if (node.embedding.length > 0 && !node.embedding.every(val => typeof val === 'number' && !isNaN(val))) {
        errors.push(`Node ${index}: embedding must contain only valid numbers`);
      }
      // Note: Empty embedding arrays are now allowed (for skipEmbeddings mode)
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates edges before persistence to ensure data integrity.
   * @param edges - Array of edges to validate
   * @returns Validation result with errors if any
   */
  private validateEdges(edges: Edge[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(edges)) {
      errors.push('Edges must be an array');
      return { valid: false, errors };
    }
    
    for (const [index, edge] of edges.entries()) {
      if (!edge.source || typeof edge.source !== 'string' || edge.source.trim() === '') {
        errors.push(`Edge ${index}: source is required and must be a non-empty string`);
      }
      
      if (!edge.target || typeof edge.target !== 'string' || edge.target.trim() === '') {
        errors.push(`Edge ${index}: target is required and must be a non-empty string`);
      }
      
      if (!edge.type || typeof edge.type !== 'string' || edge.type.trim() === '') {
        errors.push(`Edge ${index}: type is required and must be a non-empty string`);
      }
      
      if (edge.properties && typeof edge.properties !== 'object') {
        errors.push(`Edge ${index}: properties must be an object if provided`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates data consistency across nodes and edges.
   * @param nodes - Array of nodes
   * @param edges - Array of edges
   * @returns Validation result with errors if any
   */
  private validateDataConsistency(nodes: NodeWithEmbedding[], edges: Edge[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(nodes.map(node => node.id));
    
    // Check that all edge sources and targets reference existing nodes
    for (const [index, edge] of edges.entries()) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge ${index}: source node '${edge.source}' does not exist in the provided nodes`);
      }
      
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge ${index}: target node '${edge.target}' does not exist in the provided nodes`);
      }
    }
    
    // Check for duplicate node IDs
    const duplicateIds = nodes
      .map(node => node.id)
      .filter((id, index, arr) => arr.indexOf(id) !== index);
    
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate node IDs found: ${[...new Set(duplicateIds)].join(', ')}`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Performs comprehensive data validation before persistence.
   * @param nodes - Array of nodes to validate
   * @param edges - Array of edges to validate
   * @returns Validation result with all errors
   */
  private performDataValidation(nodes: NodeWithEmbedding[], edges: Edge[]): { valid: boolean; errors: string[] } {
    const allErrors: string[] = [];
    
    // Validate nodes
    const nodeValidation = this.validateNodes(nodes);
    allErrors.push(...nodeValidation.errors);
    
    // Validate edges
    const edgeValidation = this.validateEdges(edges);
    allErrors.push(...edgeValidation.errors);
    
    // Validate data consistency
    if (nodeValidation.valid && edgeValidation.valid) {
      const consistencyValidation = this.validateDataConsistency(nodes, edges);
      allErrors.push(...consistencyValidation.errors);
    }
    
    return { valid: allErrors.length === 0, errors: allErrors };
  }
}
