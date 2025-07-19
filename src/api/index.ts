/**
 * @file API server entry point.
 *       Initializes configuration, logging, and starts the Express server.
 */

import * as path from 'path';
import { initializeConfig } from '../config';
import { initializeLogger } from '../utils/logger';
import { createAPIServer } from './server';

/**
 * Main function to start the API server.
 */
async function main(): Promise<void> {
  try {
    // Initialize configuration
    const projectRoot = path.resolve(__dirname, '../..');
    const configManager = initializeConfig(projectRoot);
    const config = configManager.getConfig();

    // Initialize logging
    initializeLogger({
      level: config.logging.level,
      enableConsole: config.logging.enableConsole,
      enableFile: config.logging.enableFile,
      logFilePath: config.logging.logFilePath,
    });

    // Create and start the API server
    const server = createAPIServer();
    await server.start();

    console.log('🚀 hikma-engine API server is running!');
    console.log(`📍 Health check: http://localhost:${process.env.PORT || 3000}/health`);
    console.log(`📍 API endpoints: http://localhost:${process.env.PORT || 3000}/api/v1`);

  } catch (error) {
    console.error('Failed to start API server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error during startup:', error);
    process.exit(1);
  });
}

export { main };
