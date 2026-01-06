import * as path from 'path';
import * as fs from 'fs';
import { InvalidPathError } from './errors';

/**
 * Default index directory name
 */
export const INDEX_DIR = '.hikma';

/**
 * Database filename within index directory
 */
export const DATABASE_FILE = 'index.db';

/**
 * Config filename within index directory
 */
export const CONFIG_FILE = 'config.json';

/**
 * Resolve and validate a project path
 */
export function resolveProjectPath(inputPath?: string): string {
  const resolved = path.resolve(inputPath || process.cwd());

  if (!fs.existsSync(resolved)) {
    throw new InvalidPathError(resolved, 'directory does not exist');
  }

  if (!fs.statSync(resolved).isDirectory()) {
    throw new InvalidPathError(resolved, 'not a directory');
  }

  return resolved;
}

/**
 * Get the index directory path for a project
 */
export function getIndexPath(projectPath: string): string {
  return path.join(projectPath, INDEX_DIR);
}

/**
 * Get the database path for a project
 */
export function getDatabasePath(projectPath: string): string {
  return path.join(getIndexPath(projectPath), DATABASE_FILE);
}

/**
 * Get the config path for a project
 */
export function getConfigPath(projectPath: string): string {
  return path.join(getIndexPath(projectPath), CONFIG_FILE);
}

/**
 * Check if an index exists for a project
 */
export function indexExists(projectPath: string): boolean {
  const dbPath = getDatabasePath(projectPath);
  return fs.existsSync(dbPath);
}

/**
 * Validate that a file path is within the project root
 */
export function validatePathWithinProject(
  filePath: string,
  projectPath: string
): string {
  const resolvedFile = path.resolve(projectPath, filePath);
  const resolvedProject = path.resolve(projectPath);

  if (!resolvedFile.startsWith(resolvedProject + path.sep)) {
    throw new InvalidPathError(
      filePath,
      'path is outside the project directory'
    );
  }

  return resolvedFile;
}

/**
 * Convert an absolute path to a relative path from project root
 */
export function toRelativePath(
  absolutePath: string,
  projectPath: string
): string {
  return path.relative(projectPath, absolutePath);
}

/**
 * Detect project root by looking for common markers
 */
export function detectProjectRoot(startPath: string): string | null {
  const markers = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml'];
  let current = path.resolve(startPath);

  while (current !== path.dirname(current)) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }
    current = path.dirname(current);
  }

  return null;
}

/**
 * Ensure the index directory exists
 */
export function ensureIndexDirectory(projectPath: string): string {
  const indexPath = getIndexPath(projectPath);

  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(indexPath, { recursive: true });
  }

  return indexPath;
}

/**
 * Add .hikma to .gitignore if not already present
 */
export function ensureGitignore(projectPath: string): void {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const entry = INDEX_DIR;

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n# hikma-mcp index\n${entry}/\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `# hikma-mcp index\n${entry}/\n`);
  }
}
