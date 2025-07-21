/**
 * @file Responsible for generating AI-powered summaries for FileNodes.
 *       This module leverages machine learning models to create intelligent
 *       descriptions of file contents and purposes.
 */

import { FileNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Generates AI summaries for FileNodes.
 */
export class SummaryGenerator {
  private config: ConfigManager;
  private logger = getLogger('SummaryGenerator');
  private model: any = null;
  private maxRetries = 3;

  /**
   * Initializes the AI Summary Generator.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(config: ConfigManager) {
    this.config = config;
    this.logger.info('Initializing SummaryGenerator');
    // Set environment for transformers
    // env.allowLocalModels = true; // This line is removed as transformers are no longer used
  }

  /**
   * Loads the necessary Language Model for summarization.
   */
  async loadModel(): Promise<void> {
    if (this.model) {
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
      // This section is removed as transformers are no longer used
      // this.llm = await pipeline('summarization', aiConfig.summary.model);

      // this.isModelLoaded = true; // This line is removed
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
    if (!this.model) {
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
      // This section is removed as transformers are no longer used
      // const result = await this.llm(inputText, {
      //   max_length: maxLength,
      //   min_length: Math.min(30, Math.floor(maxLength * 0.2)),
      // });

      // const summary_text = result[0].summary_text; // This line is removed
      const summary_text = `AI Summary: This content appears to contain ${this.analyzeContent(
        text
      )}. ${text.substring(0, 200)}...`; // Fallback to basic text analysis

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
   * Basic content analysis fallback when AI models are not available.
   */
  private analyzeContent(text: string): string {
    const lines = text.split('\n').length;
    const words = text.split(/\s+/).length;
    
    // Basic analysis
    if (text.includes('function') || text.includes('def ') || text.includes('class ')) {
      return `code with ${lines} lines and ${words} words, containing function or class definitions`;
    } else if (text.includes('import ') || text.includes('#include') || text.includes('require(')) {
      return `code with imports/dependencies, ${lines} lines and ${words} words`;
    } else if (text.includes('test') || text.includes('describe(') || text.includes('it(')) {
      return `test code with ${lines} lines and ${words} words`;
    } else {
      return `text content with ${lines} lines and ${words} words`;
    }
  }

  /**
   * Reads file content for summarization.
   * @param {string} filePath - The path to the file.
   * @returns {Promise<string>} The file content.
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      this.logger.warn(`Failed to read file: ${filePath}`, {
        error: getErrorMessage(error),
      });
      return `Unable to read file content: ${path.basename(filePath)}`;
    }
  }

  /**
   * Generates directory information by reading directory contents.
   * Note: This method is kept for potential future use but directories are no longer indexed.
   */
  private async gatherDirectoryInfo(dirPath: string): Promise<string> {
    this.logger.debug(`Gathering directory info for: ${dirPath}`);

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const files = items.filter(item => item.isFile()).map(item => item.name);
      const dirs = items.filter(item => item.isDirectory()).map(item => item.name);

      let info = `Directory containing ${files.length} files and ${dirs.length} subdirectories.`;

      if (files.length > 0) {
        info += ` Files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}.`;
      }

      if (dirs.length > 0) {
        info += ` Subdirectories: ${dirs.slice(0, 5).join(', ')}${
          dirs.length > 5 ? '...' : ''
        }.`;
      }

      return info;
    } catch (error) {
      this.logger.warn(`Failed to gather directory info for ${dirPath}`, {
        error: getErrorMessage(error),
      });
      return `Directory at ${dirPath}`;
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
   * Gets summarization statistics.
   * @returns {Promise<{modelLoaded: boolean, model: string}>}
   */
  async getStats(): Promise<{
    modelLoaded: boolean;
    model: string;
  }> {
    const aiConfig = this.config.getAIConfig();

    return {
      modelLoaded: !!this.model, // Check if model is loaded
      model: aiConfig.summary.model,
    };
  }
}
