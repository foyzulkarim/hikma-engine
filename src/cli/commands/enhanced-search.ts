/**
 * @file Enhanced search command that works with the embedding_nodes table.
 */

import { Command } from 'commander';
import { ConfigManager } from '../../config';
import { EnhancedSearchService, EmbeddingSearchOptions, EmbeddingMetadataFilters } from '../../modules/enhanced-search-service';
import { getLogger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error-handling';

const logger = getLogger('EnhancedSearchCLI');

/**
 * Creates the enhanced search command.
 */
export function createEnhancedSearchCommand(): Command {
  const searchCmd = new Command('enhanced-search')
    .description('Enhanced search functionality for embedding_nodes table')
    .alias('esearch');

  // Semantic search command
  searchCmd
    .command('semantic <query>')
    .description('Perform semantic search using vector embeddings')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', '0.1')
    .option('-t, --types <types>', 'Comma-separated list of node types to search')
    .option('-f, --files <files>', 'Comma-separated list of file paths to search in')
    .option('-e, --include-embedding', 'Include embedding vectors in results', false)
    .option('--json', 'Output results in JSON format', false)
    .action(async (query: string, options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        const searchService = new EnhancedSearchService(config);
        
        await searchService.initialize();
        
        const searchOptions: EmbeddingSearchOptions = {
          limit: parseInt(options.limit),
          minSimilarity: parseFloat(options.similarity),
          includeEmbedding: options.includeEmbedding
        };
        
        if (options.types) {
          searchOptions.nodeTypes = options.types.split(',').map((t: string) => t.trim());
        }
        
        if (options.files) {
          searchOptions.filePaths = options.files.split(',').map((f: string) => f.trim());
        }
        
        const results = await searchService.semanticSearch(query, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displaySearchResults(results, 'Semantic Search');
        }
        
        await searchService.disconnect();
      } catch (error) {
        logger.error('Semantic search failed', { error: getErrorMessage(error) });
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });

  // Text search command
  searchCmd
    .command('text <query>')
    .description('Perform text-based search in source_text field')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option('-t, --types <types>', 'Comma-separated list of node types to search')
    .option('-f, --files <files>', 'Comma-separated list of file paths to search in')
    .option('--json', 'Output results in JSON format', false)
    .action(async (query: string, options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        const searchService = new EnhancedSearchService(config);
        
        await searchService.initialize();
        
        const searchOptions: EmbeddingSearchOptions = {
          limit: parseInt(options.limit)
        };
        
        if (options.types) {
          searchOptions.nodeTypes = options.types.split(',').map((t: string) => t.trim());
        }
        
        if (options.files) {
          searchOptions.filePaths = options.files.split(',').map((f: string) => f.trim());
        }
        
        const results = await searchService.textBasedSearch(query, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displaySearchResults(results, 'Text Search');
        }
        
        await searchService.disconnect();
      } catch (error) {
        logger.error('Text search failed', { error: getErrorMessage(error) });
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });

  // Metadata search command
  searchCmd
    .command('metadata')
    .description('Perform metadata-based search')
    .option('-l, --limit <number>', 'Maximum number of results', '100')
    .option('-t, --type <type>', 'Node type to search for')
    .option('-f, --file-path <path>', 'File path pattern to search for')
    .option('-x, --extension <ext>', 'File extension to search for')
    .option('-c, --contains <text>', 'Text that source_text should contain')
    .option('--json', 'Output results in JSON format', false)
    .action(async (options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        const searchService = new EnhancedSearchService(config);
        
        await searchService.initialize();
        
        const filters: EmbeddingMetadataFilters = {};
        
        if (options.type) filters.nodeType = options.type;
        if (options.filePath) filters.filePath = options.filePath;
        if (options.extension) filters.fileExtension = options.extension;
        if (options.contains) filters.sourceTextContains = options.contains;
        
        const searchOptions: EmbeddingSearchOptions = {
          limit: parseInt(options.limit)
        };
        
        const results = await searchService.metadataSearch(filters, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displaySearchResults(results, 'Metadata Search');
        }
        
        await searchService.disconnect();
      } catch (error) {
        logger.error('Metadata search failed', { error: getErrorMessage(error) });
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });

  // Hybrid search command
  searchCmd
    .command('hybrid <query>')
    .description('Perform hybrid search combining semantic and metadata filters')
    .option('-l, --limit <number>', 'Maximum number of results', '20')
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', '0.1')
    .option('-t, --type <type>', 'Node type to search for')
    .option('-f, --file-path <path>', 'File path pattern to search for')
    .option('-x, --extension <ext>', 'File extension to search for')
    .option('--json', 'Output results in JSON format', false)
    .action(async (query: string, options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        const searchService = new EnhancedSearchService(config);
        
        await searchService.initialize();
        
        const filters: EmbeddingMetadataFilters = {};
        if (options.type) filters.nodeType = options.type;
        if (options.filePath) filters.filePath = options.filePath;
        if (options.extension) filters.fileExtension = options.extension;
        
        const searchOptions: EmbeddingSearchOptions = {
          limit: parseInt(options.limit),
          minSimilarity: parseFloat(options.similarity)
        };
        
        const results = await searchService.hybridSearch(query, filters, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displaySearchResults(results, 'Hybrid Search');
        }
        
        await searchService.disconnect();
      } catch (error) {
        logger.error('Hybrid search failed', { error: getErrorMessage(error) });
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });

  // Similar nodes command
  searchCmd
    .command('similar <nodeId>')
    .description('Find nodes similar to a given node ID')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', '0.1')
    .option('-t, --types <types>', 'Comma-separated list of node types to search')
    .option('--json', 'Output results in JSON format', false)
    .action(async (nodeId: string, options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        const searchService = new EnhancedSearchService(config);
        
        await searchService.initialize();
        
        const searchOptions: EmbeddingSearchOptions = {
          limit: parseInt(options.limit),
          minSimilarity: parseFloat(options.similarity)
        };
        
        if (options.types) {
          searchOptions.nodeTypes = options.types.split(',').map((t: string) => t.trim());
        }
        
        const results = await searchService.findSimilarNodes(nodeId, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displaySearchResults(results, `Similar to Node: ${nodeId}`);
        }
        
        await searchService.disconnect();
      } catch (error) {
        logger.error('Similar nodes search failed', { error: getErrorMessage(error) });
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });

  // Stats command
  searchCmd
    .command('stats')
    .description('Show statistics about the embedding_nodes table')
    .option('--json', 'Output stats in JSON format', false)
    .action(async (options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        const searchService = new EnhancedSearchService(config);
        
        await searchService.initialize();
        
        const stats = await searchService.getEmbeddingStats();
        
        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          displayStats(stats);
        }
        
        await searchService.disconnect();
      } catch (error) {
        logger.error('Failed to get stats', { error: getErrorMessage(error) });
        console.error(`Error: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });

  return searchCmd;
}

/**
 * Displays search results in a formatted way.
 */
function displaySearchResults(results: any[], searchType: string): void {
  console.log(`\n=== ${searchType} Results ===`);
  console.log(`Found ${results.length} results\n`);
  
  if (results.length === 0) {
    console.log('No results found.');
    return;
  }
  
  results.forEach((result, index) => {
    console.log(`${index + 1}. [${result.node.nodeType}] ${result.node.filePath}`);
    console.log(`   Node ID: ${result.node.nodeId}`);
    console.log(`   Similarity: ${(result.similarity * 100).toFixed(2)}%`);
    console.log(`   Source: ${result.node.sourceText.substring(0, 150)}${result.node.sourceText.length > 150 ? '...' : ''}`);
    console.log('');
  });
}

/**
 * Displays embedding statistics in a formatted way.
 */
function displayStats(stats: any): void {
  console.log('\n=== Embedding Nodes Statistics ===');
  console.log(`Total Nodes: ${stats.totalNodes}`);
  console.log(`Embedding Coverage: ${(stats.embeddingCoverage * 100).toFixed(2)}%`);
  
  console.log('\nNode Type Breakdown:');
  Object.entries(stats.nodeTypeBreakdown).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\nTop File Paths:');
  Object.entries(stats.filePathBreakdown).slice(0, 10).forEach(([path, count]) => {
    console.log(`  ${path}: ${count}`);
  });
}