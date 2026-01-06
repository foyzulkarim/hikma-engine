/**
 * hikma-mcp init command
 *
 * Initializes the code index for a project by running the hikma-engine
 * indexing pipeline and storing results in .hikma/ directory.
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import {
  resolveProjectPath,
  getIndexPath,
  getDatabasePath,
  ensureIndexDirectory,
  ensureGitignore,
  indexExists,
  detectProjectRoot,
} from '../utils/paths';
import { logger } from '../utils/logger';

export interface InitOptions {
  dir?: string;
  force?: boolean;
  exclude?: string[];
}

export async function initCommand(options: InitOptions): Promise<void> {
  const startTime = Date.now();

  console.log(chalk.blue('\n🔍 hikma-mcp init\n'));

  // Resolve project path
  let projectPath: string;
  try {
    projectPath = resolveProjectPath(options.dir);
  } catch (error) {
    console.log(chalk.red(`✗ Invalid directory: ${options.dir}`));
    throw error;
  }

  // Detect project root if not at root
  const detectedRoot = detectProjectRoot(projectPath);
  if (detectedRoot && detectedRoot !== projectPath) {
    console.log(chalk.yellow(`  Detected project root: ${detectedRoot}`));
    projectPath = detectedRoot;
  }

  console.log(chalk.gray(`  Project: ${projectPath}`));

  // Check if index already exists
  if (indexExists(projectPath) && !options.force) {
    console.log(chalk.yellow('\n⚠ Index already exists. Use --force to rebuild.\n'));
    console.log(chalk.gray(`  Index location: ${getIndexPath(projectPath)}`));
    return;
  }

  // Ensure .hikma directory exists
  const indexPath = ensureIndexDirectory(projectPath);
  console.log(chalk.gray(`  Index location: ${indexPath}`));

  // Add to .gitignore
  ensureGitignore(projectPath);

  // Run hikma-engine indexing
  console.log(chalk.blue('\n📦 Running code indexing...\n'));

  try {
    await runHikmaEngine(projectPath, indexPath, options);
  } catch (error) {
    console.log(chalk.red(`\n✗ Indexing failed: ${error}\n`));
    throw error;
  }

  // Copy database to .hikma if needed
  await copyDatabaseIfNeeded(projectPath, indexPath);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.green(`\n✓ Index created successfully in ${elapsed}s\n`));

  // Show next steps
  console.log(chalk.blue('Next steps:'));
  console.log(chalk.gray('  1. Add hikma-mcp to your AI CLI config:'));
  console.log(chalk.white(`
     // For Claude Code (~/.claude.json):
     {
       "mcpServers": {
         "hikma": {
           "command": "hikma-mcp",
           "args": ["serve", "--project", "${projectPath}"]
         }
       }
     }
  `));
  console.log(chalk.gray('  2. Restart your AI CLI\n'));
}

async function runHikmaEngine(
  projectPath: string,
  indexPath: string,
  options: InitOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if hikma-engine is available
    const hikmaEnginePath = findHikmaEngine();

    if (!hikmaEnginePath) {
      // Fall back to running npm command
      console.log(chalk.yellow('  hikma-engine not found locally, using npx...'));
      runWithNpx(projectPath, indexPath, options, resolve, reject);
      return;
    }

    console.log(chalk.gray(`  Using hikma-engine: ${hikmaEnginePath}`));

    // Build command arguments
    const args = [
      'embed',
      '--provider', 'transformers',
      '--dir', projectPath,
    ];

    if (options.force) {
      args.push('--force-full');
    }

    // Run hikma-engine
    const child = spawn('node', [hikmaEnginePath, ...args], {
      cwd: projectPath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Override data directory to use .hikma
        HIKMA_DATA_DIR: indexPath,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Show progress
      if (text.includes('%') || text.includes('Phase')) {
        process.stdout.write(chalk.gray(`  ${text.trim()}\n`));
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`hikma-engine exited with code ${code}\n${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function runWithNpx(
  projectPath: string,
  indexPath: string,
  options: InitOptions,
  resolve: () => void,
  reject: (error: Error) => void
): void {
  const args = [
    '-y', 'hikma-engine',
    'embed',
    '--provider', 'transformers',
    '--dir', projectPath,
  ];

  if (options.force) {
    args.push('--force-full');
  }

  const child = spawn('npx', args, {
    cwd: projectPath,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HIKMA_DATA_DIR: indexPath,
    },
  });

  let stderr = '';

  child.stdout?.on('data', (data) => {
    const text = data.toString();
    if (text.includes('%') || text.includes('Phase')) {
      process.stdout.write(chalk.gray(`  ${text.trim()}\n`));
    }
  });

  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`npx hikma-engine exited with code ${code}\n${stderr}`));
    }
  });

  child.on('error', (error) => {
    reject(error);
  });
}

function findHikmaEngine(): string | null {
  // Check common locations
  const locations = [
    // Sibling in monorepo
    path.resolve(__dirname, '../../../../dist/cli/main.js'),
    // Installed globally
    'hikma-engine',
    // Local node_modules
    path.resolve(process.cwd(), 'node_modules/.bin/hikma-engine'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
}

async function copyDatabaseIfNeeded(projectPath: string, indexPath: string): Promise<void> {
  // Check if database was created in default location
  const defaultDbPath = path.join(projectPath, 'data', 'metadata.db');
  const targetDbPath = getDatabasePath(projectPath);

  if (fs.existsSync(defaultDbPath) && !fs.existsSync(targetDbPath)) {
    console.log(chalk.gray('  Moving database to .hikma/...'));
    fs.copyFileSync(defaultDbPath, targetDbPath);
  }
}
