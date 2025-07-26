#!/usr/bin/env node
/**
 * @file Main CLI entry point for hikma-engine
 *       Provides unified access to indexing and search functionality
 */

import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { Indexer, IndexingOptions } from '../core/indexer';
import { EnhancedSearchService, EmbeddingSearchOptions, EmbeddingMetadataFilters } from '../modules/enhanced-search-service';
import { ConfigManager } from '../config';
import { initializeLogger, getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import Table from 'cli-table3';

/**
 * Display search results in a formatted table
 */
function displayResults(results: any[], title: string) {
  console.log(chalk.green(`\n${title}`));
  console.log(chalk.gray('='.repeat(title.length)));
  
  if (results.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }

  const table = new Table({
    head: ['Node ID', 'Type', 'File Path', 'Similarity', 'Data Source', 'Source Text Preview'],
    colWidths: [10, 15, 30, 12, 15, 40],
    wordWrap: true
  });

  results.forEach((result) => {
    const similarity = result.similarity ? result.similarity.toFixed(4) : 'N/A';
    const preview = result.node?.sourceText ? 
      (result.node.sourceText.length > 80 ? 
        result.node.sourceText.substring(0, 80) + '...' : 
        result.node.sourceText) : 'N/A';
    
    table.push([
      result.node?.nodeId || 'N/A',
      result.node?.nodeType || 'N/A', 
      result.node?.filePath || 'N/A',
      similarity,
      chalk.cyan('embedding_nodes'),
      preview
    ]);
  });

  console.log(table.toString());
}

/**
 * Create the main CLI program
 */
function createProgram(): Command {
  const program = new Command();
  
  program
    .name('hikma')
    .description('Hikma Engine - Code Knowledge Graph and Search')
    .version('1.0.0');

  // Index command
  const indexCmd = program
    .command('index [project-path]')
    .description('Index a codebase to build knowledge graph')
    .option('-f, --force-full', 'Force full indexing (ignore incremental updates)')
    .option('--skip-ai-summary', 'Skip AI summary generation')
    .option('--skip-embeddings', 'Skip vector embedding generation')
    .option('--dry-run', 'Perform indexing without persisting data')
    .option('--phases <phases>', 'Run only specific phases (comma-separated)')
    .option('--from-phase <phase>', 'Start from specific phase')
    .option('--force-phases <phases>', 'Force re-run specific phases')
    .option('--inspect-phase <phase>', 'Show phase data and exit')
    .option('--status', 'Show status of all phases')
    .action(async (projectPath: string = process.cwd(), options: any) => {
      try {
        const resolvedPath = path.resolve(projectPath);
        
        // Parse indexing options
        const indexingOptions: IndexingOptions = {
          forceFullIndex: options.forceFull,
          skipAISummary: options.skipAiSummary,
          skipEmbeddings: options.skipEmbeddings,
          dryRun: options.dryRun,
          showStatus: options.status
        };
        
        if (options.phases) {
          indexingOptions.runPhases = options.phases.split(',').map(Number);
        }
        if (options.fromPhase) {
          indexingOptions.fromPhase = Number(options.fromPhase);
        }
        if (options.forcePhases) {
          indexingOptions.forcePhases = options.forcePhases.split(',').map(Number);
        }
        if (options.inspectPhase) {
          indexingOptions.inspectPhase = Number(options.inspectPhase);
        }
        
        // Initialize configuration and logging
        const config = new ConfigManager(resolvedPath);
        const loggingConfig = config.getLoggingConfig();
        initializeLogger({
          level: loggingConfig.level,
          enableConsole: loggingConfig.enableConsole,
          enableFile: loggingConfig.enableFile,
          logFilePath: loggingConfig.logFilePath,
        });
        
        console.log(chalk.blue('🚀 Starting hikma-engine indexing...'));
        console.log(chalk.gray(`Project: ${resolvedPath}`));
        
        // Create and run indexer
        const indexer = new Indexer(resolvedPath, config);
        const result = await indexer.run(indexingOptions);
        
        // Display results
        console.log(chalk.green('\n✅ Indexing completed successfully!'));
        console.log(chalk.gray('='.repeat(40)));
        console.log(`Mode: ${result.isIncremental ? 'Incremental' : 'Full'}`);
        console.log(`Files processed: ${result.processedFiles}`);
        console.log(`Nodes created: ${result.totalNodes}`);
        console.log(`Edges created: ${result.totalEdges}`);
        console.log(`Duration: ${result.duration}ms`);
        
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\nWarnings/Errors: ${result.errors.length}`));
          result.errors.forEach(error => console.log(chalk.yellow(`  - ${error}`)));
        }
        
        if (indexingOptions.dryRun) {
          console.log(chalk.cyan('\n(Dry run mode - no data was persisted)'));
        }
        
      } catch (error) {
        console.error(chalk.red(`❌ Indexing failed: ${getErrorMessage(error)}`));
        process.exit(1);
      }
    });

  // Search command group
  const searchCmd = program
    .command('search')
    .description('Search the knowledge graph using various methods');

  // Semantic search subcommand
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
        
        // Initialize logging
        const loggingConfig = config.getLoggingConfig();
        initializeLogger({
          level: loggingConfig.level,
          enableConsole: false,
          enableFile: loggingConfig.enableFile,
          logFilePath: loggingConfig.logFilePath,
        });
        
        const searchService = new EnhancedSearchService(config);
        
        console.log(chalk.blue('🚀 Initializing enhanced search service...'));
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
        
        console.log(chalk.blue(`🔍 Searching for: "${query}"`));
        const results = await searchService.semanticSearch(query, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displayResults(results, 'Semantic Search Results');
        }
        
        await searchService.disconnect();
      } catch (error) {
        console.error(chalk.red(`❌ Error: ${getErrorMessage(error)}`));
        process.exit(1);
      }
    });

  // Text search subcommand
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
        
        const loggingConfig = config.getLoggingConfig();
        initializeLogger({
          level: loggingConfig.level,
          enableConsole: false,
          enableFile: loggingConfig.enableFile,
          logFilePath: loggingConfig.logFilePath,
        });
        
        const searchService = new EnhancedSearchService(config);
        
        console.log(chalk.blue('🚀 Initializing enhanced search service...'));
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
        
        console.log(chalk.blue(`🔍 Text searching for: "${query}"`));
        const results = await searchService.textBasedSearch(query, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displayResults(results, 'Text Search Results');
        }
        
        await searchService.disconnect();
      } catch (error) {
        console.error(chalk.red(`❌ Error: ${getErrorMessage(error)}`));
        process.exit(1);
      }
    });

  // Hybrid search subcommand
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
        
        const loggingConfig = config.getLoggingConfig();
        initializeLogger({
          level: loggingConfig.level,
          enableConsole: false,
          enableFile: loggingConfig.enableFile,
          logFilePath: loggingConfig.logFilePath,
        });
        
        const searchService = new EnhancedSearchService(config);
        
        console.log(chalk.blue('🚀 Initializing enhanced search service...'));
        await searchService.initialize();
        
        const filters: EmbeddingMetadataFilters = {};
        
        if (options.type) filters.nodeType = options.type;
        if (options.filePath) filters.filePath = options.filePath;
        if (options.extension) filters.fileExtension = options.extension;
        
        const searchOptions: EmbeddingSearchOptions = {
          limit: parseInt(options.limit),
          minSimilarity: parseFloat(options.similarity)
        };
        
        console.log(chalk.blue(`🔍 Hybrid searching for: "${query}"`));
        const results = await searchService.hybridSearch(query, filters, searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displayResults(results, 'Hybrid Search Results');
        }
        
        await searchService.disconnect();
      } catch (error) {
        console.error(chalk.red(`❌ Error: ${getErrorMessage(error)}`));
        process.exit(1);
      }
    });

  // Stats subcommand
  searchCmd
    .command('stats')
    .description('Display embedding statistics')
    .option('--json', 'Output results in JSON format', false)
    .action(async (options: any) => {
      try {
        const config = new ConfigManager(process.cwd());
        
        const loggingConfig = config.getLoggingConfig();
        initializeLogger({
          level: loggingConfig.level,
          enableConsole: false,
          enableFile: loggingConfig.enableFile,
          logFilePath: loggingConfig.logFilePath,
        });
        
        const searchService = new EnhancedSearchService(config);
        
        console.log(chalk.blue('🚀 Initializing enhanced search service...'));
        await searchService.initialize();
        
        console.log(chalk.blue('📊 Retrieving embedding statistics...'));
        const stats = await searchService.getEmbeddingStats();
        
        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log(chalk.green('\n📊 Embedding Statistics'));
          console.log(chalk.gray('='.repeat(25)));
          console.log(`Total Nodes: ${stats.totalNodes}`);
          console.log(`Embedding Coverage: ${(stats.embeddingCoverage * 100).toFixed(2)}%`);
          
          if (stats.nodeTypeBreakdown && Object.keys(stats.nodeTypeBreakdown).length > 0) {
            console.log(chalk.blue('\nNode Type Breakdown:'));
            Object.entries(stats.nodeTypeBreakdown).forEach(([type, count]) => {
              console.log(`  ${type}: ${count}`);
            });
          }
          
          if (stats.filePathBreakdown && Object.keys(stats.filePathBreakdown).length > 0) {
            console.log(chalk.blue('\nTop File Paths:'));
            Object.entries(stats.filePathBreakdown)
              .sort(([,a], [,b]) => (b as number) - (a as number))
              .slice(0, 10)
              .forEach(([path, count]) => {
                console.log(`  ${path}: ${count}`);
              });
          }
        }
        
        await searchService.disconnect();
      } catch (error) {
        console.error(chalk.red(`❌ Error: ${getErrorMessage(error)}`));
        process.exit(1);
      }
    });

  return program;
}

// Main execution
if (require.main === module) {
  const program = createProgram();
  program.parse(process.argv);
}

export { createProgram };