/**
 * @file Main entry point for the hikma-engine application.
 *       Initializes configuration, logging, and delegates to the core indexer.
 */

// Add global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

import * as path from 'path';
import { Indexer, IndexingOptions } from './core/indexer';
import { initializeConfig } from './config';
import { initializeLogger, getLogger } from './utils/logger';
import { getErrorMessage, getErrorStack, logError } from './utils/error-handling';

/**
 * Command line interface for the hikma-engine.
 */
class HikmaEngineCLI {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Parses command line arguments and returns indexing options.
   */
  private parseArguments(): IndexingOptions {
    const args = process.argv.slice(2);
    const options: IndexingOptions = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--force-full':
        case '-f':
          options.forceFullIndex = true;
          break;
        case '--skip-ai-summary':
          options.skipAISummary = true;
          break;
        case '--skip-embeddings':
          options.skipEmbeddings = true;
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--help':
        case '-h':
          this.printHelp();
          process.exit(0);
          break;
        default:
          // Skip unknown arguments or treat as project path
          if (!arg.startsWith('-') && i === 0) {
            this.projectRoot = path.resolve(arg);
          }
          break;
      }
    }

    return options;
  }

  /**
   * Prints help information.
   */
  private printHelp(): void {
    console.log(`
hikma-engine - Code Knowledge Graph Indexer

Usage: npm start [project-path] [options]

Arguments:
  project-path          Path to the project to index (default: current directory)

Options:
  -f, --force-full      Force full indexing (ignore incremental updates)
  --skip-ai-summary     Skip AI summary generation
  --skip-embeddings     Skip vector embedding generation
  --dry-run             Perform indexing without persisting data
  -h, --help            Show this help message

Examples:
  npm start                           # Index current directory
  npm start /path/to/project          # Index specific project
  npm start --force-full              # Force full re-indexing
  npm start --dry-run                 # Test run without persistence
    `);
  }

  /**
   * Runs the hikma-engine with the provided options.
   */
  async run(): Promise<void> {
    try {
      const options = this.parseArguments();

      // Initialize configuration
      const config = initializeConfig(this.projectRoot);
      
      // Initialize logging
      const loggingConfig = config.getLoggingConfig();
      initializeLogger({
        level: loggingConfig.level,
        enableConsole: loggingConfig.enableConsole,
        enableFile: loggingConfig.enableFile,
        logFilePath: loggingConfig.logFilePath,
      });

      const logger = getLogger('CLI');
      console.log('✓ Logger initialized');
      
      logger.info('Starting hikma-engine', { 
        projectRoot: this.projectRoot,
        options,
        version: require('../package.json').version 
      });

      // Create and run the indexer
      console.log('✓ Creating indexer...');
      const indexer = new Indexer(this.projectRoot, config);
      console.log('✓ Indexer created, starting run...');
      const result = await indexer.run(options);
      console.log('✓ Indexing completed');

      // Log results
      logger.info('Indexing completed successfully', result);
      
      console.log('\n=== Indexing Results ===');
      console.log(`Project: ${this.projectRoot}`);
      console.log(`Mode: ${result.isIncremental ? 'Incremental' : 'Full'}`);
      console.log(`Files processed: ${result.processedFiles}`);
      console.log(`Nodes created: ${result.totalNodes}`);
      console.log(`Edges created: ${result.totalEdges}`);
      console.log(`Duration: ${result.duration}ms`);
      
      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.length}`);
        result.errors.forEach(error => console.log(`  - ${error}`));
      }

      if (options.dryRun) {
        console.log('\n(Dry run mode - no data was persisted)');
      }

    } catch (error) {
      const logger = getLogger('CLI');
      logError(logger, 'Application failed', error);
      
      console.error('\n=== Error ===');
      console.error(`Failed to index project: ${getErrorMessage(error)}`);
      
      if (process.env.NODE_ENV === 'development') {
        const stack = getErrorStack(error);
        if (stack) {
          console.error('\nStack trace:');
          console.error(stack);
        }
      }
      
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const projectPath = process.argv.find(arg => !arg.startsWith('-') && arg !== process.argv[0] && arg !== process.argv[1]) || process.cwd();
  const cli = new HikmaEngineCLI(projectPath);
  await cli.run();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = getLogger('Process');
  logger.error('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = getLogger('Process');
  logger.error('Uncaught exception', { error: getErrorMessage(error), stack: getErrorStack(error) });
  process.exit(1);
});

// Run the application
if (require.main === module) {
  main();
}


