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
import { AnswerSynthesizer } from '../modules/answer-synthesizer';
import { generateRAGExplanation, RAGResponse, adaptSearchResults } from '../modules/llm-rag';
import { shutdownPythonEmbedding } from '../modules/embedding-py';
import { ConfigManager } from '../config';
import { initializeLogger, getLogger } from '../utils/logger';
import { getErrorMessage, normalizeError } from '../utils/error-handling';
import { PythonDependencyChecker, ensurePythonDependencies, isPythonEnvironmentReady } from '../utils/python-dependency-checker';
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
    forceCleanExit(error.exitCode);
  } else if (error instanceof Error) {
    console.error(chalk.red(`❌ ${context}: ${error.message}`));
    if (process.env.NODE_ENV === 'development' && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    forceCleanExit(1);
  } else {
    console.error(chalk.red(`❌ ${context}: ${getErrorMessage(error)}`));
    forceCleanExit(1);
  }
  
  // This should never be reached, but TypeScript requires it
  process.exit(1);
}

/**
 * Cleanup resources and force exit to prevent hanging
 */
async function forceCleanExit(exitCode: number = 0): Promise<void> {
  try {
    // Shut down persistent Python embedding process
    await shutdownPythonEmbedding();
  } catch (error) {
    // Ignore cleanup errors
  }
  
  // Force process exit after a brief delay to allow cleanup
  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
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
 * Display synthesized answer
 */
function displayAnswer(answer: string) {
  console.log(chalk.green('\n🤖 Answer:'));
  console.log(chalk.gray('='.repeat(50)));
  console.log(chalk.white(answer));
  console.log(chalk.gray('='.repeat(50)));
}

/**
 * Display RAG explanation with enhanced formatting
 */
function displayRAGExplanation(query: string, ragResponse: RAGResponse) {
  const { explanation, model, device } = ragResponse;
  
  console.log(chalk.green('\n🧠 Code Explanation:'));
  console.log(chalk.gray('='.repeat(60)));
  console.log(chalk.cyan(`Query: "${query}"`));
  console.log(chalk.gray(`Model: ${model}${device ? ` (${device})` : ''}`));
  console.log(chalk.gray('='.repeat(60)));
  console.log();
  
  if (explanation) {
    // Split explanation into paragraphs for better readability
    const paragraphs = explanation.split('\n\n').filter(p => p.trim());
    paragraphs.forEach((paragraph, index) => {
      if (index > 0) console.log(); // Add spacing between paragraphs
      console.log(chalk.white(paragraph.trim()));
    });
  } else {
    console.log(chalk.yellow('No explanation generated.'));
  }
  
  console.log();
  console.log(chalk.gray('='.repeat(60)));
  console.log(chalk.green('✨ Code explanation completed'));
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
    .version('2.0.0')
    .option('--install-python-deps', 'Automatically install Python dependencies if missing')
    .option('--check-python-deps', 'Check Python dependencies and exit')
    .option('--python-setup-help', 'Display Python setup instructions and exit');

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
    .option(
      '-a, --answer',
      'Synthesize results into a coherent answer',
      false
    )
    .option(
      '--rag',
      'Generate detailed code explanation using LLM (requires Python)',
      false
    )
    .option(
      '--rag-model <model>',
      'Specify LLM model for RAG (default: Qwen/Qwen2.5-Coder-3B-Instruct)'
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

          // If RAG explanation is requested
          if (options.rag) {
            displayProgress('Generating detailed code explanation with LLM...');
            
            try {
              // Check if we should auto-install Python dependencies
              const globalOptions = program.opts();
              if (globalOptions.installPythonDeps) {
                try {
                  await ensurePythonDependencies(true, true);
                } catch (depError) {
                  console.log(chalk.yellow('⚠️  Failed to install Python dependencies automatically:'), getErrorMessage(depError));
                  console.log(chalk.blue('💡 Try running: hikma --python-setup-help'));
                  throw depError;
                }
              } else {
                // Check dependencies without auto-install
                const isReady = await isPythonEnvironmentReady();
                if (!isReady) {
                  console.log(chalk.yellow('⚠️  Python dependencies are not available for RAG feature'));
                  console.log(chalk.blue('💡 Run with --install-python-deps to install automatically, or:'));
                  console.log(chalk.cyan('   hikma --python-setup-help'));
                  throw new Error('Python dependencies required for RAG feature');
                }
              }
              
              const ragOptions = {
                model: options.ragModel,
                timeout: 300000, // 5 minutes
                maxResults: 8
              };
              
              const adaptedResults = adaptSearchResults(results);
              const ragResponse = await generateRAGExplanation(query, adaptedResults, ragOptions);
              
              if (ragResponse.success) {
                displayRAGExplanation(query, ragResponse);
              } else {
                console.error(chalk.red(`RAG explanation failed: ${ragResponse.error}`));
                console.log(chalk.yellow('Falling back to showing search results:'));
                const format = options.displayFormat === 'markdown' ? 'markdown' : 'table';
                displayResults(results, 'Semantic Search Results', format);
              }
            } catch (error) {
              const errorMsg = getErrorMessage(error);
              if (errorMsg.includes('Python dependencies') || errorMsg.includes('Python 3 is required')) {
                console.log(chalk.red('❌ RAG feature requires Python dependencies'));
                console.log(chalk.blue('💡 Setup instructions: hikma --python-setup-help'));
                console.log(chalk.cyan('💡 Auto-install: hikma search semantic "your query" --rag --install-python-deps'));
              } else {
                console.error(chalk.red(`RAG explanation error: ${errorMsg}`));
              }
              console.log(chalk.yellow('Falling back to showing search results:'));
              const format = options.displayFormat === 'markdown' ? 'markdown' : 'table';
              displayResults(results, 'Semantic Search Results', format);
            }
          }
          // If answer synthesis is requested
          else if (options.answer) {
            displayProgress('Synthesizing answer from results...');
            const answerSynthesizer = new AnswerSynthesizer(config);
            console.log('results', results);
            const answer = await answerSynthesizer.synthesizeAnswer(query, results);
            displayAnswer(answer);
          } else if (options.json) {
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
          
          // Clean exit to prevent hanging
          await forceCleanExit();
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
          
          // Clean exit to prevent hanging
          await forceCleanExit();
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
          
          // Clean exit to prevent hanging
          await forceCleanExit();
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
          
          // Clean exit to prevent hanging
          await forceCleanExit();
        }
      } catch (error) {
        handleCLIError(error, 'Stats command failed');
      }
    });

  // Answer command
  const answerCmd = program
    .command('answer <query> [project-path]')
    .description('Synthesize search results into a coherent answer\n\nPerforms semantic search and then synthesizes the results into a coherent answer using local LLM.')
    .option('-l, --limit <number>', 'Maximum number of results to consider', '10')
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
    .action(async (query: string, projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate query
        if (!query || query.trim().length === 0) {
          throw new ValidationError('Search query cannot be empty', 'answer synthesis');
        }

        // Validate numeric options
        const limit = parseInt(options.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          throw new ValidationError('Limit must be a number between 1 and 1000', 'answer synthesis');
        }

        const similarity = parseFloat(options.similarity);
        if (isNaN(similarity) || similarity < 0 || similarity > 1) {
          throw new ValidationError('Similarity threshold must be a number between 0 and 1', 'answer synthesis');
        }

        // Validate and resolve project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new ValidationError(`Project path does not exist: ${resolvedPath}`, 'answer synthesis');
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
          throw new ConfigurationError(`Failed to initialize configuration: ${getErrorMessage(error)}`, 'answer synthesis');
        }

        const searchService = new EnhancedSearchService(config);
        const answerSynthesizer = new AnswerSynthesizer(config);

        displayCommandHeader('Answer Synthesis', `Answering: "${query}" in ${resolvedPath}`);
        displayProgress('Initializing services...');
        
        try {
          await searchService.initialize();
          await answerSynthesizer.loadModel();
        } catch (error) {
          throw new ProcessingError(`Failed to initialize services: ${getErrorMessage(error)}`, 'answer synthesis');
        }

        const searchOptions: EmbeddingSearchOptions = {
          limit,
          minSimilarity: similarity,
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

        displayProgress('Performing semantic search...');
        let results;
        try {
          results = await searchService.semanticSearch(query, searchOptions);
        } catch (error) {
          throw new ProcessingError(`Search operation failed: ${getErrorMessage(error)}`, 'answer synthesis');
        }

        displayProgress('Synthesizing answer from results...');
        try {
          const answer = await answerSynthesizer.synthesizeAnswer(query, results);
          displayAnswer(answer);
        } catch (error) {
          throw new ProcessingError(`Answer synthesis failed: ${getErrorMessage(error)}`, 'answer synthesis');
        } finally {
          try {
            await searchService.disconnect();
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to disconnect search service: ${getErrorMessage(error)}`));
          }
          
          // Clean exit to prevent hanging
          await forceCleanExit();
        }
      } catch (error) {
        handleCLIError(error, 'Answer synthesis failed');
      }
    });

  return program;
}

// Main execution
if (require.main === module) {
  const program = createProgram();
  
  // Handle global Python options before parsing commands
  const args = process.argv;
  
  if (args.includes('--python-setup-help')) {
    const checker = PythonDependencyChecker.getInstance();
    checker.displaySetupInstructions();
    process.exit(0);
  }
  
  if (args.includes('--check-python-deps')) {
    (async () => {
      try {
        const checker = PythonDependencyChecker.getInstance();
        const envInfo = await checker.checkEnvironment();
        
        console.log(chalk.blue('\n🐍 Python Environment Status'));
        console.log(chalk.gray('=' .repeat(40)));
        console.log(`Python Available: ${envInfo.pythonAvailable ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        if (envInfo.pythonVersion) {
          console.log(`Python Version: ${chalk.cyan(envInfo.pythonVersion)}`);
        }
        console.log(`Pip Available: ${envInfo.pipAvailable ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        console.log(`Dependencies Installed: ${envInfo.dependenciesInstalled ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        
        if (envInfo.missingDependencies.length > 0) {
          console.log(chalk.yellow('\n⚠️  Missing Dependencies:'));
          envInfo.missingDependencies.forEach(dep => {
            console.log(chalk.red(`   - ${dep}`));
          });
          console.log(chalk.blue('\n💡 Run with --install-python-deps to install automatically'));
        }
        
        process.exit(envInfo.dependenciesInstalled ? 0 : 1);
      } catch (error) {
        console.error(chalk.red('❌ Error checking Python environment:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })();
    process.exit(0);
  }
  
  // Parse the program normally
  program.parse(process.argv);
  
  // Handle --install-python-deps after parsing to get the option value
  const options = program.opts();
  if (options.installPythonDeps) {
    (async () => {
      try {
        console.log(chalk.blue('🔧 Installing Python dependencies...'));
        const checker = PythonDependencyChecker.getInstance();
        await checker.installDependencies(true);
        console.log(chalk.green('✅ Python dependencies installation completed!'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to install Python dependencies:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })();
  }
}

export { createProgram };
