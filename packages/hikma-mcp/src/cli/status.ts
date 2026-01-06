/**
 * hikma-mcp status command
 *
 * Shows the status of the code index for a project.
 */

import * as fs from 'fs';
import chalk from 'chalk';
import {
  resolveProjectPath,
  indexExists,
  getDatabasePath,
  getIndexPath,
} from '../utils/paths';
import { SearchService } from '../services/search-service';

export interface StatusOptions {
  dir?: string;
  detailed?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  console.log(chalk.blue('\n📊 hikma-mcp status\n'));

  // Resolve project path
  let projectPath: string;
  try {
    projectPath = resolveProjectPath(options.dir);
  } catch (error) {
    console.log(chalk.red(`✗ Invalid directory: ${options.dir}`));
    throw error;
  }

  console.log(chalk.gray(`  Project: ${projectPath}`));

  // Check if index exists
  if (!indexExists(projectPath)) {
    console.log(chalk.yellow('\n⚠ No index found for this project.\n'));
    console.log(chalk.gray(`  Run 'hikma-mcp init' to create the index.\n`));
    return;
  }

  const indexPath = getIndexPath(projectPath);
  const dbPath = getDatabasePath(projectPath);

  console.log(chalk.gray(`  Index: ${indexPath}`));
  console.log('');

  // Get database stats
  try {
    const stats = fs.statSync(dbPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    const lastModified = stats.mtime.toISOString().split('T')[0];

    console.log(chalk.white('  Index Status:'), chalk.green('Ready'));
    console.log(chalk.white('  Database Size:'), `${sizeInMB} MB`);
    console.log(chalk.white('  Last Updated:'), lastModified);
    console.log('');

    // Get detailed stats from database
    const searchService = new SearchService(dbPath, projectPath);
    await searchService.initialize();

    const dbStats = await searchService.getStats();

    console.log(chalk.white('  Total Nodes:'), dbStats.totalNodes.toLocaleString());
    console.log(chalk.white('  Total Files:'), dbStats.totalFiles.toLocaleString());
    console.log(chalk.white('  Vector Search:'), dbStats.vectorEnabled ? chalk.green('Enabled') : chalk.yellow('Disabled'));
    console.log('');

    if (options.detailed && Object.keys(dbStats.nodeTypes).length > 0) {
      console.log(chalk.blue('  Node Types:'));
      for (const [type, count] of Object.entries(dbStats.nodeTypes)) {
        console.log(chalk.gray(`    ${type}: ${count}`));
      }
      console.log('');
    }

    searchService.close();
  } catch (error) {
    console.log(chalk.red(`  ✗ Error reading index: ${error}`));
  }

  console.log('');
}
