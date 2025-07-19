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