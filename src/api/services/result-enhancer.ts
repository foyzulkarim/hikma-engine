/**
 * @file Result enhancement service for adding context and metadata to search results.
 *       Provides syntax highlighting, breadcrumbs, and related information.
 */

import * as path from 'path';
import { SearchResult } from '../../modules/search-service';
import { SQLiteClient } from '../../persistence/db-clients';
import { getLogger } from '../../utils/logger';

const logger = getLogger('ResultEnhancer');

/**
 * Enhanced search result with additional context.
 */
export interface EnhancedSearchResult extends SearchResult {
  context?: {
    filePath?: string;
    fileName?: string;
    breadcrumbs?: string[];
    beforeLines?: string[];
    afterLines?: string[];
    relatedFiles?: string[];
    syntaxHighlighted?: string;
  };
  metadata?: {
    language?: string;
    author?: string;
    lastModified?: string;
    fileSize?: number;
    lineCount?: number;
  };
}

/**
 * Enhancement options.
 */
interface EnhancementOptions {
  includeSyntaxHighlighting?: boolean;
  includeContext?: boolean;
  includeRelatedFiles?: boolean;
  contextLines?: number;
}

/**
 * Service for enhancing search results with additional context and metadata.
 */
export class ResultEnhancerService {
  constructor(private sqliteClient: SQLiteClient) {}

  /**
   * Enhances an array of search results.
   */
  async enhanceResults(
    results: SearchResult[],
    options: EnhancementOptions = {},
    query?: string
  ): Promise<EnhancedSearchResult[]> {
    const {
      includeSyntaxHighlighting = false,
      includeContext = true,
      includeRelatedFiles = false,
      contextLines = 3,
    } = options;

    logger.debug('Enhancing search results', {
      resultCount: results.length,
      options,
      hasQuery: !!query,
    });

    const enhancedResults = await Promise.all(
      results.map(result => this.enhanceResult(result, {
        includeSyntaxHighlighting,
        includeContext,
        includeRelatedFiles,
        contextLines,
      }, query))
    );

    logger.debug('Results enhanced successfully', {
      enhancedCount: enhancedResults.length,
      withRelevanceScoring: !!query,
    });

    return enhancedResults;
  }

  /**
   * Enhances a single search result with advanced features.
   */
  private async enhanceResult(
    result: SearchResult,
    options: EnhancementOptions,
    query?: string
  ): Promise<EnhancedSearchResult> {
    const enhanced: EnhancedSearchResult = { ...result };

    try {
      // Add file context
      if (options.includeContext) {
        enhanced.context = await this.addFileContext(result, options.contextLines || 3);
      }

      // Add metadata
      enhanced.metadata = await this.addMetadata(result);

      // Add advanced syntax highlighting
      if (options.includeSyntaxHighlighting && enhanced.context) {
        const codeToHighlight = result.node.properties.signature || 
                               result.node.properties.body || 
                               result.node.properties.name || '';
        
        enhanced.context.syntaxHighlighted = this.addAdvancedSyntaxHighlighting(
          codeToHighlight,
          enhanced.metadata?.language
        );
      }

      // Add advanced related files with relationships
      if (options.includeRelatedFiles) {
        enhanced.context = enhanced.context || {};
        const relatedInfo = await this.findAdvancedRelatedFiles(result);
        enhanced.context.relatedFiles = relatedInfo.relatedFiles;
        
        // Add relationship information to metadata
        enhanced.metadata = enhanced.metadata || {};
        (enhanced.metadata as any).fileRelationships = relatedInfo.relationships;
      }

      // Add relevance scoring explanation
      if (query) {
        const relevanceInfo = this.addRelevanceExplanation(result, query);
        enhanced.metadata = enhanced.metadata || {};
        (enhanced.metadata as any).relevanceScore = relevanceInfo.score;
        (enhanced.metadata as any).relevanceExplanation = relevanceInfo.explanation;
        (enhanced.metadata as any).relevanceFactors = relevanceInfo.factors;
      }

      // Add performance metrics
      enhanced.metadata = enhanced.metadata || {};
      (enhanced.metadata as any).enhancementTimestamp = new Date().toISOString();

    } catch (error) {
      logger.warn('Failed to enhance result', {
        nodeId: result.node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return enhanced;
  }

  /**
   * Adds file context including breadcrumbs and surrounding lines.
   */
  private async addFileContext(
    result: SearchResult,
    contextLines: number
  ): Promise<{
    filePath?: string;
    fileName?: string;
    breadcrumbs?: string[];
    beforeLines?: string[];
    afterLines?: string[];
  }> {
    const filePath = result.node.properties.filePath;
    if (!filePath) return {};

    const fileName = path.basename(filePath);
    const breadcrumbs = this.generateBreadcrumbs(filePath);

    // For code nodes, try to get surrounding lines
    let beforeLines: string[] = [];
    let afterLines: string[] = [];

    if (result.node.type === 'CodeNode' && result.node.properties.startLine) {
      const contextResult = await this.getCodeContext(
        filePath,
        result.node.properties.startLine as number,
        result.node.properties.endLine as number,
        contextLines
      );
      beforeLines = contextResult.beforeLines;
      afterLines = contextResult.afterLines;
    }

    return {
      filePath,
      fileName,
      breadcrumbs,
      beforeLines,
      afterLines,
    };
  }

  /**
   * Adds metadata about the file and node.
   */
  private async addMetadata(result: SearchResult): Promise<{
    language?: string;
    author?: string;
    lastModified?: string;
    fileSize?: number;
    lineCount?: number;
  }> {
    const metadata: any = {};

    // Get language from node properties
    metadata.language = result.node.properties.language;

    // Get file metadata if available
    if (result.node.properties.filePath) {
      try {
        const fileInfo = this.sqliteClient.get(
          'SELECT language, size_kb, updated_at FROM files WHERE file_path = ?',
          [result.node.properties.filePath]
        );

        if (fileInfo) {
          metadata.language = metadata.language || fileInfo.language;
          metadata.fileSize = fileInfo.size_kb ? Math.round(fileInfo.size_kb * 1024) : undefined;
          metadata.lastModified = fileInfo.updated_at;
        }
      } catch (error) {
        logger.debug('Failed to get file metadata', {
          filePath: result.node.properties.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Get author from recent commits if it's a code node
    if (result.node.type === 'CodeNode') {
      try {
        const commitInfo = this.sqliteClient.get(`
          SELECT c.author, c.date 
          FROM commits c
          JOIN file_commits fc ON c.id = fc.commit_id
          JOIN files f ON fc.file_id = f.file_id
          WHERE f.file_path = ?
          ORDER BY c.date DESC
          LIMIT 1
        `, [result.node.properties.filePath]);

        if (commitInfo) {
          metadata.author = commitInfo.author;
          if (!metadata.lastModified) {
            metadata.lastModified = commitInfo.date;
          }
        }
      } catch (error) {
        logger.debug('Failed to get commit metadata', {
          filePath: result.node.properties.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return metadata;
  }

  /**
   * Generates breadcrumb navigation for a file path.
   */
  private generateBreadcrumbs(filePath: string): string[] {
    const parts = filePath.split(path.sep).filter(part => part.length > 0);
    const breadcrumbs: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      breadcrumbs.push(parts.slice(0, i + 1).join(path.sep));
    }

    return breadcrumbs;
  }

  /**
   * Gets code context (surrounding lines) for a code node.
   */
  private async getCodeContext(
    filePath: string,
    startLine: number,
    endLine: number,
    contextLines: number
  ): Promise<{
    beforeLines: string[];
    afterLines: string[];
  }> {
    // This is a simplified implementation
    // In a real scenario, you might read the actual file content
    // For now, we'll return placeholder context
    
    const beforeLines: string[] = [];
    const afterLines: string[] = [];

    // Try to get context from other code nodes in the same file
    try {
      const beforeNodes = this.sqliteClient.all(`
        SELECT name, signature 
        FROM code_nodes 
        WHERE file_path = ? AND end_line < ? AND end_line >= ?
        ORDER BY start_line DESC
        LIMIT ?
      `, [filePath, startLine, Math.max(1, startLine - contextLines * 2), contextLines]);

      const afterNodes = this.sqliteClient.all(`
        SELECT name, signature 
        FROM code_nodes 
        WHERE file_path = ? AND start_line > ? AND start_line <= ?
        ORDER BY start_line ASC
        LIMIT ?
      `, [filePath, endLine, endLine + contextLines * 2, contextLines]);

      beforeLines.push(...beforeNodes.map(node => `// ${node.name}: ${node.signature}`));
      afterLines.push(...afterNodes.map(node => `// ${node.name}: ${node.signature}`));

    } catch (error) {
      logger.debug('Failed to get code context', {
        filePath,
        startLine,
        endLine,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { beforeLines, afterLines };
  }

  /**
   * Finds files related to the current result.
   */
  private async findRelatedFiles(result: SearchResult): Promise<string[]> {
    const relatedFiles: string[] = [];

    try {
      if (result.node.properties.filePath) {
        // Find files in the same directory
        const directory = path.dirname(result.node.properties.filePath);
        const sameDirectoryFiles = this.sqliteClient.all(`
          SELECT file_path 
          FROM files 
          WHERE file_path LIKE ? AND file_path != ?
          LIMIT 5
        `, [`${directory}%`, result.node.properties.filePath]);

        relatedFiles.push(...sameDirectoryFiles.map(f => f.file_path));

        // Find files with similar names or extensions
        const fileName = path.basename(result.node.properties.filePath, path.extname(result.node.properties.filePath));
        const extension = path.extname(result.node.properties.filePath);
        
        const similarFiles = this.sqliteClient.all(`
          SELECT file_path 
          FROM files 
          WHERE (file_name LIKE ? OR file_extension = ?) AND file_path != ?
          LIMIT 3
        `, [`%${fileName}%`, extension, result.node.properties.filePath]);

        relatedFiles.push(...similarFiles.map(f => f.file_path));
      }
    } catch (error) {
      logger.debug('Failed to find related files', {
        nodeId: result.node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Remove duplicates and limit results
    return [...new Set(relatedFiles)].slice(0, 5);
  }

  /**
   * Adds relevance scoring explanation to results.
   */
  private addRelevanceExplanation(
    result: SearchResult,
    query: string
  ): {
    score: number;
    explanation: string[];
    factors: Array<{ factor: string; weight: number; contribution: number }>;
  } {
    const explanation: string[] = [];
    const factors: Array<{ factor: string; weight: number; contribution: number }> = [];
    let totalScore = result.similarity;

    const queryLower = query.toLowerCase();
    const name = result.node.properties.name?.toLowerCase() || '';
    const signature = result.node.properties.signature?.toLowerCase() || '';

    // Exact name match
    if (name === queryLower) {
      const contribution = 0.3;
      factors.push({ factor: 'Exact name match', weight: 0.3, contribution });
      explanation.push(`Exact name match (+${(contribution * 100).toFixed(0)}%)`);
    }

    // Name contains query
    else if (name.includes(queryLower)) {
      const contribution = 0.2;
      factors.push({ factor: 'Name contains query', weight: 0.2, contribution });
      explanation.push(`Name contains query (+${(contribution * 100).toFixed(0)}%)`);
    }

    // Signature match
    if (signature.includes(queryLower)) {
      const contribution = 0.15;
      factors.push({ factor: 'Signature match', weight: 0.15, contribution });
      explanation.push(`Signature contains query (+${(contribution * 100).toFixed(0)}%)`);
    }

    // Node type relevance
    const nodeTypeWeights: Record<string, number> = {
      'CodeNode': 0.1,
      'FileNode': 0.08,
      'CommitNode': 0.06,
      'TestNode': 0.09,
      'PullRequestNode': 0.05,
      'DirectoryNode': 0.04,
    };

    const nodeTypeWeight = nodeTypeWeights[result.node.type] || 0.05;
    factors.push({ 
      factor: `${result.node.type} relevance`, 
      weight: nodeTypeWeight, 
      contribution: nodeTypeWeight 
    });
    explanation.push(`${result.node.type} type (+${(nodeTypeWeight * 100).toFixed(0)}%)`);

    // Recent activity bonus (for commits and files)
    if (result.node.properties.date || result.node.properties.lastModified) {
      const dateStr = result.node.properties.date || result.node.properties.lastModified;
      if (dateStr) {
        const date = new Date(dateStr as string);
        const daysSinceModified = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceModified < 30) {
          const contribution = Math.max(0.05, 0.1 - (daysSinceModified / 300));
          factors.push({ factor: 'Recent activity', weight: 0.1, contribution });
          explanation.push(`Recent activity (+${(contribution * 100).toFixed(0)}%)`);
        }
      }
    }

    // Language popularity bonus
    const popularLanguages = ['typescript', 'javascript', 'python', 'java', 'go'];
    const language = result.node.properties.language?.toLowerCase();
    if (language && popularLanguages.includes(language)) {
      const contribution = 0.02;
      factors.push({ factor: 'Popular language', weight: 0.02, contribution });
      explanation.push(`Popular language: ${language} (+${(contribution * 100).toFixed(0)}%)`);
    }

    return {
      score: totalScore,
      explanation,
      factors,
    };
  }

  /**
   * Improves syntax highlighting with better language detection and highlighting.
   */
  private addAdvancedSyntaxHighlighting(code: string, language?: string): string {
    if (!code || !language) return code;

    // Enhanced syntax highlighting with more comprehensive patterns
    const highlightingRules = this.getAdvancedHighlightingRules(language);
    let highlighted = code;

    // Apply highlighting rules in order of precedence
    highlightingRules.forEach(rule => {
      highlighted = highlighted.replace(rule.pattern, rule.replacement);
    });

    return highlighted;
  }

  /**
   * Gets advanced highlighting rules for different languages.
   */
  private getAdvancedHighlightingRules(language: string): Array<{ pattern: RegExp; replacement: string }> {
    const commonRules = [
      // Comments
      { pattern: /\/\/.*$/gm, replacement: '<span class="comment">$&</span>' },
      { pattern: /\/\*[\s\S]*?\*\//g, replacement: '<span class="comment">$&</span>' },
      // Strings
      { pattern: /"([^"\\]|\\.)*"/g, replacement: '<span class="string">$&</span>' },
      { pattern: /'([^'\\]|\\.)*'/g, replacement: '<span class="string">$&</span>' },
      { pattern: /`([^`\\]|\\.)*`/g, replacement: '<span class="template-string">$&</span>' },
    ];

    const languageSpecificRules: Record<string, Array<{ pattern: RegExp; replacement: string }>> = {
      typescript: [
        ...commonRules,
        // Keywords
        { pattern: /\b(function|const|let|var|class|interface|type|async|await|return|if|else|for|while|try|catch|finally|import|export|from|default)\b/g, replacement: '<span class="keyword">$&</span>' },
        // Types
        { pattern: /\b(string|number|boolean|object|any|void|never|unknown)\b/g, replacement: '<span class="type">$&</span>' },
        // Decorators
        { pattern: /@\w+/g, replacement: '<span class="decorator">$&</span>' },
      ],
      javascript: [
        ...commonRules,
        // Keywords
        { pattern: /\b(function|const|let|var|class|async|await|return|if|else|for|while|try|catch|finally|import|export|from|default)\b/g, replacement: '<span class="keyword">$&</span>' },
      ],
      python: [
        // Comments
        { pattern: /#.*$/gm, replacement: '<span class="comment">$&</span>' },
        // Strings
        { pattern: /"""[\s\S]*?"""/g, replacement: '<span class="docstring">$&</span>' },
        { pattern: /"([^"\\]|\\.)*"/g, replacement: '<span class="string">$&</span>' },
        { pattern: /'([^'\\]|\\.)*'/g, replacement: '<span class="string">$&</span>' },
        // Keywords
        { pattern: /\b(def|class|if|elif|else|for|while|try|except|finally|import|from|as|return|yield|lambda|with|async|await)\b/g, replacement: '<span class="keyword">$&</span>' },
        // Decorators
        { pattern: /@\w+/g, replacement: '<span class="decorator">$&</span>' },
      ],
      java: [
        ...commonRules,
        // Keywords
        { pattern: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|import|package|return|if|else|for|while|try|catch|finally|new|this|super)\b/g, replacement: '<span class="keyword">$&</span>' },
        // Annotations
        { pattern: /@\w+/g, replacement: '<span class="annotation">$&</span>' },
      ],
      go: [
        ...commonRules,
        // Keywords
        { pattern: /\b(func|var|const|type|struct|interface|package|import|return|if|else|for|range|switch|case|default|go|defer|chan|select)\b/g, replacement: '<span class="keyword">$&</span>' },
      ],
    };

    return languageSpecificRules[language.toLowerCase()] || commonRules;
  }

  /**
   * Enhanced method to find related files with better algorithms.
   */
  private async findAdvancedRelatedFiles(result: SearchResult): Promise<{
    relatedFiles: string[];
    relationships: Array<{ file: string; relationship: string; strength: number }>;
  }> {
    const relatedFiles: string[] = [];
    const relationships: Array<{ file: string; relationship: string; strength: number }> = [];

    try {
      if (result.node.properties.filePath) {
        const currentFile = result.node.properties.filePath;
        const directory = path.dirname(currentFile);
        const fileName = path.basename(currentFile, path.extname(currentFile));
        const extension = path.extname(currentFile);

        // 1. Files in the same directory
        const sameDirectoryFiles = this.sqliteClient.all(`
          SELECT file_path, file_name 
          FROM files 
          WHERE file_path LIKE ? AND file_path != ?
          LIMIT 10
        `, [`${directory}%`, currentFile]);

        sameDirectoryFiles.forEach((f: any) => {
          relatedFiles.push(f.file_path);
          relationships.push({
            file: f.file_path,
            relationship: 'Same directory',
            strength: 0.6,
          });
        });

        // 2. Files with similar names
        const similarNameFiles = this.sqliteClient.all(`
          SELECT file_path, file_name 
          FROM files 
          WHERE (file_name LIKE ? OR file_name LIKE ?) AND file_path != ?
          LIMIT 5
        `, [`%${fileName}%`, `${fileName}%`, currentFile]);

        similarNameFiles.forEach((f: any) => {
          if (!relatedFiles.includes(f.file_path)) {
            relatedFiles.push(f.file_path);
            relationships.push({
              file: f.file_path,
              relationship: 'Similar name',
              strength: 0.7,
            });
          }
        });

        // 3. Files with same extension
        const sameExtensionFiles = this.sqliteClient.all(`
          SELECT file_path, file_name 
          FROM files 
          WHERE file_extension = ? AND file_path != ? AND file_path NOT LIKE ?
          ORDER BY updated_at DESC
          LIMIT 5
        `, [extension, currentFile, `${directory}%`]);

        sameExtensionFiles.forEach((f: any) => {
          if (!relatedFiles.includes(f.file_path)) {
            relatedFiles.push(f.file_path);
            relationships.push({
              file: f.file_path,
              relationship: 'Same file type',
              strength: 0.4,
            });
          }
        });

        // 4. Files that import/reference this file
        const referencingFiles = this.sqliteClient.all(`
          SELECT DISTINCT f.file_path 
          FROM files f
          JOIN file_imports fi ON f.file_id = fi.file_id
          WHERE fi.imported_path LIKE ? AND f.file_path != ?
          LIMIT 5
        `, [`%${fileName}%`, currentFile]);

        referencingFiles.forEach((f: any) => {
          if (!relatedFiles.includes(f.file_path)) {
            relatedFiles.push(f.file_path);
            relationships.push({
              file: f.file_path,
              relationship: 'Imports this file',
              strength: 0.9,
            });
          }
        });

        // 5. Files this file imports
        const importedFiles = this.sqliteClient.all(`
          SELECT DISTINCT f.file_path 
          FROM files f
          JOIN file_imports fi ON f.file_id = fi.file_id
          WHERE fi.file_id = (SELECT file_id FROM files WHERE file_path = ?)
          LIMIT 5
        `, [currentFile]);

        importedFiles.forEach((f: any) => {
          if (!relatedFiles.includes(f.file_path)) {
            relatedFiles.push(f.file_path);
            relationships.push({
              file: f.file_path,
              relationship: 'Imported by this file',
              strength: 0.8,
            });
          }
        });
      }
    } catch (error) {
      logger.debug('Failed to find advanced related files', {
        nodeId: result.node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Sort by relationship strength
    relationships.sort((a, b) => b.strength - a.strength);

    return {
      relatedFiles: [...new Set(relatedFiles)].slice(0, 10),
      relationships: relationships.slice(0, 10),
    };
  }
}
