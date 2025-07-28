#!/usr/bin/env node

// Load environment variables from .env file
import 'dotenv/config';

/**
 * @file Main CLI entry point for hikma-engine
 *       Provides unified access to indexing and search functionality
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { Indexer, IndexingOptions } from '../core/indexer';
import {
  EnhancedSearchService,
  EmbeddingSearchOptions,
  EmbeddingMetadataFilters,
} from '../modules/enhanced-search-service';
import { ConfigManager } from '../config';
import { initializeLogger, getLogger } from '../utils/logger';
import { getErrorMessage, normalizeError } from '../utils/error-handling';
import Table from 'cli-table3';

/**
 * CLI-specific error types for better error handling
 */
class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
    public readonly context?: string
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

class ValidationError extends CLIError {
  constructor(message: string, context?: string) {
    super(message, 1, context);
    this.name = 'ValidationError';
  }
}

class ConfigurationError extends CLIError {
  constructor(message: string, context?: string) {
    super(message, 2, context);
    this.name = 'ConfigurationError';
  }
}

class ProcessingError extends CLIError {
  constructor(message: string, context?: string) {
    super(message, 3, context);
    this.name = 'ProcessingError';
  }
}

/**
 * Consistent error handler for all CLI commands
 */
function handleCLIError(error: unknown, context: string): never {
  const normalizedError = normalizeError(error, context);
  
  if (error instanceof CLIError) {
    console.error(chalk.red(`❌ ${error.message}`));
    if (error.context) {
      console.error(chalk.gray(`   Context: ${error.context}`));
    }
    process.exit(error.exitCode);
  } else if (error instanceof Error) {
    console.error(chalk.red(`❌ ${context}: ${error.message}`));
    if (process.env.NODE_ENV === 'development' && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  } else {
    console.error(chalk.red(`❌ ${context}: ${getErrorMessage(error)}`));
    process.exit(1);
  }
}

/**
 * Display success message with consistent formatting
 */
function displaySuccess(message: string, metrics?: Record<string, any>): void {
  console.log(chalk.green(`\n✅ ${message}`));
  if (metrics) {
    console.log(chalk.gray('='.repeat(Math.min(message.length + 3, 50))));
    Object.entries(metrics).forEach(([key, value]) => {
      const formattedKey = chalk.cyan(key);
      const formattedValue = typeof value === 'number' 
        ? chalk.yellow(value.toLocaleString())
        : chalk.white(value);
      console.log(`${formattedKey}: ${formattedValue}`);
    });
  }
}

/**
 * Display command header with consistent formatting
 */
function displayCommandHeader(command: string, description: string): void {
  console.log(chalk.blue(`\n🚀 ${command}`));
  console.log(chalk.gray(description));
  console.log(chalk.gray('-'.repeat(50)));
}

/**
 * Display progress message with consistent formatting
 */
function displayProgress(message: string): void {
  console.log(chalk.blue(`🔄 ${message}`));
}

/**
 * Display search results in the specified format
 */
function displayResults(
  results: any[],
  title: string,
  format: 'table' | 'markdown' = 'table'
) {
  console.log(); // Add spacing before results
  
  if (format === 'markdown') {
    displayResultsAsMarkdown(results, title);
  } else {
    displayResultsAsTable(results, title);
  }
  
  // Display result summary
  const resultCount = results.length;
  if (resultCount === 0) {
    console.log(chalk.yellow('\n📭 No results found. Try adjusting your search criteria.'));
  } else {
    console.log(chalk.green(`\n📊 Displayed ${resultCount} result${resultCount === 1 ? '' : 's'}`));
  }
}

/**
 * Display search results in a formatted table
 */
function displayResultsAsTable(results: any[], title: string) {
  console.log(chalk.green(`📋 ${title}`));
  console.log(chalk.gray('='.repeat(title.length + 3)));

  if (results.length === 0) {
    return; // Summary will be handled by displayResults
  }

  const table = new Table({
    head: [
      chalk.bold('Node ID'),
      chalk.bold('Type'),
      chalk.bold('File Path'),
      chalk.bold('Similarity'),
      chalk.bold('Data Source'),
      chalk.bold('Source Text Preview'),
    ],
    colWidths: [12, 15, 35, 12, 15, 45],
    wordWrap: true,
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  });

  results.forEach((result, index) => {
    const similarity = result.similarity 
      ? `${(result.similarity * 100).toFixed(1)}%`
      : 'N/A';
    
    const preview = result.node?.sourceText
      ? result.node.sourceText.length > 80
        ? result.node.sourceText.substring(0, 80).replace(/\n/g, ' ') + '...'
        : result.node.sourceText.replace(/\n/g, ' ')
      : 'N/A';

    const nodeId = result.node?.nodeId || 'N/A';
    const nodeType = result.node?.nodeType || 'N/A';
    const filePath = result.node?.filePath || 'N/A';

    table.push([
      chalk.dim(`#${index + 1} `) + nodeId.substring(0, 8),
      chalk.blue(nodeType),
      chalk.gray(filePath.length > 30 ? '...' + filePath.substring(filePath.length - 30) : filePath),
      similarity === 'N/A' ? chalk.gray(similarity) : chalk.green(similarity),
      chalk.cyan('embeddings'),
      chalk.white(preview),
    ]);
  });

  console.log(table.toString());
}

/**
 * Display search results in markdown format
 */
function displayResultsAsMarkdown(results: any[], title: string) {
  console.log(`# 📋 ${title}\n`);

  if (results.length === 0) {
    return; // Summary will be handled by displayResults
  }

  results.forEach((result, index) => {
    const similarity = result.similarity 
      ? `${(result.similarity * 100).toFixed(1)}%`
      : 'N/A';
    
    const nodeId = result.node?.nodeId || 'N/A';
    const nodeType = result.node?.nodeType || 'N/A';
    const filePath = result.node?.filePath || 'N/A';
    const sourceText = result.node?.sourceText || 'N/A';

    console.log(`## ${index + 1}. ${chalk.blue(nodeType)} - ${chalk.gray(filePath)}\n`);
    console.log(`**Node ID:** \`${nodeId}\`\n`);
    console.log(`**Type:** \`${nodeType}\`\n`);
    console.log(`**File Path:** \`${filePath}\`\n`);
    
    if (similarity !== 'N/A') {
      console.log(`**Similarity:** ${chalk.green(similarity)}\n`);
    }
    
    console.log(`**Data Source:** ${chalk.cyan('embeddings')}\n`);
    console.log(`**Source Code:**\n`);
    console.log('```typescript');
    console.log(sourceText);
    console.log('```\n');
    console.log('---\n');
  });
}

/**
 * Create the main CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('hikma')
    .description('Hikma Engine - Code Knowledge Graph and Search\n\nUnified CLI for indexing codebases and performing semantic, text, and hybrid searches.\nSupports multi-repository workflows with directory-specific indexing and searching.')
    .version('2.0.0');

  // Index command
  const indexCmd = program
    .command('index [project-path]')
    .description('Index a codebase to build knowledge graph\n\nIndexes the specified project path (or current directory) to create a searchable knowledge graph with AST parsing, Git analysis, and vector embeddings.')
    .option(
      '-f, --force-full',
      'Force full indexing (ignore incremental updates)'
    )
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
        // Validate project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new ValidationError(`Project path does not exist: ${resolvedPath}`, 'index command');
        }

        // Parse and validate indexing options
        const indexingOptions: IndexingOptions = {
          forceFullIndex: options.forceFull,
          skipAISummary: options.skipAiSummary,
          skipEmbeddings: options.skipEmbeddings,
          dryRun: options.dryRun,
          showStatus: options.status,
        };

        // Validate numeric options
        if (options.phases) {
          const phases = options.phases.split(',').map((p: string) => {
            const num = Number(p.trim());
            if (isNaN(num) || num < 1) {
              throw new ValidationError(`Invalid phase number: ${p}`, 'index command');
            }
            return num;
          });
          indexingOptions.runPhases = phases;
        }
        
        if (options.fromPhase) {
          const fromPhase = Number(options.fromPhase);
          if (isNaN(fromPhase) || fromPhase < 1) {
            throw new ValidationError(`Invalid from-phase number: ${options.fromPhase}`, 'index command');
          }
          indexingOptions.fromPhase = fromPhase;
        }
        
        if (options.forcePhases) {
          const forcePhases = options.forcePhases.split(',').map((p: string) => {
            const num = Number(p.trim());
            if (isNaN(num) || num < 1) {
              throw new ValidationError(`Invalid force-phase number: ${p}`, 'index command');
            }
            return num;
          });
          indexingOptions.forcePhases = forcePhases;
        }
        
        if (options.inspectPhase) {
          const inspectPhase = Number(options.inspectPhase);
          if (isNaN(inspectPhase) || inspectPhase < 1) {
            throw new ValidationError(`Invalid inspect-phase number: ${options.inspectPhase}`, 'index command');
          }
          indexingOptions.inspectPhase = inspectPhase;
        }

        // Initialize configuration and logging
        try {
          const config = new ConfigManager(resolvedPath);
          const loggingConfig = config.getLoggingConfig();
          initializeLogger({
            level: loggingConfig.level,
            enableConsole: loggingConfig.enableConsole,
            enableFile: loggingConfig.enableFile,
            logFilePath: loggingConfig.logFilePath,
          });
        } catch (error) {
          throw new ConfigurationError(`Failed to initialize configuration: ${getErrorMessage(error)}`, 'index command');
        }

        displayCommandHeader('Hikma Engine Indexing', `Indexing project: ${resolvedPath}`);

        // Create and run indexer
        try {
          const indexer = new Indexer(resolvedPath, new ConfigManager(resolvedPath));
          const result = await indexer.run(indexingOptions);

          // Display results with success formatting
          const metrics = {
            'Mode': result.isIncremental ? 'Incremental' : 'Full',
            'Files processed': result.processedFiles,
            'Nodes created': result.totalNodes,
            'Edges created': result.totalEdges,
            'Duration': `${result.duration}ms`
          };

          displaySuccess('Indexing completed successfully!', metrics);

          if (result.errors.length > 0) {
            console.log(chalk.yellow(`\nWarnings/Errors: ${result.errors.length}`));
            result.errors.forEach((error) =>
              console.log(chalk.yellow(`  - ${error}`))
            );
          }

          if (indexingOptions.dryRun) {
            console.log(chalk.cyan('\n(Dry run mode - no data was persisted)'));
          }
        } catch (error) {
          throw new ProcessingError(`Indexing operation failed: ${getErrorMessage(error)}`, 'index command');
        }
      } catch (error) {
        handleCLIError(error, 'Indexing failed');
      }
    });

  // Search command group
  const searchCmd = program
    .command('search')
    .description('Search the knowledge graph using various methods\n\nProvides semantic, text-based, and hybrid search capabilities across the indexed codebase.');

  // Semantic search subcommand
  searchCmd
    .command('semantic <query> [project-path]')
    .description('Perform semantic search using vector embeddings\n\nExample: hikma search semantic "authentication logic"\nExample: hikma search semantic "authentication logic" /path/to/project')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option(
      '-s, --similarity <number>',
      'Minimum similarity threshold (0-1)',
      '0.1'
    )
    .option(
      '-t, --types <types>',
      'Comma-separated list of node types to search'
    )
    .option(
      '-f, --files <files>',
      'Comma-separated list of file paths to search in'
    )
    .option(
      '-e, --include-embedding',
      'Include embedding vectors in results',
      false
    )
    .option('--json', 'Output results in JSON format', false)
    .option(
      '--displayFormat <format>',
      'Display format: table or markdown',
      'table'
    )
    .action(async (query: string, projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate query
        if (!query || query.trim().length === 0) {
          throw new ValidationError('Search query cannot be empty', 'semantic search');
        }

        // Validate numeric options
        const limit = parseInt(options.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          throw new ValidationError('Limit must be a number between 1 and 1000', 'semantic search');
        }

        const similarity = parseFloat(options.similarity);
        if (isNaN(similarity) || similarity < 0 || similarity > 1) {
          throw new ValidationError('Similarity threshold must be a number between 0 and 1', 'semantic search');
        }

        // Validate display format
        if (options.displayFormat && !['table', 'markdown'].includes(options.displayFormat)) {
          throw new ValidationError('Display format must be either "table" or "markdown"', 'semantic search');
        }

        // Validate and resolve project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new ValidationError(`Project path does not exist: ${resolvedPath}`, 'semantic search');
        }

        let config: ConfigManager;
        try {
          config = new ConfigManager(resolvedPath);

          // Initialize logging
          const loggingConfig = config.getLoggingConfig();
          initializeLogger({
            level: loggingConfig.level,
            enableConsole: loggingConfig.enableConsole,
            enableFile: loggingConfig.enableFile,
            logFilePath: loggingConfig.logFilePath,
          });
        } catch (error) {
          throw new ConfigurationError(`Failed to initialize configuration: ${getErrorMessage(error)}`, 'semantic search');
        }

        const searchService = new EnhancedSearchService(config);

        displayCommandHeader('Semantic Search', `Searching for: "${query}" in ${resolvedPath}`);
        displayProgress('Initializing enhanced search service...');
        
        try {
          await searchService.initialize();
        } catch (error) {
          throw new ProcessingError(`Failed to initialize search service: ${getErrorMessage(error)}`, 'semantic search');
        }

        const searchOptions: EmbeddingSearchOptions = {
          limit,
          minSimilarity: similarity,
          includeEmbedding: options.includeEmbedding,
        };

        if (options.types) {
          searchOptions.nodeTypes = options.types
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t.length > 0);
        }

        if (options.files) {
          searchOptions.filePaths = options.files
            .split(',')
            .map((f: string) => f.trim())
            .filter((f: string) => f.length > 0);
        }

        displayProgress(`Performing semantic search...`);
        
        try {
          const results = await searchService.semanticSearch(query, searchOptions);

          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            const format = options.displayFormat === 'markdown' ? 'markdown' : 'table';
            displayResults(results, 'Semantic Search Results', format);
          }

          // Success message will be displayed by displayResults
        } catch (error) {
          throw new ProcessingError(`Search operation failed: ${getErrorMessage(error)}`, 'semantic search');
        } finally {
          try {
            await searchService.disconnect();
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to disconnect search service: ${getErrorMessage(error)}`));
          }
        }
      } catch (error) {
        handleCLIError(error, 'Semantic search failed');
      }
    });

  // Text search subcommand
  searchCmd
    .command('text <query> [project-path]')
    .description('Perform text-based search in source_text field\n\nExample: hikma search text "function authenticate"\nExample: hikma search text "function authenticate" /path/to/project')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option(
      '-t, --types <types>',
      'Comma-separated list of node types to search'
    )
    .option(
      '-f, --files <files>',
      'Comma-separated list of file paths to search in'
    )
    .option('--json', 'Output results in JSON format', false)
    .option(
      '--displayFormat <format>',
      'Display format: table or markdown',
      'table'
    )
    .action(async (query: string, projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate query
        if (!query || query.trim().length === 0) {
          throw new ValidationError('Search query cannot be empty', 'text search');
        }

        // Validate numeric options
        const limit = parseInt(options.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          throw new ValidationError('Limit must be a number between 1 and 1000', 'text search');
        }

        // Validate display format
        if (options.displayFormat && !['table', 'markdown'].includes(options.displayFormat)) {
          throw new ValidationError('Display format must be either "table" or "markdown"', 'text search');
        }

        // Validate and resolve project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new ValidationError(`Project path does not exist: ${resolvedPath}`, 'text search');
        }

        let config: ConfigManager;
        try {
          config = new ConfigManager(resolvedPath);

          const loggingConfig = config.getLoggingConfig();
          initializeLogger({
            level: loggingConfig.level,
            enableConsole: loggingConfig.enableConsole,
            enableFile: loggingConfig.enableFile,
            logFilePath: loggingConfig.logFilePath,
          });
        } catch (error) {
          throw new ConfigurationError(`Failed to initialize configuration: ${getErrorMessage(error)}`, 'text search');
        }

        const searchService = new EnhancedSearchService(config);

        displayCommandHeader('Text Search', `Searching for: "${query}" in ${resolvedPath}`);
        displayProgress('Initializing enhanced search service...');
        
        try {
          await searchService.initialize();
        } catch (error) {
          throw new ProcessingError(`Failed to initialize search service: ${getErrorMessage(error)}`, 'text search');
        }

        const searchOptions: EmbeddingSearchOptions = {
          limit,
        };

        if (options.types) {
          searchOptions.nodeTypes = options.types
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t.length > 0);
        }

        if (options.files) {
          searchOptions.filePaths = options.files
            .split(',')
            .map((f: string) => f.trim())
            .filter((f: string) => f.length > 0);
        }

        displayProgress(`Performing text-based search...`);
        
        try {
          const results = await searchService.textBasedSearch(query, searchOptions);

          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            const format = options.displayFormat === 'markdown' ? 'markdown' : 'table';
            displayResults(results, 'Text Search Results', format);
          }

          // Success message will be displayed by displayResults
        } catch (error) {
          throw new ProcessingError(`Search operation failed: ${getErrorMessage(error)}`, 'text search');
        } finally {
          try {
            await searchService.disconnect();
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to disconnect search service: ${getErrorMessage(error)}`));
          }
        }
      } catch (error) {
        handleCLIError(error, 'Text search failed');
      }
    });

  // Hybrid search subcommand
  searchCmd
    .command('hybrid <query> [project-path]')
    .description(
      'Perform hybrid search combining semantic and metadata filters\n\nExample: hikma search hybrid "user validation" --type function --extension .ts\nExample: hikma search hybrid "user validation" /path/to/project --type function'
    )
    .option('-l, --limit <number>', 'Maximum number of results', '20')
    .option(
      '-s, --similarity <number>',
      'Minimum similarity threshold (0-1)',
      '0.1'
    )
    .option('-t, --type <type>', 'Node type to search for')
    .option('-f, --file-path <path>', 'File path pattern to search for')
    .option('-x, --extension <ext>', 'File extension to search for')
    .option('--json', 'Output results in JSON format', false)
    .option(
      '--displayFormat <format>',
      'Display format: table or markdown',
      'table'
    )
    .action(async (query: string, projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate query
        if (!query || query.trim().length === 0) {
          throw new ValidationError('Search query cannot be empty', 'hybrid search');
        }

        // Validate numeric options
        const limit = parseInt(options.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          throw new ValidationError('Limit must be a number between 1 and 1000', 'hybrid search');
        }

        const similarity = parseFloat(options.similarity);
        if (isNaN(similarity) || similarity < 0 || similarity > 1) {
          throw new ValidationError('Similarity threshold must be a number between 0 and 1', 'hybrid search');
        }

        // Validate display format
        if (options.displayFormat && !['table', 'markdown'].includes(options.displayFormat)) {
          throw new ValidationError('Display format must be either "table" or "markdown"', 'hybrid search');
        }

        // Validate and resolve project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new ValidationError(`Project path does not exist: ${resolvedPath}`, 'hybrid search');
        }

        let config: ConfigManager;
        try {
          config = new ConfigManager(resolvedPath);

          const loggingConfig = config.getLoggingConfig();
          initializeLogger({
            level: loggingConfig.level,
            enableConsole: loggingConfig.enableConsole,
            enableFile: loggingConfig.enableFile,
            logFilePath: loggingConfig.logFilePath,
          });
        } catch (error) {
          throw new ConfigurationError(`Failed to initialize configuration: ${getErrorMessage(error)}`, 'hybrid search');
        }

        const searchService = new EnhancedSearchService(config);

        displayCommandHeader('Hybrid Search', `Searching for: "${query}" in ${resolvedPath}`);
        displayProgress('Initializing enhanced search service...');
        
        try {
          await searchService.initialize();
        } catch (error) {
          throw new ProcessingError(`Failed to initialize search service: ${getErrorMessage(error)}`, 'hybrid search');
        }

        const filters: EmbeddingMetadataFilters = {};

        if (options.type) filters.nodeType = options.type;
        if (options.filePath) filters.filePath = options.filePath;
        if (options.extension) filters.fileExtension = options.extension;

        const searchOptions: EmbeddingSearchOptions = {
          limit,
          minSimilarity: similarity,
        };

        displayProgress(`Performing hybrid search with filters...`);
        
        try {
          const results = await searchService.hybridSearch(query, filters, searchOptions);

          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            const format = options.displayFormat === 'markdown' ? 'markdown' : 'table';
            displayResults(results, 'Hybrid Search Results', format);
          }

          // Success message will be displayed by displayResults
        } catch (error) {
          throw new ProcessingError(`Search operation failed: ${getErrorMessage(error)}`, 'hybrid search');
        } finally {
          try {
            await searchService.disconnect();
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to disconnect search service: ${getErrorMessage(error)}`));
          }
        }
      } catch (error) {
        handleCLIError(error, 'Hybrid search failed');
      }
    });

  // Stats subcommand
  searchCmd
    .command('stats [project-path]')
    .description('Display embedding statistics\n\nShows total nodes, embedding coverage, and breakdowns by type and file path.\nExample: hikma search stats\nExample: hikma search stats /path/to/project')
    .option('--json', 'Output results in JSON format', false)
    .action(async (projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate and resolve project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new ValidationError(`Project path does not exist: ${resolvedPath}`, 'stats command');
        }

        let config: ConfigManager;
        try {
          config = new ConfigManager(resolvedPath);

          const loggingConfig = config.getLoggingConfig();
          initializeLogger({
            level: loggingConfig.level,
            enableConsole: loggingConfig.enableConsole,
            enableFile: loggingConfig.enableFile,
            logFilePath: loggingConfig.logFilePath,
          });
        } catch (error) {
          throw new ConfigurationError(`Failed to initialize configuration: ${getErrorMessage(error)}`, 'stats command');
        }

        const searchService = new EnhancedSearchService(config);

        displayCommandHeader('Embedding Statistics', `Retrieving comprehensive statistics about indexed embeddings in ${resolvedPath}`);
        displayProgress('Initializing enhanced search service...');
        
        try {
          await searchService.initialize();
        } catch (error) {
          throw new ProcessingError(`Failed to initialize search service: ${getErrorMessage(error)}`, 'stats command');
        }

        displayProgress('Retrieving embedding statistics...');
        
        try {
          const stats = await searchService.getEmbeddingStats();

          if (options.json) {
            console.log(JSON.stringify(stats, null, 2));
          } else {
            // Display main statistics
            const mainMetrics = {
              'Total Nodes': stats.totalNodes,
              'Embedding Coverage': `${(stats.embeddingCoverage * 100).toFixed(2)}%`
            };
            
            displaySuccess('Statistics retrieved successfully', mainMetrics);

            // Display node type breakdown
            if (stats.nodeTypeBreakdown && Object.keys(stats.nodeTypeBreakdown).length > 0) {
              console.log(chalk.blue('\n📊 Node Type Breakdown:'));
              console.log(chalk.gray('-'.repeat(30)));
              Object.entries(stats.nodeTypeBreakdown)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .forEach(([type, count]) => {
                  const percentage = ((count as number) / stats.totalNodes * 100).toFixed(1);
                  console.log(`  ${chalk.cyan(type.padEnd(20))} ${chalk.yellow((count as number).toLocaleString().padStart(8))} ${chalk.gray(`(${percentage}%)`)}`);
                });
            }

            // Display top file paths
            if (stats.filePathBreakdown && Object.keys(stats.filePathBreakdown).length > 0) {
              console.log(chalk.blue('\n📁 Top File Paths:'));
              console.log(chalk.gray('-'.repeat(30)));
              Object.entries(stats.filePathBreakdown)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 10)
                .forEach(([path, count]) => {
                  const displayPath = path.length > 40 ? '...' + path.substring(path.length - 37) : path;
                  console.log(`  ${chalk.gray(displayPath.padEnd(40))} ${chalk.yellow((count as number).toLocaleString())}`);
                });
            }
          }
        } catch (error) {
          throw new ProcessingError(`Failed to retrieve statistics: ${getErrorMessage(error)}`, 'stats command');
        } finally {
          try {
            await searchService.disconnect();
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to disconnect search service: ${getErrorMessage(error)}`));
          }
        }
      } catch (error) {
        handleCLIError(error, 'Stats command failed');
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
