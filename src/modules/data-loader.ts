/**
 * @file Responsible for loading processed nodes and edges into the polyglot persistence layer.
 *       Manages data persistence across LanceDB (vector), TinkerGraph (graph), and SQLite (relational) databases.
 */

import { NodeWithEmbedding, Edge, FileNode, DirectoryNode, CodeNode, CommitNode, TestNode, PullRequestNode, RepositoryNode, FunctionNode, BaseNode } from '../types';
import * as crypto from 'crypto';
import { LanceDBClient, SQLiteClient } from '../persistence/db-clients';
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
 * Loads processed data into the various database systems.
 */
export class DataLoader {
  private lancedbPath: string;
  private sqlitePath: string;
  private config: ConfigManager;
  private logger = getLogger('DataLoader');

  private lancedbClient: LanceDBClient;
  private sqliteClient: SQLiteClient;

  /**
   * Initializes the DataLoader with database connection parameters.
   * @param {string} lancedbPath - Path to the LanceDB database.
   * @param {string} sqlitePath - Path to the SQLite database file.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(lancedbPath: string, sqlitePath: string, config: ConfigManager) {
    this.lancedbPath = lancedbPath;
    this.sqlitePath = sqlitePath;
    this.config = config;

    // Initialize database clients
    this.lancedbClient = new LanceDBClient(lancedbPath);
    this.sqliteClient = new SQLiteClient(sqlitePath);

    this.logger.info('DataLoader initialized', {
      lancedbPath,
      sqlitePath,
    });
  }

  /**
   * Establishes connections to all databases with individual error handling.
   */
  private async connectToDatabases(): Promise<{
    lancedb: boolean;
    sqlite: boolean;
  }> {
    const operation = this.logger.operation('Connecting to databases');
    const connectionStatus = {
      lancedb: false,
      sqlite: false,
    };

    this.logger.info('Connecting to all databases');

    // Connect to each database individually with error handling
    const connectionPromises = [
      this.connectToLanceDB().then(() => {
        connectionStatus.lancedb = true;
        this.logger.info('LanceDB connected successfully');
      }).catch((error) => {
        this.logger.warn('Failed to connect to LanceDB', { error: getErrorMessage(error) });
      }),

      this.connectToSQLite().then(() => {
        connectionStatus.sqlite = true;
        this.logger.info('SQLite connected successfully');
      }).catch((error) => {
        this.logger.warn('Failed to connect to SQLite', { error: getErrorMessage(error) });
      }),
    ];

    await Promise.allSettled(connectionPromises);

    const connectedCount = Object.values(connectionStatus).filter(Boolean).length;
    this.logger.info(`Connected to ${connectedCount}/2 databases`, connectionStatus);

    // Require at least one database to be connected
    if (connectedCount === 0) {
      const error = new Error('Failed to connect to any database');
      this.logger.error('All database connections failed');
      operation();
      throw error;
    }

    operation();
    return connectionStatus;
  }

  /**
   * Connects to LanceDB with retry logic and circuit breaker.
   */
  private async connectToLanceDB(): Promise<void> {
    try {
      await withRetry(
        async () => {
          await this.lancedbClient.connect();
        },
        DEFAULT_RETRY_CONFIG,
        this.logger,
        'LanceDB connection'
      );
    } catch (error) {
      this.logger.error('Failed to connect to LanceDB after all retries', { 
        error: getErrorMessage(error) 
      });
      throw new DatabaseConnectionError('LanceDB', `Connection failed: ${getErrorMessage(error)}`, error);
    }
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
   * Disconnects from all databases with individual error handling.
   */
  private async disconnectFromDatabases(): Promise<void> {
    const operation = this.logger.operation('Disconnecting from databases');

    this.logger.info('Disconnecting from all databases');

    // Disconnect from each database individually with error handling
    const disconnectionPromises = [
      this.lancedbClient.disconnect().catch((error) => {
        this.logger.warn('Failed to disconnect from LanceDB', { error: getErrorMessage(error) });
      }),

      Promise.resolve().then(() => {
        this.sqliteClient.disconnect();
      }).catch((error) => {
        this.logger.warn('Failed to disconnect from SQLite', { error: getErrorMessage(error) });
      }),
    ];

    await Promise.allSettled(disconnectionPromises);

    this.logger.info('Database disconnection completed');
    operation();
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

        try {
          // Try to get existing table first
          let table;
          try {
            table = await this.lancedbClient.getTable(tableName);
            this.logger.debug(`Using existing LanceDB table: ${tableName}`);
          } catch (error) {
            // Table doesn't exist, create it
            table = await this.lancedbClient.createTable(tableName, vectorData);
            this.logger.debug(`Created new LanceDB table: ${tableName}`);
          }

          // Insert data (LanceDB handles batch inserts)
          if (table && table.add) {
            await table.add(vectorData);
          } else {
            this.logger.warn(`LanceDB table ${tableName} doesn't support add operation (mock mode)`);
          }

          this.logger.debug(`Loaded ${typeNodes.length} ${nodeType} nodes to LanceDB table: ${tableName}`);
        } catch (tableError) {
          this.logger.warn(`Failed to load ${nodeType} nodes to LanceDB`, { error: getErrorMessage(tableError) });
        }
      }

      this.logger.info('LanceDB batch load completed successfully');
      operation();
    } catch (error) {
      this.logger.error('LanceDB batch load failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
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

      // Load enhanced nodes into graph storage
      const nodeResult = await this.sqliteClient.batchInsertEnhancedGraphNodes(enhancedNodes);
      this.logger.debug(`Added ${nodeResult.success} enhanced nodes to SQLite graph`, {
        failed: nodeResult.failed,
        errors: nodeResult.errors.slice(0, 5)
      });

      // Load enhanced edges into graph storage
      const edgeResult = await this.sqliteClient.batchInsertEnhancedGraphEdges(enhancedEdges);
      this.logger.debug(`Added ${edgeResult.success} enhanced edges to SQLite graph`, {
        failed: edgeResult.failed,
        errors: edgeResult.errors.slice(0, 5)
      });

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
          'DirectoryNode',
          'CommitNode',
          'PullRequestNode',
          'CodeNode',
          'TestNode',
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
              case 'DirectoryNode':
                this.insertDirectoryNodesSync(typeNodes as unknown as DirectoryNode[], statements.directories);
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
      directories: this.sqliteClient.prepare(`
        INSERT OR REPLACE INTO directories (id, repo_id, dir_path, dir_name, ai_summary)
        VALUES (?, ?, ?, ?, ?)
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
        this.logger.warn(`Failed to insert DirectoryNode: ${node.id}`, { error: getErrorMessage(error) });
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
  private insertDirectoryNodesSync(nodes: DirectoryNode[], statement: any): void {
    for (const node of nodes) {
      statement.run(
        node.id,
        node.properties.repoId,
        node.properties.dirPath,
        node.properties.dirName,
        node.properties.aiSummary || null
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
   * Main method to load all nodes and edges into the polyglot persistence layer.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   * @param {Edge[]} edges - Array of edges.
   */
  async load(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<{
    success: boolean;
    results: {
      lancedb: { success: boolean; error?: string };
      sqlite: { success: boolean; error?: string };
    };
  }> {
    const operation = this.logger.operation(`Loading ${nodes.length} nodes and ${edges.length} edges to all databases`);

    const results: {
      lancedb: { success: boolean; error?: string };
      sqlite: { success: boolean; error?: string };
    } = {
      lancedb: { success: false },
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
      
      this.logger.info('Starting polyglot data loading', {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypes: this.getNodeTypeStats(nodes),
        validationPassed: true
      });

      // Connect to all databases with individual error handling
      const connectionStatus = await this.connectToDatabases();

      // Verify we have at least one working database
      const availableDatabases = Object.entries(connectionStatus)
        .filter(([_, connected]) => connected)
        .map(([name, _]) => name);

      if (availableDatabases.length === 0) {
        throw new Error('No databases available for data loading');
      }

      this.logger.info('Available databases for loading', { availableDatabases });

      // Load data to all available databases in parallel with individual error handling
      const loadingPromises = [];

      if (connectionStatus.lancedb) {
        loadingPromises.push(
          this.batchLoadToVectorDB(nodes)
            .then(() => {
              results.lancedb.success = true;
              this.logger.info('LanceDB loading completed successfully');
            })
            .catch((error) => {
              results.lancedb.error = getErrorMessage(error);
              this.logger.error('LanceDB loading failed', { error: getErrorMessage(error) });
            })
        );
      } else {
        results.lancedb.error = 'Database not connected';
      }

      if (connectionStatus.sqlite) {
        loadingPromises.push(
          this.batchLoadToSqlite(nodes, edges)
            .then(() => {
              results.sqlite.success = true;
              this.logger.info('SQLite loading completed successfully');
            })
            .catch((error) => {
              results.sqlite.error = getErrorMessage(error);
              this.logger.error('SQLite loading failed', { error: getErrorMessage(error) });
            })
        );

        // Also load to SQLite graph storage (same database, different tables)
        loadingPromises.push(
          this.batchLoadToGraphDB(nodes, edges)
            .then(() => {
              this.logger.info('SQLite graph loading completed successfully');
            })
            .catch((error) => {
              this.logger.error('SQLite graph loading failed', { error: getErrorMessage(error) });
            })
        );
      } else {
        results.sqlite.error = 'Database not connected';
      }

      // Wait for all loading operations to complete
      await Promise.allSettled(loadingPromises);

      // Check if at least one database loaded successfully
      const successfulLoads = Object.values(results).filter(result => result.success).length;
      const totalAttempts = availableDatabases.length;

      this.logger.info('Polyglot data loading completed', {
        successful: successfulLoads,
        total: totalAttempts,
        results,
      });

      if (successfulLoads === 0) {
        throw new Error('All database loading operations failed');
      }

      operation();
      return {
        success: successfulLoads > 0,
        results,
      };
    } catch (error) {
      this.logger.error('Polyglot data loading failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    } finally {
      // Always disconnect from databases
      try {
        await this.disconnectFromDatabases();
      } catch (disconnectError) {
        this.logger.warn('Failed to disconnect from some databases', { error: getErrorMessage(disconnectError) });
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
          case 'lancedb':
            if (connectionStatus.lancedb) {
              retryPromises.push(
                this.batchLoadToVectorDB(nodes)
                  .then(() => {
                    results.lancedb = { success: true };
                    this.logger.info('LanceDB retry successful');
                  })
                  .catch((error) => {
                    results.lancedb = { success: false, error: getErrorMessage(error) };
                    this.logger.error('LanceDB retry failed', { error: getErrorMessage(error) });
                  })
              );
            } else {
              results.lancedb = { success: false, error: 'Database not connected' };
            }
            break;

          case 'sqlite':
            if (connectionStatus.sqlite) {
              retryPromises.push(
                this.batchLoadToSqlite(nodes, edges)
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
   * Performs a health check on all databases and attempts basic recovery.
   * @returns {Promise<{healthy: string[], unhealthy: string[], recovered: string[]}>}
   */
  async performHealthCheck(): Promise<{
    healthy: string[];
    unhealthy: string[];
    recovered: string[];
  }> {
    const operation = this.logger.operation('Performing database health check');

    const healthy: string[] = [];
    const unhealthy: string[] = [];
    const recovered: string[] = [];

    try {
      this.logger.info('Starting database health check');

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
              case 'lancedb':
                await this.connectToLanceDB();
                if (this.lancedbClient.isConnectedToDatabase()) {
                  recovered.push(dbName);
                  healthy.push(dbName);
                  unhealthy.splice(unhealthy.indexOf(dbName), 1);
                }
                break;

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

      this.logger.info('Database health check completed', {
        healthy: healthy.length,
        unhealthy: unhealthy.length,
        recovered: recovered.length,
      });

      operation();
      return { healthy, unhealthy, recovered };
    } catch (error) {
      this.logger.error('Database health check failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    } finally {
      await this.disconnectFromDatabases();
    }
  }

  /**
   * Verifies database connectivity before attempting operations.
   * @returns {Promise<{lancedb: boolean, sqlite: boolean}>}
   */
  async verifyDatabaseConnectivity(): Promise<{
    lancedb: boolean;
    sqlite: boolean;
  }> {
    const operation = this.logger.operation('Verifying database connectivity');

    try {
      const connectivity = {
        lancedb: false,
        sqlite: false,
      };

      // Test each database connection
      const verificationPromises = [
        this.verifyLanceDBConnection().then(() => {
          connectivity.lancedb = true;
        }).catch((error) => {
          this.logger.debug('LanceDB connectivity check failed', { error: getErrorMessage(error) });
        }),

        this.verifySQLiteConnection().then(() => {
          connectivity.sqlite = true;
        }).catch((error) => {
          this.logger.debug('SQLite connectivity check failed', { error: getErrorMessage(error) });
        }),
      ];

      await Promise.allSettled(verificationPromises);

      this.logger.info('Database connectivity verification completed', connectivity);
      operation();
      return connectivity;
    } catch (error) {
      this.logger.error('Database connectivity verification failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Verifies LanceDB connection.
   */
  private async verifyLanceDBConnection(): Promise<void> {
    if (!this.lancedbClient.isConnectedToDatabase()) {
      throw new Error('LanceDB not connected');
    }
    // Additional verification could include a simple query
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
          
          // Get graph stats from SQLite graph tables
          const graphStats = await this.sqliteClient.getEnhancedGraphStats();
          this.logger.debug('SQLite stats', { sqliteStats, graphStats });
          
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
   * Gets loading statistics and database health information.
   * @returns {Promise<{databases: Record<string, boolean>, lastLoad: Date | null, connectivity: {lancedb: boolean, sqlite: boolean}}>}
   */
  async getStats(): Promise<{
    databases: Record<string, boolean>;
    lastLoad: Date | null;
    connectivity: {lancedb: boolean, sqlite: boolean};
  }> {
    try {
      // Check database connectivity
      const databases = {
        lancedb: this.lancedbClient.isConnectedToDatabase(),
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
