#!/usr/bin/env node

/**
 * hikma-mcp CLI entry point
 */

import { Command } from 'commander';
import { initCommand } from './init';
import { serveCommand } from './serve';
import { statusCommand } from './status';
import { logger, setVerbose } from '../utils/logger';

const program = new Command();

program
  .name('hikma-mcp')
  .description('MCP server for code intelligence - semantic search for your codebase')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });

// Init command
program
  .command('init')
  .description('Initialize the code index for a project')
  .option('-d, --dir <path>', 'Project directory (default: current directory)')
  .option('-f, --force', 'Force re-index even if index exists')
  .option('--exclude <patterns...>', 'Additional glob patterns to exclude')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      logger.error(`Init failed: ${error}`);
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('Start the MCP server')
  .option('-p, --project <path>', 'Project directory (default: current directory)')
  .action(async (options) => {
    try {
      await serveCommand(options);
    } catch (error) {
      logger.error(`Serve failed: ${error}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show index status')
  .option('-d, --dir <path>', 'Project directory (default: current directory)')
  .option('--detailed', 'Show detailed information')
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      logger.error(`Status failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();
