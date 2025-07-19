/**
 * @file Responsible for discovering all relevant files within a project directory,
 *       respecting `.gitignore` rules. It supports incremental indexing by identifying
 *       files that have changed since a last known state.
 */

import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import * as crypto from 'crypto';

/**
 * Manages file discovery within a given project.
 */
export class FileScanner {
  private projectRoot: string;
  private config: ConfigManager;
  private logger = getLogger('FileScanner');

  /**
   * @param {string} projectRoot - The absolute path to the root of the project.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(projectRoot: string, config: ConfigManager) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  /**
   * Reads the .gitignore file and converts its patterns into glob-compatible ignore rules.
   * @returns {Promise<string[]>} A promise that resolves to an array of .gitignore patterns.
   */
  private async getGitIgnorePatterns(): Promise<string[]> {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    const indexingConfig = this.config.getIndexingConfig();

    let patterns = [...indexingConfig.ignorePatterns];

    if (fs.existsSync(gitignorePath)) {
      try {
        const content = await fs.promises.readFile(gitignorePath, 'utf-8');
        const gitignorePatterns = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '' && !line.startsWith('#'));

        patterns.push(...gitignorePatterns);
        this.logger.debug(
          `Loaded ${gitignorePatterns.length} patterns from .gitignore`
        );
      } catch (error) {
        this.logger.warn('Failed to read .gitignore file', {
          error: getErrorMessage(error),
        });
      }
    }

    return patterns;
  }

  /**
   * Filters files based on size limits and other criteria.
   * @param {string[]} files - Array of file paths to filter.
   * @returns {Promise<string[]>} Filtered array of file paths.
   */
  private async filterFiles(files: string[]): Promise<string[]> {
    const indexingConfig = this.config.getIndexingConfig();
    const filteredFiles: string[] = [];

    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file);

        // Check file size
        if (stats.size > indexingConfig.maxFileSize) {
          this.logger.debug(
            `Skipping large file: ${file} (${stats.size} bytes)`
          );
          continue;
        }

        // Check if file is readable
        await fs.promises.access(file, fs.constants.R_OK);
        filteredFiles.push(file);
      } catch (error) {
        this.logger.warn(`Skipping inaccessible file: ${file}`, {
          error: getErrorMessage(error),
        });
      }
    }

    return filteredFiles;
  }

  async findAllFiles(
    patterns: string[],
    changedFiles?: string[]
  ): Promise<FileMetadata[]> {
    const operation = this.logger.operation('File discovery');

    try {
      const ignorePatterns = await this.getGitIgnorePatterns();

      this.logger.info('Starting file discovery', {
        projectRoot: this.projectRoot,
        patterns: patterns.length,
        ignorePatterns: ignorePatterns.length,
        incrementalMode: !!changedFiles,
      });

      let files = await glob(patterns, {
        cwd: this.projectRoot,
        ignore: ignorePatterns,
        nodir: true,
        absolute: true,
      });

      this.logger.debug(`Found ${files.length} files matching patterns`);

      // Filter for incremental indexing
      if (changedFiles && changedFiles.length > 0) {
        const changedFilesAbsolute = changedFiles.map((f) =>
          path.isAbsolute(f) ? f : path.resolve(this.projectRoot, f)
        );

        files = files.filter((file) => changedFilesAbsolute.includes(file));
        this.logger.info(
          `Filtered to ${files.length} changed files for incremental indexing`
        );
      }

      // Apply additional filters (size, accessibility, etc.)
      const filteredFiles = await this.filterFiles(files);
      const metadataPromises = filteredFiles.map(filePath => this.getFileMetadata(filePath));
      const metadata = await Promise.all(metadataPromises);

      this.logger.info(`File discovery completed`, {
        totalFound: files.length,
        afterFiltering: filteredFiles.length,
        filtered: files.length - filteredFiles.length,
      });

      operation();
      return metadata;
    } catch (error) {
      this.logger.error('File discovery failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Gets file statistics for the project.
   * @returns {Promise<{totalFiles: number, totalSize: number, filesByExtension: Record<string, number>}>}
   */
  async getFileStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByExtension: Record<string, number>;
  }> {
    const indexingConfig = this.config.getIndexingConfig();
    const files = await this.findAllFiles(indexingConfig.filePatterns);

    let totalSize = 0;
    const filesByExtension: Record<string, number> = {};

    for (const file of files) {
      try {
        // Convert sizeKb back to bytes for totalSize calculation
        totalSize += file.sizeKb * 1024;

        const ext = file.extension ? `.${file.extension}` : '';
        filesByExtension[ext] = (filesByExtension[ext] || 0) + 1;
      } catch (error) {
        this.logger.warn(`Failed to get stats for file: ${file.path}`, {
          error: getErrorMessage(error),
        });
      }
    }

    return {
      totalFiles: files.length,
      totalSize,
      filesByExtension,
    };
  }

  private async getFileMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const stats = await fs.promises.stat(filePath);
      const content = await fs.promises.readFile(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const language = this.detectLanguage(ext);
      const fileType = this.classifyFileType(filePath);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        extension: ext,
        language,
        sizeKb: Math.ceil(stats.size / 1024),
        contentHash: hash,
        fileType,
      };
    } catch (error) {
      this.logger.error(`Failed to get metadata for file: ${filePath}`, {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  private detectLanguage(extension: string): string {
    const languageMap: Record<string, string> = {
      js: 'JavaScript',
      ts: 'TypeScript',
      py: 'Python',
      java: 'Java',
      go: 'Go',
      // Add more as needed
    };
    return languageMap[extension] || 'Unknown';
  }

  private classifyFileType(filePath: string): 'source' | 'test' | 'config' | 'dev' | 'vendor' {
    const normalizedPath = filePath.toLowerCase();
    const fileName = path.basename(normalizedPath);
    
    if (normalizedPath.includes('test') || normalizedPath.includes('spec') || fileName.includes('.test.') || fileName.includes('.spec.')) {
      return 'test';
    }
    if (normalizedPath.includes('config') || fileName.endsWith('.json') || fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
      return 'config';
    }
    if (normalizedPath.includes('node_modules') || normalizedPath.includes('vendor')) {
      return 'vendor';
    }
    if (normalizedPath.includes('scripts') || normalizedPath.includes('build') || normalizedPath.includes('dist')) {
      return 'dev';
    }
    return 'source';
  }
}

export interface FileMetadata {
  path: string;
  name: string;
  extension: string;
  language: string;
  sizeKb: number;
  contentHash: string;
  fileType: 'source' | 'test' | 'config' | 'dev' | 'vendor';
}
