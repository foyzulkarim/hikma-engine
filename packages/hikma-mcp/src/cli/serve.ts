/**
 * hikma-mcp serve command
 *
 * Starts the MCP server for the specified project.
 */

import chalk from 'chalk';
import { resolveProjectPath, indexExists, getDatabasePath } from '../utils/paths';
import { logger, setVerbose } from '../utils/logger';
import { IndexNotFoundError } from '../utils/errors';
import { HikmaMcpServer } from '../server';

export interface ServeOptions {
  project?: string;
  verbose?: boolean;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  // Resolve project path
  let projectPath: string;
  try {
    projectPath = resolveProjectPath(options.project);
  } catch (error) {
    console.error(chalk.red(`Invalid project directory: ${options.project}`));
    throw error;
  }

  // Check if index exists
  if (!indexExists(projectPath)) {
    console.error(chalk.red('\nNo index found for this project.'));
    console.error(chalk.yellow(`Run 'hikma-mcp init' first to create the index.\n`));
    throw new IndexNotFoundError(projectPath);
  }

  const dbPath = getDatabasePath(projectPath);

  // Log startup info (to stderr so it doesn't interfere with MCP protocol)
  logger.info(`Starting hikma-mcp server`);
  logger.info(`Project: ${projectPath}`);
  logger.info(`Database: ${dbPath}`);

  // Create and start server
  const server = new HikmaMcpServer({
    projectPath,
    verbose: options.verbose,
  });

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });

  // Start the server (this will block and handle MCP protocol over stdio)
  await server.start();
}
