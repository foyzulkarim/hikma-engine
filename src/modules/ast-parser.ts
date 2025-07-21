/**
 * @file Responsible for parsing AST of supported languages and extracting code structure.
 *       It identifies and creates various node types (CodeNode, FileNode,
 *       TestNode, FunctionNode) and their relationships (edges).
 *       Polyglot AST parser supporting multiple languages.
 */

import { CodeNode, FileNode, Edge, TestNode, FunctionNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export class AstParser {
  private config: ConfigManager;
  private logger = getLogger('AstParser');
  private projectRoot: string;
  private repoId: string;
  private nodes: (CodeNode | FileNode | TestNode | FunctionNode)[] = [];
  private edges: Edge[] = [];
  private pathToIdMap: Map<string, string> = new Map();

  /**
   * @param {string} projectRoot - The absolute path to the root of the project.
   * @param {ConfigManager} config - Configuration manager instance.
   * @param {string} repoId - The repository ID for foreign key relationships.
   */
  constructor(projectRoot: string, config: ConfigManager, repoId: string) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.repoId = repoId;
    this.logger.info('AstParser initialized', { projectRoot, repoId });
  }


  public getNodes() {
    return this.nodes;
  }

  public getEdges() {
    return this.edges;
  }

  /**
   * Parses the given files and extracts nodes and edges.
   * @param {string[]} filePaths        – files to parse
   * @param {Map<string,string>} idMap  – absolute path → FileNode.id
   * @returns {Promise<void>}
   */
  async parseFiles(
    filePaths: string[],
    idMap: Map<string, string> = new Map()
  ): Promise<void> {
    const op = this.logger.operation('AST parsing');
    try {
      this.logger.info(`Starting AST parsing for ${filePaths.length} files`);

      /* reset state */
      this.nodes = [];
      this.edges = [];
      this.pathToIdMap = idMap;

      /* basic file/dir nodes first */
      this.createFileNodes(filePaths);

      /* per-file detailed parsing */
      for (const filePath of filePaths) {
        const lang = this.detectLanguage(filePath);
        try {
          switch (lang) {
            case 'typescript':
            case 'javascript':
              await this.parseTypeScriptFile(filePath);
              break;
            default:
              this.logger.debug(`Skipping detailed parsing for ${lang}: ${filePath}`);
          }
        } catch (err) {
          this.logger.warn(`Failed to parse file: ${filePath}`, { error: getErrorMessage(err) });
        }
      }

      /* relationships & call graph */
      this.createEdges();
      this.buildCallGraph();

      this.logger.info('AST parsing completed', {
        totalNodes: this.nodes.length,
        totalEdges: this.edges.length,
        nodeTypes: this.getNodeTypeStats(),
      });
      op();
    } catch (err) {
      this.logger.error('AST parsing failed', { error: getErrorMessage(err) });
      op();
      throw err;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private isTestFile(filePath: string): boolean {
    const patterns = [
      /\.test\./, /\.spec\./, /_test\./, /_spec\./,
      /test_/i, /spec_/i, /tests?\//i, /specs?\//i,
      /__tests?__/i, /__specs?__/i,
    ];
    return patterns.some(p => p.test(filePath.toLowerCase()));
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.go': 'go',
      '.c': 'c', '.cc': 'cpp', '.cxx': 'cpp', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
      '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
      '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
      '.json': 'json', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
      '.md': 'markdown', '.rst': 'restructuredtext',
    };
    return map[ext] || 'unknown';
  }

  private createNodeId(type: string, props: Record<string, any>): string {
    switch (type) {
      case 'FileNode': return `file:${props.filePath}`;
      case 'CodeNode': return `code:${props.filePath}:${props.name}:${props.startLine}:${props.startColumn || 0}`;
      case 'TestNode': return `test:${props.filePath}:${props.name}:${props.startLine}:${props.startColumn || 0}`;
      case 'FunctionNode': return `func:${props.filePath}:${props.name}:${props.startLine}:${props.startColumn || 0}`;
      default:
        return `${type.toLowerCase()}:${Date.now()}:${Math.random()}`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* TypeScript / JavaScript parsing                                    */
  /* ------------------------------------------------------------------ */

  private async parseTypeScriptFile(filePath: string): Promise<void> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      // Functions (incl. arrow, methods)
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node)
      ) {
        const func = this.extractFunctionDetails(node, filePath);
        if (func) {
          this.nodes.push(func);
          this.extractFunctionCalls(node, func.id, sourceFile);
        }
      }

      // Classes, interfaces remain CodeNode
      else if (ts.isClassDeclaration(node)) this.extractCodeNode(node, filePath, 'class');
      else if (ts.isInterfaceDeclaration(node)) this.extractCodeNode(node, filePath, 'interface');

      // Test functions → TestNode
      if (
        this.isTestFile(filePath) &&
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      ) {
        this.extractTestNode(node, filePath);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /* ------------------------------------------------------------------ */
  /* Extractors                                                         */
  /* ------------------------------------------------------------------ */

  private extractFunctionDetails(node: ts.Node, filePath: string): FunctionNode | null {
    const sf = node.getSourceFile();
    const start = sf.getLineAndCharacterOfPosition(node.getStart());
    const end = sf.getLineAndCharacterOfPosition(node.getEnd());

    let name = 'anonymous';
    let signature = '';
    let returnType = 'any';
    let accessLevel: 'public' | 'private' | 'protected' = 'public';

    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      name = node.name?.getText() || 'anonymous';
      signature = node.getText().split('{')[0].trim();
      if (node.type) returnType = node.type.getText();
      if (node.modifiers) {
        for (const m of node.modifiers) {
          if (m.kind === ts.SyntaxKind.PrivateKeyword) accessLevel = 'private';
          else if (m.kind === ts.SyntaxKind.ProtectedKeyword) accessLevel = 'protected';
        }
      }
    } else if (ts.isArrowFunction(node)) {
      signature = node.getText().split('=>')[0].trim();
      if (node.type) returnType = node.type.getText();
    } else {
      return null;
    }

    const func: FunctionNode = {
      id: this.createNodeId('FunctionNode', { filePath, name, startLine: start.line + 1, startColumn: start.character }),
      type: 'FunctionNode',
      properties: {
        name,
        signature,
        returnType,
        accessLevel,
        filePath,
        fileId: this.pathToIdMap.get(filePath) || '',
        startLine: start.line + 1,
        endLine: end.line + 1,
        body: node.getText(),
        callsMethods: [],
        calledByMethods: [],
        usesExternalMethods: false,
        internalCallGraph: [],
        transitiveCallDepth: 0,
      },
    };
    return func;
  }

  private extractCodeNode(node: ts.Node, filePath: string, nodeType: string): void {
    const sf = node.getSourceFile();
    const start = sf.getLineAndCharacterOfPosition(node.getStart());
    const end = sf.getLineAndCharacterOfPosition(node.getEnd());

    let name = 'anonymous';
    let signature = '';

    if (ts.isClassDeclaration(node)) {
      name = node.name?.getText() || 'anonymous';
      signature = `class ${name}`;
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name?.getText() || 'anonymous';
      signature = `interface ${name}`;
    }

    const cn: CodeNode = {
      id: this.createNodeId('CodeNode', { filePath, name, startLine: start.line + 1, startColumn: start.character }),
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
    this.nodes.push(cn);
  }

  private extractTestNode(node: ts.Node, filePath: string): void {
    const sf = node.getSourceFile();
    const start = sf.getLineAndCharacterOfPosition(node.getStart());
    const end = sf.getLineAndCharacterOfPosition(node.getEnd());

    const name = (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      ? node.name?.getText() || 'anonymous test'
      : 'anonymous test';

    const tn: TestNode = {
      id: this.createNodeId('TestNode', { filePath, name, startLine: start.line + 1, startColumn: start.character }),
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
    this.nodes.push(tn);
  }

  private detectTestFramework(filePath: string): string {
    const n = path.basename(filePath).toLowerCase();
    if (n.includes('jest')) return 'jest';
    if (n.includes('mocha')) return 'mocha';
    if (n.includes('jasmine')) return 'jasmine';
    if (n.includes('vitest')) return 'vitest';
    return 'unknown';
  }

  private determineFileType(filePath: string): 'source' | 'test' | 'config' | 'dev' | 'vendor' {
    const lowerPath = filePath.toLowerCase();
    
    // Check for test files
    if (this.isTestFile(filePath)) {
      return 'test';
    }
    
    // Check for vendor/third-party files
    if (lowerPath.includes('node_modules') || lowerPath.includes('vendor') || lowerPath.includes('third_party')) {
      return 'vendor';
    }
    
    // Check for config files
    const configPatterns = [
      'package.json', 'tsconfig.json', 'jest.config', 'webpack.config', 
      '.eslintrc', '.prettierrc', '.gitignore', '.env', 'dockerfile',
      'makefile', 'cmake', '.yml', '.yaml', '.toml', '.ini'
    ];
    if (configPatterns.some(pattern => lowerPath.includes(pattern))) {
      return 'config';
    }
    
    // Check for development/build files
    const devPatterns = ['gulpfile', 'gruntfile', 'rollup.config', 'vite.config'];
    if (devPatterns.some(pattern => lowerPath.includes(pattern))) {
      return 'dev';
    }
    
    // Default to source
    return 'source';
  }

  private generateContentHash(filePath: string): string {
    // Simple hash generation based on file path
    // In a real implementation, this would hash the actual file content
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
      const char = filePath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /* ------------------------------------------------------------------ */
  /* File nodes only - directories removed                             */
  /* ------------------------------------------------------------------ */

  private createFileNodes(filePaths: string[]): void {
    // FileNode creation is now handled by NodeCreator in the indexing pipeline
    // This method is no longer needed but kept for compatibility
  }

  private createEdges(): void {
    const files = this.nodes.filter(n => n.type === 'FileNode') as FileNode[];
    const codes = this.nodes.filter(n => n.type === 'CodeNode') as CodeNode[];
    const tests = this.nodes.filter(n => n.type === 'TestNode') as TestNode[];

    // Code/Test -> File
    [...codes, ...tests].forEach(n => {
      const f = files.find(fi =>
        path.resolve(this.projectRoot, fi.properties.filePath) === n.properties.filePath
      );
      if (f) this.edges.push({ source: n.id, target: f.id, type: 'DEFINED_IN' });
    });

    // Note: Directory relationships are no longer created since DirectoryNode is removed
  }

  /* ------------------------------------------------------------------ */
  /* Call-graph helpers                                                 */
  /* ------------------------------------------------------------------ */

  private extractFunctionCalls(node: ts.Node, callerId: string, sf: ts.SourceFile): void {
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const calleeName = n.expression.getText();
        const callee = this.nodes.find(
          (x): x is FunctionNode =>
            x.type === 'FunctionNode' &&
            x.properties.name === calleeName &&
            x.properties.filePath === sf.fileName
        );
        if (callee) {
          this.edges.push({
            type: 'CALLS',
            source: callerId,
            target: callee.id,
            properties: {},
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
  }

  private buildCallGraph(): void {
    const funcs = this.nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];
    const callMap = new Map<string, string[]>();
    const calledByMap = new Map<string, string[]>();

    funcs.forEach(f => {
      callMap.set(f.id, []);
      calledByMap.set(f.id, []);
      f.properties.callsMethods = [];
      f.properties.calledByMethods = [];
      f.properties.usesExternalMethods = false;
      f.properties.internalCallGraph = [];
      f.properties.transitiveCallDepth = 0;
    });

    this.edges.forEach(e => {
      if (e.type === 'CALLS') {
        callMap.get(e.source)!.push(e.target);
        calledByMap.get(e.target)!.push(e.source);
      }
    });

    funcs.forEach(f => {
      f.properties.callsMethods = callMap.get(f.id)!;
      f.properties.calledByMethods = calledByMap.get(f.id)!;

      const callees = f.properties.callsMethods.map(id =>
        funcs.find(fn => fn.id === id)
      ).filter(Boolean) as FunctionNode[];

      f.properties.usesExternalMethods = callees.some(
        c => c.properties.fileId !== f.properties.fileId
      );

      f.properties.internalCallGraph = callees
        .filter(c => c.properties.fileId === f.properties.fileId)
        .map(c => c.id);

      f.properties.transitiveCallDepth = this.computeTransitiveDepth(f.id, callMap);
    });
  }

  private computeTransitiveDepth(id: string, callMap: Map<string, string[]>): number {
    const visited = new Set<string>();
    const dfs = (curr: string, depth: number): number => {
      if (visited.has(curr)) return depth;
      visited.add(curr);
      const calls = callMap.get(curr) || [];
      return Math.max(depth, ...calls.map(c => dfs(c, depth + 1)));
    };
    return dfs(id, 0);
  }

  private getNodeTypeStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.nodes.forEach(n => (stats[n.type] = (stats[n.type] || 0) + 1));
    return stats;
  }
}
