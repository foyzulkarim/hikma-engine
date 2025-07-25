#!/usr/bin/env node

/**
 * @file CLI command for searching the hikma-engine knowledge graph.
 *       Provides semantic search, metadata filtering, and specialized search commands.
 */

import { Command } from 'commander';
import { ConfigManager } from '../config';
import { SearchService, SearchOptions, MetadataFilters } from '../modules/search-service';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import chalk from 'chalk';
import Table from 'cli-table3';

const logger = getLogger('SearchCLI');

/**
 * Formats and displays search results in a table.
 */
function displayResults(results: any[], title: string): void {
  if (results.length === 0) {
    console.log(chalk.yellow(`\n📭 No results found for ${title}`));
    return;
  }

  console.log(chalk.blue(`\n🔍 ${title} (${results.length} results):`));
  console.log(chalk.gray('─'.repeat(80)));

  const table = new Table({
    head: [
      chalk.cyan('Rank'),
      chalk.cyan('Type'),
      chalk.cyan('ID'),
      chalk.cyan('Similarity'),
      chalk.cyan('Details')
    ],
    colWidths: [6, 12, 25, 12, 35],
    wordWrap: true
  });

  results.forEach((result, index) => {
    const similarity = result.similarity ? (result.similarity * 100).toFixed(1) + '%' : 'N/A';
    const details = formatNodeDetails(result.node, result.metadata);
    
    table.push([
      chalk.white(result.rank || index + 1),
      chalk.green(result.node.type),
      chalk.yellow(result.node.id.substring(0, 22) + '...'),
      chalk.magenta(similarity),
      details
    ]);
  });

  console.log(table.toString());
}

/**
 * Displays RDBMS data in a structured table format.
 */
function displayRDBMSData(data: any[], tableName: string, title: string): void {
  if (data.length === 0) {
    console.log(chalk.yellow(`\n📭 No ${tableName} data found`));
    return;
  }

  console.log(chalk.blue(`\n🗄️  ${title} - ${tableName.toUpperCase()} Table (${data.length} records):`));
  console.log(chalk.gray('─'.repeat(100)));

  if (data.length > 0) {
    const columns = Object.keys(data[0]);
    const table = new Table({
      head: columns.map(col => chalk.cyan(col)),
      wordWrap: true,
      colWidths: columns.map(() => 20)
    });

    data.slice(0, 10).forEach(row => {
      const values = columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string' && value.length > 18) {
          return value.substring(0, 15) + '...';
        }
        return String(value);
      });
      table.push(values);
    });

    console.log(table.toString());
    
    if (data.length > 10) {
      console.log(chalk.gray(`... and ${data.length - 10} more records`));
    }
  }
}

/**
 * Displays graph relationships in a structured format.
 */
function displayGraphData(nodes: any[], edges: any[], title: string): void {
  console.log(chalk.blue(`\n🕸️  ${title}:`));
  console.log(chalk.gray('─'.repeat(80)));

  if (nodes.length > 0) {
    console.log(chalk.green(`\n📊 Graph Nodes (${nodes.length}):`));
    const nodeTable = new Table({
      head: [chalk.cyan('ID'), chalk.cyan('Type'), chalk.cyan('Business Key'), chalk.cyan('Properties')],
      colWidths: [25, 15, 25, 35],
      wordWrap: true
    });

    nodes.slice(0, 10).forEach(node => {
      const properties = node.properties ? JSON.stringify(node.properties).substring(0, 30) + '...' : 'None';
      nodeTable.push([
        chalk.yellow(node.id.substring(0, 22) + '...'),
        chalk.green(node.node_type || node.type),
        chalk.white(node.business_key || 'N/A'),
        properties
      ]);
    });

    console.log(nodeTable.toString());
  }

  if (edges.length > 0) {
    console.log(chalk.green(`\n🔗 Graph Edges (${edges.length}):`));
    const edgeTable = new Table({
      head: [chalk.cyan('Source'), chalk.cyan('Target'), chalk.cyan('Edge Type'), chalk.cyan('Properties')],
      colWidths: [25, 25, 15, 25],
      wordWrap: true
    });

    edges.slice(0, 10).forEach(edge => {
      const properties = edge.properties ? JSON.stringify(edge.properties).substring(0, 20) + '...' : 'None';
      edgeTable.push([
        chalk.yellow(edge.source_id.substring(0, 22) + '...'),
        chalk.yellow(edge.target_id.substring(0, 22) + '...'),
        chalk.magenta(edge.edge_type),
        properties
      ]);
    });

    console.log(edgeTable.toString());
  }

  if (nodes.length === 0 && edges.length === 0) {
    console.log(chalk.yellow('📭 No graph data found'));
  }
}

/**
 * Displays embedding metadata in a detailed format.
 */
function displayEmbeddingData(embeddings: any[], title: string): void {
  if (embeddings.length === 0) {
    console.log(chalk.yellow(`\n📭 No embedding data found`));
    return;
  }

  console.log(chalk.blue(`\n🧠 ${title} (${embeddings.length} embeddings):`));
  console.log(chalk.gray('─'.repeat(100)));

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Node Type'),
      chalk.cyan('Business Key'),
      chalk.cyan('Extracted Text'),
      chalk.cyan('File Path'),
      chalk.cyan('Embedding Size')
    ],
    colWidths: [20, 12, 20, 30, 25, 15],
    wordWrap: true
  });

  embeddings.slice(0, 10).forEach(embedding => {
    const extractedText = embedding.extracted_text ? 
      embedding.extracted_text.substring(0, 27) + '...' : 'N/A';
    const filePath = embedding.file_path ? 
      embedding.file_path.substring(0, 22) + '...' : 'N/A';
    const embeddingSize = embedding.embedding ? 
      `${embedding.embedding.length} dims` : 'No embedding';
    
    table.push([
      chalk.yellow(embedding.id || embedding.node_id || 'N/A'),
      chalk.green(embedding.node_type),
      chalk.white(embedding.business_key || 'N/A'),
      extractedText,
      chalk.gray(filePath),
      chalk.magenta(embeddingSize)
    ]);
  });

  console.log(table.toString());
  
  if (embeddings.length > 10) {
    console.log(chalk.gray(`... and ${embeddings.length - 10} more embeddings`));
  }
}

/**
 * Formats node details for display.
 */
function formatNodeDetails(node: any, metadata?: any): string {
  const details: string[] = [];
  
  // Add node properties
  if (node.properties) {
    if (node.properties.name) {
      details.push(`Name: ${node.properties.name}`);
    }
    if (node.properties.content) {
      const content = node.properties.content.substring(0, 50);
      details.push(`Content: ${content}...`);
    }
    if (node.properties.message) {
      const message = node.properties.message.substring(0, 50);
      details.push(`Message: ${message}...`);
    }
  }
  
  // Add metadata
  if (metadata) {
    if (metadata.filePath) {
      details.push(`Path: ${metadata.filePath}`);
    }
    if (metadata.language) {
      details.push(`Lang: ${metadata.language}`);
    }
    if (metadata.author) {
      details.push(`Author: ${metadata.author}`);
    }
  }
  
  return details.join('\n') || 'No details available';
}

/**
 * Parses node types from comma-separated string.
 */
function parseNodeTypes(nodeTypesStr: string): string[] {
  return nodeTypesStr.split(',').map(type => type.trim()).filter(Boolean);
}

/**
 * Main search command.
 */
async function searchCommand(
  query: string,
  options: {
    limit?: string;
    nodeTypes?: string;
    minSimilarity?: string;
    fileExtension?: string;
    author?: string;
    language?: string;
    filePath?: string;
    dateStart?: string;
    dateEnd?: string;
    semantic?: boolean;
    metadata?: boolean;
    hybrid?: boolean;
    all?: boolean;
  }
): Promise<void> {
  const operation = logger.operation(`Search command: "${query}"`);
  
  try {
    console.log(chalk.blue('🚀 Initializing hikma-engine search...'));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    // Parse options
    const searchOptions: SearchOptions = {
      limit: options.limit ? parseInt(options.limit) : 10,
      minSimilarity: options.minSimilarity ? parseFloat(options.minSimilarity) : 0.1,
      nodeTypes: options.nodeTypes ? parseNodeTypes(options.nodeTypes) as any : undefined,
      includeMetadata: true
    };
    
    const metadataFilters: MetadataFilters = {};
    if (options.fileExtension) metadataFilters.fileExtension = options.fileExtension;
    if (options.author) metadataFilters.author = options.author;
    if (options.language) metadataFilters.language = options.language;
    if (options.filePath) metadataFilters.filePath = options.filePath;
    if (options.dateStart && options.dateEnd) {
      metadataFilters.dateRange = {
        start: options.dateStart,
        end: options.dateEnd
      };
    }
    
    // Determine search type
    let searchType = 'hybrid'; // default
    if (options.semantic) searchType = 'semantic';
    if (options.metadata) searchType = 'metadata';
    if (options.hybrid) searchType = 'hybrid';
    if (options.all) searchType = 'comprehensive';
    
    console.log(chalk.green(`🔍 Performing ${searchType} search for: "${query}"`));
    
    let results: any[] = [];
    
    switch (searchType) {
      case 'semantic':
        results = await searchService.semanticSearch(query, searchOptions);
        displayResults(results, `Semantic Search Results`);
        break;
        
      case 'metadata':
        const nodeIds = await searchService.metadataSearch(metadataFilters, searchOptions);
        console.log(chalk.blue(`\n📊 Metadata Search Results (${nodeIds.length} nodes):`));
        console.log(chalk.gray('─'.repeat(80)));
        nodeIds.slice(0, searchOptions.limit).forEach((id, index) => {
          console.log(chalk.white(`${index + 1}. ${chalk.yellow(id)}`));
        });
        break;
        
      case 'comprehensive':
        results = await searchService.comprehensiveSearch(query, {
          ...searchOptions,
          metadataFilters
        });
        displayResults(results, `Comprehensive Search Results`);
        break;
        
      case 'hybrid':
      default:
        results = await searchService.hybridSearch(query, metadataFilters, searchOptions);
        displayResults(results, `Hybrid Search Results`);
        break;
    }
    
    // Display search statistics
    const stats = await searchService.getStats();
    console.log(chalk.gray('\n📈 Search Statistics:'));
    console.log(chalk.gray(`   • Total indexed nodes: ${stats.totalIndexedNodes}`));
    console.log(chalk.gray(`   • Embedding model: ${stats.embeddingModel}`));
    console.log(chalk.gray(`   • Service initialized: ${stats.isInitialized}`));
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ Search completed successfully!'));
    
    operation();
  } catch (error) {
    console.error(chalk.red('❌ Search failed:'), getErrorMessage(error));
    logger.error('Search command failed', { error: getErrorMessage(error) });
    operation();
    process.exit(1);
  }
}

/**
 * Code search command.
 */
async function codeSearchCommand(
  codeSnippet: string,
  options: {
    language?: string;
    limit?: string;
    minSimilarity?: string;
  }
): Promise<void> {
  try {
    console.log(chalk.blue('🔍 Searching for similar code patterns...'));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    const searchOptions: SearchOptions = {
      limit: options.limit ? parseInt(options.limit) : 10,
      minSimilarity: options.minSimilarity ? parseFloat(options.minSimilarity) : 0.1
    };
    
    const results = await searchService.findSimilarCode(
      codeSnippet,
      options.language,
      searchOptions
    );
    
    displayResults(results, `Similar Code Patterns`);
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ Code search completed!'));
  } catch (error) {
    console.error(chalk.red('❌ Code search failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

/**
 * File search command.
 */
async function fileSearchCommand(
  query: string,
  options: {
    extension?: string;
    limit?: string;
  }
): Promise<void> {
  try {
    console.log(chalk.blue('📁 Searching files...'));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    const searchOptions: SearchOptions = {
      limit: options.limit ? parseInt(options.limit) : 10
    };
    
    const results = await searchService.searchFiles(
      query,
      options.extension,
      searchOptions
    );
    
    displayResults(results, `File Search Results`);
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ File search completed!'));
  } catch (error) {
    console.error(chalk.red('❌ File search failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

/**
 * Commit search command.
 */
async function commitSearchCommand(
  query: string,
  options: {
    author?: string;
    dateStart?: string;
    dateEnd?: string;
    limit?: string;
  }
): Promise<void> {
  try {
    console.log(chalk.blue('📝 Searching commit history...'));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    const searchOptions: SearchOptions = {
      limit: options.limit ? parseInt(options.limit) : 10
    };
    
    const dateRange = options.dateStart && options.dateEnd ? {
      start: options.dateStart,
      end: options.dateEnd
    } : undefined;
    
    const results = await searchService.searchCommits(
      query,
      options.author,
      dateRange,
      searchOptions
    );
    
    displayResults(results, `Commit Search Results`);
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ Commit search completed!'));
  } catch (error) {
    console.error(chalk.red('❌ Commit search failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

/**
 * RDBMS data query command - queries raw database tables.
 */
async function rdbmsQueryCommand(
  table: string,
  options: {
    limit?: string;
    where?: string;
    columns?: string;
  }
): Promise<void> {
  try {
    console.log(chalk.blue(`🗄️  Querying RDBMS table: ${table}...`));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    // Get SQLite client from search service
    const sqliteClient = (searchService as any).sqliteClient;
    
    const limit = options.limit ? parseInt(options.limit) : 50;
    const columns = options.columns || '*';
    const whereClause = options.where ? `WHERE ${options.where}` : '';
    
    const sql = `SELECT ${columns} FROM ${table} ${whereClause} LIMIT ${limit}`;
    
    console.log(chalk.gray(`Executing SQL: ${sql}`));
    
    const data = sqliteClient.all(sql);
    
    displayRDBMSData(data, table, 'RDBMS Query Results');
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ RDBMS query completed!'));
  } catch (error) {
    console.error(chalk.red('❌ RDBMS query failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

/**
 * Graph data query command - queries graph nodes and relationships.
 */
async function graphQueryCommand(
  query: string,
  options: {
    nodeType?: string;
    limit?: string;
    includeEdges?: boolean;
  }
): Promise<void> {
  try {
    console.log(chalk.blue('🕸️  Querying graph data...'));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    // Get SQLite client from search service
    const sqliteClient = (searchService as any).sqliteClient;
    
    const limit = options.limit ? parseInt(options.limit) : 20;
    
    // Query graph nodes
    let nodesSql = `
      SELECT id, node_type, business_key, properties, file_path, repo_id
      FROM graph_nodes
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (query && query !== '*') {
      conditions.push('(business_key LIKE ? OR properties LIKE ?)');
      params.push(`%${query}%`, `%${query}%`);
    }
    
    if (options.nodeType) {
      conditions.push('node_type = ?');
      params.push(options.nodeType);
    }
    
    if (conditions.length > 0) {
      nodesSql += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    nodesSql += ` ORDER BY created_at DESC LIMIT ${limit}`;
    
    console.log(chalk.gray(`Executing nodes query: ${nodesSql}`));
    const nodes = sqliteClient.all(nodesSql, params);
    
    let edges: any[] = [];
    
    // Query graph edges if requested
     if (options.includeEdges && nodes.length > 0) {
       const nodeIds = nodes.map((n: any) => n.id);
       const placeholders = nodeIds.map(() => '?').join(',');
      
      const edgesSql = `
        SELECT source_id, target_id, edge_type, properties
        FROM graph_edges
        WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
        LIMIT ${limit}
      `;
      
      console.log(chalk.gray(`Executing edges query: ${edgesSql}`));
      edges = sqliteClient.all(edgesSql, [...nodeIds, ...nodeIds]);
    }
    
    displayGraphData(nodes, edges, 'Graph Query Results');
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ Graph query completed!'));
  } catch (error) {
    console.error(chalk.red('❌ Graph query failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

/**
 * Embedding metadata query command - queries embedding tables and metadata.
 */
async function embeddingQueryCommand(
  query: string,
  options: {
    table?: string;
    nodeType?: string;
    limit?: string;
    similarity?: boolean;
  }
): Promise<void> {
  try {
    console.log(chalk.blue('🧠 Querying embedding metadata...'));
    
    const config = new ConfigManager(process.cwd());
    const searchService = new SearchService(config);
    
    await searchService.initialize();
    
    // Get SQLite client from search service
    const sqliteClient = (searchService as any).sqliteClient;
    
    const limit = options.limit ? parseInt(options.limit) : 20;
    const table = options.table || 'embed_graph_nodes';
    
    let sql = '';
    const params: any[] = [];
    
    if (options.similarity && query && query !== '*') {
      // Perform semantic similarity search if requested
      try {
        const results = await searchService.semanticSearch(query, {
          limit,
          nodeTypes: options.nodeType ? [options.nodeType as any] : undefined
        });
        
        displayResults(results, 'Embedding Similarity Search Results');
        
        // Also show the raw embedding metadata
        if (results.length > 0) {
          const nodeIds = results.map(r => r.node.id);
          const placeholders = nodeIds.map(() => '?').join(',');
          
          sql = `
            SELECT id, node_id, node_type, business_key, extracted_text, 
                   file_path, properties_metadata, created_at
            FROM ${table}
            WHERE node_id IN (${placeholders})
            ORDER BY created_at DESC
          `;
          
          const embeddings = sqliteClient.all(sql, nodeIds);
          displayEmbeddingData(embeddings, 'Related Embedding Metadata');
        }
      } catch (error) {
        console.log(chalk.yellow('Similarity search failed, showing raw embedding data instead'));
        options.similarity = false;
      }
    }
    
    if (!options.similarity) {
      // Query raw embedding metadata
      sql = `
        SELECT id, node_id, node_type, business_key, extracted_text, 
               file_path, properties_metadata, created_at
        FROM ${table}
      `;
      
      const conditions: string[] = [];
      
      if (query && query !== '*') {
        conditions.push('(business_key LIKE ? OR extracted_text LIKE ? OR file_path LIKE ?)');
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      
      if (options.nodeType) {
        conditions.push('node_type = ?');
        params.push(options.nodeType);
      }
      
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
      
      console.log(chalk.gray(`Executing embedding query: ${sql}`));
      const embeddings = sqliteClient.all(sql, params);
      
      displayEmbeddingData(embeddings, 'Embedding Metadata Query Results');
    }
    
    await searchService.disconnect();
    console.log(chalk.green('\n✅ Embedding query completed!'));
  } catch (error) {
    console.error(chalk.red('❌ Embedding query failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

// CLI setup
const program = new Command();

program
  .name('hikma-search')
  .description('Search the hikma-engine knowledge graph')
  .version('1.0.0');

// Main search command
program
  .command('search <query>')
  .description('Search the knowledge graph with semantic and metadata filtering')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .option('-t, --node-types <types>', 'Comma-separated node types to search')
  .option('-s, --min-similarity <number>', 'Minimum similarity threshold', '0.1')
  .option('-e, --file-extension <ext>', 'Filter by file extension')
  .option('-a, --author <author>', 'Filter by author')
  .option('--language <lang>', 'Filter by programming language')
  .option('-p, --file-path <path>', 'Filter by file path pattern')
  .option('--date-start <date>', 'Start date for date range filter (YYYY-MM-DD)')
  .option('--date-end <date>', 'End date for date range filter (YYYY-MM-DD)')
  .option('--semantic', 'Use semantic search only')
  .option('--metadata', 'Use metadata search only')
  .option('--hybrid', 'Use hybrid search (default)')
  .option('--all', 'Search across all databases and node types comprehensively')
  .action(searchCommand);

// Code search command
program
  .command('code <snippet>')
  .description('Find similar code patterns')
  .option('--language <lang>', 'Programming language filter')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .option('-s, --min-similarity <number>', 'Minimum similarity threshold', '0.1')
  .action(codeSearchCommand);

// File search command
program
  .command('files <query>')
  .description('Search files by content or metadata')
  .option('-e, --extension <ext>', 'File extension filter')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .action(fileSearchCommand);

// Commit search command
program
  .command('commits <query>')
  .description('Search commit history')
  .option('-a, --author <author>', 'Author filter')
  .option('--date-start <date>', 'Start date (YYYY-MM-DD)')
  .option('--date-end <date>', 'End date (YYYY-MM-DD)')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .action(commitSearchCommand);

// RDBMS query command
program
  .command('rdbms <table>')
  .description('Query raw database tables')
  .option('-l, --limit <number>', 'Maximum number of results', '50')
  .option('-w, --where <condition>', 'WHERE clause condition')
  .option('-c, --columns <columns>', 'Comma-separated column names', '*')
  .action(rdbmsQueryCommand);

// Graph query command
program
  .command('graph <query>')
  .description('Query graph nodes and relationships')
  .option('-t, --node-type <type>', 'Filter by node type')
  .option('-l, --limit <number>', 'Maximum number of results', '20')
  .option('-e, --include-edges', 'Include related edges in results')
  .action(graphQueryCommand);

// Embedding query command
program
  .command('embeddings <query>')
  .description('Query embedding metadata and perform similarity search')
  .option('-t, --table <table>', 'Embedding table name', 'embed_graph_nodes')
  .option('-n, --node-type <type>', 'Filter by node type')
  .option('-l, --limit <number>', 'Maximum number of results', '20')
  .option('-s, --similarity', 'Perform semantic similarity search')
  .action(embeddingQueryCommand);

// Stats command
program
  .command('stats')
  .description('Show search service statistics')
  .action(async () => {
    try {
      console.log(chalk.blue('📊 Getting search service statistics...'));
      
      const config = new ConfigManager(process.cwd());
      const searchService = new SearchService(config);
      
      await searchService.initialize();
      const stats = await searchService.getStats();
      
      console.log(chalk.green('\n📈 Search Service Statistics:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.white(`Service Status: ${stats.isInitialized ? chalk.green('✅ Initialized') : chalk.red('❌ Not Initialized')}`));
      console.log(chalk.white(`Embedding Model: ${chalk.cyan(stats.embeddingModel)}`));
      console.log(chalk.white(`Total Indexed Nodes: ${chalk.yellow(stats.totalIndexedNodes)}`));
      
      await searchService.disconnect();
    } catch (error) {
      console.error(chalk.red('❌ Failed to get stats:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// Parse command line arguments
if (require.main === module) {
  program.parse();
}

export { program };