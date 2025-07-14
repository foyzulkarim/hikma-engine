/**
 * @file Parses source code files to extract Abstract Syntax Tree (AST) information.
 *       It identifies and creates various node types (CodeNode, FileNode, DirectoryNode, TestNode)
 *       and their relationships (edges) within the knowledge graph.
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { CodeNode, FileNode, DirectoryNode, Edge, TestNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage, getErrorStack, logError } from '../utils/error-handling';

/**
 * Parses source code files to extract structured data for the knowledge graph.
 */
export class AstParser {
  private projectRoot: string;
  private config: ConfigManager;
  private logger = getLogger('AstParser');
  private nodes: (CodeNode | FileNode | DirectoryNode | TestNode)[] = [];
  private edges: Edge[] = [];

  /**
   * @param {string} projectRoot - The absolute path to the root of the project.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(projectRoot: string, config: ConfigManager) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  /**
   * Returns the list of extracted nodes.
   * @returns {(CodeNode | FileNode | DirectoryNode | TestNode)[]} An array of nodes.
   */
  public getNodes(): (CodeNode | FileNode | DirectoryNode | TestNode)[] {
    return this.nodes;
  }

  /**
   * Returns the list of extracted edges.
   * @returns {Edge[]} An array of edges.
   */
  public getEdges(): Edge[] {
    return this.edges;
  }

  /**
   * Determines if a given file path corresponds to a test file based on common naming conventions.
   * @param {string} filePath - The absolute path of the file.
   * @returns {boolean} True if it's a test file, false otherwise.
   */
  private isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    const testPatterns = [
      /\.test\./,
      /\.spec\./,
      /_test\./,
      /_spec\./,
      /test_/,
      /spec_/,
      /tests?\//,
      /specs?\//,
      /__tests?__/,
      /__specs?__/,
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath.toLowerCase()));
  }

  /**
   * Determines the programming language of a file based on its extension.
   * @param {string} filePath - The file path.
   * @returns {string} The detected language.
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cxx': 'cpp',
      '.cc': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.rst': 'restructuredtext',
    };
    
    return languageMap[ext] || 'unknown';
  }

  /**
   * Creates a unique ID for a node based on its type and properties.
   * @param {string} type - The node type.
   * @param {Record<string, any>} properties - The node properties.
   * @returns {string} A unique identifier.
   */
  private createNodeId(type: string, properties: Record<string, any>): string {
    switch (type) {
      case 'FileNode':
        return `file:${properties.filePath}`;
      case 'DirectoryNode':
        return `dir:${properties.dirPath}`;
      case 'CodeNode':
        return `code:${properties.filePath}:${properties.name}:${properties.startLine}`;
      case 'TestNode':
        return `test:${properties.filePath}:${properties.name}:${properties.startLine}`;
      default:
        return `${type.toLowerCase()}:${Date.now()}:${Math.random()}`;
    }
  }

  /**
   * Parses TypeScript/JavaScript files using the TypeScript compiler API.
   * @param {string} filePath - The path to the file to parse.
   * @returns {Promise<void>}
   */
  private async parseTypeScriptFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        // Extract functions
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
          this.extractCodeNode(node, filePath, 'function');
        }
        
        // Extract classes
        if (ts.isClassDeclaration(node)) {
          this.extractCodeNode(node, filePath, 'class');
        }
        
        // Extract interfaces
        if (ts.isInterfaceDeclaration(node)) {
          this.extractCodeNode(node, filePath, 'interface');
        }
        
        // Extract test methods (basic detection)
        if (this.isTestFile(filePath) && (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))) {
          this.extractTestNode(node, filePath);
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch (error) {
      this.logger.warn(`Failed to parse TypeScript file: ${filePath}`, { error: getErrorMessage(error) });
    }
  }

  /**
   * Extracts a CodeNode from a TypeScript AST node.
   * @param {ts.Node} node - The TypeScript AST node.
   * @param {string} filePath - The file path.
   * @param {string} nodeType - The type of code construct.
   */
  private extractCodeNode(node: ts.Node, filePath: string, nodeType: string): void {
    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    
    let name = 'anonymous';
    let signature = '';
    
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      name = node.name?.getText() || 'anonymous';
      signature = node.getText().split('{')[0].trim();
    } else if (ts.isClassDeclaration(node)) {
      name = node.name?.getText() || 'anonymous';
      signature = `class ${name}`;
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name.getText();
      signature = `interface ${name}`;
    }

    const codeNode: CodeNode = {
      id: this.createNodeId('CodeNode', { filePath, name, startLine: start.line + 1 }),
      type: 'CodeNode',
      properties: {
        name,
        signature,
        body: node.getText(),
        language: this.detectLanguage(filePath),
        filePath,
        startLine: start.line + 1,
        endLine: end.line + 1,
      },
    };

    this.nodes.push(codeNode);
  }

  /**
   * Extracts a TestNode from a TypeScript AST node.
   * @param {ts.Node} node - The TypeScript AST node.
   * @param {string} filePath - The file path.
   */
  private extractTestNode(node: ts.Node, filePath: string): void {
    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    
    let name = 'anonymous test';
    
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      name = node.name?.getText() || 'anonymous test';
    }

    const testNode: TestNode = {
      id: this.createNodeId('TestNode', { filePath, name, startLine: start.line + 1 }),
      type: 'TestNode',
      properties: {
        name,
        filePath,
        startLine: start.line + 1,
        endLine: end.line + 1,
        framework: this.detectTestFramework(filePath),
        testBody: node.getText(),
      },
    };

    this.nodes.push(testNode);
  }

  /**
   * Detects the test framework used in a file.
   * @param {string} filePath - The file path.
   * @returns {string} The detected test framework.
   */
  private detectTestFramework(filePath: string): string {
    // This is a simplified detection - in practice, you'd analyze imports and usage
    const fileName = path.basename(filePath).toLowerCase();
    
    if (fileName.includes('jest')) return 'jest';
    if (fileName.includes('mocha')) return 'mocha';
    if (fileName.includes('jasmine')) return 'jasmine';
    if (fileName.includes('vitest')) return 'vitest';
    
    return 'unknown';
  }

  /**
   * Creates FileNode and DirectoryNode entries for the given files.
   * @param {string[]} filePaths - Array of file paths to process.
   */
  private createFileAndDirectoryNodes(filePaths: string[]): void {
    const processedDirs = new Set<string>();
    
    for (const filePath of filePaths) {
      // Create FileNode
      const relativePath = path.relative(this.projectRoot, filePath);
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath);
      
      const fileNode: FileNode = {
        id: this.createNodeId('FileNode', { filePath }),
        type: 'FileNode',
        properties: {
          filePath: relativePath,
          fileName,
          fileExtension,
        },
      };
      
      this.nodes.push(fileNode);
      
      // Create DirectoryNodes for all parent directories
      let currentDir = path.dirname(filePath);
      while (currentDir !== this.projectRoot && !processedDirs.has(currentDir)) {
        const relativeDirPath = path.relative(this.projectRoot, currentDir);
        const dirName = path.basename(currentDir);
        
        const dirNode: DirectoryNode = {
          id: this.createNodeId('DirectoryNode', { dirPath: currentDir }),
          type: 'DirectoryNode',
          properties: {
            dirPath: relativeDirPath,
            dirName,
          },
        };
        
        this.nodes.push(dirNode);
        processedDirs.add(currentDir);
        
        currentDir = path.dirname(currentDir);
      }
    }
  }

  /**
   * Creates edges between nodes based on their relationships.
   */
  private createEdges(): void {
    const fileNodes = this.nodes.filter(n => n.type === 'FileNode') as FileNode[];
    const dirNodes = this.nodes.filter(n => n.type === 'DirectoryNode') as DirectoryNode[];
    const codeNodes = this.nodes.filter(n => n.type === 'CodeNode') as CodeNode[];
    const testNodes = this.nodes.filter(n => n.type === 'TestNode') as TestNode[];
    
    // Create DEFINED_IN edges (CodeNode -> FileNode, TestNode -> FileNode)
    for (const codeNode of codeNodes) {
      const fileNode = fileNodes.find(f => 
        path.resolve(this.projectRoot, f.properties.filePath) === codeNode.properties.filePath
      );
      
      if (fileNode) {
        this.edges.push({
          source: codeNode.id,
          target: fileNode.id,
          type: 'DEFINED_IN',
        });
      }
    }
    
    for (const testNode of testNodes) {
      const fileNode = fileNodes.find(f => 
        path.resolve(this.projectRoot, f.properties.filePath) === testNode.properties.filePath
      );
      
      if (fileNode) {
        this.edges.push({
          source: testNode.id,
          target: fileNode.id,
          type: 'DEFINED_IN',
        });
      }
    }
    
    // Create CONTAINS edges (DirectoryNode -> FileNode, DirectoryNode -> DirectoryNode)
    for (const fileNode of fileNodes) {
      const filePath = path.resolve(this.projectRoot, fileNode.properties.filePath);
      const fileDir = path.dirname(filePath);
      
      const parentDirNode = dirNodes.find(d => 
        path.resolve(this.projectRoot, d.properties.dirPath) === fileDir
      );
      
      if (parentDirNode) {
        this.edges.push({
          source: parentDirNode.id,
          target: fileNode.id,
          type: 'CONTAINS',
        });
      }
    }
    
    for (const dirNode of dirNodes) {
      const dirPath = path.resolve(this.projectRoot, dirNode.properties.dirPath);
      const parentDir = path.dirname(dirPath);
      
      const parentDirNode = dirNodes.find(d => 
        path.resolve(this.projectRoot, d.properties.dirPath) === parentDir
      );
      
      if (parentDirNode) {
        this.edges.push({
          source: parentDirNode.id,
          target: dirNode.id,
          type: 'CONTAINS',
        });
      }
    }
  }

  /**
   * Parses the given files and extracts nodes and edges.
   * @param {string[]} filePaths - Array of file paths to parse.
   * @returns {Promise<void>}
   */
  async parseFiles(filePaths: string[]): Promise<void> {
    const operation = this.logger.operation('AST parsing');
    
    try {
      this.logger.info(`Starting AST parsing for ${filePaths.length} files`);
      
      // Reset state
      this.nodes = [];
      this.edges = [];
      
      // Create file and directory nodes
      this.createFileAndDirectoryNodes(filePaths);
      
      // Parse each file based on its language
      for (const filePath of filePaths) {
        const language = this.detectLanguage(filePath);
        
        try {
          switch (language) {
            case 'typescript':
            case 'javascript':
              await this.parseTypeScriptFile(filePath);
              break;
            default:
              // For other languages, we'll add basic file information only
              this.logger.debug(`Skipping detailed parsing for unsupported language: ${language} (${filePath})`);
              break;
          }
        } catch (error) {
          this.logger.warn(`Failed to parse file: ${filePath}`, { error: getErrorMessage(error) });
        }
      }
      
      // Create relationships between nodes
      this.createEdges();
      
      this.logger.info('AST parsing completed', {
        totalNodes: this.nodes.length,
        totalEdges: this.edges.length,
        nodeTypes: this.getNodeTypeStats(),
      });
      
      operation();
    } catch (error) {
      this.logger.error('AST parsing failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Gets statistics about the parsed nodes by type.
   * @returns {Record<string, number>} Node type statistics.
   */
  private getNodeTypeStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const node of this.nodes) {
      stats[node.type] = (stats[node.type] || 0) + 1;
    }
    
    return stats;
  }
}
