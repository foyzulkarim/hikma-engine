/**
 * @file Responsible for generating AI-powered summaries for FileNodes and DirectoryNodes.
 *       It integrates with a Language Model (LLM) to create meaningful textual summaries
 *       that enhance the semantic understanding of the codebase.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileNode, DirectoryNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import {
  getErrorMessage,
  getErrorStack,
  logError,
} from '../utils/error-handling';
import { pipeline, env } from '@xenova/transformers';

/**
 * Generates AI summaries for FileNodes and DirectoryNodes.
 */
export class SummaryGenerator {
  private config: ConfigManager;
  private logger = getLogger('SummaryGenerator');
  private llm: any; // Placeholder for the LLM pipeline or client
  private isModelLoaded = false;

  /**
   * Initializes the AI Summary Generator.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(config: ConfigManager) {
    this.config = config;
    this.logger.info('Initializing SummaryGenerator');
    // Set environment for transformers
    env.allowLocalModels = true;
  }

  /**
   * Loads the necessary Language Model for summarization.
   */
  async loadModel(): Promise<void> {
    if (this.isModelLoaded) {
      this.logger.debug('Model already loaded, skipping');
      return;
    }

    const operation = this.logger.operation('Loading LLM for summarization');

    try {
      const aiConfig = this.config.getAIConfig();
      this.logger.info('Loading LLM for summarization', {
        model: aiConfig.summary.model,
        maxTokens: aiConfig.summary.maxTokens,
      });

      // Load the transformers pipeline for summarization
      this.llm = await pipeline('summarization', aiConfig.summary.model);

      this.isModelLoaded = true;
      this.logger.info('LLM loaded successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to load LLM', {
        error: getErrorMessage(error),
      });
      operation();
      throw error;
    }
  }

  /**
   * Generates an AI summary for a given text content.
   * @param {string} text - The text content to summarize.
   * @param {number} maxLength - Maximum length of the summary.
   * @returns {Promise<string>} A promise that resolves to the AI-generated summary.
   */
  private async generateSummary(
    text: string,
    maxLength: number = 150,
    filePath: string = ''
  ): Promise<string> {
    if (!this.isModelLoaded) {
      await this.loadModel();
    }

    try {
      this.logger.info('Generating summary', {
        textLength: text.length,
        maxLength,
        filePath,
      });

      // Truncate very long texts to avoid model input limits (most models have ~512-1024 token limits)
      // Approximate 1 token = 4 characters, so we limit to ~2000 characters to be safe
      const maxInputLength = 2000;
      const inputText =
        text.length > maxInputLength
          ? text.substring(0, maxInputLength) + '...'
          : text;

      // Use transformers pipeline to generate summary
      const result = await this.llm(inputText, {
        max_length: maxLength,
        min_length: Math.min(30, Math.floor(maxLength * 0.2)),
      });

      const summary_text = result[0].summary_text;
      this.logger.info('Summary generated', {
        summary_text,
        filePath,
      });
      return summary_text;
    } catch (error) {
      this.logger.warn('Failed to generate summary, using fallback', {
        error: getErrorMessage(error),
      });
      // Fallback to basic text analysis
      const truncatedText = text.substring(0, 200);
      const summary = `AI Summary: This content appears to contain ${this.analyzeContent(
        text
      )}. ${truncatedText}...`;

      return summary.length > maxLength
        ? summary.substring(0, maxLength - 3) + '...'
        : summary;
    }
  }

  /**
   * Analyzes content to provide basic insights for summary generation.
   * @param {string} content - The content to analyze.
   * @returns {string} Basic analysis of the content.
   */
  private analyzeContent(content: string): string {
    const insights: string[] = [];

    // Basic code analysis
    if (
      content.includes('function ') ||
      content.includes('const ') ||
      content.includes('class ')
    ) {
      insights.push('code definitions');
    }

    if (content.includes('import ') || content.includes('require(')) {
      insights.push('module imports');
    }

    if (
      content.includes('test(') ||
      content.includes('describe(') ||
      content.includes('it(')
    ) {
      insights.push('test cases');
    }

    if (content.includes('TODO') || content.includes('FIXME')) {
      insights.push('development notes');
    }

    if (content.includes('/**') || content.includes('//')) {
      insights.push('documentation');
    }

    return insights.length > 0 ? insights.join(', ') : 'various content types';
  }

  /**
   * Reads file content for summarization.
   * @param {string} filePath - The path to the file.
   * @returns {Promise<string>} The file content.
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      this.logger.warn(`Failed to read file: ${filePath}`, {
        error: getErrorMessage(error),
      });
      return `Unable to read file content: ${path.basename(filePath)}`;
    }
  }

  /**
   * Gathers directory information for summarization.
   * @param {string} dirPath - The path to the directory.
   * @returns {Promise<string>} Information about the directory.
   */
  private async gatherDirectoryInfo(dirPath: string): Promise<string> {
    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      const dirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const fileTypes = new Set(
        files.map((file) => path.extname(file).toLowerCase())
      );
      const fileTypesList = Array.from(fileTypes)
        .filter((ext) => ext !== '')
        .join(', ');

      let info = `Directory containing ${files.length} files and ${dirs.length} subdirectories.`;

      if (fileTypesList) {
        info += ` File types: ${fileTypesList}.`;
      }

      if (dirs.length > 0) {
        info += ` Subdirectories: ${dirs.slice(0, 5).join(', ')}${
          dirs.length > 5 ? '...' : ''
        }.`;
      }

      // Check for common patterns
      const hasTests = files.some(
        (file) => file.includes('test') || file.includes('spec')
      );
      const hasConfig = files.some(
        (file) =>
          file.includes('config') ||
          file.includes('.json') ||
          file.includes('.yml')
      );
      const hasReadme = files.some((file) =>
        file.toLowerCase().includes('readme')
      );

      if (hasTests) info += ' Contains test files.';
      if (hasConfig) info += ' Contains configuration files.';
      if (hasReadme) info += ' Contains documentation.';

      return info;
    } catch (error) {
      this.logger.warn(`Failed to gather directory info: ${dirPath}`, {
        error: getErrorMessage(error),
      });
      return `Directory information unavailable: ${path.basename(dirPath)}`;
    }
  }

  /**
   * Processes a list of FileNodes and generates AI summaries for them.
   * @param {FileNode[]} fileNodes - An array of FileNodes to summarize.
   * @returns {Promise<FileNode[]>} A promise that resolves to the updated FileNodes with summaries.
   */
  async summarizeFileNodes(fileNodes: FileNode[]): Promise<FileNode[]> {
    const operation = this.logger.operation(
      `Summarizing ${fileNodes.length} FileNodes`
    );

    try {
      this.logger.info(
        `Starting file summarization for ${fileNodes.length} files`
      );

      const aiConfig = this.config.getAIConfig();
      const summarizedNodes: FileNode[] = [];

      for (const node of fileNodes) {
        try {
          // Construct full file path
          const fullPath = path.isAbsolute(node.properties.filePath)
            ? node.properties.filePath
            : path.resolve(process.cwd(), node.properties.filePath);

          // Read file content
          const fileContent = await this.readFileContent(fullPath);
          this.logger.info('File content read', {
            fullPath,
            fileContent: fileContent.substring(0, 100),
          });
          // Generate summary
          const summary = await this.generateSummary(
            fileContent,
            aiConfig.summary.maxTokens,
            fullPath
          );

          // Update node with summary
          const updatedNode: FileNode = {
            ...node,
            properties: {
              ...node.properties,
              aiSummary: summary,
            },
          };

          summarizedNodes.push(updatedNode);
          this.logger.debug(
            `Generated summary for file: ${node.properties.fileName}`
          );
        } catch (error) {
          this.logger.warn(
            `Failed to summarize file: ${node.properties.fileName}`,
            { error: getErrorMessage(error) }
          );
          // Add node without summary
          summarizedNodes.push({
            ...node,
            properties: {
              ...node.properties,
              aiSummary: `Summary generation failed: ${getErrorMessage(error)}`,
            },
          });
        }
      }

      this.logger.info(`File summarization completed`, {
        total: fileNodes.length,
        successful: summarizedNodes.filter(
          (n) =>
            !n.properties.aiSummary?.startsWith('Summary generation failed')
        ).length,
      });

      operation();
      return summarizedNodes;
    } catch (error) {
      this.logger.error('File summarization failed', {
        error: getErrorMessage(error),
      });
      operation();
      throw error;
    }
  }

  /**
   * Processes a list of DirectoryNodes and generates AI summaries for them.
   * @param {DirectoryNode[]} directoryNodes - An array of DirectoryNodes to summarize.
   * @returns {Promise<DirectoryNode[]>} A promise that resolves to the updated DirectoryNodes with summaries.
   */
  async summarizeDirectoryNodes(
    directoryNodes: DirectoryNode[]
  ): Promise<DirectoryNode[]> {
    const operation = this.logger.operation(
      `Summarizing ${directoryNodes.length} DirectoryNodes`
    );

    try {
      this.logger.info(
        `Starting directory summarization for ${directoryNodes.length} directories`
      );

      const aiConfig = this.config.getAIConfig();
      const summarizedNodes: DirectoryNode[] = [];

      for (const node of directoryNodes) {
        try {
          // Construct full directory path
          const fullPath = path.isAbsolute(node.properties.dirPath)
            ? node.properties.dirPath
            : path.resolve(process.cwd(), node.properties.dirPath);

          // Gather directory information
          const dirInfo = await this.gatherDirectoryInfo(fullPath);

          // Generate summary
          const summary = await this.generateSummary(
            dirInfo,
            aiConfig.summary.maxTokens
          );

          // Update node with summary
          const updatedNode: DirectoryNode = {
            ...node,
            properties: {
              ...node.properties,
              aiSummary: summary,
            },
          };

          summarizedNodes.push(updatedNode);
          this.logger.debug(
            `Generated summary for directory: ${node.properties.dirName}`
          );
        } catch (error) {
          this.logger.warn(
            `Failed to summarize directory: ${node.properties.dirName}`,
            { error: getErrorMessage(error) }
          );
          // Add node without summary
          summarizedNodes.push({
            ...node,
            properties: {
              ...node.properties,
              aiSummary: `Summary generation failed: ${getErrorMessage(error)}`,
            },
          });
        }
      }

      this.logger.info(`Directory summarization completed`, {
        total: directoryNodes.length,
        successful: summarizedNodes.filter(
          (n) =>
            !n.properties.aiSummary?.startsWith('Summary generation failed')
        ).length,
      });

      operation();
      return summarizedNodes;
    } catch (error) {
      this.logger.error('Directory summarization failed', {
        error: getErrorMessage(error),
      });
      operation();
      throw error;
    }
  }

  /**
   * Gets summarization statistics.
   * @returns {Promise<{modelLoaded: boolean, model: string}>}
   */
  async getStats(): Promise<{
    modelLoaded: boolean;
    model: string;
  }> {
    const aiConfig = this.config.getAIConfig();

    return {
      modelLoaded: this.isModelLoaded,
      model: aiConfig.summary.model,
    };
  }
}
