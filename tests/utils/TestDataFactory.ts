/**
 * @file TestDataFactory - Factory for generating consistent test data
 */

import { v4 as uuidv4 } from 'uuid';
import {
  BaseNode,
  NodeWithEmbedding,
  CodeNode,
  FileNode,
  RepositoryNode,
  CommitNode,
  TestNode,
  PullRequestNode,
  FunctionNode,
  Edge,
  NodeType,
  EdgeType
} from '../../src/types';
import {
  EnhancedNode,
  EnhancedEdge,
  RepositoryNode as EnhancedRepositoryNode,
  CommitNode as EnhancedCommitNode,
  EnhancedFileNode,
  EnhancedFunctionNode,
  ClassNode,
  VariableNode,
  ImportNode,
  ExportNode,
  TestCaseNode,
  BusinessKeyGenerator
} from '../../src/types/enhanced-graph';

export interface TestRepositoryOptions {
  id?: string;
  name?: string;
  path?: string;
  url?: string;
  fileCount?: number;
  commitCount?: number;
}

export interface TestFileOptions {
  id?: string;
  repositoryId?: string;
  path?: string;
  name?: string;
  extension?: string;
  language?: string;
  content?: string;
  size?: number;
  nodeCount?: number;
}

export interface TestNodeOptions {
  id?: string;
  type?: NodeType;
  name?: string;
  fileId?: string;
  properties?: Record<string, any>;
}

export interface TestEdgeOptions {
  id?: string;
  source?: string;
  target?: string;
  type?: EdgeType;
  properties?: Record<string, any>;
}

export interface TestProjectStructure {
  name: string;
  files: Record<string, string>;
  dependencies?: string[];
}

export class TestDataFactory {
  private static idCounter = 1;

  // Core node factories
  static createRepository(options: TestRepositoryOptions = {}): RepositoryNode {
    const id = options.id || `repo-${this.idCounter++}`;
    const name = options.name || `test-repository-${this.idCounter}`;
    const path = options.path || `/test/repos/${name}`;
    
    return {
      id,
      type: 'RepositoryNode',
      properties: {
        repoName: name,
        repoPath: path,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  static createFile(options: TestFileOptions = {}): FileNode {
    const id = options.id || `file-${this.idCounter++}`;
    const name = options.name || `test-file-${this.idCounter}.ts`;
    const path = options.path || `src/${name}`;
    const extension = options.extension || '.ts';
    const language = options.language || 'typescript';
    
    return {
      id,
      type: 'FileNode',
      properties: {
        filePath: path,
        fileName: name,
        fileExtension: extension,
        repoId: options.repositoryId || 'repo-1',
        language,
        sizeKb: options.size || 1.5,
        contentHash: this.generateHash(options.content || ''),
        fileType: 'source',
        aiSummary: `This ${language} file contains test functionality`,
        imports: ['fs', 'path'],
        exports: ['testFunction', 'TestClass']
      }
    };
  }

  static createCodeNode(options: TestNodeOptions = {}): CodeNode {
    const id = options.id || `code-${this.idCounter++}`;
    const name = options.name || `testFunction${this.idCounter}`;
    
    return {
      id,
      type: 'CodeNode',
      properties: {
        name,
        signature: `function ${name}(param: string): string`,
        body: `return "test-${name}";`,
        docstring: `Test function ${name}`,
        language: 'typescript',
        filePath: 'src/test.ts',
        startLine: 10,
        endLine: 15,
        ...options.properties
      }
    };
  }

  static createFunctionNode(options: TestNodeOptions = {}): FunctionNode {
    const id = options.id || `func-${this.idCounter++}`;
    const name = options.name || `testFunction${this.idCounter}`;
    
    return {
      id,
      type: 'FunctionNode',
      properties: {
        name,
        signature: `function ${name}(param: string): string`,
        returnType: 'string',
        accessLevel: 'public' as const,
        fileId: options.fileId || 'file-1',
        filePath: 'src/test.ts',
        startLine: 10,
        endLine: 15,
        body: `return "test-${name}";`,
        calledByMethods: [],
        callsMethods: [],
        usesExternalMethods: false,
        internalCallGraph: [],
        transitiveCallDepth: 1,
        ...options.properties
      }
    };
  }

  static createCommit(options: Partial<CommitNode['properties']> = {}): CommitNode {
    const id = `commit-${this.idCounter++}`;
    const hash = options.hash || this.generateHash(`commit-${id}`);
    
    return {
      id,
      type: 'CommitNode',
      properties: {
        hash,
        author: 'Test Author',
        date: new Date().toISOString(),
        message: 'Test commit message',
        diffSummary: 'Added test functionality',
        ...options
      }
    };
  }

  static createTestNode(options: TestNodeOptions = {}): TestNode {
    const id = options.id || `test-${this.idCounter++}`;
    const name = options.name || `should test functionality ${this.idCounter}`;
    
    return {
      id,
      type: 'TestNode',
      properties: {
        name,
        filePath: 'tests/test.spec.ts',
        startLine: 20,
        endLine: 30,
        framework: 'jest',
        testBody: `expect(result).toBe("expected");`,
        ...options.properties
      }
    };
  }

  static createPullRequest(options: Partial<PullRequestNode['properties']> = {}): PullRequestNode {
    const id = `pr-${this.idCounter++}`;
    
    return {
      id,
      type: 'PullRequestNode',
      properties: {
        prId: `${this.idCounter}`,
        title: 'Test Pull Request',
        author: 'Test Author',
        createdAt: new Date().toISOString(),
        url: `https://github.com/test/repo/pull/${this.idCounter}`,
        body: 'Test pull request description',
        ...options
      }
    };
  }

  // Edge factories
  static createEdge(options: TestEdgeOptions = {}): Edge {
    return {
      source: options.source || 'node-1',
      target: options.target || 'node-2',
      type: options.type || 'CALLS',
      properties: options.properties || {}
    };
  }

  static createCallsEdge(sourceId: string, targetId: string): Edge {
    return {
      source: sourceId,
      target: targetId,
      type: 'CALLS',
      properties: {
        callType: 'direct',
        line: 25
      }
    };
  }

  static createContainsEdge(containerId: string, containedId: string): Edge {
    return {
      source: containerId,
      target: containedId,
      type: 'CONTAINS',
      properties: {
        relationship: 'parent-child'
      }
    };
  }

  static createDefinedInEdge(nodeId: string, fileId: string): Edge {
    return {
      source: nodeId,
      target: fileId,
      type: 'DEFINED_IN',
      properties: {
        startLine: 10,
        endLine: 20
      }
    };
  }

  // Enhanced graph factories
  static createEnhancedRepository(options: Partial<EnhancedRepositoryNode> = {}): EnhancedRepositoryNode {
    const name = options.properties?.url?.split('/').pop()?.replace('.git', '') || `test-repo-${this.idCounter++}`;
    const owner = 'test-owner';
    
    return {
      id: options.id || `enhanced-repo-${this.idCounter++}`,
      businessKey: BusinessKeyGenerator.repository(owner, name),
      type: 'Repository',
      properties: {
        url: `https://github.com/${owner}/${name}.git`,
        cloneUrl: `git@github.com:${owner}/${name}.git`,
        defaultBranch: 'main',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...options.properties
      },
      repoId: options.repoId,
      ...options
    };
  }

  static createEnhancedFile(options: Partial<EnhancedFileNode> = {}): EnhancedFileNode {
    const repoId = options.repoId || 'repo-1';
    const commitSha = options.commitSha || 'abc123';
    const path = options.properties?.path || `src/test-${this.idCounter++}.ts`;
    
    return {
      id: options.id || `enhanced-file-${this.idCounter++}`,
      businessKey: BusinessKeyGenerator.file(repoId, commitSha, path),
      type: 'File',
      properties: {
        path,
        ext: '.ts',
        language: 'typescript',
        size: 1024,
        loc: 50,
        hash: this.generateHash(path),
        ...options.properties
      },
      repoId,
      commitSha,
      filePath: path,
      ...options
    };
  }

  static createEnhancedFunction(options: Partial<EnhancedFunctionNode> = {}): EnhancedFunctionNode {
    const fileId = options.filePath || 'file-1';
    const name = options.properties?.name || `testFunction${this.idCounter++}`;
    const startLine = options.line || 10;
    
    return {
      id: options.id || `enhanced-func-${this.idCounter++}`,
      businessKey: BusinessKeyGenerator.function(fileId, name, startLine),
      type: 'Function',
      properties: {
        name,
        async: false,
        generator: false,
        params: ['param1', 'param2'],
        returnType: 'string',
        loc: 10,
        startLine,
        endLine: startLine + 10,
        body: `function ${name}() { return "test"; }`,
        docstring: `Test function ${name}`,
        ...options.properties
      },
      repoId: options.repoId,
      commitSha: options.commitSha,
      filePath: fileId,
      line: startLine,
      ...options
    };
  }

  // Embedding factories
  static createNodeWithEmbedding(node: BaseNode, embeddingDimensions: number = 384): NodeWithEmbedding {
    return {
      ...node,
      embedding: this.createEmbedding(embeddingDimensions),
      sourceText: this.extractTextFromNode(node)
    };
  }

  static createEmbedding(dimensions: number = 384): number[] {
    const embedding: number[] = [];
    for (let i = 0; i < dimensions; i++) {
      embedding.push((Math.random() - 0.5) * 2); // Values between -1 and 1
    }
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude === 0 ? 0 : val / magnitude);
  }

  // Project structure factories
  static createTestProject(options: TestProjectStructure): string {
    const projectPath = `/tmp/test-projects/${options.name}`;
    
    // This would typically create actual files in a test environment
    // For now, we return the path where the project would be created
    return projectPath;
  }

  static createTypescriptProject(): TestProjectStructure {
    return {
      name: `typescript-project-${this.idCounter++}`,
      files: {
        'package.json': JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'typescript': '^4.0.0'
          }
        }, null, 2),
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'es2020',
            module: 'commonjs',
            strict: true
          }
        }, null, 2),
        'src/index.ts': 'export function main() { console.log("Hello World"); }',
        'src/utils.ts': 'export function helper() { return "helper"; }',
        'tests/index.test.ts': 'import { main } from "../src/index"; test("main", () => { expect(main).toBeDefined(); });'
      },
      dependencies: ['typescript', 'jest']
    };
  }

  static createPythonProject(): TestProjectStructure {
    return {
      name: `python-project-${this.idCounter++}`,
      files: {
        'requirements.txt': 'pytest>=6.0.0\nrequests>=2.25.0',
        'setup.py': 'from setuptools import setup\nsetup(name="test-project", version="1.0.0")',
        'src/__init__.py': '',
        'src/main.py': 'def main():\n    print("Hello World")\n\nif __name__ == "__main__":\n    main()',
        'src/utils.py': 'def helper():\n    return "helper"',
        'tests/__init__.py': '',
        'tests/test_main.py': 'from src.main import main\n\ndef test_main():\n    assert main is not None'
      },
      dependencies: ['pytest', 'requests']
    };
  }

  // Batch factories
  static createRepositoryWithFiles(
    repoOptions: TestRepositoryOptions = {},
    fileCount: number = 5
  ): { repository: RepositoryNode; files: FileNode[] } {
    const repository = this.createRepository(repoOptions);
    const files: FileNode[] = [];
    
    for (let i = 0; i < fileCount; i++) {
      files.push(this.createFile({
        repositoryId: repository.id,
        name: `file-${i + 1}.ts`,
        path: `src/file-${i + 1}.ts`
      }));
    }
    
    return { repository, files };
  }

  static createFileWithNodes(
    fileOptions: TestFileOptions = {},
    nodeCount: number = 3
  ): { file: FileNode; nodes: CodeNode[] } {
    const file = this.createFile(fileOptions);
    const nodes: CodeNode[] = [];
    
    for (let i = 0; i < nodeCount; i++) {
      nodes.push(this.createCodeNode({
        name: `function${i + 1}`,
        fileId: file.id,
        properties: {
          filePath: file.properties.filePath,
          startLine: 10 + (i * 10),
          endLine: 15 + (i * 10)
        }
      }));
    }
    
    return { file, nodes };
  }

  static createConnectedNodes(count: number = 5): { nodes: CodeNode[]; edges: Edge[] } {
    const nodes: CodeNode[] = [];
    const edges: Edge[] = [];
    
    // Create nodes
    for (let i = 0; i < count; i++) {
      nodes.push(this.createCodeNode({
        name: `function${i + 1}`
      }));
    }
    
    // Create edges (each node calls the next one)
    for (let i = 0; i < count - 1; i++) {
      edges.push(this.createCallsEdge(nodes[i].id, nodes[i + 1].id));
    }
    
    return { nodes, edges };
  }

  // Utility methods
  private static generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private static extractTextFromNode(node: BaseNode): string {
    switch (node.type) {
      case 'CodeNode':
        return `${node.properties.name} ${node.properties.signature || ''} ${node.properties.docstring || ''}`;
      case 'FileNode':
        return `${node.properties.fileName} ${node.properties.aiSummary || ''}`;
      case 'RepositoryNode':
        return `${node.properties.repoName} ${node.properties.repoPath}`;
      case 'CommitNode':
        return `${node.properties.message} ${node.properties.author}`;
      case 'TestNode':
        return `${node.properties.name} ${node.properties.framework || ''}`;
      case 'PullRequestNode':
        return `${node.properties.title} ${node.properties.body || ''}`;
      case 'FunctionNode':
        return `${node.properties.name} ${node.properties.signature}`;
      default:
        return `${node.type} ${node.id}`;
    }
  }

  // Reset counter for tests
  static resetCounter(): void {
    this.idCounter = 1;
  }

  // Generate test data sets
  static generateLargeDataset(size: 'small' | 'medium' | 'large' = 'small'): {
    repositories: RepositoryNode[];
    files: FileNode[];
    nodes: CodeNode[];
    edges: Edge[];
  } {
    const sizes = {
      small: { repos: 2, filesPerRepo: 5, nodesPerFile: 3 },
      medium: { repos: 5, filesPerRepo: 10, nodesPerFile: 5 },
      large: { repos: 10, filesPerRepo: 20, nodesPerFile: 10 }
    };
    
    const config = sizes[size];
    const repositories: RepositoryNode[] = [];
    const files: FileNode[] = [];
    const nodes: CodeNode[] = [];
    const edges: Edge[] = [];
    
    for (let r = 0; r < config.repos; r++) {
      const repo = this.createRepository({ name: `repo-${r + 1}` });
      repositories.push(repo);
      
      for (let f = 0; f < config.filesPerRepo; f++) {
        const file = this.createFile({
          repositoryId: repo.id,
          name: `file-${f + 1}.ts`,
          path: `src/file-${f + 1}.ts`
        });
        files.push(file);
        
        for (let n = 0; n < config.nodesPerFile; n++) {
          const node = this.createCodeNode({
            name: `function${n + 1}`,
            fileId: file.id,
            properties: {
              filePath: file.properties.filePath,
              startLine: 10 + (n * 10),
              endLine: 15 + (n * 10)
            }
          });
          nodes.push(node);
          
          // Create some edges between nodes
          if (nodes.length > 1 && Math.random() > 0.5) {
            const sourceIndex = Math.floor(Math.random() * (nodes.length - 1));
            edges.push(this.createCallsEdge(nodes[sourceIndex].id, node.id));
          }
        }
      }
    }
    
    return { repositories, files, nodes, edges };
  }
}
