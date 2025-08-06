#!/usr/bin/env node

// Load environment variables from .env file
import 'dotenv/config';

/**
 * @file Simplified CLI for hikma-engine MVP
 *       Provides basic indexing and semantic search with RAG functionality
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { Indexer, IndexingOptions } from '../core/indexer';
import {
  EnhancedSearchService,
  EmbeddingSearchOptions,
} from '../modules/enhanced-search-service';
import { generateRAGExplanation, RAGResponse, adaptSearchResults } from '../modules/llm-rag';
import { shutdownPythonEmbedding } from '../modules/embedding-py';
import { ConfigManager } from '../config';
import { initializeLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import { ensurePythonDependencies, isPythonEnvironmentReady } from '../utils/python-dependency-checker';
import Table from 'cli-table3';

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
function displayResults(results: any[], title: string) {
  console.log(chalk.green(`\n📋 ${title}`));
  console.log(chalk.gray('='.repeat(title.length + 3)));

  if (results.length === 0) {
    console.log(chalk.yellow('\n📭 No results found. Try adjusting your search criteria.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('Node ID'),
      chalk.bold('Type'),
      chalk.bold('File Path'),
      chalk.bold('Similarity'),
      chalk.bold('Source Text Preview'),
    ],
    colWidths: [12, 15, 35, 12, 50],
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
      chalk.white(preview),
    ]);
  });

  console.log(table.toString());
  console.log(chalk.green(`\n📊 Displayed ${results.length} result${results.length === 1 ? '' : 's'}`));
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
 * Consistent error handler for all CLI commands
 */
function handleCLIError(error: unknown, context: string): never {
  console.error(chalk.red(`❌ ${context}: ${getErrorMessage(error)}`));
  if (process.env.NODE_ENV === 'development' && error instanceof Error && error.stack) {
    console.error(chalk.gray(error.stack));
  }
  forceCleanExit(1);
  process.exit(1); // TypeScript requires this
}

/**
 * Create the main CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('hikma')
    .description('Hikma Engine - Code Knowledge Graph and Search\n\nSimplified CLI for indexing codebases and performing semantic search with RAG.')
    .version('2.1.2')
    .option('--install-python-deps', 'Automatically install Python dependencies if missing');

  // Index command
  program
    .command('index [project-path]')
    .description('Index a codebase to build knowledge graph')
    .option('-f, --force-full', 'Force full indexing (ignore incremental updates)')
    .option('--skip-embeddings', 'Skip vector embedding generation')
    .action(async (projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Project path does not exist: ${resolvedPath}`);
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

        displayCommandHeader('Hikma Engine Indexing', `Indexing project: ${resolvedPath}`);

        // Create and run indexer
        const indexingOptions: IndexingOptions = {
          forceFullIndex: options.forceFull,
          skipEmbeddings: options.skipEmbeddings,
        };

        const indexer = new Indexer(resolvedPath, config);
        const result = await indexer.run(indexingOptions);

        // Display results
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

        await forceCleanExit(0);
      } catch (error) {
        handleCLIError(error, 'Indexing failed');
      }
    });

  // Search command
  program
    .command('search <query> [project-path]')
    .description('Perform semantic search using vector embeddings')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', '0.1')
    .option('--rag', 'Generate detailed code explanation using LLM (requires Python)', false)
    .option('--rag-model <model>', 'Specify LLM model for RAG (default: Qwen/Qwen2.5-Coder-1.5B-Instruct)')
    .action(async (query: string, projectPath: string = process.cwd(), options: any) => {
      try {
        // Validate query
        if (!query || query.trim().length === 0) {
          throw new Error('Search query cannot be empty');
        }

        // Validate numeric options
        const limit = parseInt(options.limit);
        if (isNaN(limit) || limit < 1 || limit > 100) {
          throw new Error('Limit must be a number between 1 and 100');
        }

        const similarity = parseFloat(options.similarity);
        if (isNaN(similarity) || similarity < 0 || similarity > 1) {
          throw new Error('Similarity threshold must be a number between 0 and 1');
        }

        // Validate and resolve project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Project path does not exist: ${resolvedPath}`);
        }

        const config = new ConfigManager(resolvedPath);
        const loggingConfig = config.getLoggingConfig();
        initializeLogger({
          level: loggingConfig.level,
          enableConsole: loggingConfig.enableConsole,
          enableFile: loggingConfig.enableFile,
          logFilePath: loggingConfig.logFilePath,
        });

        const searchService = new EnhancedSearchService(config);

        displayCommandHeader('Semantic Search', `Searching for: "${query}" in ${resolvedPath}`);
        displayProgress('Initializing search service...');
        
        await searchService.initialize();

        const searchOptions: EmbeddingSearchOptions = {
          limit,
          minSimilarity: similarity,
        };

        displayProgress('Performing semantic search...');
        const results = await searchService.semanticSearch(query, searchOptions);

        // Display search results
        displayResults(results, 'Search Results');

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
                console.log(chalk.blue('💡 Try running: npm run setup-python'));
                throw depError;
              }
            } else {
              // Check dependencies without auto-install
              const isReady = await isPythonEnvironmentReady();
              if (!isReady) {
                console.log(chalk.yellow('⚠️  Python dependencies are not available for RAG feature'));
                console.log(chalk.blue('💡 Run with --install-python-deps to install automatically, or:'));
                console.log(chalk.cyan('   npm run setup-python'));
                throw new Error('Python dependencies required for RAG feature');
              }
            }

            // Adapt search results for RAG
            const adaptedResults = adaptSearchResults(results);
            
            // Generate RAG explanation
            const ragResponse = await generateRAGExplanation(
              query,
              adaptedResults,
              { model: options.ragModel || config.getAIConfig().rag.model }
            );
            
            displayRAGExplanation(query, ragResponse);
          } catch (ragError) {
            console.log(chalk.red('❌ RAG explanation failed:'), getErrorMessage(ragError));
            console.log(chalk.blue('💡 Search results are still available above'));
          }
        }

        await forceCleanExit(0);
      } catch (error) {
        handleCLIError(error, 'Search failed');
      }
    });

  return program;
}

/**
 * Main execution
 */
if (require.main === module) {
  const program = createProgram();
  
  // Handle global options before parsing
  const args = process.argv;
  
  // Handle install Python dependencies
  const options = program.opts();
  if (args.includes('--install-python-deps')) {
    (async () => {
      try {
        console.log(chalk.blue('🐍 Installing Python dependencies...'));
        await ensurePythonDependencies(true, true);
        console.log(chalk.green('✅ Python dependencies installed successfully'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to install Python dependencies:'), getErrorMessage(error));
        process.exit(1);
      }
    })();
  }
  
  program.parse(process.argv);
}

export { createProgram };
